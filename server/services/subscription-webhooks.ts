import Stripe from 'stripe';
import { storage } from '../storage';
import { db } from '../db';
import {
  companies,
  paymentTransactions,
  stripeWebhookEvents,
  subscriptionEvents,
  subscriptionNotifications,
  InsertPaymentTransaction,
  type Company
} from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import { logger } from '../utils/logger';

export interface WebhookConfig {
  stripeSecretKey: string;
  webhookSecret: string;
}

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Subscription Webhook Handler
 * Processes Stripe webhook events for subscription management
 */
export class SubscriptionWebhookHandler {
  private stripe: Stripe;
  private webhookSecret: string;

  constructor(config: WebhookConfig) {
    this.stripe = new Stripe(config.stripeSecretKey, {
      apiVersion: '2025-09-30.clover' as any
    });
    this.webhookSecret = config.webhookSecret;
  }

  /**
   * Verify and process Stripe webhook
   */
  async processWebhook(body: string | Buffer, signature: string): Promise<{ success: boolean; error?: string }> {
    try {

      const event = this.stripe.webhooks.constructEvent(body, signature, this.webhookSecret);
      
      logger.info('subscription-webhooks', `Processing webhook event: ${event.type}`);


      await this.handleWebhookEvent(event);

      return { success: true };

    } catch (error) {
      logger.error('subscription-webhooks', 'Webhook processing error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Handle different types of webhook events
   */
  private async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event, event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event, event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event, event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event, event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event, event.data.object as Stripe.Subscription);
        break;

      case 'invoice.upcoming':
        await this.handleUpcomingInvoice(event, event.data.object as Stripe.Invoice);
        break;

      default:
        logger.info('subscription-webhooks', `Unhandled webhook event type: ${event.type}`);
    }
  }

  /**
   * Ledger + ordering: one DB transaction per webhook; skip duplicates and stale ordering.
   */
  private async withStripeBillingTransaction(
    event: Stripe.Event,
    companyId: number,
    work: (tx: DbTx, company: Company) => Promise<void>
  ): Promise<void> {
    await db.transaction(async (tx) => {
      const [ledger] = await tx
        .insert(stripeWebhookEvents)
        .values({
          eventId: event.id,
          eventType: event.type,
          companyId
        })
        .onConflictDoNothing({ target: stripeWebhookEvents.eventId })
        .returning();
      if (!ledger) {
        return;
      }

      await tx.execute(sql`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`);

      const [companyRow] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (!companyRow) {
        return;
      }

      const eventTime = new Date(event.created * 1000);
      if (
        companyRow.lastProcessedBillingEventAt &&
        eventTime <= companyRow.lastProcessedBillingEventAt
      ) {
        return;
      }

      await work(tx, companyRow);

      await tx
        .update(companies)
        .set({
          lastProcessedBillingEventAt: eventTime,
          updatedAt: new Date()
        })
        .where(eq(companies.id, companyId));
    });
  }

  /**
   * Upsert by invoice id (partial unique on external_transaction_id); later success overwrites failed row.
   */
  private async upsertPaymentTransaction(
    tx: DbTx,
    transactionData: InsertPaymentTransaction
  ): Promise<{ id: number } | undefined> {
    const [row] = await tx
      .insert(paymentTransactions)
      .values(transactionData)
      .onConflictDoUpdate({
        target: paymentTransactions.externalTransactionId,
        targetWhere: sql`${paymentTransactions.externalTransactionId} IS NOT NULL`,
        set: {
          companyId: transactionData.companyId,
          planId: transactionData.planId,
          amount: transactionData.amount,
          currency: transactionData.currency,
          status: transactionData.status,
          paymentMethod: transactionData.paymentMethod,
          paymentIntentId: transactionData.paymentIntentId,
          receiptUrl: transactionData.receiptUrl,
          metadata: transactionData.metadata,
          isRecurring: transactionData.isRecurring,
          subscriptionPeriodStart: transactionData.subscriptionPeriodStart,
          subscriptionPeriodEnd: transactionData.subscriptionPeriodEnd,
          dunningAttempt: transactionData.dunningAttempt ?? 0,
          updatedAt: new Date()
        }
      })
      .returning({ id: paymentTransactions.id });
    return row;
  }

  /**
   * Handle successful invoice payment
   */
  private async handleInvoicePaymentSucceeded(event: Stripe.Event, invoice: Stripe.Invoice): Promise<void> {
    try {
      if (!invoice.id) {
        logger.error('subscription-webhooks', 'Invoice missing id, skipping');
        return;
      }

      if (!(invoice as any).subscription) {
        logger.info('subscription-webhooks', 'Invoice not associated with subscription, skipping');
        return;
      }

      const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }

      const plan = await storage.getPlan(company.planId!);
      if (!plan) {
        logger.error('subscription-webhooks', `Plan not found for company: ${companyId}`);
        return;
      }

      await this.withStripeBillingTransaction(event, companyId, async (tx, lockedCompany) => {
        const transactionData: InsertPaymentTransaction = {
          companyId,
          planId: lockedCompany.planId!,
          amount: (invoice.amount_paid / 100).toString(), // Convert from cents
          currency: invoice.currency.toUpperCase(),
          status: 'completed',
          paymentMethod: 'stripe',
          paymentIntentId: (invoice as any).payment_intent as string,
          externalTransactionId: invoice.id,
          receiptUrl: invoice.hosted_invoice_url,
          isRecurring: true,
          subscriptionPeriodStart: new Date((subscription as any).current_period_start * 1000),
          subscriptionPeriodEnd: new Date((subscription as any).current_period_end * 1000),
          metadata: {
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: subscription.id
          }
        };

        const txRow = await this.upsertPaymentTransaction(tx, transactionData);

        await tx
          .update(companies)
          .set({
            subscriptionStatus: 'active',
            subscriptionStartDate: new Date((subscription as any).current_period_start * 1000),
            subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
            dunningAttempts: 0,
            lastDunningAttempt: null,
            gracePeriodEnd: null,

            isInTrial: false,
            trialStartDate: null,
            trialEndDate: null,
            updatedAt: new Date()
          })
          .where(eq(companies.id, companyId));

        await tx.insert(subscriptionEvents).values({
          companyId,
          eventType: 'payment_succeeded',
          eventData: {
            transactionId: txRow?.id,
            invoiceId: invoice.id,
            amount: invoice.amount_paid / 100,
            subscriptionId: subscription.id
          },
          previousStatus: lockedCompany.subscriptionStatus || 'inactive',
          newStatus: 'active',
          triggeredBy: 'stripe_webhook'
        });

        logger.info(
          'subscription-webhooks',
          `Payment succeeded for company ${companyId}, transaction ${txRow?.id ?? 'unknown'}`
        );
      });
    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling payment succeeded:', error);
      throw error;
    }
  }

  /**
   * Handle failed invoice payment
   */
  private async handleInvoicePaymentFailed(event: Stripe.Event, invoice: Stripe.Invoice): Promise<void> {
    try {
      if (!invoice.id) {
        logger.error('subscription-webhooks', 'Invoice missing id, skipping');
        return;
      }

      if (!(invoice as any).subscription) {
        logger.info('subscription-webhooks', 'Invoice not associated with subscription, skipping');
        return;
      }

      const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }

      await this.withStripeBillingTransaction(event, companyId, async (tx, lockedCompany) => {
        const transactionData: InsertPaymentTransaction = {
          companyId,
          planId: lockedCompany.planId!,
          amount: (invoice.amount_due / 100).toString(),
          currency: invoice.currency.toUpperCase(),
          status: 'failed',
          paymentMethod: 'stripe',
          externalTransactionId: invoice.id,
          isRecurring: true,
          subscriptionPeriodStart: new Date((subscription as any).current_period_start * 1000),
          subscriptionPeriodEnd: new Date((subscription as any).current_period_end * 1000),
          dunningAttempt: invoice.attempt_count || 1,
          metadata: {
            stripeInvoiceId: invoice.id,
            stripeSubscriptionId: subscription.id,
            failureReason: invoice.last_finalization_error?.message
          }
        };

        await this.upsertPaymentTransaction(tx, transactionData);

        const newDunningAttempts = (lockedCompany.dunningAttempts || 0) + 1;
        await tx
          .update(companies)
          .set({
            subscriptionStatus: 'past_due',
            dunningAttempts: newDunningAttempts,
            lastDunningAttempt: new Date(),
            updatedAt: new Date()
          })
          .where(eq(companies.id, companyId));

        await tx.insert(subscriptionEvents).values({
          companyId,
          eventType: 'payment_failed',
          eventData: {
            invoiceId: invoice.id,
            amount: invoice.amount_due / 100,
            subscriptionId: subscription.id,
            attemptCount: invoice.attempt_count,
            failureReason: invoice.last_finalization_error?.message
          },
          previousStatus: lockedCompany.subscriptionStatus || 'inactive',
          newStatus: 'past_due',
          triggeredBy: 'stripe_webhook'
        });

        await tx.insert(subscriptionNotifications).values({
          companyId,
          notificationType: 'payment_failed',
          scheduledFor: new Date(),
          notificationData: {
            invoiceId: invoice.id,
            amount: invoice.amount_due / 100,
            attemptCount: invoice.attempt_count
          },
          status: 'pending'
        });

        logger.info('subscription-webhooks', `Payment failed for company ${companyId}, attempt ${invoice.attempt_count}`);
      });
    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling payment failed:', error);
      throw error;
    }
  }

  /**
   * Handle subscription updates
   */
  private async handleSubscriptionUpdated(event: Stripe.Event, subscription: Stripe.Subscription): Promise<void> {
    try {
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }

      await this.withStripeBillingTransaction(event, companyId, async (tx, lockedCompany) => {
        let newStatus = lockedCompany.subscriptionStatus || 'inactive';

        switch (subscription.status) {
          case 'active':
            newStatus = 'active';
            break;
          case 'past_due':
            newStatus = 'past_due';
            break;
          case 'canceled':
            newStatus = 'cancelled';
            break;
          case 'unpaid':
            newStatus = 'overdue';
            break;
        }

        await tx
          .update(companies)
          .set({
            subscriptionStatus: newStatus,
            subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
            stripeSubscriptionId: subscription.id,
            updatedAt: new Date()
          })
          .where(eq(companies.id, companyId));

        await tx.insert(subscriptionEvents).values({
          companyId,
          eventType: 'subscription_updated',
          eventData: {
            subscriptionId: subscription.id,
            status: subscription.status,
            currentPeriodEnd: (subscription as any).current_period_end
          },
          previousStatus: lockedCompany.subscriptionStatus || 'inactive',
          newStatus,
          triggeredBy: 'stripe_webhook'
        });
      });

      logger.info('subscription-webhooks', `Subscription updated for company ${companyId}, status: ${subscription.status}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling subscription updated:', error);
      throw error;
    }
  }

  /**
   * Handle subscription deletion
   */
  private async handleSubscriptionDeleted(event: Stripe.Event, subscription: Stripe.Subscription): Promise<void> {
    try {
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }


      await this.withStripeBillingTransaction(event, companyId, async (tx, lockedCompany) => {
        await tx
          .update(companies)
          .set({
            subscriptionStatus: 'cancelled',
            stripeSubscriptionId: null,
            autoRenewal: false,
            updatedAt: new Date()
          })
          .where(eq(companies.id, companyId));

        await tx.insert(subscriptionEvents).values({
          companyId,
          eventType: 'subscription_cancelled',
          eventData: {
            subscriptionId: subscription.id,
            canceledAt: subscription.canceled_at
          },
          previousStatus: lockedCompany.subscriptionStatus || 'inactive',
          newStatus: 'cancelled',
          triggeredBy: 'stripe_webhook'
        });
      });

      logger.info('subscription-webhooks', `Subscription cancelled for company ${companyId}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling subscription deleted:', error);
      throw error;
    }
  }

  /**
   * Handle subscription creation
   */
  private async handleSubscriptionCreated(event: Stripe.Event, subscription: Stripe.Subscription): Promise<void> {
    try {
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        logger.error('subscription-webhooks', 'No company ID found in subscription metadata');
        return;
      }

      const company = await storage.getCompany(companyId);
      if (!company) {
        logger.error('subscription-webhooks', `Company not found: ${companyId}`);
        return;
      }

      await this.withStripeBillingTransaction(event, companyId, async (tx, lockedCompany) => {
        await tx
          .update(companies)
          .set({
            stripeSubscriptionId: subscription.id,
            subscriptionEndDate: new Date((subscription as any).current_period_end * 1000),
            autoRenewal: true,
            updatedAt: new Date()
          })
          .where(eq(companies.id, companyId));

        await tx.insert(subscriptionEvents).values({
          companyId,
          eventType: 'subscription_created',
          eventData: {
            subscriptionId: subscription.id,
            status: subscription.status
          },
          previousStatus: lockedCompany.subscriptionStatus ?? null,
          newStatus: 'active',
          triggeredBy: 'stripe_webhook'
        });
      });

      logger.info('subscription-webhooks', `Subscription created for company ${companyId}: ${subscription.id}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling subscription created:', error);
      throw error;
    }
  }

  /**
   * Handle upcoming invoice (for notifications)
   */
  private async handleUpcomingInvoice(event: Stripe.Event, invoice: Stripe.Invoice): Promise<void> {
    try {
      if (!(invoice as any).subscription) {
        return;
      }

      const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
      const companyId = parseInt(subscription.metadata.companyId || '0');

      if (!companyId) {
        return;
      }

      const notificationDate = new Date(invoice.period_end * 1000 - 3 * 24 * 60 * 60 * 1000);

      await this.withStripeBillingTransaction(event, companyId, async (tx, _lockedCompany) => {
        await tx.insert(subscriptionNotifications).values({
          companyId,
          notificationType: 'subscription_renewal_upcoming',
          scheduledFor: notificationDate,
          notificationData: {
            invoiceId: invoice.id,
            amount: invoice.amount_due / 100,
            renewalDate: new Date(invoice.period_end * 1000)
          },
          status: 'pending'
        });
      });

      logger.info('subscription-webhooks', `Scheduled renewal notification for company ${companyId}`);

    } catch (error) {
      logger.error('subscription-webhooks', 'Error handling upcoming invoice:', error);
      throw error;
    }
  }
}

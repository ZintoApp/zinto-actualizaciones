import {assertErpGatewayEvidence,type ErpGatewayEvidence} from '../../services/erp-gateway-money';
import { Router, type Express, type Request, type Response } from 'express';
import Stripe from 'stripe';
import {
  erpGatewayFromRouteSlug,
  type ErpOnlineGateway,
  ERP_GATEWAY_TO_PAYMENT_METHOD,
} from '@shared/erp-payment-gateway';
import { storage } from '../../storage';
import { completeInvoiceCheckoutSession } from '../../services/erp-invoice-checkout-service';
import { getErpGatewaySettingsRaw } from '../../services/erp-payment-gateway-service';
import type {
  ErpMercadoPagoSettings,
  ErpMpesaSettings,
  ErpMoyasarSettings,
  ErpPayPalSettings,
  ErpPaystackSettings,
  ErpStripeSettings,
} from '@shared/erp-payment-gateway';
import {verifyMpesaCheckout,verifyMoyasarPayment,verifyPaystackPayment,capturePayPalOrder, verifyMercadoPagoPayment } from '../../services/payment-gateway-core';

function parseCompanyId(value:string):number|undefined {if(!/^\d+$/.test(value))return;const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:undefined;}
async function completeSessionByMetadata(checkoutSessionId:number,companyId:number,gateway:ErpOnlineGateway,evidence:ErpGatewayEvidence):Promise<void>{
 const retained=await storage.getErpInvoiceCheckoutSession(checkoutSessionId);if(!retained)throw new Error('Checkout session not found');
 assertErpGatewayEvidence(retained,companyId,gateway,evidence);await completeInvoiceCheckoutSession(checkoutSessionId,{referenceNumber:evidence.referenceNumber,verifiedEvidence:evidence,verifiedCompanyId:companyId});
}
export function registerErpPaymentWebhooks(app: Express): void {
  const router = Router();

  router.post('/stripe/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const settings = (await getErpGatewaySettingsRaw(companyId, 'stripe')) as ErpStripeSettings | undefined;
      if (!settings?.secretKey || !settings.webhookSecret) {
        return res.status(400).json({ error: 'Stripe is not configured' });
      }

      const stripe = new Stripe(settings.secretKey, { apiVersion: '2025-09-30.clover' as any });
      const signature = req.headers['stripe-signature'] as string;
      let event;
      try {
        event = stripe.webhooks.constructEvent(req.body, signature, settings.webhookSecret);
      } catch (err) {
        return res.status(400).send(`Webhook Error: ${err instanceof Error ? err.message : 'Invalid signature'}`);
      }

      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutSessionId = parseCompanyId(session.metadata?.checkoutSessionId||'');
        if (checkoutSessionId && session.payment_status === 'paid') {
          await completeSessionByMetadata(checkoutSessionId,companyId,'stripe',{paid:true,minorAmount:session.amount_total??undefined,currency:session.currency??undefined,externalSessionId:session.id,metadata:session.metadata??undefined,referenceNumber:(session.payment_intent as string)||session.id});
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] stripe', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/paystack/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const settings = (await getErpGatewaySettingsRaw(companyId, 'paystack')) as ErpPaystackSettings | undefined;
      if (!settings?.secretKey) return res.status(400).json({ error: 'Paystack not configured' });

      const body = req.body;
      if (body?.event === 'charge.success' && body?.data?.metadata?.checkoutSessionId) {
        const checkoutSessionId = parseCompanyId(String(body.data.metadata.checkoutSessionId));
        if(!checkoutSessionId)throw new Error('Invalid checkout session');const verified=await verifyPaystackPayment(settings,String(body.data.reference));await completeSessionByMetadata(checkoutSessionId,companyId,'paystack',verified);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] paystack', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/mercadopago/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const settings = (await getErpGatewaySettingsRaw(companyId, 'mercadopago')) as ErpMercadoPagoSettings | undefined;
      if (!settings?.accessToken) return res.status(400).json({ error: 'Mercado Pago not configured' });

      const { type, data } = req.body || {};
      if (type === 'payment' && data?.id) {
        const verified = await verifyMercadoPagoPayment(settings, String(data.id));
        if (verified.paid && verified.externalReference) {
          const checkoutSessionId = parseCompanyId(verified.externalReference);
          if (checkoutSessionId) {
            await completeSessionByMetadata(checkoutSessionId,companyId,'mercadopago',verified);
          }
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] mercadopago', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/paypal/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const settings = (await getErpGatewaySettingsRaw(companyId, 'paypal')) as ErpPayPalSettings | undefined;
      if (!settings?.clientId) return res.status(400).json({ error: 'PayPal not configured' });

      const body = req.body;
      const verificationUrl = settings.testMode
        ? 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr'
        : 'https://ipnpb.paypal.com/cgi-bin/webscr';
      const verificationBody =
        'cmd=_notify-validate&' +
        Object.keys(body)
          .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(body[key])}`)
          .join('&');
      const verificationResponse = await fetch(verificationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verificationBody,
      });
      const verificationText = await verificationResponse.text();

      if (verificationText === 'VERIFIED' && body.payment_status === 'Completed' && body.custom) {
        const checkoutSessionId = parseCompanyId(String(body.custom));
        if (checkoutSessionId) {
          const retained=await storage.getErpInvoiceCheckoutSession(checkoutSessionId);if(!retained||retained.companyId!==companyId||retained.gateway!=='paypal'||!retained.externalSessionId)throw new Error('Checkout scope does not match');const verified=await capturePayPalOrder(settings,retained.externalSessionId);await completeSessionByMetadata(checkoutSessionId,companyId,'paypal',verified);
        }
      }

      res.status(200).end();
    } catch (error) {
      console.error('[erp-webhook] paypal', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/moyasar/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const body = req.body;
      const metadata = body?.data?.metadata || body?.metadata;
      if (body?.type === 'payment_paid' && metadata?.checkoutSessionId) {
        const checkoutSessionId = parseCompanyId(String(metadata.checkoutSessionId));
        if(!checkoutSessionId)throw new Error('Invalid checkout session');const settings=await getErpGatewaySettingsRaw(companyId,'moyasar') as ErpMoyasarSettings|undefined;if(!settings?.secretKey)throw new Error('Moyasar not configured');const verified=await verifyMoyasarPayment(settings,String(body.data?.id));await completeSessionByMetadata(checkoutSessionId,companyId,'moyasar',verified);
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] moyasar', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/mpesa/:companyId', async (req: Request, res: Response) => {
    try {
      const companyId = parseCompanyId(req.params.companyId);
      if (!companyId) return res.status(400).json({ error: 'Invalid company ID' });

      const body = req.body?.Body?.stkCallback || req.body;
      if (body?.ResultCode === 0 && body?.CheckoutRequestID) {
        const session = await storage.getErpInvoiceCheckoutSessionByExternalId(
          companyId,
          body.CheckoutRequestID
        );
        if (session) {
          if (session.gateway !== 'mpesa') throw new Error('Checkout gateway does not match');
          const settings = await getErpGatewaySettingsRaw(companyId, 'mpesa') as ErpMpesaSettings | undefined;
          if (!settings) throw new Error('MPESA not configured');
          const verified = await verifyMpesaCheckout(settings, String(body.CheckoutRequestID));
          const merchantRequestId = (session.metadata as Record<string, unknown> | null)?.mpesaMerchantRequestId;
          if (!merchantRequestId || verified.checkoutRequestId !== session.externalSessionId || verified.merchantRequestId !== merchantRequestId) {
            throw new Error('MPESA initiation identity does not match');
          }
          // Daraja status queries omit amount and receipt. Use the retained exact
          // initiation amount and authenticated checkout ID; callback data is only a trigger.
          await completeSessionByMetadata(session.id, companyId, 'mpesa', {
            paid: verified.paid, amountText: session.amount, currency: session.currency,
            externalReference: String(session.id), referenceNumber: session.externalSessionId!,
          });
        }
      }

      res.json({ received: true });
    } catch (error) {
      console.error('[erp-webhook] mpesa', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  router.post('/bank-transfer/:companyId', async (_req, res) => {
    res.json({ received: true, message: 'Bank transfers are confirmed manually' });
  });

  app.use('/api/webhooks/erp', router);
}

export { erpGatewayFromRouteSlug, ERP_GATEWAY_TO_PAYMENT_METHOD };

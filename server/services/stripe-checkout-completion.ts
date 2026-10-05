import type Stripe from 'stripe';
import { getPool } from '../db';
import { storage } from '../storage';
import { computeSubscriptionEndDate } from '../routes/enhanced-subscription';

/** Only call with a session retrieved from Stripe or a verified Stripe webhook. */
export async function completeStripeCheckout(session: Stripe.Checkout.Session, expectedCompanyId?: number) {
  const transactionId=Number(session.metadata?.transactionId);
  if(!Number.isInteger(transactionId) || transactionId<=0) throw new Error('Missing checkout transaction');
  if(session.payment_status!=='paid' || session.mode!=='payment') throw new Error('Checkout payment is not complete');
  const client=await getPool().connect();
  try {
    await client.query('BEGIN');
    const {rows:[transaction]}=await client.query('SELECT * FROM payment_transactions WHERE id=$1 FOR UPDATE',[transactionId]);
    if(!transaction || transaction.payment_method!=='stripe' || Number(session.metadata?.companyId)!==transaction.company_id || Number(session.metadata?.planId)!==transaction.plan_id ||
      (expectedCompanyId!==undefined && transaction.company_id!==expectedCompanyId) || (transaction.metadata?.stripeSessionId && transaction.metadata.stripeSessionId!==session.id)) throw new Error('Checkout does not match its transaction');
    if(session.currency?.toLowerCase()!==transaction.currency.toLowerCase() || session.amount_total!==Math.round(Number(transaction.amount)*100)) throw new Error('Checkout amount or currency does not match');
    const plan=await storage.getPlan(transaction.plan_id);
    if(!plan) throw new Error('Purchased plan not found');
    const {rows:[company]}=await client.query('SELECT * FROM companies WHERE id=$1 FOR UPDATE',[transaction.company_id]);
    if(!company) throw new Error('Company not found');
    if(transaction.status!=='completed') {
      if(['refunded','cancelled'].includes(transaction.status)) throw new Error('Transaction is no longer payable');
      if(!company.appsumo_license_key) {
        const now=new Date();
        const base=transaction.metadata?.renewalType==='subscription_renewal' && company.subscription_end_date && new Date(company.subscription_end_date)>now ? new Date(company.subscription_end_date) : now;
        await client.query(`UPDATE companies SET plan_id=$2,plan=$3,max_users=$4,subscription_status='active',subscription_start_date=$5,
          subscription_end_date=$6,is_in_trial=false,trial_start_date=NULL,trial_end_date=NULL WHERE id=$1`,
          [company.id,plan.id,plan.name.toLowerCase(),plan.maxUsers,now,computeSubscriptionEndDate(plan,base)]);
      }
      await client.query(`UPDATE payment_transactions SET status='completed',payment_intent_id=$2,
        metadata=COALESCE(metadata,'{}'::jsonb)||$3::jsonb WHERE id=$1`,
        [transaction.id,typeof session.payment_intent==='string'?session.payment_intent:null,JSON.stringify({stripeSessionId:session.id,...(company.appsumo_license_key?{appsumoEntitlementPreserved:true}:{})})]);
    }
    await client.query('COMMIT');
    return {plan:company.appsumo_license_key?null:plan};
  } catch(error) {await client.query('ROLLBACK');throw error;}
  finally {client.release();}
}

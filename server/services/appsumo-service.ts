import { createHash, randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { getPool } from '../db';
import { encryptValue, decryptValue } from '../utils/crypto';
import { AppSumoRepository, type AppSumoSql, type AppSumoTransaction } from './appsumo-repository';
import { APPSUMO_CALLBACK } from '../../shared/appsumo';
import { safeAppSumoManagementUrl } from './appsumo-protocol';

const sql: AppSumoSql = { query: (q, p) => getPool().query(q, p) };
export const appSumoTransaction: AppSumoTransaction = async work => {
  const client = await getPool().connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
};
export const appSumoRepository = new AppSumoRepository(sql, appSumoTransaction);
export const activationHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function appSumoConfig() {
  const { rows: [config] } = await sql.query('SELECT * FROM appsumo_config WHERE id=1');
  return config;
}
export async function saveAppSumoConfig(input: { enabled: boolean; apiKey?: string; clientId?: string; clientSecret?: string; tiers: Record<string, number> }) {
  await appSumoTransaction(async tx => {
    const { rows: [old] } = await tx.query('SELECT * FROM appsumo_config WHERE id=1 FOR UPDATE');
    const apiKey = input.apiKey ? encryptValue(input.apiKey) : old.api_key_encrypted;
    const secret = input.clientSecret ? encryptValue(input.clientSecret) : old.client_secret_encrypted;
    // URL validation precedes OAuth credential issuance; webhooks can be enabled with the API key alone.
    if (input.enabled && !apiKey) throw new Error('An AppSumo API key is required');
    for (const tier of [1,2,3]) {
      const planId = input.tiers[String(tier)];
      const { rows: [plan] } = await tx.query('SELECT id FROM plans WHERE id=$1 AND is_active=true AND is_free=false', [planId]);
      if (!plan) throw new Error(`Select an active paid plan for tier ${tier}`);
    }
    if (new Set(Object.values(input.tiers)).size !== 3) throw new Error('Each AppSumo tier must use a different plan');
    await tx.query('DELETE FROM appsumo_tiers');
    for (const tier of [1,2,3]) await tx.query('INSERT INTO appsumo_tiers(tier,plan_id) VALUES ($1,$2)', [tier,input.tiers[String(tier)]]);
    await tx.query('UPDATE appsumo_config SET enabled=$1,api_key_encrypted=$2,client_id=$3,client_secret_encrypted=$4 WHERE id=1',
      [input.enabled,apiKey,input.clientId || old.client_id,secret]);
    await tx.query('UPDATE companies SET updated_at=now() WHERE appsumo_license_key IS NOT NULL');
  });
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`AppSumo request failed (${response.status}). Please retry activation.`);
  return response.json();
}

export async function appSumoApi(path: string) {
  const config = await appSumoConfig();
  if (!config?.enabled || !config.api_key_encrypted) throw new Error('AppSumo is not configured');
  // Database reservation coordinates workers/processes. Never sleep with a DB lock held.
  const { rows } = await sql.query(`UPDATE appsumo_config SET api_next_request_at=GREATEST(now(),api_next_request_at)+interval '3100 milliseconds'
    WHERE id=1 AND api_next_request_at<=now()+interval '10 seconds' RETURNING api_next_request_at-interval '3100 milliseconds' AS available_at`);
  if (!rows.length) throw new Error('AppSumo API rate limit; retry shortly');
  const wait = new Date(rows[0].available_at).getTime()-Date.now();
  if(wait>0) await new Promise(resolve=>setTimeout(resolve,wait));
  return fetchJson(`https://api.licensing.appsumo.com/v2/${path}`, { headers: { 'X-AppSumo-Licensing-Key': decryptValue(config.api_key_encrypted) } });
}

export async function beginAppSumoOAuth(code: string) {
  const config = await appSumoConfig();
  if (!config?.enabled || !config.client_id || !config.client_secret_encrypted) throw new Error('AppSumo OAuth is not configured');
  const token = await fetchJson('https://appsumo.com/openid/token/', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({code, client_id:config.client_id, client_secret:decryptValue(config.client_secret_encrypted), redirect_uri:APPSUMO_CALLBACK, grant_type:'authorization_code'}),
  });
  if (!token.access_token || token.error) throw new Error('Authorization expired. Activate again from AppSumo.');
  const proof = await fetchJson(`https://appsumo.com/openid/license_key/?access_token=${encodeURIComponent(token.access_token)}`);
  if (typeof proof.license_key !== 'string' || !/^[0-9a-f-]{36}$/i.test(proof.license_key) || proof.status !== 'active') throw new Error('AppSumo license is not active');
  const current = await appSumoApi(`licenses/${encodeURIComponent(proof.license_key)}`);
  // Tier and initial activation come from signed webhooks. Do not create an entitlement from a browser or OAuth query.
  const { rows: [license] } = await sql.query('SELECT * FROM appsumo_licenses WHERE license_key=$1', [proof.license_key]);
  if (!license || license.status !== 'active' || license.replacement_key || current.status !== 'active' || current.tier !== license.tier) {
    throw new Error('License activation is still syncing. Please activate again from AppSumo shortly.');
  }
  await sql.query('UPDATE appsumo_licenses SET management_url=$2 WHERE license_key=$1', [proof.license_key,safeAppSumoManagementUrl(current.license_change_plan_url)]);
  const claim = randomBytes(32).toString('hex');
  await sql.query(`INSERT INTO appsumo_activations(token_hash,license_key,expires_at) VALUES($1,$2,now()+interval '30 minutes')`, [activationHash(claim),proof.license_key]);
  return claim;
}

export async function stopAppSumoPreviousBilling(hash: string, companyId: number) {
  const a = await appSumoTransaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(259,1)');
    const a = await appSumoRepository.activation(hash,tx,true);
    const {rows:[reserved]} = await tx.query('SELECT pending_company_id FROM appsumo_licenses WHERE license_key=$1',[a.license_key]);
    if (reserved.pending_company_id && reserved.pending_company_id !== companyId) throw new Error('License activation is already reserved for another company');
    if (a.company_id && a.company_id !== companyId) throw new Error('License is linked to another company');
    if (a.target_company_id && a.target_company_id !== companyId) throw new Error('Activation is reserved for another company');
    const { rows: [other] } = await tx.query('SELECT license_key FROM appsumo_licenses WHERE company_id=$1 AND replacement_key IS NULL', [companyId]);
    if (other && other.license_key !== a.license_key) throw new Error('Company already has an AppSumo license');
    await tx.query('UPDATE appsumo_activations SET target_company_id=$2 WHERE token_hash=$1', [hash,companyId]);
    await tx.query('UPDATE appsumo_licenses SET pending_company_id=$2 WHERE license_key=$1',[a.license_key,companyId]);
    return a;
  });
  if (a.billing_stopped_at) return;
  try {
    const { rows: [company] } = await sql.query('SELECT * FROM companies WHERE id=$1', [companyId]);
    if (!company) throw new Error('Company not found');
    const { rows: [setting] } = await sql.query("SELECT value FROM app_settings WHERE key='payment_stripe'");
    if (company.stripe_subscription_id || company.stripe_customer_id) {
      if (!setting?.value?.secretKey) throw new Error('Stripe configuration is required to stop existing billing');
      const stripe = new Stripe(setting.value.secretKey);
      if (company.stripe_subscription_id) {
        const subscription = await stripe.subscriptions.retrieve(company.stripe_subscription_id);
        if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscription.id,{prorate:false,invoice_now:false});
      }
      if (company.stripe_customer_id) {
        for await (const session of stripe.checkout.sessions.list({customer:company.stripe_customer_id,status:'open',limit:100})) {
          await stripe.checkout.sessions.expire(session.id);
        }
      }
    }
    // Checkout IDs from the platform's one-time flow are recorded even without a Stripe customer.
    const { rows: pending } = await sql.query("SELECT metadata FROM payment_transactions WHERE company_id=$1 AND payment_method='stripe' AND status IN ('pending','failed')",[companyId]);
    const sessionIds = pending.map(p=>p.metadata?.stripeSessionId).filter(Boolean);
    if (sessionIds.length) {
      if (!setting?.value?.secretKey) throw new Error('Stripe configuration is required to expire checkout sessions');
      const stripe = new Stripe(setting.value.secretKey);
      for (const id of sessionIds) { const session=await stripe.checkout.sessions.retrieve(id); if(session.status==='open') await stripe.checkout.sessions.expire(id); }
    }
    await appSumoTransaction(async tx => {
      await tx.query('UPDATE companies SET auto_renewal=false,stripe_subscription_id=NULL WHERE id=$1',[companyId]);
      await tx.query("UPDATE dunning_management SET status='cancelled',next_attempt_date=NULL WHERE company_id=$1 AND (status IN ('pending','in_progress','failed') OR next_attempt_date IS NOT NULL)",[companyId]);
      await tx.query("UPDATE subscription_notifications SET status='cancelled' WHERE company_id=$1 AND status='pending'",[companyId]);
      await tx.query("UPDATE subscription_plan_changes SET processed=true,change_reason='appsumo_replacement' WHERE company_id=$1 AND processed=false",[companyId]);
      await tx.query('UPDATE appsumo_activations SET billing_stopped_at=now(),billing_error=NULL WHERE token_hash=$1',[hash]);
    });
  } catch (error) {
    await sql.query('UPDATE appsumo_activations SET billing_error=$2 WHERE token_hash=$1',[hash,'Unable to stop previous billing; review Stripe configuration and retry.']);
    throw error;
  }
}

export async function linkAppSumoCompany(hash: string, companyId: number, userId: number) {
  await stopAppSumoPreviousBilling(hash,companyId);
  await appSumoTransaction(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(259,1)');
    await appSumoRepository.claim(tx,hash,companyId,userId);
  });
}

export async function retryAppSumoEvent(id: number) {
  try {
  const { rows: [receipt] } = await sql.query('SELECT * FROM appsumo_events WHERE id=$1',[id]);
  if (!receipt || receipt.status==='processed') return;
  if (receipt.error?.startsWith('Reconciliation required')) {
    const events:any[]=[];
    for(let page=1;page<=100;page++) {
      const history = await appSumoApi(`licenses/${receipt.license_key}/events?limit=100&page=${page}`);
      if(!Array.isArray(history.items)) throw new Error('AppSumo event history is unavailable');
      events.push(...history.items);
      if(history.items.length<100) break;
      if(page===100) throw new Error('License history exceeds reconciliation limit; contact support');
    }
    if (!Array.isArray(events) || !events.length) throw new Error('AppSumo event history is unavailable');
    if(events.some(e=>!Number.isSafeInteger(e.event_id)||e.event_id<=0)) throw new Error('AppSumo event identifiers are unavailable');
    const latest = [...events].sort((a,b)=>b.event_id-a.event_id)[0];
    if (!['activate','deactivate','purchase','upgrade','downgrade'].includes(latest.event)) throw new Error('Unsupported AppSumo event history');
    await appSumoRepository.process(id,latest.event==='deactivate'?'deactivated':latest.event==='purchase'?'inactive':'active');
  } else await appSumoRepository.process(id);
  } catch(error) {
    await sql.query(`UPDATE appsumo_events SET status='failed',attempts=attempts+1,
      error=CASE WHEN error LIKE 'Reconciliation required%' THEN $2 ELSE COALESCE(error,$2) END,
      next_attempt_at=now()+interval '1 minute' * LEAST(60,power(2,LEAST(attempts,6))) WHERE id=$1 AND status<>'processed'`,
      [id,`Reconciliation required: ${error instanceof Error?error.message.slice(0,400):'AppSumo unavailable'}`]);
    throw error;
  }
}

export function startAppSumoWorker() {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running=true;
    try {
      if (!(await appSumoConfig())?.enabled) return;
      const { rows }=await sql.query("SELECT id FROM appsumo_events WHERE status<>'processed' AND next_attempt_at<=now() ORDER BY id LIMIT 20");
      for(const row of rows) { try { await retryAppSumoEvent(row.id); } catch { /* durable error is visible to support */ } }
      await sql.query("DELETE FROM appsumo_activations WHERE expires_at<now()-interval '7 days' AND billing_error IS NULL");
    } catch (error) { console.error('AppSumo worker unavailable:', error instanceof Error ? error.message : 'unknown error'); }
    finally { running=false; }
  },60_000);
  timer.unref();
  return timer;
}

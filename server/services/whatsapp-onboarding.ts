import { createHash, randomInt } from 'crypto';
import type { PoolClient } from 'pg';
import { getPool } from '../db';
import { storage } from '../storage';
import { encryptValue, decryptValue } from '../utils/crypto';
import { validateWhatsAppFinish, type WhatsAppOnboardingInput, type WhatsAppOnboardingResult } from '../../shared/whatsapp-onboarding';
import { discoverWhatsAppPhones, whatsappGraph, WhatsAppOnboardingError } from './whatsapp-onboarding-graph';
import { patchWhatsAppConnection } from './whatsapp-connection-state';
import { retryWebhookConfiguration } from './meta-webhook-configurator';
import { requestCoexistenceSync } from './whatsapp-coexistence-sync';

const TTL = 15 * 60 * 1000;
export async function withWhatsAppLock<T>(key: string, run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  let locked = false;
  try {
    const result = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [key]);
    locked = result.rows[0].locked;
    if (!locked) throw new WhatsAppOnboardingError('Setup is already running. Wait a moment and retry.', 409, 'WHATSAPP_SETUP_BUSY');
    return await run(client);
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key]);
    } finally { client.release(); }
  }
}

export async function exchangeWhatsAppCode(code: string, attemptId: string, userId: number, companyId: number) {
  if (typeof code !== 'string' || !code || typeof attemptId !== 'string' || !/^[a-f0-9-]{36}$/i.test(attemptId)) {
    throw new WhatsAppOnboardingError('A fresh Meta authorization and attempt ID are required.', 400, 'WHATSAPP_AUTHORIZATION_REQUIRED');
  }
  return withWhatsAppLock(`whatsapp-session:${attemptId}`, async client => {
    const previous = await client.query('SELECT * FROM meta_onboarding_sessions WHERE session_id = $1', [attemptId]);
    const hash = createHash('sha256').update(code).digest('hex');
    if (previous.rows[0]) {
      const row = previous.rows[0];
      if (row.user_id !== userId || row.company_id !== companyId || row.channel !== 'whatsapp' || row.whatsapp_state?.codeHash !== hash || new Date(row.expires_at).getTime() < Date.now()) {
        throw new WhatsAppOnboardingError('This authorization attempt is unavailable. Restart signup.', 403, 'WHATSAPP_AUTHORIZATION_UNAVAILABLE');
      }
      return { sessionId: attemptId };
    }
    const config = await storage.getPartnerConfiguration('meta');
    if (!config?.partnerApiKey || !config.partnerSecret) throw new WhatsAppOnboardingError('The Meta app ID and secret must be configured.', 400, 'WHATSAPP_CONFIGURATION_MISSING');
    // Meta documents a server-to-server GET exchange. Never log this request or its parameters.
    const token = await whatsappGraph('oauth/access_token', '', 'GET', {
      client_id: config.partnerApiKey, client_secret: config.partnerSecret, code,
    });
    if (!token.access_token) throw new WhatsAppOnboardingError('Meta did not return a customer business token. Restart signup.', 400, 'WHATSAPP_AUTHORIZATION_UNAVAILABLE');
    await client.query(`INSERT INTO meta_onboarding_sessions
      (session_id, user_id, company_id, channel, encrypted_user_access_token, discovered_asset_ids, expires_at, whatsapp_state)
      VALUES ($1,$2,$3,'whatsapp',$4,'[]',$5,$6)`,
    [attemptId, userId, companyId, encryptValue(token.access_token), new Date(Date.now() + TTL), JSON.stringify({ codeHash: hash, authorizedAt: new Date().toISOString() })]);
    return { sessionId: attemptId };
  });
}

export async function completeWhatsAppOnboarding(input: WhatsAppOnboardingInput, userId: number, companyId: number): Promise<WhatsAppOnboardingResult> {
  if (!input || typeof input.sessionId !== 'string' || typeof input.connectionName !== 'string' || !input.connectionName.trim()) throw new WhatsAppOnboardingError('Connection name and authorization session are required.', 400, 'SETUP_REQUIRED_FIELDS');
  if (!input.signupData?.data) throw new WhatsAppOnboardingError('Meta signup data is required.', 400, 'WHATSAPP_SIGNUP_DETAILS_MISSING');
  validateWhatsAppFinish(input.signupData);
  if (typeof input.enableHistorySync !== 'boolean') throw new WhatsAppOnboardingError('Choose whether to import history.');
  return withWhatsAppLock(`whatsapp-session:${input.sessionId}`, async client => {
    const { rows: [session] } = await client.query('SELECT * FROM meta_onboarding_sessions WHERE session_id = $1', [input.sessionId]);
    if (!session || session.channel !== 'whatsapp' || session.user_id !== userId || session.company_id !== companyId || new Date(session.expires_at).getTime() < Date.now()) {
      throw new WhatsAppOnboardingError('Authorization session expired or unavailable. Restart Meta signup.', 403, 'WHATSAPP_SESSION_EXPIRED');
    }
    const state = session.whatsapp_state || {};
    const wabaId = input.signupData.data.waba_id!;
    if (!/^\d+$/.test(wabaId)) throw new WhatsAppOnboardingError('Invalid WhatsApp Business Account ID.');
    const repairId = input.repairConnectionId;
    if (repairId !== undefined && (!Number.isInteger(repairId) || repairId < 1)) throw new WhatsAppOnboardingError('Invalid repair connection.');
    // Bind the resumed attempt to the original intent, while allowing a discovered phone selection.
    const intent = JSON.stringify({ wabaId, repairId, history: input.enableHistorySync, name: input.connectionName.trim(), event: input.signupData.event });
    if (state.intent && state.intent !== intent) throw new WhatsAppOnboardingError('The setup details changed. Restart signup.', 400, 'WHATSAPP_SETUP_DETAILS_CHANGED');
    state.intent = intent;
    const save = async () => { await client.query('UPDATE meta_onboarding_sessions SET whatsapp_state=$2 WHERE session_id=$1', [input.sessionId, JSON.stringify(state)]); };
    await save();
    if (state.result?.status === 'ready') return state.result;
    const token = decryptValue(session.encrypted_user_access_token);
    return withWhatsAppLock(`whatsapp-waba:${wabaId}`, async () => {
      const config = await storage.getPartnerConfiguration('meta');
      if (!config?.partnerApiKey || !config.partnerSecret || !config.partnerWebhookUrl || !config.webhookVerifyToken) throw new WhatsAppOnboardingError('Meta app credentials and webhook URL/verify token must be configured.', 400, 'WHATSAPP_CONFIGURATION_MISSING');
      const inspected = await whatsappGraph('debug_token', `${config.partnerApiKey}|${config.partnerSecret}`, 'GET', { input_token: token });
      if (inspected.data?.is_valid !== true || String(inspected.data.app_id) !== String(config.partnerApiKey) ||
          !['whatsapp_business_management', 'whatsapp_business_messaging'].every(scope => inspected.data.scopes?.includes(scope))) {
        throw new WhatsAppOnboardingError('Meta did not grant the required WhatsApp permissions to this app. Check Advanced Access and the Embedded Signup configuration, then restart signup.', 400, 'WHATSAPP_PERMISSIONS_MISSING');
      }
      const existingClient = await storage.getMetaWhatsappClientByBusinessAccountId(wabaId);
      if (existingClient && existingClient.companyId !== companyId) throw new WhatsAppOnboardingError('This WhatsApp account is already connected to another company.', 403, 'WHATSAPP_ACCOUNT_IN_USE');
      // Customer-token access, not client-provided phone details, is authoritative.
      const waba = await whatsappGraph(encodeURIComponent(wabaId), token, 'GET', { fields: 'id,name' });
      const phones = await discoverWhatsAppPhones(wabaId, token);
      const coexistence = input.signupData.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING';
      const eligible = phones.filter(phone => coexistence ? phone.is_on_biz_app === true && phone.platform_type === 'CLOUD_API' : phone.is_on_biz_app === false);
      const repair = repairId ? await storage.getChannelConnection(repairId) : undefined;
      if (repairId && (!repair || repair.companyId !== companyId || repair.channelType !== 'whatsapp_official' || !(repair.connectionData as any)?.partnerManaged)) throw new WhatsAppOnboardingError('Repair connection not found.', 404);
      if (repair) await whatsappGraph(`${encodeURIComponent(wabaId)}/message_templates`, token, 'GET', { fields: 'id', limit: 1 });
      const repairPhone = (repair?.connectionData as any)?.phoneNumberId;
      const suppliedPhone = input.selectedPhoneNumberId || input.signupData.data.phone_number_id;
      const selectedId = suppliedPhone || repairPhone || (eligible.length === 1 ? eligible[0].id : undefined);
      if (repair && suppliedPhone && String(suppliedPhone) !== String(repairPhone)) throw new WhatsAppOnboardingError('Select the same phone number as the connection being repaired.');
      if (!selectedId && eligible.length > 1) return { status: 'needs_selection', message: 'Choose the number to connect.', messageCode: 'WHATSAPP_PHONE_SELECTION_REQUIRED', phoneNumbers: eligible.map(p => ({ id: p.id, display_phone_number: p.display_phone_number, verified_name: p.verified_name })) };
      const phone = eligible.find(p => String(p.id) === String(selectedId));
      if (!phone) throw new WhatsAppOnboardingError('No eligible phone number was found for this signup. Verify your number and selected signup mode.', 400, 'WHATSAPP_PHONE_NOT_ELIGIBLE');
      if (state.phoneId && state.phoneId !== phone.id) throw new WhatsAppOnboardingError('This attempt is already bound to another phone number. Restart signup.', 400, 'WHATSAPP_PHONE_IN_USE');
      state.phoneId = phone.id;
      await save();
      const allConnections = await storage.getChannelConnectionsByType('whatsapp_official');
      const existing = allConnections.find(c => String((c.connectionData as any)?.phoneNumberId) === String(phone.id));
      if (existing && existing.companyId !== companyId) throw new WhatsAppOnboardingError('This number belongs to another company.', 403, 'WHATSAPP_PHONE_IN_USE');
      if (repair && existing && existing.id !== repair.id) throw new WhatsAppOnboardingError('This number belongs to a different connection.', 400, 'WHATSAPP_PHONE_IN_USE');
      const prior = (existing?.connectionData || {}) as any;
      // Standard Cloud API requires registration. Persist the PIN before sending so a retry is stable.
      if (!coexistence && !state.registered && !(existing && existing.status === 'active')) {
        if (!state.pin) { state.pin = prior.encryptedRegistrationPin || encryptValue(String(randomInt(0, 1_000_000)).padStart(6, '0')); await save(); }
        const registered = await whatsappGraph(`${phone.id}/register`, token, 'POST', { messaging_product: 'whatsapp', pin: decryptValue(state.pin) });
        if (!registered.success) throw new WhatsAppOnboardingError('Meta did not confirm phone registration.', 400, 'WHATSAPP_REGISTRATION_FAILED');
        state.registered = true; await save();
      } else if (!coexistence && !state.registered) {
        // An active connection is already registered. Remember this across webhook retries.
        state.registered = true; await save();
      }
      const metaClient = existingClient || await storage.createMetaWhatsappClient({ companyId, businessAccountId: wabaId, businessAccountName: waba.name || input.connectionName, status: 'active', onboardedAt: new Date() });
      let phoneRecord = await storage.getMetaWhatsappPhoneNumberByPhoneNumberId(phone.id);
      if (phoneRecord && phoneRecord.clientId !== metaClient.id) throw new WhatsAppOnboardingError('Phone account ownership differs from the saved connection.', 409);
      if (!phoneRecord) phoneRecord = await storage.createMetaWhatsappPhoneNumber({ clientId: metaClient.id, phoneNumberId: phone.id, phoneNumber: phone.display_phone_number, displayName: phone.verified_name || phone.display_phone_number, status: 'verified', qualityRating: 'unknown' });
      const connectionData: Record<string, any> = {
        ...prior, phoneNumberId: phone.id, phoneNumber: phone.display_phone_number, displayName: phone.verified_name,
        wabaId, waba_id: wabaId, businessAccountId: wabaId, ...(input.signupData.data.business_id ? { businessId: input.signupData.data.business_id } : {}),
        appId: config.partnerApiKey, accessToken: token, partnerManaged: true,
        signupMode: coexistence ? 'coexistence' : 'standard', isOnBizApp: phone.is_on_biz_app === true,
        platformType: phone.platform_type, onboardingStatus: 'configuring',
        coexistenceStatus: coexistence ? 'connected' : undefined,
        coexistenceOnboardedAt: prior.coexistenceOnboardedAt || state.authorizedAt,
        historySyncEnabled: coexistence && (prior.historySyncEnabled || input.enableHistorySync),
        historySyncStatus: prior.historySyncStatus || (coexistence && input.enableHistorySync ? 'pending' : 'disabled'),
        ...(state.pin ? { encryptedRegistrationPin: state.pin } : {}),
      };
      let connection = existing
        ? await storage.updateChannelConnection(existing.id, { connectionData, accessToken: null, status: 'pending' })
        : await storage.createChannelConnection({ userId, companyId, channelType: 'whatsapp_official', accountId: phone.id, accountName: input.connectionName.trim(), connectionData, status: 'pending' });
      state.connectionId = connection.id; await save();
      // Save before subscribing so arriving webhooks can resolve the number immediately.
      const webhook = await retryWebhookConfiguration(wabaId, config.partnerApiKey, config.partnerWebhookUrl, config.webhookVerifyToken,
        `${config.partnerApiKey}|${config.partnerSecret}`, 2, token, coexistence);
      if (!webhook.success) {
        await patchWhatsAppConnection(connection.id, { onboardingStatus: 'webhook_failed' }, 'pending');
        return { status: 'incomplete', connectionId: connection.id, message: 'Account saved, but webhook setup failed. Check Meta webhook configuration and retry setup.', messageCode: 'WHATSAPP_WEBHOOK_SETUP_FAILED' };
      }
      await storage.updateMetaWhatsappClient(metaClient.id, { onboardingState: 'webhook_configured', webhookConfiguredAt: new Date() });
      await patchWhatsAppConnection(connection.id, { onboardingStatus: 'ready' }, 'active');
      if (coexistence) await requestCoexistenceSync(connection.id);
      connection = (await storage.getChannelConnection(connection.id))!;
      const current = connection.connectionData as any;
      const syncProblem = [current.contactSyncStatus, current.historySyncStatus].some(s => ['failed', 'unknown', 'expired'].includes(s));
      const result: WhatsAppOnboardingResult = {
        status: syncProblem ? 'incomplete' : 'ready', connectionId: connection.id,
        message: syncProblem ? 'Messaging is connected, but data synchronization needs attention. Review the sync status before retrying.' : 'WhatsApp is connected. Any requested data synchronization will continue in the background.',
        messageCode: syncProblem ? 'WHATSAPP_SYNC_ATTENTION' : 'WHATSAPP_CONNECTED',
        signupMode: connectionData.signupMode, contactSyncStatus: current.contactSyncStatus, historySyncStatus: current.historySyncStatus,
      };
      state.result = result; await save();
      return result;
    });
  });
}

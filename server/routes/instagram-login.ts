import type { Express, Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { getInstagramTranslator } from '../utils/instagram-i18n';
import { instagramEnglish, type InstagramTranslate } from '../../shared/instagram-i18n';
import axios from 'axios';
import { pool } from '../db';
import { storage } from '../storage';
import { ensureAuthenticated, ensureActiveSubscription, ensureSuperAdmin } from '../middleware';
import { encryptValue } from '../utils/crypto';
import { getPublicBaseUrlFromRequest } from '../utils/twilio-public-url';
import { createInstagramOAuthState, consumeInstagramOAuthState } from '../services/instagram-oauth-state-store';
import {
  instagramConfiguration, requireInstagramConfiguration, instagramAuthorizationUrl,
  exchangeInstagramAuthorizationCode, subscribeInstagramBusinessAccount, InstagramLoginError,
} from '../services/instagram-business-login';
import { validateInstagramLoginConfiguration, type InstagramLoginResult } from '../../shared/types/instagram-login';
import * as instagram from '../services/channels/instagram';
import { sanitizeMetaConnectionForClient } from '../services/meta-graph-api';

const safeError = (error: unknown, t: InstagramTranslate) => error instanceof InstagramLoginError ? error.message : t('instagram.errors.setup_failed', 'Instagram setup could not be completed. Please try again.');

function callbackResponse(res: Response, origin: string | undefined, result: InstagramLoginResult, t: InstagramTranslate = instagramEnglish) {
  const nonce = randomBytes(18).toString('base64');
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  res.type('html').send(`<!doctype html><html><head><title>Instagram</title></head><body>
    <p id="status"></p><script nonce="${nonce}">
    const result = ${json(result)};
    document.title = ${json(t('settings.instagram_connection.direct_title', 'Instagram connection'))};
    document.getElementById('status').textContent = result.success ? ${json(t('instagram.login.completed', 'Instagram authorization completed. You can close this window.'))} : (result.error || ${json(t('instagram.login.callback_failed', 'Instagram authorization failed. Return to settings and try again.'))});
    const origin = ${json(origin || '')};
    if (origin && window.opener) { window.opener.postMessage(result, origin); window.close(); }
    </script></body></html>`);
}

export function registerInstagramLoginRoutes(app: Express, broadcast: (data: unknown, companyId: number) => void) {
  for (const channel of ['instagram', 'messenger'] as const) {
    app.post(`/api/admin/partner-configurations/${channel}/test-webhook`, ensureSuperAdmin, async (_req, res) => {
    const t = await getInstagramTranslator(_req.user?.languagePreference || 'en');
      try {
        const config = await storage.getPartnerConfiguration(channel === 'instagram' ? 'instagram' : 'meta');
        const url = channel === 'instagram' ? config?.partnerWebhookUrl : config?.messengerWebhookUrl;
        if (!url || !config?.webhookVerifyToken) return res.status(400).json({ error: t("settings.metaPartnerConfiguration.webhook_save_first", 'Save the channel configuration before testing its webhook.') });
        const challenge = randomBytes(16).toString('hex');
        const response = await axios.get(url, { params: {
          'hub.mode': 'subscribe', 'hub.verify_token': config.webhookVerifyToken, 'hub.challenge': challenge,
        }, timeout: 10000, maxRedirects: 0, responseType: 'text' });
        const success = response.status === 200 && String(response.data) === challenge;
        res.status(success ? 200 : 400).json({ success, ...(!success ? { error: t("settings.metaPartnerConfiguration.webhook_challenge_failed", 'Webhook did not return the verification challenge. Check the saved URL and verify token.') } : {}) });
      } catch { res.status(400).json({ success: false, error: t("settings.metaPartnerConfiguration.webhook_verify_failed", 'Could not verify the webhook. Check the saved URL and verify token.') }); }
    });
  }
  app.get('/api/admin/partner-configurations/instagram', ensureSuperAdmin, async (_req, res) => {
    const t = await getInstagramTranslator(_req.user?.languagePreference || 'en');
    try {
      const config = (await storage.getAllPartnerConfigurations()).find(c => c.provider === 'instagram');
      if (!config) return res.status(404).json({ error: t("instagram.errors.not_configured", 'Instagram is not configured.') });
      const settings = instagramConfiguration(config);
      res.set('Cache-Control', 'no-store').json({ ...settings, appSecret: '', hasAppSecret: !!settings.appSecret, isActive: config.isActive });
    } catch { res.status(500).json({ error: t("instagram.errors.load_configuration", 'Could not load Instagram configuration.') }); }
  });

  app.get('/api/admin/partner-configurations/instagram/secret', ensureSuperAdmin, async (_req, res) => {
    const t = await getInstagramTranslator(_req.user?.languagePreference || 'en');
    res.set('Cache-Control', 'no-store');
    try {
      const config = (await storage.getAllPartnerConfigurations()).find(c => c.provider === 'instagram');
      if (!config) return res.status(404).json({ error: t("instagram.errors.not_configured", 'Instagram is not configured.') });
      res.json({ appSecret: instagramConfiguration(config).appSecret });
    } catch { res.status(500).json({ error: t("instagram.errors.reveal_secret", 'Could not reveal the saved secret.') }); }
  });

  app.put('/api/admin/partner-configurations/instagram', ensureSuperAdmin, async (req, res) => {
    const t = await getInstagramTranslator(req.user?.languagePreference || 'en');
    try {
      const existing = (await storage.getAllPartnerConfigurations()).find(c => c.provider === 'instagram');
      const previous = existing ? instagramConfiguration(existing) : null;
      const read = (key: string) => typeof req.body[key] === 'string' ? req.body[key].trim() : '';
      const settings = { appId: read('appId'), appSecret: read('appSecret') || previous?.appSecret || '',
        verifyToken: read('verifyToken') || previous?.verifyToken || randomBytes(24).toString('hex'),
        webhookUrl: read('webhookUrl'), redirectUrl: read('redirectUrl') };
      const errors = validateInstagramLoginConfiguration(settings, t);
      if (errors.length) return res.status(400).json({ error: errors.join(' ') });
      const payload = { provider: 'instagram', partnerId: '', partnerApiKey: settings.appId,
        partnerSecret: `igenc:${encryptValue(settings.appSecret)}`, webhookVerifyToken: settings.verifyToken,
        partnerWebhookUrl: settings.webhookUrl, redirectUrl: settings.redirectUrl, isActive: true, apiVersion: 'v25.0' };
      if (existing) await storage.updatePartnerConfiguration(existing.id, payload);
      else await storage.createPartnerConfiguration(payload);
      res.json({ ...settings, appSecret: '', hasAppSecret: true, isActive: true });
    } catch { res.status(500).json({ error: t("instagram.errors.save_configuration", 'Could not save Instagram configuration. Check the server encryption configuration.') }); }
  });

  // Partial channel writes preserve unrelated fields in the existing Meta record.
  app.put('/api/admin/partner-configurations/meta/channel/:channel', ensureSuperAdmin, async (req, res) => {
    const t = await getInstagramTranslator(req.user?.languagePreference || 'en');
    try {
      const channel = req.params.channel;
      if (channel !== 'whatsapp' && channel !== 'messenger') return res.status(400).json({ error: t('settings.metaPartnerConfiguration.invalid_channel', 'Invalid channel.') });
      const existing = (await storage.getAllPartnerConfigurations()).find(c => c.provider === 'meta');
      const common = ['partnerApiKey', 'partnerSecret', 'webhookVerifyToken'];
      const fields = channel === 'whatsapp'
        ? [...common, 'partnerId', 'accessToken', 'configId', 'partnerWebhookUrl', 'redirectUrl']
        : [...common, 'messengerConfigId', 'metaChannelsConfigId', 'messengerWebhookUrl'];
      const payload: Record<string, any> = {};
      for (const field of fields) {
        if (typeof req.body[field] === 'string') payload[field] = req.body[field].trim();
      }
      if (!payload.partnerSecret) delete payload.partnerSecret;
      const merged = { ...existing, ...payload };
      if (!/^\d+$/.test(merged.partnerApiKey || '') || !merged.partnerSecret ||
          (channel === 'whatsapp' && !/^\d+$/.test(merged.partnerId || ''))) {
        return res.status(400).json({ error: channel === 'whatsapp'
          ? t("settings.metaPartnerConfiguration.validation_whatsapp", 'App ID, App Secret, and numeric Business Manager ID are required.') : t("settings.metaPartnerConfiguration.validation_credentials", 'App ID and App Secret are required.') });
      }
      if (channel === 'messenger' && !merged.metaChannelsConfigId && !merged.messengerConfigId) {
        return res.status(400).json({ error: t("settings.metaPartnerConfiguration.validation_messenger_id", 'Messenger needs a Login for Business configuration ID.') });
      }
      if (!merged.webhookVerifyToken) payload.webhookVerifyToken = randomBytes(24).toString('hex');
      const webhook = channel === 'whatsapp' ? merged.partnerWebhookUrl : merged.messengerWebhookUrl;
      if (webhook) {
        try { if (new URL(webhook).protocol !== 'https:') throw new Error(); }
        catch { return res.status(400).json({ error: t("settings.metaPartnerConfiguration.validation_https", 'Webhook URL must use HTTPS.') }); }
      }
      const saved = existing ? await storage.updatePartnerConfiguration(existing.id, payload)
        : await storage.createPartnerConfiguration({ ...payload, provider: 'meta', partnerApiKey: merged.partnerApiKey,
          partnerId: merged.partnerId || '', isActive: true, apiVersion: 'v25.0' } as any);
      res.json(saved);
    } catch { res.status(500).json({ error: t("settings.metaPartnerConfiguration.save_channel_failed", 'Could not save channel configuration.') }); }
  });

  app.get('/api/partner-configurations/instagram/availability', ensureAuthenticated, async (_req, res) => {
    const t = await getInstagramTranslator(_req.user?.languagePreference || 'en');
    res.set('Cache-Control', 'no-store');
    try {
      requireInstagramConfiguration(await storage.getPartnerConfiguration('instagram'), t);
      res.json({ isAvailable: true });
    } catch (error) { res.json({ isAvailable: false, message: safeError(error, t) }); }
  });

  app.post('/api/instagram/oauth/prepare', ensureAuthenticated, ensureActiveSubscription, async (req, res) => {
    const t = await getInstagramTranslator(req.user?.languagePreference || 'en');
    try {
      const user = req.user as any;
      if (!user?.companyId) return res.status(401).json({ error: t("instagram.errors.company_required", 'Company authentication is required.') });
      const name = typeof req.body.connectionName === 'string' ? req.body.connectionName.trim() : '';
      if (!name || name.length > 100) return res.status(400).json({ error: t("instagram.errors.connection_name", 'Enter a connection name of 1–100 characters.') });
      const config = requireInstagramConfiguration(await storage.getPartnerConfiguration('instagram'), t);
      // Same-origin callback is necessary for both the session cookie and popup result.
      if (new URL(config.redirectUrl).origin !== getPublicBaseUrlFromRequest(req)) {
        throw new InstagramLoginError(t("instagram.errors.redirect_origin", 'The Instagram redirect URL must match this application’s public origin. Contact your administrator.'));
      }
      const state = await createInstagramOAuthState({ userId: user.id, companyId: user.companyId,
        connectionName: name, redirectUri: config.redirectUrl, appId: config.appId });
      res.set('Cache-Control', 'no-store').json({ state, authorizationUrl: instagramAuthorizationUrl(config, state) });
    } catch (error) { res.status(400).json({ error: safeError(error, t) }); }
  });

  app.get('/api/instagram/oauth/callback', ensureAuthenticated, ensureActiveSubscription, async (req: Request, res: Response) => {
    const t = await getInstagramTranslator(req.user?.languagePreference || 'en');
    const user = req.user as any;
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    let origin: string | undefined = getPublicBaseUrlFromRequest(req);
    try {
      const saved = await consumeInstagramOAuthState(state, user.id, user.companyId);
      if (!saved) throw new InstagramLoginError(t("instagram.errors.state_expired", 'This Instagram login has expired or was already used. Please try again.'));
      origin = new URL(saved.redirectUri).origin;
      if (req.query.error) throw new InstagramLoginError(t("instagram.errors.authorization_cancelled", 'Instagram authorization was cancelled. You can try again when ready.'));
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!code) throw new InstagramLoginError(t("instagram.errors.missing_code", 'Instagram did not return an authorization code. Please try again.'));
      const config = requireInstagramConfiguration(await storage.getPartnerConfiguration('instagram'), t);
      if (config.redirectUrl !== saved.redirectUri || config.appId !== saved.appId) {
        throw new InstagramLoginError(t("instagram.errors.configuration_changed", 'Instagram configuration changed during login. Please start again.'));
      }
      const authorized = await exchangeInstagramAuthorizationCode(code, config, t);
      const accountId = authorized.account.id;
      const client = await pool.connect();
      let connectionId: number;
      let created = false;
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`instagram:${accountId}`]);
        const matches = await client.query(`SELECT * FROM channel_connections WHERE channel_type = 'instagram'
          AND (account_id = $1 OR connection_data->>'instagramAccountId' = $1) FOR UPDATE`, [accountId]);
        if (matches.rows.some(row => row.company_id !== user.companyId)) {
          throw new InstagramLoginError(t("instagram.errors.account_other_company", 'This Instagram account is already connected to another company.'));
        }
        if (matches.rows.some(row => row.connection_data?.authMethod !== 'instagram_login')) {
          throw new InstagramLoginError(t("instagram.errors.account_existing_connection", 'This account already has an existing Instagram connection. Manage that connection before creating a direct-login connection.'));
        }
        const previous = matches.rows[0];
        const data = { ...(previous?.connection_data || {}), authMethod: 'instagram_login',
          instagramAccountId: accountId, username: authorized.account.username, accountInfo: authorized.account,
          appId: config.appId, webhookUrl: config.webhookUrl, grantedPermissions: authorized.grantedPermissions,
          accessTokenExpiresAt: authorized.expiresAt, lastTokenRefresh: new Date().toISOString(), requiresReauth: false };
        if (previous) {
          connectionId = previous.id;
          await client.query(`UPDATE channel_connections SET access_token=$1, connection_data=$2, status='pending',
            account_name=$3, updated_at=NOW() WHERE id=$4`, [authorized.accessToken, data, saved.connectionName, connectionId]);
        } else {
          const inserted = await client.query(`INSERT INTO channel_connections
            (user_id, company_id, channel_type, account_id, account_name, access_token, connection_data, status)
            VALUES ($1,$2,'instagram',$3,$4,$5,$6,'pending') RETURNING id`,
          [user.id, user.companyId, accountId, saved.connectionName, authorized.accessToken, data]);
          connectionId = inserted.rows[0].id;
          created = true;
        }
        await client.query('COMMIT');
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
      const connection = await storage.getChannelConnection(connectionId!);
      if (!connection) throw new InstagramLoginError(t("instagram.errors.load_connection", 'Instagram connection could not be loaded. Please retry.'));
      const status = await subscribeInstagramBusinessAccount(accountId, authorized.accessToken, t, authorized.grantedPermissions,
        (connection.connectionData as any)?.instagramSubscription);
      await storage.updateChannelConnection(connection.id, {
        status: (status.success || status.inboundActive) ? 'active' : 'error',
        connectionData: { ...(connection.connectionData as any), instagramSubscription: status },
      });
      // Register the existing health monitor without running Page-based provisioning.
      await instagram.initializeHealthMonitoring();
      const updated = (await storage.getChannelConnection(connection.id))!;
      broadcast({ type: created ? 'channelConnectionCreated' : 'channelConnectionUpdated', data: sanitizeMetaConnectionForClient(updated) }, user.companyId);
      callbackResponse(res, origin, { type: 'instagram_oauth_result', state, success: true,
        connectionId: connection.id, username: authorized.account.username, warning: status.error }, t);
    } catch (error) {
      callbackResponse(res, origin, { type: 'instagram_oauth_result', state, success: false, error: safeError(error, t) }, t);
    }
  });

  app.post('/api/instagram/connections/:id/retry-subscription', ensureAuthenticated, ensureActiveSubscription, async (req, res) => {
    const t = await getInstagramTranslator(req.user?.languagePreference || 'en');
    try {
      const user = req.user as any;
      const connection = await storage.getChannelConnection(Number(req.params.id));
      const data = connection?.connectionData as any;
      if (!connection || connection.companyId !== user.companyId || connection.channelType !== 'instagram' || data?.authMethod !== 'instagram_login') {
        return res.status(404).json({ error: t("instagram.errors.connection_not_found", 'Instagram connection not found.') });
      }
      if (!connection.accessToken) return res.status(400).json({ error: t("instagram.errors.reconnect", 'Reconnect Instagram to renew authorization.') });
      if (data.requiresReauth) return res.status(400).json({ error: t("instagram.errors.reconnect_subscription", 'Reconnect Instagram to renew authorization before retrying message subscription.') });
      const status = await subscribeInstagramBusinessAccount(data.instagramAccountId, connection.accessToken, t, data.grantedPermissions, data.instagramSubscription);
      const updated = await storage.updateChannelConnection(connection.id, {
        status: (status.success || status.inboundActive) ? 'active' : 'error', connectionData: { ...data, instagramSubscription: status },
      });
      if (status.success || status.inboundActive) await instagram.initializeHealthMonitoring();
      broadcast({ type: 'channelConnectionUpdated', data: sanitizeMetaConnectionForClient(updated) }, user.companyId);
      res.status(status.success || status.inboundActive ? 200 : 400).json(status);
    } catch { res.status(500).json({ error: t("instagram.errors.retry_subscription", 'Could not retry Instagram message subscription.') }); }
  });
}

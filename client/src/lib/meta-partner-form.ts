import { instagramEnglish, type InstagramTranslate } from '@shared/instagram-i18n';
import { validateInstagramLoginConfiguration } from '@shared/types/instagram-login';

export type PartnerChannel = 'whatsapp' | 'instagram' | 'messenger';
export interface PartnerDraft {
  appId: string; appSecret: string; hasAppSecret: boolean; verifyToken: string;
  webhookUrl: string; redirectUrl: string; businessManagerId: string; accessToken: string;
  configId: string; messengerConfigId: string; metaChannelsConfigId: string;
}

export function createPartnerDrafts(origin: string, meta?: any, instagram?: any): Record<PartnerChannel, PartnerDraft> {
  const common: PartnerDraft = {
    appId: meta?.partnerApiKey || '', appSecret: meta?.partnerSecret || '', hasAppSecret: !!meta?.partnerSecret,
    verifyToken: meta?.webhookVerifyToken || '', webhookUrl: '', redirectUrl: '',
    businessManagerId: meta?.partnerId || '', accessToken: meta?.accessToken || '',
    configId: meta?.configId || '', messengerConfigId: meta?.messengerConfigId || '', metaChannelsConfigId: meta?.metaChannelsConfigId || '',
  };
  return {
    whatsapp: { ...common, webhookUrl: meta?.partnerWebhookUrl || `${origin}/api/webhooks/meta-whatsapp` },
    messenger: { ...common, webhookUrl: meta?.messengerWebhookUrl || `${origin}/api/webhooks/messenger` },
    instagram: { ...common, appId: instagram?.appId || '', appSecret: '', hasAppSecret: !!instagram?.hasAppSecret,
      verifyToken: instagram?.verifyToken || '', webhookUrl: instagram?.webhookUrl || `${origin}/api/webhooks/instagram`,
      redirectUrl: instagram?.redirectUrl || `${origin}/api/instagram/oauth/callback` },
  };
}

export function buildPartnerPayload(channel: PartnerChannel, draft: PartnerDraft, origin: string) {
  if (channel === 'instagram') return { appId: draft.appId, appSecret: draft.appSecret,
    verifyToken: draft.verifyToken, webhookUrl: draft.webhookUrl, redirectUrl: draft.redirectUrl };
  const common = { partnerApiKey: draft.appId, partnerSecret: draft.appSecret, webhookVerifyToken: draft.verifyToken };
  if (channel === 'whatsapp') return { ...common, partnerId: draft.businessManagerId,
    accessToken: draft.accessToken.trim() || undefined, configId: draft.configId.trim() || undefined,
    partnerWebhookUrl: draft.webhookUrl, redirectUrl: `${origin}/settings/channels/meta/callback` };
  return { ...common, messengerConfigId: draft.messengerConfigId, metaChannelsConfigId: draft.metaChannelsConfigId,
    messengerWebhookUrl: draft.webhookUrl };
}

export function validatePartnerDraft(channel: PartnerChannel, draft: PartnerDraft, t: InstagramTranslate = instagramEnglish): string | undefined {
  if (channel === 'instagram') {
    return validateInstagramLoginConfiguration({ ...draft, verifyToken: draft.verifyToken || 'generated_on_save' }, t)[0];
  }
  if (!/^\d+$/.test(draft.appId.trim())) return t("settings.metaPartnerConfiguration.validation_app_id", 'A numeric App ID is required.');
  if (!draft.appSecret.trim() && !draft.hasAppSecret) return t("settings.metaPartnerConfiguration.validation_app_secret", 'App Secret is required.');
  if (channel === 'whatsapp' && !/^\d+$/.test(draft.businessManagerId.trim())) return t("settings.metaPartnerConfiguration.validation_business_id", 'A numeric Business Manager ID is required.');
  if (channel === 'messenger' && !draft.metaChannelsConfigId.trim() && !draft.messengerConfigId.trim()) return t("settings.metaPartnerConfiguration.validation_messenger_id", 'Messenger needs a Login for Business configuration ID.');
  try { if (new URL(draft.webhookUrl).protocol !== 'https:') throw new Error(); }
  catch { return t("settings.metaPartnerConfiguration.validation_https", 'Webhook URL must use HTTPS.'); }
  return undefined;
}

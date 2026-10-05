import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { Loader2, Copy, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { clearConfigCache } from '@/lib/facebook-config';
import { INSTAGRAM_BUSINESS_SCOPES } from '@shared/types/instagram-login';
import { createPartnerDrafts, buildPartnerPayload, validatePartnerDraft, type PartnerChannel, type PartnerDraft } from '@/lib/meta-partner-form';

interface Props { isOpen: boolean; onClose: () => void; onSuccess: () => void }

export function MetaPartnerConfigurationForm({ isOpen, onClose, onSuccess }: Props) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [channel, setChannel] = useState<PartnerChannel>('whatsapp');
  const [drafts, setDrafts] = useState(() => createPartnerDrafts(window.location.origin));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState<Partial<Record<PartnerChannel, boolean>>>({});
  const [visibleSecrets, setVisibleSecrets] = useState<Partial<Record<keyof PartnerDraft, boolean>>>({});
  const [savedInstagramSecret, setSavedInstagramSecret] = useState('');
  const [revealing, setRevealing] = useState(false);
  const revealRequest = useRef<AbortController | null>(null);
  const draft = drafts[channel];
  const label = channel === 'whatsapp' ? 'WhatsApp' : channel === 'instagram' ? 'Instagram' : 'Messenger';

  const hideSecrets = () => {
    revealRequest.current?.abort();
    revealRequest.current = null;
    setVisibleSecrets({}); setSavedInstagramSecret(''); setRevealing(false);
  };

  useEffect(() => {
    hideSecrets();
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true); setError(''); setLoadError(''); setChannel('whatsapp'); setSaved({});
    const load = async (provider: string) => {
      const response = await fetch(`/api/admin/partner-configurations/${provider}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(t('settings.metaPartnerConfiguration.toast_load_failed', 'Failed to load existing configuration'));
      return response.json();
    };
    Promise.all([load('meta'), load('instagram')]).then(([meta, instagram]) => {
      if (!cancelled) setDrafts(createPartnerDrafts(window.location.origin, meta, instagram));
    }).catch(e => { if (!cancelled) setLoadError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; revealRequest.current?.abort(); };
  }, [isOpen]);

  const toggleSecret = async (key: keyof PartnerDraft) => {
    if (key === 'appSecret' && revealing) { hideSecrets(); return; }
    if (visibleSecrets[key]) {
      setVisibleSecrets(previous => ({ ...previous, [key]: false }));
      if (key === 'appSecret') setSavedInstagramSecret('');
      return;
    }
    if (channel === 'instagram' && key === 'appSecret' && !draft.appSecret && draft.hasAppSecret) {
      const controller = new AbortController();
      revealRequest.current = controller;
      setRevealing(true); setError('');
      try {
        const response = await fetch('/api/admin/partner-configurations/instagram/secret', {
          signal: controller.signal, cache: 'no-store',
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (typeof result.appSecret !== 'string') throw new Error();
        if (!controller.signal.aborted) {
          setSavedInstagramSecret(result.appSecret);
          setVisibleSecrets(previous => ({ ...previous, [key]: true }));
        }
      } catch {
        if (!controller.signal.aborted) setError(t('settings.metaPartnerConfiguration.reveal_failed', 'Could not reveal the saved secret. Please try again.'));
      } finally {
        if (!controller.signal.aborted) { setRevealing(false); revealRequest.current = null; }
      }
      return;
    }
    setVisibleSecrets(previous => ({ ...previous, [key]: true }));
  };

  const change = (key: keyof PartnerDraft, value: string) => {
    setDrafts(previous => {
      const next = { ...previous, [channel]: { ...previous[channel], [key]: value } };
      if (channel !== 'instagram' && ['appId', 'appSecret', 'verifyToken'].includes(key)) {
        const other = channel === 'whatsapp' ? 'messenger' : 'whatsapp';
        next[other] = { ...next[other], [key]: value };
      }
      return next;
    });
    setSaved(previous => ({ ...previous, [channel]: false })); setError('');
  };
  const field = (key: keyof PartnerDraft, text: string, options: { secret?: boolean; copy?: boolean; help?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${channel}-${key}`}>{text}</Label>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <Input id={`${channel}-${key}`} name={key}
            value={String(draft[key] || (channel === 'instagram' && key === 'appSecret' && visibleSecrets[key] ? savedInstagramSecret : ''))}
            placeholder={key === 'appSecret' && draft.hasAppSecret && !visibleSecrets[key] ? '••••••••' : undefined}
            type={options.secret && !visibleSecrets[key] ? 'password' : 'text'} autoComplete={options.secret ? 'new-password' : 'off'}
            onChange={event => {
              if (key === 'appSecret') setSavedInstagramSecret('');
              change(key, event.target.value);
            }} className={options.secret ? 'pr-11' : ''} />
          {options.secret && <Button data-tour="components-settings-metapartnerconfigurationform.button.settings.metaPartnerConfiguration.hide_secret" type="button" size="icon" variant="ghost"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" disabled={busy}
            aria-label={visibleSecrets[key]
              ? t('settings.metaPartnerConfiguration.hide_secret', 'Hide {{field}}', { field: text })
              : t('settings.metaPartnerConfiguration.show_secret', 'Show {{field}}', { field: text })}
            aria-controls={`${channel}-${key}`} aria-pressed={!!visibleSecrets[key]}
            aria-busy={key === 'appSecret' && revealing} onClick={() => toggleSecret(key)}>
            {key === 'appSecret' && revealing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              : visibleSecrets[key] ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          </Button>}
        </div>
        {options.copy && <Button data-tour="components-settings-metapartnerconfigurationform.button.settings.metaPartnerConfiguration.toast_copied" type="button" size="icon" variant="outline" aria-label={`Copy ${text}`}
          onClick={async () => {
            try { await navigator.clipboard.writeText(String(draft[key] || '')); toast({ title: t('settings.metaPartnerConfiguration.toast_copied', 'Copied') }); }
            catch { setError(t('settings.metaPartnerConfiguration.copy_failed', 'Could not copy. Select and copy the value manually.')); }
          }}><Copy className="h-4 w-4" /></Button>}
      </div>
      {options.help && <p className="text-xs text-muted-foreground">{options.help}</p>}
    </div>
  );

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validatePartnerDraft(channel, draft, t);
    if (validation) { setError(validation); return; }
    hideSecrets();
    setBusy(true); setError('');
    try {
      const response = await fetch(channel === 'instagram' ? '/api/admin/partner-configurations/instagram'
        : `/api/admin/partner-configurations/meta/channel/${channel}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPartnerPayload(channel, draft, window.location.origin)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t("settings.metaPartnerConfiguration.save_failed", 'Could not save configuration.'));
      setDrafts(previous => {
        const next = { ...previous, [channel]: { ...previous[channel],
          verifyToken: result.verifyToken || result.webhookVerifyToken || previous[channel].verifyToken,
          hasAppSecret: true, ...(channel === 'instagram' ? { appSecret: '' } : {}),
        } };
        if (channel !== 'instagram') {
          const other = channel === 'whatsapp' ? 'messenger' : 'whatsapp';
          next[other] = { ...next[other], verifyToken: next[channel].verifyToken, hasAppSecret: true };
        }
        return next;
      });
      setSaved(previous => ({ ...previous, [channel]: true }));
      clearConfigCache(); onSuccess();
    } catch (e) { setError(e instanceof Error ? e.message : t("settings.metaPartnerConfiguration.save_failed", 'Could not save configuration.')); }
    finally { setBusy(false); }
  };

  const testWebhook = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(channel === 'whatsapp' ? '/api/admin/partner-configurations/test-webhook'
        : `/api/admin/partner-configurations/${channel}/test-webhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: draft.webhookUrl, webhookVerifyToken: draft.verifyToken }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || t("settings.metaPartnerConfiguration.webhook_retry", 'Webhook verification failed. Save the configuration first, then try again.'));
      toast({ title: t('settings.metaPartnerConfiguration.toast_webhook_test_success', 'Webhook Test Successful') });
    } catch (e) { setError(e instanceof Error ? e.message : t("settings.metaPartnerConfiguration.webhook_test_failed", 'Webhook test failed.')); }
    finally { setBusy(false); }
  };

  return <Dialog open={isOpen} onOpenChange={open => { if (!open && !busy) { hideSecrets(); onClose(); } }}>
    <DialogContent data-tour="components-settings-metapartnerconfigurationform.dialogcontent.settings.metaPartnerConfiguration.title" className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('settings.metaPartnerConfiguration.title', 'Meta Partner Configuration')}</DialogTitle>
        <DialogDescription>{t('settings.metaPartnerConfiguration.choose_channel', 'Choose a connection to configure its credentials and signup settings.')}</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('settings.metaPartnerConfiguration.connection_type', 'Connection type')}>
        {(['whatsapp', 'instagram', 'messenger'] as const).map(value => <Button key={value} type="button" variant={channel === value ? 'default' : 'outline'}
          className="min-w-0 px-2 text-xs sm:text-sm" aria-pressed={channel === value} disabled={busy} onClick={() => { hideSecrets(); setChannel(value); setError(''); }}>
          {value === 'whatsapp' ? 'WhatsApp' : value === 'instagram' ? 'Instagram' : 'Messenger'}</Button>)}
      </div>
      {loading ? <div role="status" className="flex justify-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />{t('settings.metaPartnerConfiguration.loading_configuration', 'Loading configuration...')}</div>
        : loadError ? <p role="alert" className="text-destructive">{loadError}</p>
        : <form onSubmit={save} className="space-y-5" aria-label={`${label} configuration`}>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="font-medium">{label} · {validatePartnerDraft(channel, draft, t)
              ? t('settings.metaPartnerConfiguration.credentials_needed', 'Configuration incomplete')
              : t('settings.metaPartnerConfiguration.credentials_ready', 'Credentials entered')}</p>
            <p className="mt-1 text-muted-foreground">{channel === 'instagram'
              ? t('settings.metaPartnerConfiguration.instagram_direct_hint', 'Direct Instagram Business Login for Business and Creator accounts. A Facebook Page is not required.')
              : channel === 'messenger'
                ? t('settings.metaPartnerConfiguration.messenger_shared_hint', 'App ID, App Secret and verify token are shared with WhatsApp. Changing them affects both channels.')
                : t('settings.metaPartnerConfiguration.whatsapp_hint', 'Configure the existing WhatsApp embedded signup flow.')}</p>
          </div>
          <details className="rounded-lg border p-3 text-sm [&_code]:break-words">
            <summary className="cursor-pointer font-medium">{t('settings.metaPartnerConfiguration.setup_instructions_title', 'Meta App Setup Instructions')}</summary>
            <ol className="list-decimal pl-5 space-y-2 mt-3 text-muted-foreground">
              <li><a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="underline">{t('settings.metaPartnerConfiguration.open_meta_dashboard', 'Open Meta for Developers and select your Business app.')}</a></li>
              {channel === 'instagram' ? <>
                <li>{t('settings.metaPartnerConfiguration.instagram_product_step', 'Add the Instagram product and open API setup with Instagram login. Copy the Instagram App ID and App Secret below.')}</li>
                <li>{t('settings.metaPartnerConfiguration.instagram_callback_step', 'Add the exact OAuth redirect URL to Instagram Business Login. Configure the webhook callback URL and matching verify token in the dashboard.')}</li>
                <li>{t('settings.metaPartnerConfiguration.instagram_fields_step', 'Subscribe to messages, messaging_seen, message_reactions, message_echoes, messaging_postbacks and messaging_referral. App-level subscriptions are configured in the dashboard.')}</li>
                <li>{t('settings.metaPartnerConfiguration.instagram_review_step', 'Use a professional Business or Creator account. Add and accept an Instagram Tester role for testing. Set the app to Live and obtain App Review / Advanced Access before onboarding external customers.')}</li>
                <li>{t('settings.metaPartnerConfiguration.required_permissions_title', 'Required permissions')}: <code>{INSTAGRAM_BUSINESS_SCOPES.join(', ')}</code></li>
              </> : <>
                <li>{channel === 'whatsapp'
                  ? t('settings.metaPartnerConfiguration.whatsapp_v4_product_step', 'Create a new Facebook Login for Business configuration, select WhatsApp Embedded Signup and the Cloud API product, then copy its configuration ID. Meta retires Embedded Signup v2/v3 on October 15, 2026. Session logging version 3 is still correct for Coexistence.')
                  : t('settings.metaPartnerConfiguration.messenger_product_step', 'Add Messenger and Facebook Login for Business. Configure Page selection and copy the Login for Business configuration ID.')}</li>
                <li>{t('settings.metaPartnerConfiguration.channel_webhook_step', 'Set this channel’s webhook callback URL and verify token in the Meta dashboard.')}</li>
                <li>{t('settings.metaPartnerConfiguration.channel_review_step', 'Complete App Review and Advanced Access for external customers.')}</li>
                <li><code>{channel === 'whatsapp' ? 'whatsapp_business_management, whatsapp_business_messaging' : 'pages_show_list, pages_read_engagement, pages_manage_metadata, pages_messaging'}</code></li>
              </>}
            </ol>
          </details>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('appId', channel === 'instagram' ? t('settings.metaPartnerConfiguration.instagram_app_id', 'Instagram App ID') : t('settings.metaPartnerConfiguration.app_id', 'App ID *'))}
            {field('appSecret', channel === 'instagram' ? t('settings.metaPartnerConfiguration.instagram_app_secret', 'Instagram App Secret') : t('settings.metaPartnerConfiguration.app_secret', 'App Secret *'), { secret: true,
              help: draft.hasAppSecret ? t('settings.metaPartnerConfiguration.keep_secret', 'A secret is saved. Leave blank to keep it.') : undefined })}
          </div>
          {channel === 'whatsapp' && <>
            {field('businessManagerId', t('settings.metaPartnerConfiguration.business_manager_id', 'Business Manager ID *'))}
            {field('accessToken', t('settings.metaPartnerConfiguration.system_user_access_token', 'System User Access Token'), { secret: true })}
            {field('configId', t('settings.metaPartnerConfiguration.whatsapp_configuration_id', 'WhatsApp Configuration ID'))}
          </>}
          {channel === 'messenger' && <>
            {field('messengerConfigId', t('settings.metaPartnerConfiguration.messenger_configuration_id', 'Messenger Configuration ID'))}
            {field('metaChannelsConfigId', t('settings.metaPartnerConfiguration.shared_configuration_id', 'Shared Login for Business Configuration ID (optional)'), {
              help: t('settings.metaPartnerConfiguration.shared_configuration_hint', 'When set, this takes precedence over the Messenger Configuration ID. Existing Facebook-based connections retain this configuration.') })}
          </>}
          <div className="space-y-2">
            {field('verifyToken', t('settings.metaPartnerConfiguration.webhook_verify_token', 'Webhook Verify Token'), { secret: true, copy: true })}
            <Button data-tour="components-settings-metapartnerconfigurationform.button.settings.metaPartnerConfiguration.generate_secure_random_token" type="button" variant="outline" size="sm" onClick={() => change('verifyToken', Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''))}>
              <RefreshCw className="mr-2 h-4 w-4" />{t('settings.metaPartnerConfiguration.generate_secure_random_token', 'Generate secure random token')}
            </Button>
          </div>
          {field('webhookUrl', `${label} ${t('settings.metaPartnerConfiguration.webhook_url', 'Webhook URL')}`, { copy: true })}
          {channel === 'instagram' && field('redirectUrl', t('settings.metaPartnerConfiguration.oauth_redirect_url', 'OAuth Redirect URL'), { copy: true })}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {saved[channel] && <p role="status" className="text-sm text-green-700 dark:text-green-400">{t('settings.metaPartnerConfiguration.channel_saved', '{{channel}} configuration saved.', { channel: label })}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button data-tour="components-settings-metapartnerconfigurationform.button.settings.metaPartnerConfiguration.test_channel_webhook" type="button" variant="outline" onClick={testWebhook} disabled={busy || !draft.webhookUrl || !draft.verifyToken} className="flex-1">
              {t('settings.metaPartnerConfiguration.test_channel_webhook', 'Test {{channel}} Webhook', { channel: label })}
            </Button>
            <Button data-tour="components-settings-metapartnerconfigurationform.button.settings.metaPartnerConfiguration.save_channel" type="submit" disabled={busy} className="flex-1">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('settings.metaPartnerConfiguration.save_channel', 'Save {{channel}} Configuration', { channel: label })}</Button>
          </div>
        </form>}
    </DialogContent>
  </Dialog>;
}

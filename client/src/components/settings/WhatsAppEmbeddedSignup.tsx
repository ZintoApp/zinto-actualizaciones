import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTranslation } from '@/hooks/use-translation';
import { fetchMetaPartnerConfig } from '@/lib/facebook-config';
import { initFacebookSDK, launchWhatsAppSignup, setupWhatsAppSignupListener } from '@/lib/facebook-sdk';
import { WhatsAppOnboardingController } from '@/lib/whatsapp-onboarding-controller';
import { resolveSetupMessage, setupErrorPayload } from '@/lib/setup-message';
import { WHATSAPP_ONBOARDING_API_VERSION, type WhatsAppSignupMode, type WhatsAppOnboardingResult } from '@shared/whatsapp-onboarding';
import type { SetupMessageParams } from '@shared/setup-messages';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  repairConnectionId?: number | null;
  initialConnectionName?: string;
  initialSignupMode?: WhatsAppSignupMode;
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.message || 'Unable to connect WhatsApp.'), setupErrorPayload(result));
  return result;
}
export function WhatsAppEmbeddedSignup({ isOpen, onClose, onSuccess, repairConnectionId, initialConnectionName, initialSignupMode }: Props) {
  const { t } = useTranslation();
  const [connectionName, setConnectionName] = useState('');
  const [signupMode, setSignupMode] = useState<WhatsAppSignupMode>('standard');
  const [history, setHistory] = useState(false);
  const [configId, setConfigId] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [state, setState] = useState<{ busy: boolean; canRetry?: boolean; error?: string; errorCode?: string; errorParams?: SetupMessageParams; result?: WhatsAppOnboardingResult }>({ busy: false });
  const [phone, setPhone] = useState('');
  const controller = useRef<WhatsAppOnboardingController>();
  const successRef = useRef(onSuccess);
  successRef.current = onSuccess;
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setConnectionName(initialConnectionName || '');
    setSignupMode(initialSignupMode || 'standard');
    setHistory(false);
    setPhone('');
    setConfigId('');
    setState({ busy: false });
    setInitializing(true);
    void (async () => {
      const config = await fetchMetaPartnerConfig();
      if (!config?.partnerApiKey || !config.configId) throw Object.assign(new Error('Ask your administrator to configure WhatsApp Embedded Signup with a Meta Login configuration ID.'), { messageCode: 'WHATSAPP_CONFIGURATION_MISSING' });
      await initFacebookSDK(config.partnerApiKey, WHATSAPP_ONBOARDING_API_VERSION);
      if (!cancelled) setConfigId(config.configId);
    })().catch(error => { if (!cancelled) setState({ busy: false, error: error.message, errorCode: error.messageCode, errorParams: error.messageParams }); })
      .finally(() => { if (!cancelled) setInitializing(false); });
    return () => { cancelled = true; controller.current?.dispose(); controller.current = undefined; };
  }, [isOpen, repairConnectionId, initialConnectionName, initialSignupMode]);

  const start = () => {
    controller.current?.dispose();
    setPhone('');
    controller.current = new WhatsAppOnboardingController({
      listen: setupWhatsAppSignupListener,
      launch: callback => launchWhatsAppSignup(configId, callback, signupMode),
      exchange: (code, attemptId) => post('/api/channel-connections/whatsapp-signup-session', { code, attemptId }),
      complete: input => post('/api/channel-connections/meta-whatsapp-embedded-signup', input),
      update: next => {
        setState(next);
        if (next.result?.connectionId) successRef.current();
      },
    }, { connectionName: connectionName.trim(), signupMode, enableHistorySync: history,
      repairConnectionId: repairConnectionId || undefined }, crypto.randomUUID());
    controller.current.start();
  };
  const close = () => { controller.current?.dispose(); onClose(); };
  return <Dialog open={isOpen} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent data-tour="components-settings-whatsappembeddedsignup.dialogcontent.settings.whatsappSignup.repair" className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{repairConnectionId ? t('settings.whatsappSignup.repair', 'Repair WhatsApp connection') : t('settings.whatsappSignup.title', 'Connect WhatsApp Business')}</DialogTitle>
        <DialogDescription>{t('settings.whatsappSignup.description', 'Connect through Meta to use WhatsApp in BotHive. Existing conversations are preserved when repairing a connection.')}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Label htmlFor="whatsapp-connection-name">{t('settings.whatsappSignup.name', 'Connection name')}</Label>
        <Input data-tour="components-settings-whatsappembeddedsignup.input.whatsapp-connection-name" id="whatsapp-connection-name" value={connectionName} onChange={e => setConnectionName(e.target.value)} disabled={state.busy} />
        <RadioGroup value={signupMode} onValueChange={value => setSignupMode(value as WhatsAppSignupMode)} disabled={state.busy}>
          <div className="flex items-center gap-2"><RadioGroupItem id="whatsapp-standard" value="standard" /><Label htmlFor="whatsapp-standard">{t('settings.whatsappSignup.standard', 'Cloud API number')}</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem id="whatsapp-coexistence" value="coexistence" /><Label htmlFor="whatsapp-coexistence">{t('settings.whatsappSignup.coexistence', 'Keep using my WhatsApp Business app (Coexistence)')}</Label></div>
        </RadioGroup>
        {signupMode === 'coexistence' && <div className="space-y-3 text-sm">
          <p>{t('settings.whatsappSignup.verification', 'Have your WhatsApp Business app ready. Follow Meta’s instructions to connect your number and enter the verification code. Contacts sync automatically; keep the app open during synchronization.')}</p>
          <div className="flex items-start gap-2"><Checkbox id="whatsapp-import-history" checked={history} onCheckedChange={value => setHistory(value === true)} disabled={state.busy} /><Label htmlFor="whatsapp-import-history">{t('settings.whatsappSignup.history', 'Import up to six months of chat history (requires sharing approval in WhatsApp)')}</Label></div>
          <p className="text-muted-foreground">{t('settings.whatsappSignup.limitations', 'Linked devices will be unlinked and supported devices can be linked again. Group chats are not imported. Disappearing messages, view-once messages, live location and broadcast lists have restrictions. Message editing and deletion are supported by WhatsApp.')}</p>
        </div>}
        {initializing && <p role="status">{t('settings.whatsappSignup.loading', 'Preparing Meta signup…')}</p>}
        {state.busy && <p role="status">{t('settings.whatsappSignup.busy', 'Complete the Meta popup. BotHive will then configure your connection…')}</p>}
        {state.error && <p role="alert" className="text-destructive">{resolveSetupMessage(t, { messageCode: state.errorCode, messageParams: state.errorParams })}</p>}
        {state.result && <div role="status" className="space-y-2">
          <p>{resolveSetupMessage(t, state.result, state.result.status === 'ready' ? 'WHATSAPP_CONNECTED' : state.result.status === 'needs_selection' ? 'WHATSAPP_PHONE_SELECTION_REQUIRED' : 'SETUP_UNKNOWN_ERROR')}</p>
          {state.result.status === 'needs_selection' && <><Label htmlFor="whatsapp-phone">{t('settings.whatsappSignup.select_number', 'Select your WhatsApp number')}</Label><select data-tour="components-settings-whatsappembeddedsignup.select.settings.whatsappSignup.choose_number" id="whatsapp-phone" className="w-full rounded border bg-background p-2" value={phone} onChange={e => setPhone(e.target.value)}>
            <option value="">{t('settings.whatsappSignup.choose_number', 'Choose a number')}</option>{state.result.phoneNumbers?.map(p => <option key={p.id} value={p.id}>{p.display_phone_number} {p.verified_name}</option>)}
          </select><Button data-tour="components-settings-whatsappembeddedsignup.button.settings.whatsappSignup.connect_selected" disabled={!phone || state.busy} onClick={() => void controller.current?.submit(phone)}>{t('settings.whatsappSignup.connect_selected', 'Connect selected number')}</Button></>}
          {state.result.contactSyncStatus && <p>{t('settings.whatsappSignup.sync_status', 'Contacts: {{contacts}}. History: {{history}}.', { contacts: t(`settings.whatsappSignup.sync.${state.result.contactSyncStatus}`, state.result.contactSyncStatus), history: t(`settings.whatsappSignup.sync.${state.result.historySyncStatus || 'unknown'}`, state.result.historySyncStatus || 'unknown') })}</p>}
          {state.result.status === 'ready' && <p className="text-sm text-muted-foreground">{t('settings.whatsappSignup.ready_guidance', 'Keep WhatsApp Business open while data synchronizes. Cloud API messaging may require a payment method in WhatsApp Manager.')}</p>}
        </div>}
      </div>
      <DialogFooter>
        <Button data-tour="components-settings-whatsappembeddedsignup.button.settings.whatsappSignup.done" variant="outline" onClick={close}>{state.result?.status === 'ready' ? t('settings.whatsappSignup.done', 'Done') : t('settings.whatsappSignup.close', 'Close')}</Button>
        {state.canRetry && <Button data-tour="components-settings-whatsappembeddedsignup.button.settings.whatsappSignup.retry" variant="outline" disabled={state.busy} onClick={() => void controller.current?.submit(phone || undefined)}>{t('settings.whatsappSignup.retry', 'Retry setup')}</Button>}
        {state.result?.status !== 'ready' && <Button data-tour="components-settings-whatsappembeddedsignup.button.settings.whatsappSignup.connect" disabled={!configId || !connectionName.trim() || state.busy || initializing} onClick={start}>{t('settings.whatsappSignup.connect', 'Continue with Meta')}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

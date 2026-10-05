import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Instagram } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { launchInstagramBusinessLogin } from '@/lib/instagram-login';
import { resolveSetupMessage, setupErrorPayload } from '@/lib/setup-message';

interface Props { isOpen: boolean; onClose: () => void; onSuccess: () => void }

export function InstagramEmbeddedSignup({ isOpen, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [connectionName, setConnectionName] = useState('');
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [connectionId, setConnectionId] = useState<number>();
  const controller = useRef<AbortController>();

  const refresh = async (signal?: AbortSignal) => {
    setChecking(true); setError('');
    try {
      const response = await fetch('/api/partner-configurations/instagram/availability', { signal });
      const result = await response.json();
      if (!response.ok || !result.isAvailable) throw Object.assign(new Error(result.message || 'Instagram signup is not configured.'), setupErrorPayload(result));
      setAvailable(true);
    } catch (e) {
      if (!signal?.aborted) { setAvailable(false); setError(resolveSetupMessage(t, e, 'SETUP_UNKNOWN_ERROR')); }
    } finally { if (!signal?.aborted) setChecking(false); }
  };

  useEffect(() => {
    if (!isOpen) return;
    const check = new AbortController();
    setWarning(''); setConnectionId(undefined); setConnectionName(''); setLoading(false);
    void refresh(check.signal);
    return () => { check.abort(); controller.current?.abort(); };
  }, [isOpen]);

  const connect = async () => {
    if (!connectionName.trim()) { setError(t('settings.instagramEmbeddedSignup.toast_connection_name_required_desc', 'Please enter a connection name to continue.')); return; }
    const attempt = new AbortController(); controller.current = attempt;
    setLoading(true); setError(''); setWarning('');
    try {
      const result = await launchInstagramBusinessLogin(connectionName.trim(), attempt.signal, t);
      if (attempt.signal.aborted) return;
      onSuccess();
      if (result.warning) { setWarning(result.warning); setConnectionId(result.connectionId); }
      else {
        toast({ title: t('settings.instagramEmbeddedSignup.toast_connection_successful', 'Connection Successful'), description: t('settings.instagramEmbeddedSignup.connected_account', 'Instagram @{{username}} is connected.', { username: result.username }) });
        onClose();
      }
    } catch (e) {
      if (!attempt.signal.aborted) setError(resolveSetupMessage(t, e, 'SETUP_CONNECTION_CREATE_FAILED'));
    } finally { if (!attempt.signal.aborted) setLoading(false); }
  };

  const retry = async () => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/instagram/connections/${connectionId}/retry-subscription`, { method: 'POST' });
      const result = await response.json();
      if (response.ok && !result.success) { setWarning(result.error); onSuccess(); return; }
      if (!response.ok || !result.success) throw Object.assign(new Error(result.error || result.message || 'Message subscription failed.'), setupErrorPayload(result));
      setWarning(''); onSuccess(); onClose();
    } catch (e) { setError(resolveSetupMessage(t, e, 'SETUP_WEBHOOK_TEST_FAILED')); }
    finally { setLoading(false); }
  };

  const close = () => { controller.current?.abort(); onClose(); };
  return <Dialog open={isOpen} onOpenChange={open => { if (!open) close(); }}>
    <DialogContent data-tour="components-settings-instagramembeddedsignup.dialogcontent.settings.instagramEmbeddedSignup.title" className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{t('settings.instagramEmbeddedSignup.title', 'Instagram - Easy Setup')}</DialogTitle>
        <DialogDescription>{t('settings.instagramEmbeddedSignup.direct_description', 'Connect your Instagram professional account to send and receive Direct messages.')}</DialogDescription>
      </DialogHeader>
      <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
        <ol className="list-decimal pl-4 space-y-2">
          <li>{t('settings.instagramEmbeddedSignup.direct_step_login', 'Log in directly with your Instagram Business or Creator account.')}</li>
          <li>{t('settings.instagramEmbeddedSignup.direct_step_permissions', 'Allow profile and messaging access, plus comment access for outbound message echoes.')}</li>
          <li>{t('settings.instagramEmbeddedSignup.direct_step_finish', 'Return here to finish connecting. No Facebook Page is required.')}</li>
        </ol>
      </div>
      <div className="space-y-2">
        <Label htmlFor="instagram-connection-name">{t('settings.instagramEmbeddedSignup.connection_name', 'Connection name')}</Label>
        <Input data-tour="components-settings-instagramembeddedsignup.input.settings.instagramEmbeddedSignup.direct_name_placeholder" id="instagram-connection-name" value={connectionName} maxLength={100} disabled={loading || !!connectionId}
          onChange={e => setConnectionName(e.target.value)} placeholder={t('settings.instagramEmbeddedSignup.direct_name_placeholder', 'e.g. Store Instagram')} />
      </div>
      {checking && <p role="status" className="text-sm text-muted-foreground">{t('settings.instagramEmbeddedSignup.checking_configuration', 'Checking Instagram configuration…')}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {warning && <div role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
        <p className="font-medium">{t('settings.instagramEmbeddedSignup.subscription_attention', 'Account connected · messages need attention')}</p><p>{warning}</p>
      </div>}
      {!available && !checking && <Button data-tour="components-settings-instagramembeddedsignup.button.settings.instagramEmbeddedSignup.refresh_configuration" variant="outline" onClick={() => refresh()}>{t('settings.instagramEmbeddedSignup.refresh_configuration', 'Refresh Configuration')}</Button>}
      <DialogFooter>
        <Button data-tour="components-settings-instagramembeddedsignup.button.settings.instagramEmbeddedSignup.close" variant="outline" onClick={close}>{t('settings.instagramEmbeddedSignup.close', 'Close')}</Button>
        {connectionId ? <><Button data-tour="components-settings-instagramembeddedsignup.button.instagram.sync.reconnect" variant="outline" disabled={loading} onClick={connect}>{t('instagram.sync.reconnect', 'Reconnect Instagram')}</Button><Button data-tour="components-settings-instagramembeddedsignup.button.settings.instagramEmbeddedSignup.retry_subscription" disabled={loading} onClick={retry}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('settings.instagramEmbeddedSignup.retry_subscription', 'Retry message subscription')}</Button></>
          : <Button data-tour="components-settings-instagramembeddedsignup.button.settings.instagramEmbeddedSignup.waiting_instagram" disabled={checking || !available || loading || !connectionName.trim()} onClick={connect}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Instagram className="mr-2 h-4 w-4" />}
            {loading ? t('settings.instagramEmbeddedSignup.waiting_instagram', 'Waiting for Instagram…') : t('settings.instagramEmbeddedSignup.connect_instagram', 'Connect with Instagram')}
          </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

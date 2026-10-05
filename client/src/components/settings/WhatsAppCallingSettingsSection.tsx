import { useEffect, useMemo, useState } from 'react';
import { Loader2, PhoneCall, RefreshCw } from 'lucide-react';
import { normalizeWhatsAppCallingConfig, type WhatsAppCallingConfig } from '@shared/types/whatsapp-calling';
import { apiRequest } from '@/lib/queryClient';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function WhatsAppCallingSettingsSection({ connectionId }: { connectionId: number }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data: channels = [] } = useChannelConnections();
  const [config, setConfig] = useState<WhatsAppCallingConfig>(() => normalizeWhatsAppCallingConfig({}));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [globallyEnabled, setGloballyEnabled] = useState(true);
  const voiceProfiles = useMemo(() => channels.filter((channel) => channel.channelType === 'twilio_voice' && channel.status === 'active'), [channels]);

  const load = async () => {
    setLoading(true);
    try {
      const response = await apiRequest('GET', `/api/channel-connections/${connectionId}/whatsapp-calling`);
      const body = await response.json();
      setConfig(normalizeWhatsAppCallingConfig(body.config));
      setGloballyEnabled(body.globallyEnabled !== false);
    } catch (error: any) {
      toast({ title: t('calling.settings.load_failed', 'Could not load WhatsApp Calling settings'), description: error.errorCode ? t(`calling.errors.${error.errorCode}`, error.message) : error.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [connectionId]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await apiRequest('PATCH', `/api/channel-connections/${connectionId}/whatsapp-calling`, config);
      const body = await response.json(); setConfig(normalizeWhatsAppCallingConfig(body.config));
      toast({ title: t('calling.settings.saved', 'WhatsApp Calling settings saved') });
    } catch (error: any) { toast({ title: t('calling.settings.save_failed', 'Could not save WhatsApp Calling settings'), description: error.errorCode ? t(`calling.errors.${error.errorCode}`, error.message) : error.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const refresh = async () => {
    setSaving(true);
    try {
      const response = await apiRequest('POST', `/api/channel-connections/${connectionId}/whatsapp-calling/refresh`, {});
      const body = await response.json(); setConfig(normalizeWhatsAppCallingConfig(body.config));
    } catch (error: any) { toast({ title: t('calling.settings.refresh_failed', 'Eligibility check failed'), description: error.errorCode ? t(`calling.errors.${error.errorCode}`, error.message) : error.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  const setDay = (day: number, patch: Partial<WhatsAppCallingConfig['operatingHours'][number]>) => {
    const current = config.operatingHours.find((entry) => entry.day === day) || { day, start: '09:00', end: '17:00', enabled: day > 0 && day < 6 };
    setConfig({ ...config, operatingHours: [...config.operatingHours.filter((entry) => entry.day !== day), { ...current, ...patch }].sort((a, b) => a.day - b.day) });
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  const eligibility = config.eligibility;
  return <section className="space-y-4 rounded-lg border p-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-lg font-medium"><PhoneCall className="h-5 w-5" />{t('calling.settings.title', 'WhatsApp Calling')}</h3><p className="text-sm text-muted-foreground">{t('calling.settings.description', 'Receive and place official WhatsApp voice calls.')}</p></div><Button data-tour="components-settings-whatsappcallingsettingssection.button.calling.settings.check" type="button" variant="outline" size="sm" onClick={refresh} disabled={saving}><RefreshCw className="mr-2 h-4 w-4" />{t('calling.settings.check', 'Check eligibility')}</Button></div>
    <div className={`rounded-md border p-3 text-sm ${eligibility.eligible ? 'border-green-300 bg-green-50 text-green-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
      {eligibility.eligible ? t('calling.settings.eligible', 'This number is eligible for WhatsApp Calling.') : t('calling.settings.ineligible', 'Calling is unavailable until all Meta eligibility requirements are met.')}
      {!!eligibility.restrictionCodes.length && <ul className="mt-1 list-inside list-disc">{eligibility.restrictionCodes.map((code) => <li key={code}>{t(`calling.restrictions.${code}`, code)}</li>)}</ul>}
    </div>
    {!globallyEnabled && <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">{t('calling.settings.global_disabled', 'WhatsApp Calling is disabled by the system feature flag. Ask an administrator to enable it before activating a channel.')}</div>}
    <div className="flex items-center justify-between"><Label htmlFor="wa-calling-enabled">{t('calling.settings.enabled', 'Enable calling')}</Label><Switch id="wa-calling-enabled" checked={config.enabled} onCheckedChange={(enabled) => setConfig({ ...config, enabled })} disabled={!globallyEnabled || !eligibility.eligible} /></div>
    <div className="flex items-center justify-between"><Label htmlFor="wa-call-button">{t('calling.settings.button_visible', 'Show WhatsApp call button')}</Label><Switch id="wa-call-button" checked={config.callButtonVisible} onCheckedChange={(callButtonVisible) => setConfig({ ...config, callButtonVisible })} disabled={!config.enabled} /></div>
    <div className="flex items-center justify-between"><Label htmlFor="wa-callback">{t('calling.settings.callback', 'Allow callback permission')}</Label><Switch id="wa-callback" checked={config.callbackPermissionEnabled} onCheckedChange={(callbackPermissionEnabled) => setConfig({ ...config, callbackPermissionEnabled })} disabled={!config.enabled} /></div>
    <div className="grid gap-2"><Label>{t('calling.settings.routing', 'Inbound routing')}</Label><Select value={config.inboundRouting} onValueChange={(inboundRouting: any) => setConfig({ ...config, inboundRouting })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="human_first">{t('calling.routing.human_first', 'Human first, AI fallback')}</SelectItem><SelectItem value="ai_first">{t('calling.routing.ai_first', 'AI first')}</SelectItem><SelectItem value="human_only">{t('calling.routing.human_only', 'Human only')}</SelectItem></SelectContent></Select></div>
    {config.inboundRouting !== 'human_only' && <div className="grid gap-2"><Label>{t('calling.settings.ai_profile', 'AI voice profile')}</Label><Select value={config.aiVoiceConnectionId ? String(config.aiVoiceConnectionId) : 'none'} onValueChange={(value) => setConfig({ ...config, aiVoiceConnectionId: value === 'none' ? null : Number(value) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t('calling.settings.no_ai_profile', 'No AI profile')}</SelectItem>{voiceProfiles.map((channel) => <SelectItem key={channel.id} value={String(channel.id)}>{channel.accountName}</SelectItem>)}</SelectContent></Select></div>}
    <div className="grid grid-cols-2 gap-3"><div className="grid gap-2"><Label>{t('calling.settings.recording_policy', 'Recording policy')}</Label><Select value={config.recordingPolicy} onValueChange={(recordingPolicy: any) => setConfig({ ...config, recordingPolicy })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="required">{t('calling.policy.required', 'Required')}</SelectItem><SelectItem value="agent_choice">{t('calling.policy.agent_choice', 'Agent choice')}</SelectItem><SelectItem value="disabled">{t('calling.policy.disabled', 'Disabled')}</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>{t('calling.settings.transcription_policy', 'Transcription policy')}</Label><Select value={config.transcriptionPolicy} onValueChange={(transcriptionPolicy: any) => setConfig({ ...config, transcriptionPolicy })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="required">{t('calling.policy.required', 'Required')}</SelectItem><SelectItem value="agent_choice">{t('calling.policy.agent_choice', 'Agent choice')}</SelectItem><SelectItem value="disabled">{t('calling.policy.disabled', 'Disabled')}</SelectItem></SelectContent></Select></div></div>
    <div className="grid grid-cols-2 gap-3"><div className="flex items-center justify-between"><Label htmlFor="wa-record-default">{t('calling.settings.recording_default', 'Record by default')}</Label><Switch id="wa-record-default" checked={config.recordingDefault} onCheckedChange={(recordingDefault) => setConfig({ ...config, recordingDefault })} disabled={config.recordingPolicy !== 'agent_choice'} /></div><div className="flex items-center justify-between"><Label htmlFor="wa-transcript-default">{t('calling.settings.transcription_default', 'Transcribe by default')}</Label><Switch id="wa-transcript-default" checked={config.transcriptionDefault} onCheckedChange={(transcriptionDefault) => setConfig({ ...config, transcriptionDefault })} disabled={config.transcriptionPolicy !== 'agent_choice'} /></div></div>
    <div className="grid gap-2"><Label htmlFor="wa-calling-timezone">{t('calling.settings.timezone', 'Operating-hours timezone')}</Label><Input data-tour="components-settings-whatsappcallingsettingssection.input.wa-calling-timezone" id="wa-calling-timezone" value={config.timezone} onChange={(event) => setConfig({ ...config, timezone: event.target.value })} placeholder="UTC" /></div>
    <div className="space-y-2"><Label>{t('calling.settings.operating_hours', 'Operating hours')}</Label>{DAYS.map((name, day) => { const value = config.operatingHours.find((entry) => entry.day === day) || { day, start: '09:00', end: '17:00', enabled: day > 0 && day < 6 }; return <div key={name} className="grid grid-cols-[70px_1fr_1fr_auto] items-center gap-2"><span className="text-sm">{t(`calling.days.${name}`, name)}</span><Input data-tour="components-settings-whatsappcallingsettingssection.input.value.start" type="time" value={value.start} onChange={(event) => setDay(day, { start: event.target.value })} disabled={!value.enabled} /><Input data-tour="components-settings-whatsappcallingsettingssection.input.value.end" type="time" value={value.end} onChange={(event) => setDay(day, { end: event.target.value })} disabled={!value.enabled} /><Switch checked={value.enabled} onCheckedChange={(enabled) => setDay(day, { enabled })} /></div>; })}</div>
    <Button data-tour="components-settings-whatsappcallingsettingssection.button.calling.settings.save" type="button" className="w-full" onClick={save} disabled={saving || !globallyEnabled || !eligibility.eligible}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('calling.settings.save', 'Save calling settings')}</Button>
  </section>;
}

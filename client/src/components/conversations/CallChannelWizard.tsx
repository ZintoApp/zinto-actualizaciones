import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Check, Loader2, Mic, Phone, ShieldAlert } from 'lucide-react';
import { RiWhatsappFill } from 'react-icons/ri';
import type { CallChannelOption } from '@shared/types/whatsapp-calling';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createOutboundWhatsAppRtcSession } from '@/lib/whatsapp-call-webrtc';
import { requestMicrophoneAccess, stopMicrophoneStream } from '@/utils/microphone-permissions';

export interface CallWizardSelection {
  channel: CallChannelOption;
  callType: 'direct' | 'ai-powered';
  recording: boolean;
  transcription: boolean;
  sdpOffer?: string;
  rtcSessionKey?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  contactId?: number;
  conversationId?: number;
  contactName?: string;
  isStarting?: boolean;
  onStart: (selection: CallWizardSelection) => void | Promise<void>;
}

type Template = { id: number; name: string; language?: string; whatsappTemplateStatus?: string; connectionId?: number };

export function CallChannelWizard({ isOpen, onClose, contactId, conversationId, contactName, isStarting, onStart }: Props) {
  const { t } = useTranslation();
  const [channelId, setChannelId] = useState<number | null>(null);
  const [callType, setCallType] = useState<'direct' | 'ai-powered'>('direct');
  const [recording, setRecording] = useState(true);
  const [transcription, setTranscription] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [permissionMessage, setPermissionMessage] = useState('');

  const query = useQuery<{ channels: CallChannelOption[] }>({
    queryKey: ['/api/call-channels', contactId, conversationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (contactId) params.set('contactId', String(contactId));
      if (conversationId) params.set('conversationId', String(conversationId));
      const response = await apiRequest('GET', `/api/call-channels?${params}`);
      if (!response.ok) throw new Error(t('calling.errors.load_channels', 'Could not load calling channels.'));
      return response.json();
    },
    enabled: isOpen && (!!contactId || !!conversationId),
  });
  const selected = query.data?.channels.find((channel) => channel.id === channelId);
  const templates = useQuery<Template[]>({
    queryKey: ['/api/whatsapp-calling/templates', channelId],
    queryFn: async () => (await apiRequest('GET', `/api/whatsapp-calling/templates?channelId=${channelId}`)).json(),
    enabled: isOpen && !!selected && selected.channelType === 'whatsapp_official' && selected.whatsappPermission?.serviceWindowOpen === false,
  });
  const permissionRequired = selected?.channelType === 'whatsapp_official' && selected.whatsappPermission?.status !== 'granted';
  const approvedTemplates = useMemo(() => templates.data || [], [templates.data]);

  useEffect(() => {
    if (!isOpen) {
      setChannelId(null); setCallType('direct'); setError(null); setTemplateName(''); setPermissionMessage('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!selected) return;
    setCallType(selected.supportedCallTypes.includes('direct') ? 'direct' : selected.supportedCallTypes[0] || 'direct');
    setRecording(selected.recordingPolicy === 'required' || (selected.recordingPolicy === 'agent_choice' && selected.recordingDefault));
    setTranscription(selected.transcriptionPolicy === 'required' || (selected.transcriptionPolicy === 'agent_choice' && selected.transcriptionDefault));
    setError(null);
  }, [selected]);

  const requestPermission = async () => {
    if (!selected || !contactId) return;
    setPreparing(true); setError(null);
    try {
      const serviceWindowOpen = selected.whatsappPermission?.serviceWindowOpen === true;
      const response = await apiRequest('POST', '/api/whatsapp-calling/permissions/request', {
        channelId: selected.id,
        contactId,
        mode: serviceWindowOpen ? 'freeform' : 'template',
        ...(serviceWindowOpen ? { message: permissionMessage } : {}),
        ...(!serviceWindowOpen ? { templateName } : {}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('calling.permission.failed', 'Could not send the permission request.'));
      await query.refetch();
    } catch (cause: any) {
      setError(cause.errorCode ? t(`calling.errors.${cause.errorCode}`, cause.message) : cause.message);
    }
    finally { setPreparing(false); }
  };

  const start = async () => {
    if (!selected || !selected.enabled) return;
    setPreparing(true); setError(null);
    try {
      let sdpOffer: string | undefined;
      let rtcSessionKey: string | undefined;
      if (callType === 'direct') {
        if (selected.channelType === 'whatsapp_official') {
          const rtc = await createOutboundWhatsAppRtcSession();
          sdpOffer = rtc.sdpOffer; rtcSessionKey = rtc.sessionKey;
        } else if (selected.supportsBrowserDirect) {
          const permission = await requestMicrophoneAccess();
          if (!permission.success) throw new Error(t('calling.microphone.denied', 'Microphone access is required.'));
          if (permission.stream) stopMicrophoneStream(permission.stream);
        }
      }
      await onStart({ channel: selected, callType, recording, transcription, sdpOffer, rtcSessionKey });
    } catch (cause: any) {
      setError(cause.errorCode
        ? t(`calling.errors.${cause.errorCode}`, cause.message)
        : cause.message || t('calling.errors.start_failed', 'Could not start the call.'));
    }
    finally { setPreparing(false); }
  };

  return <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
    <DialogContent data-tour="components-conversations-callchannelwizard.dialogcontent.calling.wizard.title" className="sm:max-w-[460px]">
      <DialogHeader>
        <DialogTitle>{t('calling.wizard.title', 'Choose a calling channel')}</DialogTitle>
        <DialogDescription>{t('calling.wizard.description', 'Select how to call {{name}}.', { name: contactName || t('calling.wizard.contact', 'this contact') })}</DialogDescription>
      </DialogHeader>
      {query.isLoading ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div> : <div className="space-y-4">
        <div className="grid gap-2">
          {(query.data?.channels || []).map((channel) => <Button key={channel.id} type="button" variant={channelId === channel.id ? 'default' : 'outline'} className="h-auto justify-start py-3" onClick={() => channel.enabled && setChannelId(channel.id)} disabled={!channel.enabled}>
            {channel.channelType === 'whatsapp_official' ? <RiWhatsappFill className="mr-2 h-5 w-5 shrink-0 text-green-500" /> : <Phone className="mr-2 h-5 w-5 shrink-0" />}
            <span className="flex-1 truncate text-left">{channel.displayName}</span>
            {channelId === channel.id && <Check className="h-4 w-4" />}
            {!channel.enabled && <span className="text-xs">{t(`calling.errors.${channel.disabledCode}`, channel.disabledCode || 'Unavailable')}</span>}
          </Button>)}
          {!query.isLoading && !query.data?.channels.length && <p className="py-4 text-sm text-muted-foreground">{t('calling.wizard.no_channels', 'No calling channels are available.')}</p>}
        </div>

        {selected && !permissionRequired && <>
          <div className="grid grid-cols-2 gap-2">
            {selected.supportedCallTypes.includes('direct') && <Button data-tour="components-conversations-callchannelwizard.button.calling.mode.direct" type="button" variant={callType === 'direct' ? 'default' : 'outline'} onClick={() => setCallType('direct')}><Mic className="mr-2 h-4 w-4" />{t('calling.mode.direct', 'Talk directly')}</Button>}
            {selected.supportedCallTypes.includes('ai-powered') && <Button data-tour="components-conversations-callchannelwizard.button.calling.mode.ai" type="button" variant={callType === 'ai-powered' ? 'default' : 'outline'} onClick={() => setCallType('ai-powered')}><Bot className="mr-2 h-4 w-4" />{t('calling.mode.ai', 'Use AI agent')}</Button>}
          </div>
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2"><Checkbox id="call-recording" checked={recording} disabled={selected.recordingPolicy !== 'agent_choice'} onCheckedChange={(value) => setRecording(value === true)} /><Label htmlFor="call-recording">{t('calling.capture.recording', 'Record this call')}</Label></div>
            <div className="flex items-center gap-2"><Checkbox id="call-transcription" checked={transcription} disabled={selected.transcriptionPolicy !== 'agent_choice'} onCheckedChange={(value) => setTranscription(value === true)} /><Label htmlFor="call-transcription">{t('calling.capture.transcription', 'Transcribe this call')}</Label></div>
            {(recording || transcription) && selected.channelType === 'whatsapp_official' && <p className="text-xs text-muted-foreground">{t('calling.capture.meta_announcement', 'WhatsApp will play its required recording or transcription announcement.')}</p>}
          </div>
          <Button data-tour="components-conversations-callchannelwizard.button.calling.actions.start" className="w-full" onClick={start} disabled={preparing || isStarting}>{(preparing || isStarting) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('calling.actions.start', 'Start call')}</Button>
        </>}

        {selected && permissionRequired && <div className="space-y-3 rounded-md border p-4">
          <div className="flex gap-2"><ShieldAlert className="mt-0.5 h-5 w-5" /><div><p className="font-medium">{t('calling.permission.title', 'Calling permission required')}</p><p className="text-sm text-muted-foreground">{t('calling.permission.description', 'Ask the customer for permission before placing a WhatsApp call.')}</p></div></div>
          {selected.whatsappPermission?.serviceWindowOpen ? <Textarea data-tour="components-conversations-callchannelwizard.textarea.calling.permission.message_placeholder" value={permissionMessage} onChange={(event) => setPermissionMessage(event.target.value)} placeholder={t('calling.permission.message_placeholder', 'We would like to call you to help with your request.')} /> : <Select value={templateName} onValueChange={setTemplateName}><SelectTrigger data-tour="components-conversations-callchannelwizard.selecttrigger.calling.permission.choose_template"><SelectValue placeholder={t('calling.permission.choose_template', 'Choose an approved template')} /></SelectTrigger><SelectContent>{approvedTemplates.map((template) => <SelectItem key={template.id} value={template.name}>{template.name}</SelectItem>)}</SelectContent></Select>}
          <Button data-tour="components-conversations-callchannelwizard.button.calling.permission.send" className="w-full" onClick={requestPermission} disabled={preparing || selected.whatsappPermission?.canRequest === false || (selected.whatsappPermission?.serviceWindowOpen ? !permissionMessage.trim() : !templateName)}>{preparing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{t('calling.permission.send', 'Send permission request')}</Button>
          {selected.whatsappPermission?.canRequest === false && <p className="text-sm text-muted-foreground">{t('calling.permission.rate_limited', 'Meta’s permission-request limit has been reached. Try again after the limit resets.')}</p>}
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button data-tour="components-conversations-callchannelwizard.button.common.cancel" variant="ghost" className="w-full" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
      </div>}
    </DialogContent>
  </Dialog>;
}

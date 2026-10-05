import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2,
  Phone,
  PhoneOff,
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import useSocket from '@/hooks/useSocket';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { closeWhatsAppRtcSession, createInboundWhatsAppRtcSession } from '@/lib/whatsapp-call-webrtc';
import { WhatsAppCallScreenModal } from './WhatsAppCallScreenModal';

type ActiveCall = {
  call: { id: number; from?: string; status: string; direction: string };
  session: { state: string; claimedByUserId?: number | null; routingStage?: string };
  capture: {
    recordingPolicy: 'required' | 'agent_choice' | 'disabled'; recordingDefault: boolean;
    transcriptionPolicy: 'required' | 'agent_choice' | 'disabled'; transcriptionDefault: boolean;
  };
};

export function IncomingWhatsAppCallTray() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { hasPermission, PERMISSIONS } = usePermissions();
  // Call APIs belong to a company workspace, not the platform-admin session.
  const canHandleCalls = !!user?.companyId && !user.isSuperAdmin && hasPermission(PERMISSIONS.MANAGE_CALL_LOGS);
  const { isConnected, onMessage } = useSocket('/ws');
  const eventCursorRef = useRef(Number(window.localStorage.getItem('whatsapp-call-event-cursor') || 0));
  const [busyCallId, setBusyCallId] = useState<number | null>(null);
  const [active, setActive] = useState<{ callId: number; name: string; rtcSessionKey: string } | null>(null);
  const [capture, setCapture] = useState<Record<number, { recording: boolean; transcription: boolean }>>({});
  const query = useQuery<{ calls: ActiveCall[] }>({
    queryKey: ['/api/calls/active', 'whatsapp', user?.companyId, user?.id],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/calls/active');
      return response.json();
    },
    enabled: canHandleCalls,
    refetchInterval: canHandleCalls ? 3_000 : false,
    retry: false,
  });
  const incoming = canHandleCalls ? (query.data?.calls || []).filter((item) => item.call.direction === 'inbound' && !item.session.claimedByUserId) : [];

  useEffect(() => {
    // Explicit refetch bypasses a disabled query, so subscriptions need the same guard.
    if (!canHandleCalls) return;
    const handleCallEvent = (message: any) => {
      const eventId = Number(message?.data?.eventId || 0);
      if (eventId > eventCursorRef.current) {
        eventCursorRef.current = eventId;
        window.localStorage.setItem('whatsapp-call-event-cursor', String(eventId));
      }
      void query.refetch();
    };
    const unsubscribeIncoming = onMessage('incomingWhatsAppCall', handleCallEvent);
    const unsubscribeClaimed = onMessage('callClaimed', handleCallEvent);
    const unsubscribeStatus = onMessage('callStatusUpdate', handleCallEvent);
    const unsubscribePermission = onMessage('whatsappCallPermissionUpdated', (message: any) => {
      if (message?.data?.status === 'granted') {
        toast({
          title: t('calling.permission.granted_title', 'WhatsApp call permission granted'),
          description: t('calling.permission.granted_retry', 'The customer granted calling permission. Start the call again when you are ready.'),
        });
      }
    });
    return () => { unsubscribeIncoming(); unsubscribeClaimed(); unsubscribeStatus(); unsubscribePermission(); };
  }, [canHandleCalls, onMessage, query.refetch]);

  useEffect(() => {
    if (!isConnected || !canHandleCalls) return;
    void (async () => {
      try {
        const response = await apiRequest('GET', `/api/calls/events?after=${eventCursorRef.current}`);
        const body = await response.json();
        const events = Array.isArray(body.events) ? body.events : [];
        const newest = events.reduce((maximum: number, event: any) => Math.max(maximum, Number(event.id) || 0), eventCursorRef.current);
        if (newest > eventCursorRef.current) {
          eventCursorRef.current = newest;
          window.localStorage.setItem('whatsapp-call-event-cursor', String(newest));
          await query.refetch();
        }
      } catch {
        // The active-call poll remains the recovery fallback while the socket reconnects.
      }
    })();
  }, [isConnected, canHandleCalls]);

  useEffect(() => {
    setCapture((previous) => {
      const next = { ...previous };
      for (const item of incoming) if (!next[item.call.id]) next[item.call.id] = {
        recording: item.capture.recordingPolicy === 'required' || (item.capture.recordingPolicy === 'agent_choice' && item.capture.recordingDefault),
        transcription: item.capture.transcriptionPolicy === 'required' || (item.capture.transcriptionPolicy === 'agent_choice' && item.capture.transcriptionDefault),
      };
      return next;
    });
  }, [query.dataUpdatedAt]);

  const accept = async (item: ActiveCall) => {
    setBusyCallId(item.call.id);
    let claimed = false;
    let rtcSessionKey: string | undefined;
    try {
      const claimResponse = await apiRequest('POST', `/api/calls/${item.call.id}/claim`, {});
      const claimResult = await claimResponse.json();
      claimed = true;
      const rtc = await createInboundWhatsAppRtcSession(claimResult.session.sdpOffer);
      rtcSessionKey = rtc.sessionKey;
      await apiRequest('POST', `/api/calls/${item.call.id}/answer`, {
        sdpAnswer: rtc.sdpAnswer,
        recording: capture[item.call.id]?.recording,
        transcription: capture[item.call.id]?.transcription,
      });
      setActive({ callId: item.call.id, name: item.call.from || t('calling.incoming.unknown', 'WhatsApp caller'), rtcSessionKey: rtc.sessionKey });
      await query.refetch();
    } catch (error: any) {
      if (rtcSessionKey) closeWhatsAppRtcSession(rtcSessionKey);
      if (claimed) await apiRequest('POST', `/api/calls/${item.call.id}/hangup`, {}).catch(() => undefined);
      toast({
        title: t('calling.incoming.answer_failed', 'Could not answer call'),
        description: error.errorCode ? t(`calling.errors.${error.errorCode}`, error.message) : error.message,
        variant: 'destructive',
      });
      await query.refetch();
    } finally { setBusyCallId(null); }
  };

  const decline = async (callId: number) => {
    setBusyCallId(callId);
    try { await apiRequest('POST', `/api/calls/${callId}/reject`, {}); await query.refetch(); }
    catch (error: any) { toast({ title: t('calling.incoming.decline_failed', 'Could not decline call'), description: error.errorCode ? t(`calling.errors.${error.errorCode}`, error.message) : error.message, variant: 'destructive' }); }
    finally { setBusyCallId(null); }
  };

  return <>
    {incoming.length > 0 && <aside aria-label={t('calling.incoming.tray', 'Incoming WhatsApp calls')} className="fixed right-4 top-4 z-[100] w-[min(380px,calc(100vw-2rem))] space-y-3">
      {incoming.map((item) => {
        const values = capture[item.call.id] || { recording: true, transcription: true };
        return <div key={item.call.id} className="rounded-xl border bg-background p-4 shadow-xl">
          <div className="mb-3 flex items-center gap-3"><span className="rounded-full bg-green-100 p-2 text-green-700"><InboxConversationIcon className="h-5 w-5" /></span><div><p className="font-semibold">{t('calling.incoming.title', 'Incoming WhatsApp call')}</p><p className="text-sm text-muted-foreground">{item.call.from || t('calling.incoming.unknown', 'WhatsApp caller')}</p></div></div>
          <div className="mb-3 space-y-2">
            <div className="flex items-center gap-2"><Checkbox id={`incoming-record-${item.call.id}`} checked={values.recording} disabled={item.capture.recordingPolicy !== 'agent_choice'} onCheckedChange={(checked) => setCapture((old) => ({ ...old, [item.call.id]: { ...values, recording: checked === true } }))} /><Label htmlFor={`incoming-record-${item.call.id}`}>{t('calling.capture.recording', 'Record this call')}</Label></div>
            <div className="flex items-center gap-2"><Checkbox id={`incoming-transcribe-${item.call.id}`} checked={values.transcription} disabled={item.capture.transcriptionPolicy !== 'agent_choice'} onCheckedChange={(checked) => setCapture((old) => ({ ...old, [item.call.id]: { ...values, transcription: checked === true } }))} /><Label htmlFor={`incoming-transcribe-${item.call.id}`}>{t('calling.capture.transcription', 'Transcribe this call')}</Label></div>
          </div>
          <div className="grid grid-cols-2 gap-2"><Button data-tour="components-conversations-incomingwhatsappcalltray.button.calling.actions.decline" variant="destructive" onClick={() => void decline(item.call.id)} disabled={busyCallId === item.call.id}><PhoneOff className="mr-2 h-4 w-4" />{t('calling.actions.decline', 'Decline')}</Button><Button data-tour="components-conversations-incomingwhatsappcalltray.button.calling.actions.answer" onClick={() => void accept(item)} disabled={busyCallId === item.call.id}>{busyCallId === item.call.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}{t('calling.actions.answer', 'Answer')}</Button></div>
        </div>;
      })}
    </aside>}
    {active && <WhatsAppCallScreenModal isOpen onClose={() => setActive(null)} callId={active.callId} contactName={active.name} rtcSessionKey={active.rtcSessionKey} />}
  </>;
}

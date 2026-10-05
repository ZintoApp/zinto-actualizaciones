import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { applyWhatsAppRemoteAnswer, closeWhatsAppRtcSession, getWhatsAppRtcSession } from '@/lib/whatsapp-call-webrtc';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  callId: number;
  contactName: string;
  rtcSessionKey?: string;
}

export function WhatsAppCallScreenModal({ isOpen, onClose, callId, contactName, rtcSessionKey }: Props) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const seenActiveRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    if (!isOpen) return;
    const session = rtcSessionKey ? getWhatsAppRtcSession(rtcSessionKey) : undefined;
    if (audioRef.current && session) {
      audioRef.current.srcObject = session.remoteStream;
      void audioRef.current.play().catch(() => undefined);
      session.peer.addEventListener('connectionstatechange', () => setStatus(session.peer.connectionState));
    }
    const poll = window.setInterval(async () => {
      const response = await apiRequest('GET', '/api/calls/active');
      if (!response.ok) return;
      const body = await response.json();
      const active = body.calls?.find((item: any) => item.call?.id === callId);
      if (active) seenActiveRef.current = true;
      if (rtcSessionKey && active?.session?.remoteSdp) await applyWhatsAppRemoteAnswer(rtcSessionKey, active.session.remoteSdp);
      if (active?.call?.status) setStatus(active.call.status);
      if (active && ['completed', 'failed', 'rejected', 'no-answer'].includes(active.call.status)) end(false);
      if (!active && seenActiveRef.current) end(false);
    }, 1500);
    return () => window.clearInterval(poll);
  }, [callId, isOpen, rtcSessionKey]);

  const toggleMute = () => {
    const session = rtcSessionKey ? getWhatsAppRtcSession(rtcSessionKey) : undefined;
    const next = !muted;
    session?.stream.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };
  const end = async (notify = true) => {
    if (notify) await apiRequest('POST', `/api/calls/${callId}/hangup`, {});
    if (rtcSessionKey) closeWhatsAppRtcSession(rtcSessionKey);
    onClose();
  };

  return <Dialog open={isOpen} onOpenChange={(open) => !open && void end()}>
    <DialogContent className="max-w-sm text-center">
      <DialogHeader><DialogTitle>{contactName}</DialogTitle><DialogDescription>{t(`calling.status.${status}`, status)}</DialogDescription></DialogHeader>
      <audio ref={audioRef} autoPlay />
      <div className="flex justify-center gap-4 py-6">
        <Button data-tour="components-conversations-whatsappcallscreenmodal.button.calling.actions.mute" size="icon" variant="outline" aria-label={t('calling.actions.mute', 'Mute')} onClick={toggleMute}>{muted ? <MicOff /> : <Mic />}</Button>
        <Button data-tour="components-conversations-whatsappcallscreenmodal.button.calling.actions.hangup" size="icon" variant="destructive" aria-label={t('calling.actions.hangup', 'Hang up')} onClick={() => void end()}><PhoneOff /></Button>
      </div>
    </DialogContent>
  </Dialog>;
}

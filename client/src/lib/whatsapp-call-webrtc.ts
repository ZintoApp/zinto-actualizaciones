import { apiRequest } from '@/lib/queryClient';

interface WhatsAppRtcSession {
  peer: RTCPeerConnection;
  stream: MediaStream;
  remoteStream: MediaStream;
}

const sessions = new Map<string, WhatsAppRtcSession>();
let rtcConfigurationPromise: Promise<RTCConfiguration> | undefined;

async function getRtcConfiguration(): Promise<RTCConfiguration> {
  if (!rtcConfigurationPromise) {
    rtcConfigurationPromise = apiRequest('GET', '/api/whatsapp-calling/webrtc-config')
      .then((response) => response.json())
      .then((body) => ({ iceServers: Array.isArray(body.iceServers) ? body.iceServers : [] }))
      .catch(() => ({ iceServers: [] }));
  }
  return rtcConfigurationPromise;
}

function waitForIceGathering(peer: RTCPeerConnection, timeoutMs = 8_000) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, timeoutMs);
    function done() {
      window.clearTimeout(timeout);
      peer.removeEventListener('icegatheringstatechange', onChange);
      resolve();
    }
    function onChange() { if (peer.iceGatheringState === 'complete') done(); }
    peer.addEventListener('icegatheringstatechange', onChange);
  });
}

export async function createOutboundWhatsAppRtcSession() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let peer: RTCPeerConnection | undefined;
  try {
    peer = new RTCPeerConnection(await getRtcConfiguration());
    const remoteStream = new MediaStream();
    stream.getTracks().forEach((track) => peer!.addTrack(track, stream));
    peer.addEventListener('track', (event) => event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track)));
    const offer = await peer.createOffer({ offerToReceiveAudio: true });
    await peer.setLocalDescription(offer);
    await waitForIceGathering(peer);
    const sessionKey = crypto.randomUUID();
    sessions.set(sessionKey, { peer, stream, remoteStream });
    return { sessionKey, sdpOffer: peer.localDescription?.sdp || offer.sdp || '' };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    peer?.close();
    throw error;
  }
}

export async function createInboundWhatsAppRtcSession(sdpOffer: string) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let peer: RTCPeerConnection | undefined;
  try {
    peer = new RTCPeerConnection(await getRtcConfiguration());
    const remoteStream = new MediaStream();
    stream.getTracks().forEach((track) => peer!.addTrack(track, stream));
    peer.addEventListener('track', (event) => event.streams[0]?.getTracks().forEach((track) => remoteStream.addTrack(track)));
    await peer.setRemoteDescription({ type: 'offer', sdp: sdpOffer });
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await waitForIceGathering(peer);
    const sessionKey = crypto.randomUUID();
    sessions.set(sessionKey, { peer, stream, remoteStream });
    return { sessionKey, sdpAnswer: peer.localDescription?.sdp || answer.sdp || '' };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    peer?.close();
    throw error;
  }
}

export function getWhatsAppRtcSession(sessionKey: string) {
  return sessions.get(sessionKey);
}

export async function applyWhatsAppRemoteAnswer(sessionKey: string, sdp: string) {
  const session = sessions.get(sessionKey);
  if (!session || session.peer.currentRemoteDescription) return;
  await session.peer.setRemoteDescription({ type: 'answer', sdp });
}

export function closeWhatsAppRtcSession(sessionKey: string) {
  const session = sessions.get(sessionKey);
  if (!session) return;
  session.stream.getTracks().forEach((track) => track.stop());
  session.remoteStream.getTracks().forEach((track) => track.stop());
  session.peer.close();
  sessions.delete(sessionKey);
}

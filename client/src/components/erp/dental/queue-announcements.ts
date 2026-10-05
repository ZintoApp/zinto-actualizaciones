import type { QueueCallEvent, QueueSettings } from '@shared/types/dental-queue';
import { resolveMediaUrl } from '@/utils/mediaUrl';

const DEFAULT_CHIME_URL = '/audio/dental-attention-chime.mp3';

export const usesSpeech = (mode: QueueSettings['announcementMode']) => mode.includes('speech');
export const usesSound = (mode: QueueSettings['announcementMode']) => mode.startsWith('sound');
export function callSpeech(event: Pick<QueueCallEvent, 'number' | 'chairName'>, language: string) {
  // Spacing preserves leading zeroes when browser voices read ticket numbers.
  const ticket = event.number.split('').join(' ');
  return language === 'es' ? `Turno ${ticket}. Por favor, diríjase a ${event.chairName}.` : `Ticket ${ticket}. Please proceed to ${event.chairName}.`;
}

/** One player per display: calls finish in order and are cancelled on disconnect. */
export class QueueAnnouncementPlayer {
  private context: AudioContext | null = null;
  private controller: AbortController | null = null;
  private buffer: { url: string; audio: AudioBuffer } | null = null;
  async unlock() {
    if (!this.context || this.context.state === 'closed') this.context = new AudioContext();
    if (this.context.state === 'running') return;
    // Autoplay-blocked resume() can remain pending indefinitely in TV browsers.
    // Return control to the display so staff can enable sound with a new gesture.
    let timeout: number | undefined;
    try {
      await Promise.race([
        this.context.resume(),
        new Promise<never>((_, reject) => { timeout = window.setTimeout(() => reject(new Error('audio_blocked')), 3000); }),
      ]);
      if ((this.context.state as AudioContextState) !== 'running') throw new Error('audio_blocked');
    } finally { clearTimeout(timeout); }
  }
  stop() { this.controller?.abort(); this.controller = null; }
  dispose() { this.stop(); void this.context?.close(); this.context = null; }
  async play(event: Pick<QueueCallEvent, 'number' | 'chairName'>, settings: QueueSettings) {
    this.stop();
    const controller = new AbortController(); this.controller = controller;
    const signal = controller.signal;
    const mode = settings.announcementMode;
    if (mode === 'silent') return;
    if (mode.startsWith('chime') || usesSound(mode)) {
      await this.unlock();
      if (signal.aborted) return;
      const ctx = this.context!;
      // Bundled chimes come from the frontend; uploaded sounds use the media origin.
      const url = usesSound(mode) ? resolveMediaUrl(settings.soundUrl) : DEFAULT_CHIME_URL;
      if (usesSound(mode) && !settings.soundUrl) throw new Error('sound');
      if (this.buffer?.url !== url) {
        let timedOut = false;
        const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 10000);
        try {
          const response = await fetch(url, { signal });
          if (!response.ok) throw new Error('sound');
          const bytes = await response.arrayBuffer();
          if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('sound');
          const audio = await ctx.decodeAudioData(bytes);
          if (audio.duration > 30) throw new Error('sound');
          this.buffer = { url, audio };
        } catch (error) { if (timedOut) throw new Error('sound'); throw error; }
        finally { clearTimeout(timeout); }
      }
      if (signal.aborted) return;
      const source = ctx.createBufferSource(); source.buffer = this.buffer.audio;
      const gain = ctx.createGain(); source.connect(gain); gain.connect(ctx.destination);
      gain.gain.setValueAtTime(settings.announcementVolume, ctx.currentTime);
      await new Promise<void>((resolve, reject) => {
        const abort = () => { source.stop(); };
        const timeout = window.setTimeout(() => { source.stop(); reject(new Error('sound')); }, 35000);
        source.onended = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); source.disconnect(); gain.disconnect(); resolve(); };
        signal.addEventListener('abort', abort, { once: true });
        source.start();
      });
    }
    if (usesSpeech(mode) && !signal.aborted) {
      if (!('speechSynthesis' in window)) throw new Error('speech');
      const utterance = new SpeechSynthesisUtterance(callSpeech(event, settings.speechLanguage));
      utterance.lang = settings.speechLanguage; utterance.rate = settings.speechRate; utterance.volume = settings.announcementVolume;
      const voices = speechSynthesis.getVoices();
      utterance.voice = voices.find(v => v.voiceURI === settings.speechVoice && v.lang.startsWith(settings.speechLanguage))
        || voices.find(v => v.lang.startsWith(settings.speechLanguage)) || null;
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: Error) => { clearTimeout(timeout); signal.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
        const abort = () => { speechSynthesis.cancel(); finish(); };
        const timeout = window.setTimeout(() => { speechSynthesis.cancel(); finish(new Error('speech')); }, 30000);
        utterance.onend = () => finish(); utterance.onerror = () => finish(signal.aborted ? undefined : new Error('speech'));
        signal.addEventListener('abort', abort, { once: true });
        speechSynthesis.speak(utterance);
      });
    }
  }
}

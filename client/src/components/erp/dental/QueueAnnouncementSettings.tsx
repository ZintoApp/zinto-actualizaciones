import { useEffect, useRef, useState } from 'react';
import type { QueueSettings } from '@shared/types/dental-queue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiRequest } from '@/lib/queryClient';
import { QueueSelect } from './QueueSelect';
import { QueueAnnouncementPlayer, usesSound, usesSpeech } from './queue-announcements';
import { useQueueText } from './queue-text';

export function QueueAnnouncementSettings({ settings, onChange, onUploading, active = true }: {
  active?: boolean; settings: QueueSettings; onChange: (settings: QueueSettings) => void; onUploading: (value: boolean) => void;
}) {
  const { q } = useQueueText();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [uploading, setUploading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const player = useRef(new QueueAnnouncementPlayer());
  const latestSettings = useRef(settings);
  latestSettings.current = settings;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const update = () => setVoices(speechSynthesis.getVoices());
    update(); speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  useEffect(() => () => player.current.dispose(), []);
  useEffect(() => { if (!active) { player.current.stop(); setTesting(false); } }, [active]);
  const change = (value: Partial<QueueSettings>) => { player.current.stop(); onChange({ ...latestSettings.current, ...value }); setError(''); };
  async function upload(file?: File) {
    if (!file) return;
    setError('');
    if (!/\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(file.name) || file.size > 5 * 1024 * 1024) { setError(q('soundHelp')); return; }
    setUploading(true); onUploading(true);
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      const audio = await context.decodeAudioData(await file.arrayBuffer());
      if (audio.duration > 30) throw new Error(q('soundHelp'));
      const body = new FormData(); body.append('file', file);
      const result = await (await apiRequest('POST', '/api/upload', body)).json();
      change({ soundUrl: result.url });
    } catch { setError(q('soundHelp')); }
    finally { void context?.close(); setUploading(false); onUploading(false); }
  }
  return <fieldset className="space-y-4 rounded-lg border bg-muted/20 p-4" disabled={uploading}>
    <legend className="px-1 text-sm font-semibold">{q('callAnnouncements')}</legend>
    <QueueSelect id="queue-announcement-mode" label={q('announcementMode')} value={settings.announcementMode} onValueChange={mode => change({ announcementMode: mode as QueueSettings['announcementMode'], chimeEnabled: mode.startsWith('chime') })} options={(['silent', 'chime', 'speech', 'chime_speech', 'sound', 'sound_speech'] as const).map(mode => ({ value: mode, label: q(`announcement_${mode}`) }))} />
    {usesSound(settings.announcementMode) && <div className="space-y-2">
      <input ref={input} className="hidden" type="file" aria-label={q('uploadSound')} accept=".mp3,.wav,.ogg,.m4a,.aac,.webm" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      <p className="text-sm text-muted-foreground">{q('soundHelp')}</p>
      {settings.soundUrl && <p className="break-all text-sm">{q('soundFile')}: {settings.soundUrl.split('/').pop()}</p>}
      <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => input.current?.click()}>{uploading ? q('uploadingSound') : settings.soundUrl ? q('replaceSound') : q('uploadSound')}</Button>
        {settings.soundUrl && <Button type="button" variant="ghost" onClick={() => change({ soundUrl: '' })}>{q('removeSound')}</Button>}</div>
    </div>}
    {usesSpeech(settings.announcementMode) && <div className="space-y-3">
      <QueueSelect id="queue-speech-language" label={q('speechLanguage')} value={settings.speechLanguage} onValueChange={value => change({ speechLanguage: value as 'en' | 'es', speechVoice: '' })} options={[{ value: 'en', label: 'English' }, { value: 'es', label: 'Español' }]} />
      <QueueSelect id="queue-speech-voice" label={q('speechVoice')} value={settings.speechVoice} emptyLabel={q('automaticVoice')} onValueChange={speechVoice => change({ speechVoice })} options={voices.filter(v => v.lang.startsWith(settings.speechLanguage)).map(v => ({ value: v.voiceURI, label: `${v.name} (${v.lang})` }))} />
      <Label className="block">{q('speechRate')}<Input data-tour="components-erp-dental-queueannouncementsettings.input.settings.speechRate" className="mt-1" type="number" min={0.5} max={1.5} step={0.1} value={settings.speechRate} onChange={e => change({ speechRate: Number(e.target.value) })} /></Label>
      <p className="text-xs text-muted-foreground">{q('speechHelp')}</p>
    </div>}
    {settings.announcementMode !== 'silent' && <>
      <Label className="block">{q('announcementVolume')} ({Math.round(settings.announcementVolume * 100)}%)<input data-tour="components-erp-dental-queueannouncementsettings.input.settings.announcementVolume" className="mt-2 block w-full accent-primary" type="range" min={0} max={1} step={0.05} value={settings.announcementVolume} onChange={e => change({ announcementVolume: Number(e.target.value) })} /></Label>
      <Button type="button" variant="outline" disabled={usesSound(settings.announcementMode) && !settings.soundUrl} onClick={async () => {
        if (testing) { player.current.stop(); setTesting(false); return; }
        setTesting(true); setError('');
        try { await player.current.play({ number: 'A001', chairName: settings.speechLanguage === 'es' ? 'Consultorio 1' : 'Consulting Room 1' }, settings); }
        catch { setError(q('announcementFailed')); } finally { setTesting(false); }
      }}>{testing ? q('stopTest') : q('testAnnouncement')}</Button>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </fieldset>;
}

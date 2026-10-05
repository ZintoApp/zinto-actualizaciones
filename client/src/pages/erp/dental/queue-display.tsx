import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { QueueCallEvent, QueueDisplaySnapshot } from '@shared/types/dental-queue';
import { QueueDisplay } from '@/components/erp/dental/QueueDisplay';
import { QUEUE_API, queueRequest } from '@/components/erp/dental/queue-api';
import { useQueueText } from '@/components/erp/dental/queue-text';
import { QueueAnnouncementPlayer } from '@/components/erp/dental/queue-announcements';
import { Button } from '@/components/ui/button';

export default function DentalQueueDisplayPage() {
  const { q } = useQueueText();
  const [started, setStarted] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [announcement, setAnnouncement] = useState<QueueCallEvent | null>(null);
  const cursor = useRef<number>();
  const events = useRef<QueueCallEvent[]>([]);
  const nextAnnouncementAt = useRef(0);
  const player = useRef(new QueueAnnouncementPlayer());
  const playing = useRef(false);
  const displayDay = useRef<string>();
  const [audioError, setAudioError] = useState(false);
  const [enablingAudio, setEnablingAudio] = useState(false);
  const data = useQuery<QueueDisplaySnapshot>({
    queryKey: [QUEUE_API, 'display'],
    queryFn: async () => {
      try {
        const result = await queueRequest<QueueDisplaySnapshot>(`/display${cursor.current === undefined ? '' : `?after=${cursor.current}`}`);
        if (displayDay.current && displayDay.current !== result.day) { events.current = []; player.current.stop(); setAnnouncement(null); }
        displayDay.current = result.day;
        events.current.push(...result.events.filter(e => e.id > (cursor.current ?? result.cursor)));
        cursor.current = result.cursor;
        return result;
      } catch (error) {
        // Reconnection establishes a new baseline; never replay calls made while disconnected.
        cursor.current = undefined; events.current = []; player.current.stop(); setAnnouncement(null);
        throw error;
      }
    },
    // Reception is often used in another tab on the same computer. Once started,
    // this display must keep receiving calls even when that tab has focus.
    retry: false, refetchInterval: 2000, refetchIntervalInBackground: started, staleTime: 0, gcTime: 0,
  });
  const authError = [401, 403].includes((data.error as any)?.status);
  const stale = !data.dataUpdatedAt || now - data.dataUpdatedAt > 15000;
  const settings = data.data?.settings;
  useEffect(() => {
    const timer = window.setInterval(() => {
      const time = Date.now(); setNow(time);
      if (!started || authError || time - data.dataUpdatedAt > 15000) {
        events.current = []; player.current.stop(); setAnnouncement(null); return;
      }
      if (!playing.current && time >= nextAnnouncementAt.current) {
        const event = events.current.shift();
        setAnnouncement(event || null);
        if (event && settings) {
          nextAnnouncementAt.current = time + 4000;
          playing.current = true; setAudioError(false);
          void player.current.play(event, settings).catch(error => {
            if (error.name !== 'AbortError') setAudioError(true);
          }).finally(() => { playing.current = false; });
        }
      }
    }, 500);
    return () => { clearInterval(timer); };
  }, [started, settings, authError, data.dataUpdatedAt]);
  useEffect(() => () => player.current.dispose(), []);
  async function enableAudio() {
    setEnablingAudio(true);
    try {
      window.speechSynthesis?.resume();
      if (settings?.announcementMode !== 'speech' && settings?.announcementMode !== 'silent') await player.current.unlock();
      setAudioError(false);
    } catch { setAudioError(true); }
    finally { setEnablingAudio(false); }
  }
  async function start() {
    // Invoke both APIs directly from the click so fullscreen does not consume
    // the user activation required to unlock browser audio.
    const audioReady = enableAudio();
    try { await document.documentElement.requestFullscreen?.(); } catch { /* Some TV browsers use their own fullscreen mode. */ }
    await audioReady;
    events.current = []; setStarted(true);
  }
  if (authError) return <div className="grid min-h-screen place-content-center gap-4 bg-slate-950 p-10 text-center text-white"><p>{q('sessionExpired')}</p><a href="/auth">{q('signIn')}</a></div>;
  return <div className="relative min-h-screen bg-slate-950 text-white">
    {data.data && !stale ? <QueueDisplay data={data.data} now={now} announcement={announcement} /> : <div className="grid min-h-screen place-content-center gap-3 text-center"><p>{data.data ? q('stale') : data.isError ? q('reconnecting') : q('connecting')}</p></div>}
    {data.isError && !stale && <div role="alert" className="absolute inset-x-0 top-0 bg-amber-400 p-2 text-center font-medium text-black">{q('reconnecting')}</div>}
    {audioError && <div role="alert" className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-3 bg-amber-400 p-3 text-center text-black"><span>{q('announcementFailed')}</span><Button variant="secondary" disabled={enablingAudio} onClick={enableAudio}>{q('enableSound')}</Button></div>}
    {!started && <div className="absolute inset-0 grid place-content-center bg-slate-950/80 p-8 text-center backdrop-blur-sm"><Button size="lg" disabled={enablingAudio || !settings} onClick={start}>{q('startDisplay')}</Button><p className="mt-3 text-sm text-slate-300">{q('startHint')}</p></div>}
  </div>;
}

import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight } from 'lucide-react';
import { QueueDentalIcon } from './QueueDentalIcon';
import { QueueChairIcon } from './QueueChairIcon';
import { QueueCleaningIcon } from './QueueCleaningIcon';
import type { QueueDisplaySnapshot, QueueCallEvent } from '@shared/types/dental-queue';
import { useQueueText } from './queue-text';
import { QueueClock } from './QueueClock';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { resolveQueueBackgroundUrl } from './queue-background';
import { defaultQueueImageBackground } from '@shared/types/dental-queue';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import './dental-queue.css';

function PageIndicator({ page, count, label }: { page: number; count: number; label: string }) {
  return count > 1 ? <span className="dental-tv-pagination" aria-label={label}>{page + 1}<span aria-hidden="true"> / </span>{count}</span> : null;
}

export function QueueDisplay({ data, now: externalNow, announcement, preview = false }: {
  data: QueueDisplaySnapshot; now?: number; announcement?: QueueCallEvent | null; preview?: boolean;
}) {
  const { q, locale } = useQueueText();
  const [localNow, setLocalNow] = useState(Date.now);
  useEffect(() => {
    if (externalNow !== undefined) return;
    const timer = window.setInterval(() => setLocalNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [externalNow]);
  const now = externalNow ?? localNow;
  const backgroundType = data.settings.backgroundType ?? (data.settings.backgroundImageUrl ? 'image' : 'color');
  const backgroundUrl = backgroundType === 'image' && data.settings.backgroundImageUrl ? resolveQueueBackgroundUrl(data.settings.backgroundImageUrl) : '';
  const [loadedBackground, setLoadedBackground] = useState('');
  useEffect(() => {
    if (!backgroundUrl) { setLoadedBackground(''); return; }
    let active = true;
    const image = new Image();
    image.onload = () => { if (active) setLoadedBackground(backgroundUrl); };
    image.onerror = () => { if (active) setLoadedBackground(''); };
    image.src = backgroundUrl;
    return () => { active = false; image.onload = null; image.onerror = null; };
  }, [backgroundUrl]);
  const hasBackground = !!backgroundUrl && loadedBackground === backgroundUrl;
  const [pageStartedAt] = useState(now);
  const cycle = Math.max(0, Math.floor((now - pageStartedAt) / 10000));

  // Ordered announcements retain their chimes; the hero always shows the newest
  // active call, including when several calls arrive between refreshes.
  const lead = data.current[0];
  const focusEventId = data.events.reduce((latest, event) => event.turnId === lead?.id ? Math.max(latest, event.id) : latest,
    announcement?.turnId === lead?.id ? announcement?.id || 0 : 0);
  const [roomFocus, setRoomFocus] = useState({ turnId: lead?.id, eventId: focusEventId, at: now });
  const focusChanged = lead?.id !== roomFocus.turnId || focusEventId > roomFocus.eventId;
  useEffect(() => {
    if (focusChanged) setRoomFocus({ turnId: lead?.id, eventId: focusEventId, at: now });
  }, [focusChanged, lead?.id, focusEventId, now]);
  const roomPages = Math.max(1, Math.ceil(data.rooms.length / 3));
  const focusedRoomPage = Math.floor(Math.max(0, data.rooms.findIndex(r => r.id === lead?.chairId)) / 3);
  const roomPage = (focusedRoomPage + Math.max(0, Math.floor((now - (focusChanged ? now : roomFocus.at)) / 10000))) % roomPages;
  const rooms = data.rooms.slice(roomPage * 3, roomPage * 3 + 3);
  const upcomingPages = Math.max(1, Math.ceil(data.upcoming.length / 5));
  const upcomingPage = cycle % upcomingPages;
  const upcoming = data.upcoming.slice(upcomingPage * 5, upcomingPage * 5 + 5);
  const message = data.settings.messages.length ? data.settings.messages[cycle % data.settings.messages.length] : q('wellnessMessage');
  const providersPage = cycle % Math.max(1, Math.ceil(data.providers.length / 3));
  const visibleProviders = data.providers.slice(providersPage * 3, providersPage * 3 + 3);
  const servicesPage = cycle % Math.max(1, Math.ceil(data.services.length / 4));
  const isCalling = lead?.status === 'called';
  const pageLabel = (page: number, count: number) => q('displayPage', { page: page + 1, count });
  const style = {
    '--queue-accent': data.settings.primaryColor,
    '--queue-logo-background': data.settings.logoBackgroundColor,
    backgroundColor: backgroundType === 'image' ? '#0b1426' : data.settings.backgroundColor,
    backgroundImage: backgroundType === 'image' ? 'none' : 'linear-gradient(#000d, #000d)',
  } as CSSProperties;

  return <section className={`dental-tv ${preview ? 'dental-tv-preview' : ''}`} style={style} aria-label={q('title')}>
    {hasBackground && <>
      <div className="dental-tv-background-image" aria-hidden="true" style={{
        backgroundImage: `url(${JSON.stringify(backgroundUrl)})`,
        backgroundSize: ({ cover: 'cover', fit: 'contain', stretch: '100% 100%', tile: 'auto' } as const)[data.settings.backgroundImageMode || 'cover'],
        backgroundPosition: (data.settings.backgroundImagePosition || 'center').replace('-', ' '),
        backgroundRepeat: data.settings.backgroundImageMode === 'tile' ? 'repeat' : 'no-repeat',
        opacity: 1 - (data.settings.backgroundImageTransparency ?? defaultQueueImageBackground.backgroundImageTransparency) / 100,
      }} />
      <div className="dental-tv-background-overlay" aria-hidden="true" style={{ opacity: (data.settings.backgroundImageDimming ?? defaultQueueImageBackground.backgroundImageDimming) / 100 }} />
    </>}
    <header className="dental-tv-header">
      <div className="dental-tv-brand">
        {data.logoUrl && <img src={resolveMediaUrl(data.logoUrl)} alt="" onError={e => { e.currentTarget.style.visibility = 'hidden'; }} />}
        <div><strong>{data.settings.displayClinicName?.trim() || data.clinicName}</strong><p>{data.settings.welcomeMessage || q('welcome')}</p></div>
      </div>
      <QueueClock timezone={data.timezone} locale={locale} />
    </header>

    <main className="dental-tv-main">
      <div className="dental-tv-left">
        <section className={`dental-tv-call ${lead ? 'dental-tv-call-active' : ''}`} aria-live="polite" aria-atomic="true">
          <div className="dental-tv-eyebrow"><span className="dental-tv-dot" />{lead ? isCalling ? q('nowCalling') : q('in_service') : q('title')}
            {lead?.estimate.delayed && <span className="dental-tv-delay">{q('delayed')}</span>}
          </div>
          {lead ? <div className="dental-tv-lead" key={lead.id}>
            <div className="dental-tv-number" style={{ fontSize: `calc(${Math.min(9.2, 36.8 / lead.number.length)} * var(--tv-unit))` }}>{lead.number}</div>
            <ArrowRight className="dental-tv-direction" aria-hidden="true" />
            <div className={`dental-tv-destination ${lead.chairName.length > 30 ? 'dental-tv-destination-long' : ''}`}>
              <QueueDentalIcon className="dental-tv-tooth" />
              <h1 style={{ fontSize: `calc(${lead.chairName.length > 60 ? 1.6 : lead.chairName.length > 30 ? 1.8 : 2.75} * var(--tv-unit))` }}>{lead.chairName}</h1>
              <p>{lead.providerName}</p>
            </div>
          </div> : <div className="dental-tv-empty"><QueueDentalIcon /><p>{q('welcome')}</p></div>}
          <p className="dental-tv-instruction">{isCalling ? q('proceedToRoom') : q('watchTicket')}</p>
        </section>

        <section className="dental-tv-room-section" aria-label={q('activeRooms')}>
          <div className="dental-tv-section-heading"><h2>{q('activeRooms')}</h2><PageIndicator page={roomPage} count={roomPages} label={pageLabel(roomPage, roomPages)} /></div>
          <div className="dental-tv-rooms">
            {rooms.map(room => {
              const turn = data.current.find(t => t.chairId === room.id);
              return <article key={room.id} data-room-id={room.id} className={`dental-tv-room ${turn ? 'dental-tv-room-busy' : ''} ${lead?.chairId === room.id ? 'dental-tv-room-featured' : ''}`}>
                <QueueChairIcon className="dental-tv-room-icon" />
                <div className="dental-tv-room-details">
                  <h3 title={room.name}>{room.name}</h3>
                  {turn && <p className="dental-tv-room-provider" title={turn.providerName}>{turn.providerName}</p>}
                  <div className="dental-tv-room-status"><span className="dental-tv-dot" /><span>{turn ? q(turn.status === 'in_service' ? 'in_service' : 'called') : q('available')}</span>{turn && <b>{turn.number}</b>}</div>
                  {turn?.estimate.delayed && <span className="dental-tv-room-delay">{q('delayed')}</span>}
                </div>
              </article>;
            })}
            {!rooms.length && <p className="dental-tv-no-rooms">{q('noActiveRooms')}</p>}
          </div>
        </section>
      </div>

      <aside className="dental-tv-upcoming" aria-label={q('upNext')}>
        <header className="dental-tv-upcoming-header"><div><h2>{q('upNext')}</h2><p>{q('estimatedWaitTimes')}</p></div><span className="dental-tv-waiting-count">{q('waitingCount', { count: data.upcoming.length })}</span></header>
        <div className="dental-tv-upcoming-list">
          {upcoming.map(turn => <div className="dental-tv-upcoming-row" key={turn.id}>
            <b style={{ fontSize: `calc(${Math.min(3, 12 / turn.number.length)} * var(--tv-unit))` }}>{turn.number}</b>
            <div className="dental-tv-upcoming-details"><strong title={turn.chairName}>{turn.chairName}</strong><small title={turn.providerName}>{turn.providerName}</small></div>
            <span className="dental-tv-wait-estimate">{turn.estimate.delayed ? q('delayed') : turn.estimate.minutes === null ? q('noEstimate') : q('displayWait', { minutes: turn.estimate.minutes })}</span>
          </div>)}
          {!upcoming.length && <div className="dental-tv-quiet">{q('empty')}</div>}
        </div>
        <div className="dental-tv-upcoming-pages"><PageIndicator page={upcomingPage} count={upcomingPages} label={pageLabel(upcomingPage, upcomingPages)} /></div>
      </aside>
    </main>

    <footer className="dental-tv-footer">
      <div className="dental-tv-team">
        {visibleProviders.length > 0 && <span className="dental-tv-team-avatars">
          {visibleProviders.map(provider => <Avatar key={provider.id} className="dental-tv-team-avatar" role="img" aria-label={provider.name} title={provider.name}>
            <AvatarImage src={provider.avatarUrl ? resolveMediaUrl(provider.avatarUrl) : undefined} alt="" className="object-cover" />
            <AvatarFallback className="dental-tv-team-initials">{provider.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('').toLocaleUpperCase(locale) || '?'}</AvatarFallback>
          </Avatar>)}
        </span>}
        <div><h2>{q('ourDentalTeam')}</h2>
        <p>{visibleProviders.map(p => p.name).join(' · ') || '—'}</p>
        <p className="dental-tv-team-services">{data.services.slice(servicesPage * 4, servicesPage * 4 + 4).map(s => s.label).join(' · ') || '—'}</p>
      </div></div>
      <div className={`dental-tv-wellness ${message.length > 120 ? 'dental-tv-wellness-long' : ''}`}><QueueCleaningIcon /><p>{message}</p></div>
      <p className="dental-tv-patience">{q('thankYouPatience')}</p>
    </footer>
  </section>;
}

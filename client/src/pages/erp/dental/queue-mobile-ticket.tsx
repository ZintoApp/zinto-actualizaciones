import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import { Ticket, ArrowRight, WifiOff } from 'lucide-react';
import { publicQueueTicketSchema } from '@shared/types/dental-queue';
import { getZonedDateTimeParts } from '@shared/utils/agent-schedule';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { queueText, type QueueTextKey } from '@/components/erp/dental/queue-text';
import { queueDate } from '@/components/erp/dental/queue-api';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { requestDigitalTicket } from '@/components/erp/dental/queue-digital-ticket-api';

type TicketError = Error & { status?: number };

export default function DentalMobileTicketPage() {
  const [, params] = useRoute('/dental/ticket/:token');
  const [language, setLanguage] = useState(() => navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en');
  const [spanish, setSpanish] = useState<Record<string, string>>({});
  const [now, setNow] = useState(Date.now());
  const [expired, setExpired] = useState(false);
  // Use the existing translation files without changing a staff member's ERP language preference.
  useEffect(() => { if (language === 'es') void import('../../../../../translations/es.json').then(module => {
    setSpanish(Object.fromEntries(module.default.filter(row => row.key.startsWith('erp.dental.queue.')).map(row => [row.key, row.value])));
  }).catch(() => { /* Keep the bundled English fallback available while offline. */ }); }, [language]);
  const q = (key: QueueTextKey) => (language === 'es' ? spanish[`erp.dental.queue.${key}`] : undefined) || queueText[key];
  const ticket = useQuery({ queryKey: ['public-dental-ticket', params?.token], enabled: !!params?.token && !expired,
    queryFn: async ({ signal }) => publicQueueTicketSchema.parse(await requestDigitalTicket(`/api/public/dental/queue/tickets/${encodeURIComponent(params!.token)}`, 'GET', signal)),
    retry: false, refetchInterval: query => [404, 410].includes((query.state.error as TicketError)?.status ?? 0) || expired ? false : 2000,
    refetchIntervalInBackground: false, gcTime: 0 });
  useEffect(() => { setExpired(false); }, [params?.token]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const visible = () => { if (!document.hidden) { setNow(Date.now()); if (!expired && ![404, 410].includes((ticket.error as TicketError)?.status ?? 0)) void ticket.refetch(); } };
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
  }, [expired, ticket.refetch, ticket.error]);
  const data = ticket.data;
  useEffect(() => {
    if (data && getZonedDateTimeParts(new Date(Date.parse(data.serverTime) + Math.max(0, now - ticket.dataUpdatedAt)), data.timezone).dateKey !== data.day) setExpired(true);
  }, [data, now, ticket.dataUpdatedAt]);
  useEffect(() => {
    const previous = document.title;
    document.title = q('digitalTicket');
    return () => { document.title = previous; };
  }, [language, spanish]);
  const status = (ticket.error as TicketError)?.status;
  const ended = expired || status === 410;
  const unavailable = status === 404;
  const stale = !data || now - ticket.dataUpdatedAt >= 15000;
  const showData = data && !ended && !unavailable;
  return <main lang={language} className="min-h-dvh bg-slate-100 px-4 py-6 text-slate-900 sm:py-10">
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm font-medium"><Ticket className="h-5 w-5" />{q('digitalTicket')}</span>
        <Select value={language} onValueChange={setLanguage}><SelectTrigger aria-label="Language / Idioma" className="w-32 bg-white text-slate-900"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="es">Español</SelectItem></SelectContent></Select></div>
      {ended || unavailable ? <section className="rounded-2xl border bg-white p-6" role="status"><h1 className="text-lg font-semibold">{q(ended ? 'digitalTicketExpired' : 'digitalTicketNotFound')}</h1><p className="mt-2 text-sm text-slate-600">{q('mobileReceptionHelp')}</p></section> : <>
        {(ticket.error || stale && data) && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><WifiOff className="mb-2 h-5 w-5" />{q('mobileConnectionWarning')} <Button variant="ghost" onClick={() => void ticket.refetch()}>{q('retry')}</Button></div>}
        {!data && !ticket.error && <p role="status">{q('loading')}</p>}
        {showData && <article className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderTop: `5px solid ${data.primaryColor}` }}>
          <header className="border-b px-6 py-5 text-center">
            {data.logoUrl && <img src={resolveMediaUrl(data.logoUrl)} alt="" referrerPolicy="no-referrer" onError={e => { e.currentTarget.hidden = true; }} className="mx-auto mb-3 h-16 max-w-full rounded-lg object-contain p-2" style={{ backgroundColor: data.logoBackgroundColor }} />}
            <h1 className="break-words text-xl font-semibold">{data.clinicName}</h1>
          </header>
          <div className="space-y-5 px-6 py-6">
            <div className="text-center"><p className="text-sm text-slate-500">{q('ticket')}</p><p className="break-words text-6xl font-bold tabular-nums tracking-tight">{data.number}</p></div>
            <div role="status" aria-live="polite" className={`rounded-xl p-4 text-center ${!stale && data.status === 'called' ? 'bg-blue-50 text-blue-950' : 'bg-slate-50'}`}>
              <strong>{stale ? q('mobileUpdating') : q(data.status)}</strong>
              {!stale && <p className="mt-1 text-sm">{q(`mobile_${data.status}`)}</p>}
              {!stale && data.status === 'called' && <ArrowRight className="mx-auto mt-2 h-6 w-6" aria-hidden="true" />}
            </div>
            {!stale && data.status === 'waiting' && <p className="text-center text-sm font-medium">{data.estimate.delayed ? q('delayed') : data.estimate.minutes === null ? q('mobileEstimateUnavailable') : `${q('estimate')}: ${q('approx').replace('{{minutes}}', String(data.estimate.minutes))}`}</p>}
            {!stale && data.status === 'in_service' && data.estimate.delayed && <p className="text-center text-sm">{q('delayed')}</p>}
            <dl className="space-y-3 text-sm">{[
              [q('room'), data.chairName], [q('professional'), data.providerName],
              [q('issued'), queueDate(data.issuedAt, data.timezone, language, true)],
              ...(data.scheduledAt ? [[q('appointmentTime'), queueDate(data.scheduledAt, data.timezone, language, true)]] : []),
            ].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}</dl>
          </div>
          <footer className="border-t px-6 py-4 text-center text-xs text-slate-500">{q('digitalTicketExpiry')}</footer>
        </article>}
      </>}
    </div>
  </main>;
}

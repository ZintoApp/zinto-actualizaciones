import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from 'wouter';
import type { QueueTicket } from '@shared/types/dental-queue';
import { queueDate, queueRequest, QUEUE_API } from '@/components/erp/dental/queue-api';
import { useQueueText } from '@/components/erp/dental/queue-text';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { Button } from '@/components/ui/button';
import { TicketQRCode, useDigitalTicket } from '@/components/erp/dental/QueueDigitalTicket';
import '@/components/erp/dental/dental-queue.css';

export function QueueTicketContent({ data, digitalUrl }: { data: QueueTicket; digitalUrl?: string }) {
  const { q, locale } = useQueueText();
  return <article className="queue-ticket" style={{ '--ticket-width': `${data.settings.paperWidth}mm` } as CSSProperties}>
    {data.logoUrl && <img src={resolveMediaUrl(data.logoUrl)} alt="" />}
    <h1>{data.clinicName}</h1><p>{q('ticket')}</p><div className="queue-ticket-number">{data.turn.number}</div>
    <dl><dt>{q('issued')}</dt><dd>{queueDate(data.turn.issuedAt, data.timezone, locale, true)}</dd>
      {data.turn.scheduledAt && <><dt>{q('appointmentTime')}</dt><dd>{queueDate(data.turn.scheduledAt, data.timezone, locale, true)}</dd></>}
      <dt>{q('professional')}</dt><dd>{data.turn.providerName}</dd><dt>{q('room')}</dt><dd>{data.turn.chairName}</dd></dl>
    {digitalUrl && <TicketQRCode url={digitalUrl} print />}
    <footer>{data.settings.ticketFooter || q('watchTicket')}</footer>
  </article>;
}

export default function DentalQueueTicketPage() {
  const [, params] = useRoute('/erp/dental/queue/ticket/:id');
  const { q } = useQueueText();
  const ticket = useQuery({ queryKey: [QUEUE_API, 'ticket', params?.id], queryFn: () => queueRequest<QueueTicket>(`/turns/${params?.id}/ticket`), enabled: !!params?.id, retry: false, gcTime: 0 });
  const digital = useDigitalTicket(Number(params?.id), !!ticket.data);
  if (ticket.error) return <p role="alert" className="p-8">{ticket.error.message}</p>;
  if (!ticket.data) return <p className="p-8">{q('loading')}</p>;
  return <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
    <style>{`@page { size: ${ticket.data.settings.paperWidth}mm 200mm; margin: 4mm; }`}</style>
    <div className="queue-print-controls mx-auto max-w-lg space-y-3 text-center"><Button disabled={digital.isLoading} onClick={() => window.print()}>{q('print')}</Button><p className="text-sm text-slate-600">{q('printHint')}</p></div>
    {digital.error && (digital.error as any).status !== 410 && <div className="queue-print-controls mx-auto max-w-lg text-center text-sm" role="alert">{q('digitalTicketFailed')} <Button variant="ghost" onClick={() => void digital.refetch()}>{q('retry')}</Button></div>}
    {digital.isFetching && <p className="queue-print-controls text-center text-sm" role="status">{q('loadingDigitalTicket')}</p>}
    <QueueTicketContent data={ticket.data} digitalUrl={digital.error ? undefined : digital.data?.url} />
  </div>;
}

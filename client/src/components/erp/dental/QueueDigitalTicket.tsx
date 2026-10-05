import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, ExternalLink, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QUEUE_API } from './queue-api';
import { requestDigitalTicket, resolveDigitalTicketLink } from './queue-digital-ticket-api';
import { useQueueText } from './queue-text';

export function useDigitalTicket(turnId: number, enabled = true) {
  return useQuery({ queryKey: [QUEUE_API, 'digital-ticket', turnId], enabled,
    queryFn: async ({ signal }) => resolveDigitalTicketLink(await requestDigitalTicket(`${QUEUE_API}/turns/${turnId}/digital-ticket`, 'POST', signal), window.location.origin),
    retry: false, gcTime: 0, staleTime: 0 });
}

export function TicketQRCode({ url, print = false }: { url: string; print?: boolean }) {
  const { q } = useQueueText();
  return <figure className={print ? 'queue-ticket-qr' : 'mx-auto w-fit max-w-full rounded-xl bg-white p-4 text-center text-black'}>
    <QRCodeSVG value={url} size={print ? 160 : 224} level="M" marginSize={4} title={q('digitalTicket')} style={{ maxWidth: '100%', height: 'auto' }} />
    <figcaption className="mt-2 text-sm">{q('scanTicket')}</figcaption>
  </figure>;
}

export function QueueDigitalTicketDialog({ turnId, number, open, onOpenChange }: { turnId: number; number: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { q } = useQueueText();
  const link = useDigitalTicket(turnId, open);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const expired = (link.error as any)?.status === 410;
  return <Dialog open={open} onOpenChange={value => { setCopyState('idle'); onOpenChange(value); }}><DialogContent className="sm:max-w-md">
    <DialogHeader><DialogTitle>{q('digitalTicket')} · {number}</DialogTitle><DialogDescription>{q('digitalTicketExpiry')}</DialogDescription></DialogHeader>
    {link.isFetching && !link.data && <p role="status">{q('loading')}</p>}
    {link.error ? <div role="alert" className="space-y-3"><p>{q(expired ? 'digitalTicketExpired' : 'digitalTicketFailed')}</p>{!expired && <Button variant="outline" onClick={() => void link.refetch()}>{q('retry')}</Button>}</div> : link.data && <>
      <TicketQRCode url={link.data.url} />
      <div className="space-y-3 pb-4 pt-6">
      <div className="flex flex-wrap justify-center gap-2"><Button onClick={async () => { try { await navigator.clipboard.writeText(link.data!.url); setCopyState('copied'); } catch { setCopyState('error'); } }}><Copy className="mr-2 h-4 w-4" />{q('copyTicketLink')}</Button>
        <Button variant="outline" asChild><a href={link.data.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{q('openTicket')}</a></Button></div>
      {copyState !== 'idle' && <p role="status" className="text-sm text-center">{q(copyState === 'copied' ? 'ticketLinkCopied' : 'ticketCopyFailed')}</p>}
      {copyState === 'error' && <input data-tour="components-erp-dental-queuedigitalticket.input.link.data.url" aria-label={q('copyTicketLink')} readOnly value={link.data.url} onFocus={e => e.target.select()} className="w-full rounded-md border bg-background p-2 text-sm" />}
      </div>
    </>}
  </DialogContent></Dialog>;
}

export function QueueDigitalTicketButton({ turnId, number }: { turnId: number; number: string }) {
  const [open, setOpen] = useState(false);
  const { q } = useQueueText();
  return <><Button variant="outline" onClick={() => setOpen(true)}><QrCode className="mr-2 h-4 w-4" />{q('digitalTicket')}</Button>
    {open && <QueueDigitalTicketDialog turnId={turnId} number={number} open={open} onOpenChange={setOpen} />}</>;
}

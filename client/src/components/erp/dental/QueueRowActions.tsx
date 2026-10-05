import { Check, MoreHorizontal, Play, Printer, QrCode, RotateCcw, SkipForward, Volume2, X } from 'lucide-react';
import { useState } from 'react';
import { QueueDigitalTicketDialog } from './QueueDigitalTicket';
import { allowedQueueActions, type QueueAction, type QueueTurn } from '@shared/types/dental-queue';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useQueueText } from './queue-text';

const icons = { start: Play, finish: Check, return: RotateCcw, recall: Volume2, skip: SkipForward, cancel: X };

export function QueueRowActions({ turn, canManage, pending, stale, today, onAction }: {
  turn: QueueTurn; canManage: boolean; pending: boolean; stale: boolean; today?: string;
  onAction: (action: QueueAction) => void;
}) {
  const { q } = useQueueText();
  const [digitalOpen, setDigitalOpen] = useState(false);
  const actions = canManage ? allowedQueueActions[turn.status] : [];
  const secondary = actions;
  const disabled = (action: QueueAction) => pending || stale || (turn.day !== today && ['recall', 'start', 'return'].includes(action));
  const printLink = <a href={`/erp/dental/queue/ticket/${turn.id}`} target="_blank" rel="noreferrer" aria-label={q('reprint')} title={q('reprint')}><Printer className="h-4 w-4" aria-hidden="true" /></a>;
  return <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
    <Button type="button" size="icon" className="h-8 w-8 shrink-0" variant="outline" disabled={turn.day !== today} aria-label={q('digitalTicket')} title={turn.day !== today ? q('digitalTicketExpired') : q('digitalTicket')} onClick={() => setDigitalOpen(true)}><QrCode className="h-4 w-4" aria-hidden="true" /></Button>
    <Button size="icon" className="h-8 w-8 shrink-0" variant="outline" asChild>{printLink}</Button>
    {secondary.length > 0 && <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={q('turnActions', { ticket: turn.number })} title={q('turnActions', { ticket: turn.number })}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6}>
        {secondary.filter(action => action !== 'cancel').map(action => { const Icon = icons[action]; return <DropdownMenuItem key={action} disabled={disabled(action)} onSelect={() => onAction(action)}><Icon className="mr-2 h-4 w-4" aria-hidden="true" />{q(action)}</DropdownMenuItem>; })}
        {secondary.includes('cancel') && <><DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" disabled={disabled('cancel')} onSelect={() => onAction('cancel')}><X className="mr-2 h-4 w-4" aria-hidden="true" />{q('cancel')}</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>}
    {digitalOpen && <QueueDigitalTicketDialog turnId={turn.id} number={turn.number} open={digitalOpen} onOpenChange={setDigitalOpen} />}
  </div>;
}

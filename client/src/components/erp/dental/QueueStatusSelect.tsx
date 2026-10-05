import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { editableQueueStatusSchema, type EditableQueueStatus, type QueueOptions, type QueueSnapshot, type QueueTurn } from '@shared/types/dental-queue';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useQueueText } from './queue-text';

export function QueueStatusSelect({ turn, data, options, canManage, pending, stale, onChange }: {
  turn: QueueTurn; data?: QueueSnapshot; options?: QueueOptions; canManage: boolean; pending: boolean; stale: boolean;
  onChange: (status: EditableQueueStatus) => Promise<unknown>;
}) {
  const { q } = useQueueText();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const reason = (status: EditableQueueStatus) => {
    if (status === turn.status || !['waiting', 'called', 'in_service', 'skipped'].includes(status)) return '';
    if (turn.day !== data?.display.day) return q('statusPreviousDay');
    if (data?.turns.some(t => t.id !== turn.id && ['waiting', 'called', 'in_service', 'skipped'].includes(t.status) && (t.contactId === turn.contactId || (turn.appointmentId && turn.appointmentId === t.appointmentId)))) return q('statusDuplicate');
    if (turn.scheduledAt && (!turn.appointmentId || !options?.appointments.some(a => a.id === turn.appointmentId))) return q('statusAppointmentChanged');
    const professional = options?.providers.find(p => p.id === turn.providerUserId);
    if (!professional || !options?.rooms.some(r => r.id === turn.chairId) || (professional.chairIds?.length && !professional.chairIds.includes(turn.chairId))) return q('statusAssignment');
    const service = options.services.find(s => s.id === turn.serviceKey);
    const appointment = options.appointments.find(a => a.id === turn.appointmentId);
    if (!service && !(appointment?.serviceKey === turn.serviceKey && appointment.serviceLabel)) return q('statusServiceUnavailable');
    if (service && professional.specialtyIds?.length && !professional.specialtyIds.includes(service.specialtyId)) return q('statusAssignment');
    if (['called', 'in_service'].includes(status)) {
      if (turn.scheduledAt && Date.parse(turn.scheduledAt) > Date.parse(data?.display.serverTime || '')) return q('statusNotDue');
      if (data?.turns.some(t => t.id !== turn.id && ['called', 'in_service'].includes(t.status) && (t.providerUserId === turn.providerUserId || t.chairId === turn.chairId))) return q('statusResourceBusy');
    }
    return '';
  };
  const content = <><i className={`queue-status-dot queue-dot-${turn.status}`} aria-hidden="true" />{q(turn.status)}</>;
  if (!canManage || turn.status === 'invalidated') return <span className={`queue-status queue-status-${turn.status}`} title={turn.status === 'invalidated' ? q('statusInvalidated') : undefined}>{content}</span>;
  return <div className="space-y-1">
    <Select value={turn.status} disabled={pending || stale || saving} onValueChange={async value => {
      const status = editableQueueStatusSchema.parse(value);
      if (status === turn.status) return;
      setError(''); setSaving(true);
      try { await onChange(status); } catch (error) { setError((error as Error).message); } finally { setSaving(false); }
    }}>
      <SelectTrigger aria-label={q('changeTurnStatus', { ticket: turn.number })} aria-busy={saving} className={`queue-status queue-status-${turn.status} h-8 w-auto gap-2`}>
        {saving ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <i className={`queue-status-dot queue-dot-${turn.status}`} aria-hidden="true" />}{q(turn.status)}
      </SelectTrigger>
      <SelectContent align="end" className="max-w-[min(320px,calc(100vw-2rem))]">
        {editableQueueStatusSchema.options.map(status => {
          const blocked = reason(status);
          return <SelectItem key={status} value={status} textValue={q(status)} disabled={!!blocked} title={blocked || undefined}>
            <span className="flex items-center gap-2"><i className={`queue-status-dot queue-dot-${status}`} aria-hidden="true" />{q(status)}</span>
            {blocked && <span className="mt-1 block max-w-60 whitespace-normal text-xs text-muted-foreground">{blocked}</span>}
          </SelectItem>;
        })}
      </SelectContent>
    </Select>
    {error && <p role="alert" className="max-w-56 whitespace-normal text-xs text-destructive">{error}</p>}
  </div>;
}

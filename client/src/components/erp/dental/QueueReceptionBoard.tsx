import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, Clock, Search, SlidersHorizontal } from 'lucide-react';
import { allowedQueueActions, compareQueueTurns, eligibleTurn, type QueueAction, type QueueOptions, type QueueSnapshot, type QueueStatus, type QueueTurn } from '@shared/types/dental-queue';
import { compareErpSortValues } from '@shared/utils/erp-table-sorting';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, type TableSortState } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { QueueSelect } from './QueueSelect';
import { QueueRowActions } from './QueueRowActions';
import { QueueStatusSelect } from './QueueStatusSelect';
import type { EditableQueueStatus } from '@shared/types/dental-queue';
import { useQueueText } from './queue-text';
import { queueDate } from './queue-api';
import './queue-reception.css';

const pageSize = 10;
const unfinished = (turn: QueueTurn) => ['waiting', 'called', 'in_service', 'skipped'].includes(turn.status);

export function QueueReceptionBoard({ data, options, canManage, pending, stale, loading, onNext, onAction, onStatusChange }: {
  data?: QueueSnapshot; options?: QueueOptions; canManage: boolean; pending: boolean; stale: boolean; loading: boolean;
  onNext: (provider: number, room: number) => void;
  onAction: (turn: QueueTurn, action: QueueAction) => Promise<unknown>;
  onStatusChange: (turn: QueueTurn, status: EditableQueueStatus) => Promise<unknown>;
}) {
  const { q, locale } = useQueueText();
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [room, setRoom] = useState('');
  const [service, setService] = useState('');
  const [status, setStatus] = useState('');
  const [tab, setTab] = useState('');
  const [previousOnly, setPreviousOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<TableSortState | null>(null);
  const [page, setPage] = useState(1);
  const [stationProvider, setStationProvider] = useState('');
  const [stationRoom, setStationRoom] = useState('');
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolveError, setResolveError] = useState('');
  const turns = data?.turns || [];
  const day = data?.display.day;
  const autoClear = data?.display.settings.autoClearPreviousDay !== false;
  useEffect(() => { if (autoClear) setPreviousOnly(false); }, [autoClear]);
  const previous = turns.filter(t => t.day !== day && unfinished(t));
  const filtered = turns.filter(t => (!provider || String(t.providerUserId) === provider) && (!room || String(t.chairId) === room)
    && (!service || t.serviceKey === service) && (!status || t.status === status) && (!previousOnly || (t.day !== day && unfinished(t)))
    && (!search.trim() || [t.number, t.patientName, t.providerName, t.chairName, t.serviceLabel, q(t.status)].some(value => value.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)))));
  const visible = filtered.filter(t => !tab || t.status === tab);
  const value = (t: QueueTurn, column: number) => [t.number, t.patientName, t.providerName, t.serviceLabel, q(t.status)][column];
  const sorted = sort ? visible.map((turn, index) => ({ turn, index })).sort((a, b) =>
    compareErpSortValues(value(a.turn, sort.columnIndex), value(b.turn, sort.columnIndex), sort.direction, 'text', locale)
    || (sort.columnIndex === 2 ? compareErpSortValues(a.turn.chairName, b.turn.chairName, sort.direction, 'text', locale) : 0)
    || a.index - b.index).map(item => item.turn) : visible;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => { setPage(1); }, [search, provider, room, service, status, tab, previousOnly, sort]);
  useEffect(() => { setPage(p => Math.min(p, pageCount)); }, [pageCount]);
  const stationProfessional = options?.providers.find(p => String(p.id) === stationProvider);
  const stationRooms = (options?.rooms || []).filter(r => !stationProfessional?.chairIds?.length || stationProfessional.chairIds.includes(r.id));
  const assignmentValid = !!stationProfessional && stationRooms.some(r => String(r.id) === stationRoom);
  const busy = assignmentValid ? turns.find(t => ['called', 'in_service'].includes(t.status) && (String(t.providerUserId) === stationProvider || String(t.chairId) === stationRoom)) : undefined;
  const next = assignmentValid && !busy && !stale ? turns.filter(t => t.day === day && String(t.providerUserId) === stationProvider && String(t.chairId) === stationRoom && eligibleTurn(t, Date.parse(data!.display.serverTime))).sort(compareQueueTurns)[0] : undefined;
  const stationPrevious = previous.filter(t => String(t.providerUserId) === stationProvider || String(t.chairId) === stationRoom);
  const resolution = turns.find(t => t.id === resolveId);
  const resolutionActions: QueueAction[] = resolution && unfinished(resolution) ? resolution.status === 'in_service' ? ['finish', 'cancel'] : ['cancel'] : [];
  const estimate = (t: QueueTurn) => {
    const e = data?.estimates[t.id];
    return stale || !e || (e.minutes === null && !e.delayed) ? '' : e.delayed ? q('delayed') : q('approx', { minutes: e.minutes });
  };
  const reviewPrevious = () => { setSearch(''); setProvider(''); setRoom(''); setService(''); setStatus(''); setTab(''); setPreviousOnly(true); setFiltersOpen(true); setPage(1); };
  const openResolution = (id: number) => { setResolveError(''); setResolveId(id); };
  const stationHint = stale ? q('stationOffline') : !assignmentValid ? q('chooseStation') : busy ? q('busy') : !next ? q('noStationPatients') : q('readyToCall');
  return <div className="queue-reception">
    <section className="queue-overview" aria-label={q('overview')}>
      <h2>{q('overview')}</h2>
      {(['waiting', 'called', 'in_service', 'finished'] as const).map(s => <button key={s} type="button" aria-pressed={status === s} onClick={() => { setTab(''); setStatus(status === s ? '' : s); }}>
        <span><i className={`queue-status-dot queue-dot-${s}`} />{q(s)}</span><strong>{turns.filter(t => t.status === s).length}</strong>
      </button>)}
    </section>
    <div className="queue-reception-grid">
      <section className="queue-patient-panel" aria-label={q('patientQueue')}>
        <div className="queue-table-toolbar">
          <div className="flex items-center gap-3"><h2>{q('patientQueue')}</h2><span className="queue-count">{q('ticketCount', { count: turns.length })}</span></div>
          <div className="flex min-w-0 items-center gap-2"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input data-tour="components-erp-dental-queuereceptionboard.input.search" type="search" aria-label={q('searchQueue')} placeholder={q('searchPatientOrTicket')} value={search} onChange={e => setSearch(e.target.value)} className="h-10 pl-9" /></div><Button variant="outline" aria-expanded={filtersOpen} aria-controls="queue-table-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal className="mr-2 h-4 w-4" />{q('filters')}</Button></div>
        </div>
        <div className="queue-tabs" role="group" aria-label={q('ticketStatus')}>
          {(['', 'waiting', 'finished', 'cancelled'] as const).map(s => <button type="button" key={s} aria-pressed={tab === s} onClick={() => setTab(s)}>{s === '' ? q('allTickets') : s === 'finished' ? q('completed') : q(s)}<span>{filtered.filter(t => !s || t.status === s).length}</span></button>)}
        </div>
        {filtersOpen && <div id="queue-table-filters" className="queue-filters">
          <div className="queue-filter-row">
            <QueueSelect inline filter id="queue-filter-provider" label={q('professional')} value={provider} onValueChange={setProvider} emptyLabel={q('all')} options={(options?.providers || []).map(p => ({ value: String(p.id), label: p.name }))} />
            <QueueSelect inline filter id="queue-filter-room" label={q('room')} value={room} onValueChange={setRoom} emptyLabel={q('all')} options={(options?.rooms || []).map(r => ({ value: String(r.id), label: r.name }))} />
            <QueueSelect inline filter id="queue-filter-service" label={q('service')} value={service} onValueChange={setService} emptyLabel={q('all')} searchable options={(options?.services || []).map(s => ({ value: s.id, label: s.label }))} />
          </div>
          <details className="queue-more-filters" open={status !== '' || previousOnly || undefined}><summary>{q('moreFilters')}{(status || previousOnly) && <span className="ml-2">•</span>}</summary><div className="mt-3 grid items-center gap-3 sm:grid-cols-2"><QueueSelect inline id="queue-filter-status" label={q('status')} value={status} onValueChange={setStatus} emptyLabel={q('all')} options={Object.keys(allowedQueueActions).map(s => ({ value: s, label: q(s as QueueStatus) }))} />{!autoClear && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={previousOnly} onChange={e => setPreviousOnly(e.target.checked)} />{q('previousOnly')}</label>}</div></details>
        </div>}
        <div tabIndex={0} role="region" aria-label={q('queue')} className="dental-queue-list booking-settings-scrollbar overflow-auto overscroll-y-contain [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Table erpSortable sort={sort} onSortChange={setSort} manualSorting className="queue-reception-table"><TableHeader className="sticky top-0 z-10 bg-card"><TableRow>{(['ticket', 'patient', 'assignment', 'service', 'status'] as const).map(key => <TableHead sortType="text" key={key}>{q(key)}</TableHead>)}<TableHead sortable={false} className="text-right">{q('actions')}</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map(turn => <TableRow key={turn.id} data-turn-id={turn.id} className={turn.id === next?.id ? 'queue-next-row' : ''}>
              <TableCell><strong className="text-base tabular-nums">{turn.number}</strong><p className="queue-cell-secondary whitespace-nowrap">{data && `${turn.day === day ? `${q('today')} ` : ''}${queueDate(turn.issuedAt, data.display.timezone, locale, turn.day !== day)}`}</p>{turn.day !== day && <span className="queue-old-label"><Clock className="h-3.5 w-3.5" />{q('previousDayShort')}</span>}</TableCell>
              <TableCell><div className="flex min-w-0 items-center gap-3"><ContactAvatar contact={{ id: turn.contactId, name: turn.patientName, avatarUrl: turn.patientAvatarUrl }} size="sm" showRefreshButton={false} className="shrink-0" /><span className="break-words font-medium">{turn.patientName}</span></div>{turn.reason && <p className="mt-1 text-xs text-destructive">{turn.reason === 'appointment_deleted' ? q('reasonDeleted') : turn.reason === 'appointment_changed' ? q('reasonChanged') : q('reasonInactive')}</p>}</TableCell>
              <TableCell><span>{turn.providerName}</span><p className="queue-cell-secondary">{turn.chairName}</p></TableCell>
              <TableCell><span>{turn.serviceLabel}</span>{estimate(turn) && <p className="queue-cell-secondary">{estimate(turn)}</p>}</TableCell>
              <TableCell><QueueStatusSelect turn={turn} data={data} options={options} canManage={canManage} pending={pending} stale={stale} onChange={status => onStatusChange(turn, status)} /></TableCell>
              <TableCell className="text-right"><QueueRowActions turn={turn} canManage={canManage} pending={pending} stale={stale} today={day} onAction={action => { void onAction(turn, action).catch(() => {}); }} /></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {!rows.length && <p className="p-12 text-center text-muted-foreground">{loading ? q('loading') : turns.length ? q('noMatchingTurns') : q('empty')}</p>}
        </div>
        <div className="queue-table-pagination"><span>{q('showingTickets', { from: sorted.length ? (currentPage - 1) * pageSize + 1 : 0, to: Math.min(currentPage * pageSize, sorted.length), total: sorted.length })}</span><div className="flex items-center gap-2"><Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} aria-label={q('previousPage')} onClick={() => setPage(currentPage - 1)}><ChevronLeft className="h-4 w-4" /></Button><span className="queue-page-number" aria-label={q('displayPage', { page: currentPage, count: pageCount })}>{currentPage}</span><Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === pageCount} aria-label={q('nextPage')} onClick={() => setPage(currentPage + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>
        <p className="queue-timezone"><Clock className="h-4 w-4" />{q('clinicTimezone')}: {data?.display.timezone || '—'}</p>
      </section>
      <aside className="queue-station" aria-label={q('callStation')}>
        <h2>{q('callStation')}</h2><p className="text-sm text-muted-foreground">{q('stationDescription')}</p>
        <div className="queue-station-selects">
          <QueueSelect id="queue-station-provider" label={q('professional')} value={stationProvider} emptyLabel={q('select')} onValueChange={id => { setStationProvider(id); setStationRoom(''); }} options={(options?.providers || []).map(p => ({ value: String(p.id), label: p.name }))} />
          <QueueSelect id="queue-station-room" label={q('room')} value={stationRoom} emptyLabel={q('select')} disabled={!stationProfessional} onValueChange={setStationRoom} options={stationRooms.map(r => ({ value: String(r.id), label: r.name }))} />
        </div>
        <div className="queue-station-next"><h3>{busy ? q('activeTicket') : q('nextPatient')}</h3>
          {(next || busy) && !stale ? <div className="queue-next-card"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{(next || busy)!.number}</strong>{busy && <span className="queue-status">{q(busy.status)}</span>}</div><p className="mt-2 font-medium break-words">{(next || busy)!.patientName}</p><p className="mt-1 text-sm text-muted-foreground">{(next || busy)!.serviceLabel}</p>{next && estimate(next) && <p className="mt-2 text-sm text-muted-foreground">{estimate(next)}</p>}
            {busy && canManage && <div className="mt-3"><QueueRowActions turn={busy} canManage pending={pending} stale={stale} today={day} onAction={action => { void onAction(busy, action).catch(() => {}); }} /></div>}
          </div> : <div className="queue-next-card queue-station-empty"><AlertCircle className="h-6 w-6" /><p>{stationHint}</p></div>}
          {canManage && <Button className="mt-4 h-12 w-full" disabled={!next || pending || stale} onClick={() => onNext(Number(stationProvider), Number(stationRoom))}>{q('callNextPatient')}<ArrowRight className="ml-3 h-4 w-4" /></Button>}
          <p className="mt-2 text-center text-xs text-muted-foreground">{stationHint}</p>
        </div>
        {previous.length > 0 && <div className="queue-previous-warning"><div className="flex items-center gap-2 font-semibold"><AlertCircle className="h-5 w-5 shrink-0" />{q('previousTicketCount', { count: previous.length })}</div><p className="mt-2 text-sm text-muted-foreground">{q('reviewPreviousDescription')}</p><Button variant="link" className="h-auto px-0 py-2" onClick={reviewPrevious}>{q('reviewTickets')}<ArrowRight className="ml-2 h-4 w-4" /></Button>{canManage && <Button variant="outline" className="mt-2 w-full border-amber-500/60 text-amber-600 dark:text-amber-400" disabled={stale || pending} onClick={() => openResolution((stationPrevious[0] || previous[0]).id)}><AlertTriangle className="mr-2 h-4 w-4" />{q('resolveTicket')}</Button>}</div>}
      </aside>
    </div>
    <Dialog open={resolveId !== null} onOpenChange={open => { if (!open) setResolveId(null); }}><DialogContent><DialogHeader><DialogTitle>{q('resolveTicket')}</DialogTitle><DialogDescription>{q('resolveDescription')}</DialogDescription></DialogHeader>{resolution ? <div className="space-y-4"><div className="rounded-lg border p-4"><strong className="text-xl">{resolution.number}</strong><p>{resolution.patientName}</p><p className="text-sm text-muted-foreground">{resolution.providerName} · {resolution.chairName}</p><p className="text-sm text-muted-foreground">{data && queueDate(resolution.issuedAt, data.display.timezone, locale, true)}</p><p className="mt-2 text-sm">{q(resolution.status)}</p></div>{resolveError && <p role="alert" className="text-sm text-destructive">{resolveError}</p>}<div className="flex justify-end gap-2">{resolutionActions.map(action => <Button key={action} variant={action === 'cancel' ? 'destructive' : 'default'} disabled={pending || stale} onClick={async () => { try { await onAction(resolution, action); setResolveId(null); } catch (error) { setResolveError((error as Error).message); } }}>{q(action)}</Button>)}</div>{!resolutionActions.length && <p>{q('ticketResolved')}</p>}</div> : <p>{q('ticketResolved')}</p>}</DialogContent></Dialog>
  </div>;
}

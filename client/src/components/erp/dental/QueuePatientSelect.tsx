import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, UserRound } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { QUEUE_API } from './queue-api';
import { useQueueText } from './queue-text';

type Patient = { contactId: number; name: string };

export function QueuePatientSelect({ value, name, excluded, onSelect }: {
  value: string; name: string; excluded: Set<number>; onSelect: (patient: Patient) => void;
}) {
  const { q } = useQueueText();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const patients = useQuery<Patient[]>({
    queryKey: [QUEUE_API, 'patients', debouncedSearch], enabled: open,
    queryFn: async () => (await (await apiRequest('GET', `/api/erp/dental/schedule/patient-options?limit=50&search=${encodeURIComponent(debouncedSearch)}`)).json()).data,
  });
  const loading = search.trim() !== debouncedSearch || patients.isFetching;
  const results = (patients.data || []).filter(patient => !excluded.has(patient.contactId));
  return <div className="space-y-1.5">
    <Label htmlFor="queue-patient-picker">{q('patient')}</Label>
    <Popover open={open} onOpenChange={next => { setOpen(next); if (next) { setSearch(''); setDebouncedSearch(''); } }}>
      <PopoverTrigger asChild>
        <Button data-tour="components-erp-dental-queuepatientselect.button.queue-patient-picker" ref={trigger} id="queue-patient-picker" type="button" variant="outline" role="combobox" aria-expanded={open} className="h-10 w-full justify-between gap-2 font-normal">
          <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={`min-w-0 flex-1 truncate text-left ${value ? '' : 'text-muted-foreground'}`}>{value ? name : q('searchPatient')}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} onEscapeKeyDown={event => event.stopPropagation()} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }} className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0">
        <Command shouldFilter={false}>
          <CommandInput aria-label={q('patientSearchHint')} placeholder={q('patientSearchHint')} value={search} onValueChange={setSearch} />
          <CommandList className="max-h-[min(16rem,40dvh,var(--radix-popover-content-available-height))]">
            {loading ? <div role="status" className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />{q('loading')}</div>
              : patients.isError ? <div role="alert" className="space-y-2 p-4 text-sm"><p>{q('error')}</p><Button type="button" variant="outline" size="sm" onClick={() => void patients.refetch()}>{q('retry')}</Button></div>
              : !results.length ? <p role="status" className="p-4 text-center text-sm text-muted-foreground">{q('noMatchingPatients')}</p>
              : results.map(patient => <CommandItem key={patient.contactId} value={String(patient.contactId)} className="min-h-10 px-3 py-2" onSelect={() => { onSelect(patient); setOpen(false); }}>
                <UserRound className="text-muted-foreground" aria-hidden="true" /><span className="min-w-0 flex-1 break-words">{patient.name}</span>
                {value === String(patient.contactId) && <Check className="text-primary" aria-hidden="true" />}
              </CommandItem>)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
}

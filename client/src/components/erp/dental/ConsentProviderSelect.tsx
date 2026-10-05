import { useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { ConsentProvider } from '@shared/dental-consent';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export function ConsentProviderSelect({ providers, value, onChange }: {
  providers: ConsentProvider[]; value: string; onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = providers.find(provider => String(provider.id) === value);
  const choose = (next: string) => { onChange(next); setOpen(false); setSearch(''); };
  const searchable = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const matches = providers.filter(provider => searchable(provider.name).includes(searchable(search.trim())));
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch(''); }}>
    <PopoverTrigger asChild><Button data-tour="components-erp-dental-consentproviderselect.button.consent-professionalName" ref={trigger} id="consent-professionalName" type="button" variant="outline" role="combobox" aria-expanded={open} aria-required="true" aria-label={t('erp.dental.consent.professionalName')} className="h-10 w-full justify-between gap-2 font-normal">
      <span className="min-w-0 truncate">{value === 'manual' ? t('erp.dental.consent.manualProfessional') : selected?.name || t('erp.dental.consent.selectProfessional')}</span><ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 opacity-50" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" onEscapeKeyDown={event => event.stopPropagation()} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
      <Command shouldFilter={false}>
        <CommandInput value={search} onValueChange={setSearch} aria-label={t('erp.dental.consent.searchProfessional')} placeholder={t('erp.dental.consent.searchProfessional')} />
        <CommandList className="max-h-[min(16rem,40dvh,var(--radix-popover-content-available-height))]">
          {matches.map(provider => <CommandItem key={provider.id} value={String(provider.id)} onSelect={() => choose(String(provider.id))} className="min-h-10 gap-2">
            <span className="min-w-0 flex-1 break-words">{provider.name}{providers.some(other => other.id !== provider.id && other.name === provider.name) && <span className="ml-2 text-xs text-muted-foreground">#{provider.id}</span>}</span>{value === String(provider.id) && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}
          </CommandItem>)}
          {!matches.length && <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{t('erp.dental.consent.noMatchingProviders')}</p>}
          <CommandItem value="manual" onSelect={() => choose('manual')} className="min-h-10 gap-2 border-t"><span className="flex-1">{t('erp.dental.consent.manualProfessional')}</span>{value === 'manual' && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}</CommandItem>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}

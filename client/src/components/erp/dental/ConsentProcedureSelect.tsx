import { useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import type { ConsentLanguage, ConsentTemplate } from '@shared/dental-consent';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

export function ConsentProcedureSelect({ templates, language, value, onChange }: {
  templates: ConsentTemplate[]; language: ConsentLanguage; value: string; onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const trigger = useRef<HTMLButtonElement>(null);
  const searchable = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  const activeTemplates = templates.filter(template => template.isActive);
  const selected = activeTemplates.find(template => template.key === value);
  const matches = activeTemplates.filter(template => searchable(template.translations[language].title).includes(searchable(search.trim())));
  return <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch(''); }}>
    <PopoverTrigger asChild><Button data-tour="components-erp-dental-consentprocedureselect.button.consent-procedure" ref={trigger} id="consent-procedure" type="button" variant="outline" role="combobox" aria-expanded={open} aria-required="true" aria-label={t('erp.dental.consent.procedure')} className="h-10 w-full justify-between gap-2 font-normal">
      <span className="min-w-0 truncate text-left">{selected?.translations[language].title || t('erp.dental.consent.selectProcedure')}</span><ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 opacity-50" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0" onEscapeKeyDown={event => event.stopPropagation()} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus(); }}>
      <Command shouldFilter={false}>
        <CommandInput value={search} onValueChange={setSearch} aria-label={t('erp.dental.consent.searchProcedure')} placeholder={t('erp.dental.consent.searchProcedure')} />
        <CommandList className="max-h-[min(16rem,40dvh,var(--radix-popover-content-available-height))]">
          {matches.map(template => <CommandItem key={template.key} value={template.key} onSelect={() => { onChange(template.key); setOpen(false); setSearch(''); }} className="min-h-10 gap-2">
            <span className="min-w-0 flex-1 break-words">{template.translations[language].title}</span>{value === template.key && <Check aria-hidden="true" className="h-4 w-4 text-primary" />}
          </CommandItem>)}
          {!matches.length && <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{t('erp.dental.consent.noMatchingProcedures')}</p>}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}

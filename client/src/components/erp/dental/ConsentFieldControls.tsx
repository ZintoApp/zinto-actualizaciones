import { useRef, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandItem, CommandList, CommandGroup, CommandEmpty } from '@/components/ui/command';
import { CONSENT_PLACEHOLDERS } from '@shared/dental-consent';
import { customConsentToken, type ConsentCustomField } from '@shared/dental-consent-custom-fields';

export function ConsentFieldControls({ fields, selected = [], onFieldsChange, onInsert, disabled }: {
  fields: ConsentCustomField[]; selected?: number[]; onFieldsChange?: (ids: number[]) => void; onInsert?: (token: string) => void; disabled?: boolean;
}) {
  const { t } = useTranslation(); const [open, setOpen] = useState(false); const trigger = useRef<HTMLButtonElement>(null);
  const name = t(onInsert ? 'erp.dental.consent.insertPlaceholder' : 'erp.dental.consent.fields.select');
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button ref={trigger} type="button" role="combobox" aria-expanded={open} aria-label={name} variant="outline" disabled={disabled} className={`h-8 max-w-full justify-between gap-2 px-2 text-xs ${onInsert ? '' : 'w-full'}`}><span className="truncate">{name}{!onInsert && selected.length ? ` (${selected.length})` : ''}</span><ChevronsUpDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /></Button></PopoverTrigger>
    <PopoverContent align="start" className="w-72 max-w-[calc(100vw-2rem)] p-0" onEscapeKeyDown={event => event.stopPropagation()} onCloseAutoFocus={event => { event.preventDefault(); if (!onInsert) trigger.current?.focus(); }}>
      <Command><CommandInput placeholder={t('erp.dental.consent.fields.search')} aria-label={t('erp.dental.consent.fields.search')} /><CommandList><CommandEmpty>{t('erp.dental.consent.fields.empty')}</CommandEmpty>
        {onInsert && <CommandGroup heading={t('erp.dental.consent.fields.standard')}>{CONSENT_PLACEHOLDERS.map(token => <CommandItem key={token} value={t(`erp.dental.consent.placeholder.${token}`)} onSelect={() => { onInsert(token); setOpen(false); }}>{t(`erp.dental.consent.placeholder.${token}`)}</CommandItem>)}</CommandGroup>}
        <CommandGroup heading={t('erp.dental.consent.fields.title')}>{fields.map(field => <CommandItem key={field.id} aria-checked={onInsert ? undefined : selected.includes(field.id)} value={`${field.fieldLabel} ${field.fieldName} ${field.id}`} onSelect={() => { if (onInsert) { onInsert(customConsentToken(field.id)); setOpen(false); } else onFieldsChange?.(selected.includes(field.id) ? selected.filter(id => id !== field.id) : [...selected, field.id]); }}>
          {!onInsert && <Check aria-hidden="true" className={`mr-1 h-4 w-4 ${selected.includes(field.id) ? '' : 'opacity-0'}`} />}<span className="break-words">{field.fieldLabel}</span>
        </CommandItem>)}</CommandGroup>
      </CommandList></Command>
    </PopoverContent>
    {!onInsert && selected.some(id => !fields.some(field => field.id === id)) && <Button data-tour="components-erp-dental-consentfieldcontrols.button.erp.dental.consent.fields.removeUnavailable" variant="ghost" size="sm" className="h-auto whitespace-normal text-xs text-destructive" disabled={disabled} onClick={() => onFieldsChange?.(selected.filter(id => fields.some(field => field.id === id)))}>{t('erp.dental.consent.fields.removeUnavailable')}</Button>}
  </Popover>;
}

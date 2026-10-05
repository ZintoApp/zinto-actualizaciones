import { useId, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import { SearchableSelect } from '@/components/ui/searchable-select';

export function EditorField({ label, value, onChange, multiline = false, type = 'text' }: {
  label: string; value: string; onChange: (value: string) => void; multiline?: boolean; type?: string;
}) {
  const id = useId();
  return <div className="tour-field"><Label htmlFor={id}>{label}</Label>{multiline
    ? <Textarea id={id} dir="auto" value={value} onChange={event => onChange(event.target.value)} />
    : <Input id={id} dir="auto" type={type} value={value} onChange={event => onChange(event.target.value)} />}</div>;
}

export function EditorChoice({ label, value, options, onChange, searchable = false }: {
  label: string; value: string; options: { value: string; label: string }[];
  onChange: (value: string) => void; searchable?: boolean;
}) {
  const id = useId();
  const { t, currentLanguage } = useTranslation();
  const [open, setOpen] = useState(false);
  if (searchable) return <div className="tour-field"><Label htmlFor={id}>{label}</Label>
    <SearchableSelect id={id} label={label} value={value} options={options} onChange={onChange} searchPlaceholder={t('guided_tours.search_options', 'Search options…')} />
  </div>;
  return <div className="tour-field"><Label htmlFor={id}>{label}</Label><Select open={open} onOpenChange={setOpen} dir={currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr'} value={value} onValueChange={onChange}>
    <SelectTrigger id={id} aria-label={label}><SelectValue>{options.find(option => option.value === value)?.label}</SelectValue></SelectTrigger>
    {open && <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw_-_24px)]">
      {options.map(option => <SelectItem key={option.value} value={option.value} className="whitespace-normal [overflow-wrap:anywhere]">{option.label}</SelectItem>)}
    </SelectContent>}
  </Select></div>;
}

export function EditorCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return <div className="tour-check"><Checkbox id={id} checked={checked} onCheckedChange={value => onChange(value === true)} /><Label htmlFor={id}>{label}</Label></div>;
}

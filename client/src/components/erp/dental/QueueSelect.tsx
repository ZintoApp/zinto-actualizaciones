import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';

/** Keep queue values unchanged while using the same dropdowns as Schedule. */
export function QueueSelect({ id, label, value, onValueChange, options, emptyLabel, disabled, filter = false, searchable = false, inline = false }: {
  id: string; label: string; value: string; onValueChange: (value: string) => void;
  options: { value: string; label: string }[]; emptyLabel?: string;
  disabled?: boolean; filter?: boolean; searchable?: boolean;
  inline?: boolean;
}) {
  const { t } = useTranslation();
  // Prefix real IDs so service keys cannot collide with the empty/All choice.
  const encode = (value: string) => `item:${value}`;
  return <div className={`min-w-0 ${filter ? 'space-y-2' : 'space-y-1'}`}>
    <Label htmlFor={id} className={inline ? 'sr-only' : undefined}>{label}</Label>
    <Select value={value ? encode(value) : 'empty'} disabled={disabled}
      onValueChange={selected => onValueChange(selected === 'empty' ? '' : selected.slice(5))}>
      <SelectTrigger id={id} className={filter ? 'h-11 w-full' : 'h-10 w-full'}>{inline ? <span className="flex min-w-0 flex-1 items-center gap-2 text-left"><span className="shrink-0 text-xs text-muted-foreground" aria-hidden="true">{label}:</span><SelectValue placeholder={emptyLabel} /></span> : <SelectValue placeholder={emptyLabel} />}</SelectTrigger>
      <SelectContent searchable={searchable} searchPlaceholder={t('common.search', 'Search...')} className="max-w-[calc(100vw-2rem)]">
        {emptyLabel !== undefined && <SelectItem value="empty">{emptyLabel}</SelectItem>}
        {options.map(option => <SelectItem key={option.value} value={encode(option.value)}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

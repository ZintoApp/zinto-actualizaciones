import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';

export type ErpFieldDefinition = {
  id: number; name: string; fieldKey: string;
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  options: string[] | null; isRequired: boolean; isActive: boolean;
  defaultValue?: string | null;
};

/** Shared controls extracted from the Catalog product editor. */
export function ErpCustomFieldsEditor({ definitions, values, onChange, disabled, idPrefix = 'erp-cf' }: {
  definitions: ErpFieldDefinition[]; values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void; disabled?: boolean; idPrefix?: string;
}) {
  const { t } = useTranslation();
  return <div className="grid gap-4 sm:grid-cols-2">
    {definitions.filter(field => field.isActive).map(field => {
      const id = `${idPrefix}-${field.fieldKey}`;
      const current = values[field.fieldKey];
      const setValue = (value: unknown) => onChange({ ...values, [field.fieldKey]: value });
      if (field.fieldType === 'checkbox') return <div key={id} className="flex items-center gap-2">
        <Checkbox id={id} disabled={disabled} checked={current === true || current === 'true'} onCheckedChange={value => setValue(value === true)} />
        <Label htmlFor={id}>{field.name}{field.isRequired && <span className="text-destructive"> *</span>}</Label>
      </div>;
      return <div key={id} className={`space-y-2 ${field.fieldType === 'textarea' ? 'sm:col-span-2' : ''}`}>
        <Label htmlFor={id}>{field.name}{field.isRequired && <span className="text-destructive"> *</span>}</Label>
        {field.fieldType === 'select' ? <Select disabled={disabled} value={String(current ?? '') || '__empty__'} onValueChange={value => setValue(value === '__empty__' ? '' : value)}>
          <SelectTrigger id={id}><SelectValue placeholder={t('erp.common.none', 'None')} /></SelectTrigger>
          <SelectContent searchable><SelectItem value="__empty__">{t('erp.common.none', 'None')}</SelectItem>
            {(field.options ?? []).map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
          </SelectContent>
        </Select> : field.fieldType === 'textarea' ? <Textarea id={id} disabled={disabled} value={String(current ?? '')} onChange={event => setValue(event.target.value)} />
          : <Input id={id} disabled={disabled} type={field.fieldType === 'number' || field.fieldType === 'date' ? field.fieldType : 'text'} value={String(current ?? '')} onChange={event => setValue(event.target.value)} />}
      </div>;
    })}
  </div>;
}

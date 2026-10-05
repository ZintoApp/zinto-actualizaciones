import { AlertTriangle } from 'lucide-react';
import type { ContactCustomFieldDefinition } from '@shared/contact-custom-fields';
import { isEmptyContactCustomFieldValue } from '@shared/contact-custom-fields';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomFieldFileSelect } from './CustomFieldFileSelect';
import { isCustomFieldFileReference } from '@shared/contact-custom-fields';
import { useTranslation } from '@/hooks/use-translation';

type Props = {
  definitions: ContactCustomFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  disabled?: boolean;
  showMissingRequired?: boolean;
  ownerType?: 'contact' | 'deal';
  ownerId?: number | null;
  pendingFiles?: Record<string, File | null>;
  onPendingFilesChange?: (files: Record<string, File | null>) => void;
};

export function ContactCustomFieldsEditor({
  definitions,
  values,
  onChange,
  disabled = false,
  showMissingRequired = true,
  ownerType = 'contact',
  ownerId,
  pendingFiles = {},
  onPendingFilesChange,
}: Props) {
  const { t } = useTranslation();
  const setValue = (fieldName: string, value: unknown) => {
    onChange({ ...values, [fieldName]: value });
  };

  if (definitions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('custom_fields.editor.none_configured', 'No contact custom fields configured.')}</p>;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {definitions.map((field) => {
        const value = values[field.fieldName];
        const missing = Boolean(field.required && isEmptyContactCustomFieldValue(value));
        const options = Array.isArray(field.options) ? field.options : [];
        return (
          <div key={field.fieldName} className={field.fieldType === 'multi_select' || field.fieldType === 'file_select' ? 'sm:col-span-2' : ''}>
            <Label className="flex items-center gap-1">
              {field.fieldLabel}
              {field.required ? <span className="text-destructive" aria-hidden="true">*</span> : null}
            </Label>

            {field.fieldType === 'file_select' ? (
              <div className="mt-1">
                <CustomFieldFileSelect
                  ownerType={ownerType}
                  ownerId={ownerId}
                  value={isCustomFieldFileReference(value) ? value : undefined}
                  pendingFile={pendingFiles[field.fieldName]}
                  onChange={(next) => setValue(field.fieldName, next)}
                  onPendingFileChange={(file) => onPendingFilesChange?.({ ...pendingFiles, [field.fieldName]: file })}
                  disabled={disabled}
                />
              </div>
            ) : field.fieldType === 'select' ? (
              <Select
                value={typeof value === 'string' && value ? value : '__empty__'}
                onValueChange={(next) => setValue(field.fieldName, next === '__empty__' ? '' : next)}
                disabled={disabled}
              >
                <SelectTrigger data-tour="components-contacts-contactcustomfieldseditor.selecttrigger.custom_fields.editor.select_placeholder" className="mt-1"><SelectValue placeholder={t('custom_fields.editor.select_placeholder', 'Select…')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">{t('custom_fields.editor.not_specified', 'Not specified')}</SelectItem>
                  {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : field.fieldType === 'multi_select' ? (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 rounded-md border p-3">
                {options.map((option) => {
                  const selected = Array.isArray(value) && value.includes(option.value);
                  return (
                    <Label key={option.value} className="flex cursor-pointer items-center gap-2 font-normal">
                      <Checkbox
                        checked={selected}
                        disabled={disabled}
                        onCheckedChange={(checked) => {
                          const current = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
                          setValue(field.fieldName, checked
                            ? [...new Set([...current, option.value])]
                            : current.filter((item) => item !== option.value));
                        }}
                      />
                      {option.label}
                    </Label>
                  );
                })}
              </div>
            ) : field.fieldType === 'boolean' ? (
              <Select
                value={typeof value === 'boolean' ? String(value) : '__empty__'}
                onValueChange={(next) => setValue(field.fieldName, next === '__empty__' ? undefined : next === 'true')}
                disabled={disabled}
              >
                <SelectTrigger data-tour="components-contacts-contactcustomfieldseditor.selecttrigger.custom_fields.editor.select_placeholder" className="mt-1"><SelectValue placeholder={t('custom_fields.editor.select_placeholder', 'Select…')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__empty__">{t('custom_fields.editor.not_specified', 'Not specified')}</SelectItem>
                  <SelectItem value="true">
                    {(!Array.isArray(field.options) && field.options?.trueLabel) || t('common.yes', 'Yes')}
                  </SelectItem>
                  <SelectItem value="false">
                    {(!Array.isArray(field.options) && field.options?.falseLabel) || t('common.no', 'No')}
                  </SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input
                className="mt-1"
                type={field.fieldType === 'number' ? 'number' : field.fieldType === 'date' ? 'date' : 'text'}
                value={typeof value === 'string' || typeof value === 'number' ? value : ''}
                disabled={disabled}
                onChange={(event) => setValue(field.fieldName, event.target.value)}
              />
            )}

            {showMissingRequired && missing ? (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" /> {t('custom_fields.editor.required_incomplete', 'Required field is incomplete')}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

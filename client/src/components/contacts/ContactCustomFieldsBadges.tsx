import { Badge } from '@/components/ui/badge';
import { File } from 'lucide-react';
import { isCustomFieldFileReference } from '@shared/contact-custom-fields';

/** Helper to convert fieldName to label (e.g. "lead_source" -> "Lead Source") */
function fieldNameToLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type SchemaField = {
  fieldName: string;
  fieldLabel: string;
  fieldType?: string;
  options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } | null;
};

export function ContactCustomFieldsBadges({
  customFields,
  schema,
  maxVisible = 5,
  showFileName = true,
  fileClassName = '',
  className = '',
}: {
  customFields?: Record<string, any> | null;
  schema?: SchemaField[];
  maxVisible?: number;
  showFileName?: boolean;
  fileClassName?: string;
  className?: string;
}) {
  if (!customFields || typeof customFields !== 'object' || Object.keys(customFields).length === 0) {
    return null;
  }

  const items: { label: string; value: string; url?: string }[] = [];

  for (const [key, val] of Object.entries(customFields)) {
    if (val === undefined || val === null || val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;

    const schemaField = schema?.find((f) => f.fieldName === key);
    // Only active definitions belong in schema-aware displays. Unknown stored
    // keys are preserved for compatibility, but must not surface as fields.
    if (schema && !schemaField) continue;
    const fieldLabel = schemaField?.fieldLabel || fieldNameToLabel(key);
    if (schemaField?.fieldType === 'file_select') {
      if (isCustomFieldFileReference(val)) {
        items.push({ label: fieldLabel, value: val.name, url: val.url });
      }
      continue;
    }
    const boolOpts = schemaField?.fieldType === 'boolean' && schemaField?.options && !Array.isArray(schemaField.options)
      ? (schemaField.options as { trueLabel?: string; falseLabel?: string })
      : null;
    const selectOptions = schemaField?.options && Array.isArray(schemaField.options)
      ? schemaField.options
      : [];
    const formatValue = (value: unknown) => {
      if (schemaField?.fieldType === 'select' || schemaField?.fieldType === 'multi_select') {
        return selectOptions.find((option) => String(option.value) === String(value))?.label ?? String(value);
      }
      return String(value);
    };
    const displayVal = Array.isArray(val)
      ? val.map(formatValue).join(', ')
      : typeof val === 'boolean'
      ? val
        ? (boolOpts?.trueLabel ?? 'Yes')
        : (boolOpts?.falseLabel ?? 'No')
      : formatValue(val);
    if (Array.isArray(val)) {
      val.forEach((v) => items.push({ label: fieldLabel, value: formatValue(v) }));
    } else {
      items.push({ label: fieldLabel, value: displayVal });
    }
  }

  if (items.length === 0) return null;

  const visible = items.slice(0, maxVisible);
  const remaining = items.length - maxVisible;

  return (
    <div className={`flex min-w-0 max-w-full flex-wrap gap-1 ${className}`}>
      {visible.map((item, idx) => {
        const displayText = item.url && !showFileName
          ? item.label
          : item.label ? `${item.label}: ${item.value}` : item.value;
        return (
          <Badge
            key={`${item.label}-${item.value}-${idx}`}
            variant="secondary"
            className={`min-w-0 max-w-full overflow-hidden text-xs px-1.5 py-0.5 !bg-muted !text-muted-foreground ${item.url ? fileClassName : ''}`}
            title={displayText}
          >
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" className="flex min-w-0 max-w-full items-center gap-1 hover:underline">
                <File className="h-3 w-3 shrink-0" />
                <span className="truncate">{displayText}</span>
              </a>
            ) : displayText}
          </Badge>
        );
      })}
      {remaining > 0 && (
        <Badge variant="outline" className="text-xs px-1.5 py-0.5 shrink-0">
          +{remaining}
        </Badge>
      )}
    </div>
  );
}

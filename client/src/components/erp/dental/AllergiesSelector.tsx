import { useRef } from 'react';
import { CheckCircle2, Circle, Stethoscope } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const NKDA_LABEL = 'None known (NKDA)';

const GRID_ALLERGY_VALUES = [
  'Penicillin',
  'Latex',
  'Aspirin',
  'Ibuprofen/NSAIDs',
  'Clindamycin',
  'Cephalosporins',
  'Sulfa drugs',
  'Lidocaine',
  NKDA_LABEL,
] as const;

type GridAllergyValue = (typeof GRID_ALLERGY_VALUES)[number];

type AllergyOption = {
  value: GridAllergyValue | 'other';
  labelKey: string;
  fallback: string;
  dashed?: boolean;
};

const ALLERGY_OPTIONS: AllergyOption[] = [
  { value: 'Penicillin', labelKey: 'erp.dental.patients.allergies.penicillin', fallback: 'Penicillin' },
  { value: 'Latex', labelKey: 'erp.dental.patients.allergies.latex', fallback: 'Latex' },
  { value: 'Aspirin', labelKey: 'erp.dental.patients.allergies.aspirin', fallback: 'Aspirin' },
  {
    value: 'Ibuprofen/NSAIDs',
    labelKey: 'erp.dental.patients.allergies.ibuprofenNsaid',
    fallback: 'Ibuprofen / NSAIDs',
  },
  { value: 'Clindamycin', labelKey: 'erp.dental.patients.allergies.clindamycin', fallback: 'Clindamycin' },
  {
    value: 'Cephalosporins',
    labelKey: 'erp.dental.patients.allergies.cephalosporins',
    fallback: 'Cephalosporins',
  },
  { value: 'Sulfa drugs', labelKey: 'erp.dental.patients.allergies.sulfaDrugs', fallback: 'Sulfa drugs' },
  { value: 'Lidocaine', labelKey: 'erp.dental.patients.allergies.lidocaine', fallback: 'Lidocaine' },
  { value: 'other', labelKey: 'erp.dental.patients.allergies.other', fallback: 'Other' },
  {
    value: NKDA_LABEL,
    labelKey: 'erp.dental.patients.allergies.noneKnown',
    fallback: 'None known',
    dashed: true,
  },
];

function normalizeAllergiesValue(value: string | null | undefined): string {
  if (value == null) return '';
  const trimmed = value.trim();
  if (!trimmed || trimmed === '[]' || trimmed === '{}' || trimmed.toLowerCase() === 'null') {
    return '';
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => (typeof item === 'string' ? item.trim() : String(item).trim()))
          .filter(Boolean)
          .join(', ');
      }
    } catch {
      // fall through to raw text
    }
  }

  return trimmed;
}

function parseAllergyParts(value: string): string[] {
  const normalized = normalizeAllergiesValue(value);
  if (!normalized) return [];
  return normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== '[]');
}

function serializeAllergyParts(parts: string[]): string {
  return parts.join(', ');
}

function isNkdaValue(part: string): boolean {
  const lower = part.toLowerCase();
  return lower === NKDA_LABEL.toLowerCase() || lower === 'none known';
}

function isGridAllergyValue(part: string): part is GridAllergyValue {
  return GRID_ALLERGY_VALUES.some((value) => value.toLowerCase() === part.toLowerCase());
}

function allergyPartsInclude(parts: string[], label: string): boolean {
  const target = label.toLowerCase();
  return parts.some((part) => part.toLowerCase() === target);
}

function splitAllergyValue(value: string): { gridParts: string[]; otherParts: string[] } {
  const parts = parseAllergyParts(value);
  const gridParts: string[] = [];
  const otherParts: string[] = [];

  for (const part of parts) {
    if (isGridAllergyValue(part) || isNkdaValue(part)) {
      const canonical = isNkdaValue(part)
        ? NKDA_LABEL
        : GRID_ALLERGY_VALUES.find((item) => item.toLowerCase() === part.toLowerCase())!;
      if (!gridParts.some((existing) => existing.toLowerCase() === canonical.toLowerCase())) {
        gridParts.push(canonical);
      }
    } else {
      otherParts.push(part);
    }
  }

  return { gridParts, otherParts };
}

function composeAllergyValue(gridParts: string[], otherParts: string[]): string {
  return serializeAllergyParts([...gridParts, ...otherParts]);
}

function toggleGridAllergy(gridParts: string[], label: GridAllergyValue): string[] {
  const active = allergyPartsInclude(gridParts, label);

  if (label === NKDA_LABEL) {
    return active ? [] : [NKDA_LABEL];
  }

  if (allergyPartsInclude(gridParts, NKDA_LABEL)) {
    return gridParts;
  }

  if (active) {
    return gridParts.filter((part) => part.toLowerCase() !== label.toLowerCase());
  }

  return [...gridParts, label];
}

type AllergiesSelectorProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  t: (key: string, fallback: string) => string;
};

export function AllergiesSelector({ value, onChange, disabled = false, t }: AllergiesSelectorProps) {
  const otherInputRef = useRef<HTMLInputElement>(null);
  const { gridParts, otherParts } = splitAllergyValue(value);
  const otherText = serializeAllergyParts(otherParts);
  const nkdaOn = allergyPartsInclude(gridParts, NKDA_LABEL);

  const updateValue = (nextGridParts: string[], nextOtherParts: string[]) => {
    onChange(composeAllergyValue(nextGridParts, nextOtherParts));
  };

  return (
    <div className="space-y-1.5">
      <div className="rounded-lg border border-border/60 bg-muted/10 p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 shrink-0 text-foreground" strokeWidth={1.75} />
          <span className="text-sm font-semibold">{t('erp.dental.patients.fields.allergies', 'Allergies')}</span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {ALLERGY_OPTIONS.map((option) => {
            if (option.value === 'other') {
              const active = otherParts.length > 0;
              return (
                <button
                  key="other"
                  type="button"
                  disabled={disabled || nkdaOn}
                  onClick={() => otherInputRef.current?.focus()}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                    active
                      ? 'border-emerald-600/50 bg-emerald-600/25 text-foreground'
                      : 'border-border/80 bg-background/50 text-muted-foreground hover:bg-muted/40',
                    (disabled || nkdaOn) && 'cursor-not-allowed opacity-50',
                  )}
                >
                  {active ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" strokeWidth={1.75} />
                  )}
                  <span className="truncate">{t(option.labelKey, option.fallback)}</span>
                </button>
              );
            }

            const gridValue = option.value;
            const active = allergyPartsInclude(gridParts, gridValue);
            const blocked = nkdaOn && gridValue !== NKDA_LABEL;

            return (
              <button
                key={gridValue}
                type="button"
                disabled={disabled || blocked}
                onClick={() => updateValue(toggleGridAllergy(gridParts, gridValue), otherParts)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'border-emerald-600/50 bg-emerald-600/25 text-foreground'
                    : 'border-border/80 bg-background/50 text-muted-foreground hover:bg-muted/40',
                  option.dashed && !active && 'border-dashed',
                  (disabled || blocked) && 'cursor-not-allowed opacity-50',
                )}
              >
                {active ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" strokeWidth={1.75} />
                )}
                <span className="truncate">{t(option.labelKey, option.fallback)}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <Label className="shrink-0 text-sm font-normal text-muted-foreground sm:w-40">
            {t('erp.dental.patients.fields.otherAllergies', 'Other allergies (if any)')}
          </Label>
          <Input data-tour="components-erp-dental-allergiesselector.input.erp.dental.patients.fields.otherAllergiesPlaceholder"
            ref={otherInputRef}
            value={otherText}
            disabled={disabled || nkdaOn}
            onChange={(e) => updateValue(gridParts, parseAllergyParts(e.target.value))}
            placeholder={t('erp.dental.patients.fields.otherAllergiesPlaceholder', 'Type here…')}
            className="bg-background/50"
          />
        </div>
      </div>
    </div>
  );
}

export function parseAllergyPartsForAlerts(value: string | null | undefined): string[] {
  if (!value) return [];
  return parseAllergyParts(value).filter((part) => !isNkdaValue(part));
}

export function normalizeAllergiesField(value: string | null | undefined): string {
  return normalizeAllergiesValue(value);
}

export function isNkdaActive(allergies: string): boolean {
  return parseAllergyParts(allergies).some(isNkdaValue);
}

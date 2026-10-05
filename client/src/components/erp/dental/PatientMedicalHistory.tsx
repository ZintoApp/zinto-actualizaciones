import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Baby, CalendarDays, ChevronDown, Cigarette, ClipboardPlus, Droplets, FileText, Gauge, Heart, HeartPulse, Hospital, NotebookPen, Pencil, Plus, Ruler, Save, ShieldCheck, Thermometer, Trash2, Weight, Wind, X } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  DENTAL_CONDITION_KEYS,
  DENTAL_CONDITION_STATUSES,
  DENTAL_INFECTIOUS_TEST_STATUSES,
  DENTAL_INFECTIOUS_TEST_TYPES,
  DENTAL_PREGNANCY_STATUSES,
  DENTAL_SMOKING_STATUSES,
  classifyAdultBloodPressure,
  type DentalConditionKey,
  type DentalConditionStatus,
  type DentalInfectiousTestStatus,
  type DentalInfectiousTestType,
  type DentalMedicalHistoryDetails,
  type DentalPregnancyStatus,
  type DentalSmokingStatus,
} from '@shared/dental-medical-history';

export type DentalPatientVitalRecord = {
  id: number;
  systolic: number;
  diastolic: number;
  pulse: number | null;
  temperatureCelsius: number | null;
  respiratoryRate: number | null;
  oxygenSaturation: number | null;
  weightKg: number | null;
  heightCm: number | null;
  painScore: number | null;
  recordedAt: string;
  notes: string | null;
};

export type DentalPatientInfectiousTestRecord = {
  id: number;
  testType: DentalInfectiousTestType;
  status: DentalInfectiousTestStatus;
  testDate: string | null;
  notes: string | null;
  createdAt: string;
};

type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

export function useDentalMedicalRecords(contactId: number, enabled: boolean) {
  const vitalsQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'vitals'],
    enabled,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/vitals`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to load vital signs');
      const records = (json.data as DentalPatientVitalRecord[]).slice().sort((left, right) => {
        const recordedAtDifference = Date.parse(right.recordedAt) - Date.parse(left.recordedAt);
        return recordedAtDifference || right.id - left.id;
      });
      return { records, timezone: typeof json.timezone === 'string' ? json.timezone : 'UTC' };
    },
  });
  const testsQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'infectious-tests'],
    enabled,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/infectious-tests`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to load screening records');
      return json.data as DentalPatientInfectiousTestRecord[];
    },
  });
  return { vitalsQuery, testsQuery };
}

const conditionFallbacks: Record<DentalConditionKey, string> = {
  diabetes: 'Diabetes',
  hypertension: 'Hypertension',
  heartDisease: 'Heart disease',
  bleedingDisorder: 'Bleeding disorder',
  pregnancy: 'Pregnancy',
  majorSurgeryHospitalization: 'Major surgery / hospitalization',
};

const conditionIcons: Record<DentalConditionKey, typeof Activity> = {
  diabetes: Droplets,
  hypertension: HeartPulse,
  heartDisease: Heart,
  bleedingDisorder: Droplets,
  pregnancy: Baby,
  majorSurgeryHospitalization: Hospital,
};

const recordActionButtonClass = 'h-10 min-w-24 gap-2 px-4';

const testFallbacks: Record<DentalInfectiousTestType, string> = {
  hiv: 'HIV',
  hepatitis_b: 'Hepatitis B',
  hepatitis_c: 'Hepatitis C',
};

function localDateTimeValue(value = new Date()): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function emptyVitalForm(recordedAt = localDateTimeValue()) {
  return {
    systolic: '',
    diastolic: '',
    pulse: '',
    temperatureCelsius: '',
    respiratoryRate: '',
    oxygenSaturation: '',
    weightKg: '',
    heightCm: '',
    painScore: '',
    recordedAt,
    notes: '',
  };
}

type VitalForm = ReturnType<typeof emptyVitalForm>;
type VitalFormErrors = Partial<Record<keyof VitalForm, string>>;

function validateVitalForm(form: VitalForm, t: Translate): VitalFormErrors {
  const errors: VitalFormErrors = {};
  const rangeMessage = (min: number, max: number) => t(
    'erp.dental.patients.medical.validation.range',
    'Enter a value from {{min}} to {{max}}.',
    { min, max },
  );
  const validateNumber = (field: keyof VitalForm, min: number, max: number, required = false, integer = false) => {
    const rawValue = form[field];
    if (rawValue === '') {
      if (required) errors[field] = t('erp.dental.patients.medical.validation.required', 'This field is required.');
      return;
    }
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue) || numericValue < min || numericValue > max) {
      errors[field] = rangeMessage(min, max);
    } else if (integer && !Number.isInteger(numericValue)) {
      errors[field] = t('erp.dental.patients.medical.validation.wholeNumber', 'Enter a whole number.');
    }
  };

  validateNumber('systolic', 40, 300, true, true);
  validateNumber('diastolic', 20, 200, true, true);
  validateNumber('pulse', 20, 250, false, true);
  validateNumber('temperatureCelsius', 30, 45);
  validateNumber('respiratoryRate', 4, 80, false, true);
  validateNumber('oxygenSaturation', 50, 100, false, true);
  validateNumber('weightKg', 1, 500);
  validateNumber('heightCm', 30, 250);
  validateNumber('painScore', 0, 10, false, true);

  if (!form.recordedAt) {
    errors.recordedAt = t('erp.dental.patients.medical.validation.required', 'This field is required.');
  } else if (Number.isNaN(new Date(form.recordedAt).getTime())) {
    errors.recordedAt = t('erp.dental.patients.medical.validation.invalidDate', 'Enter a valid date and time.');
  }
  return errors;
}

function optionalNumber(value: string): number | null {
  return value === '' ? null : Number(value);
}

function calculateBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg == null || heightCm == null || heightCm <= 0) return null;
  return weightKg / ((heightCm / 100) ** 2);
}

function formatDateTime(value: string, timezone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return date.toLocaleString(undefined, { timeZone: timezone });
  } catch {
    return date.toLocaleString(undefined, { timeZone: 'UTC' });
  }
}

function formatDayMonthYear(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function displayStatus(value: string, t: Translate): string {
  const fallback = value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  return t(`erp.dental.patients.medical.status.${value}`, fallback);
}

export function PatientMedicalHistory({
  contactId,
  value,
  onChange,
  canManage,
  patientAge,
  vitals,
  companyTimezone,
  tests,
  t,
  focusRequest,
}: {
  contactId: number;
  value: DentalMedicalHistoryDetails;
  onChange: (next: DentalMedicalHistoryDetails) => void;
  canManage: boolean;
  patientAge: number | null;
  vitals: DentalPatientVitalRecord[];
  companyTimezone: string;
  tests: DentalPatientInfectiousTestRecord[];
  t: Translate;
  focusRequest?: { section: 'conditions' | 'screening' | 'vitals'; requestId: number } | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingVitalId, setEditingVitalId] = useState<number | null>(null);
  const [vitalsExpanded, setVitalsExpanded] = useState(false);
  const [vitalForm, setVitalForm] = useState(emptyVitalForm);
  const [vitalTouched, setVitalTouched] = useState<Partial<Record<keyof VitalForm, boolean>>>({});
  const [editingTestId, setEditingTestId] = useState<number | null>(null);
  const [conditionsExpanded, setConditionsExpanded] = useState(false);
  const [screeningExpanded, setScreeningExpanded] = useState(false);
  const [testForm, setTestForm] = useState<{ testType: DentalInfectiousTestType; status: DentalInfectiousTestStatus; testDate: string; notes: string }>({
    testType: 'hiv', status: 'unknown', testDate: '', notes: '',
  });

  const vitalErrors = validateVitalForm(vitalForm, t);
  const isVitalFormValid = Object.keys(vitalErrors).length === 0;
  const updateVitalField = (field: keyof VitalForm, nextValue: string) => {
    setVitalForm((form) => ({ ...form, [field]: nextValue }));
    setVitalTouched((touched) => ({ ...touched, [field]: true }));
  };
  const visibleVitalError = (field: keyof VitalForm) => vitalTouched[field] ? vitalErrors[field] : undefined;

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.section === 'conditions') setConditionsExpanded(true);
    if (focusRequest.section === 'screening') setScreeningExpanded(true);
    if (focusRequest.section === 'vitals') setVitalsExpanded(true);
  }, [focusRequest]);

  const invalidateVitals = () => queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'vitals'] });
  const invalidateTests = () => queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'infectious-tests'] });

  const saveVital = useMutation({
    mutationFn: async () => {
      const payload = {
        systolic: Number(vitalForm.systolic),
        diastolic: Number(vitalForm.diastolic),
        pulse: optionalNumber(vitalForm.pulse),
        temperatureCelsius: optionalNumber(vitalForm.temperatureCelsius),
        respiratoryRate: optionalNumber(vitalForm.respiratoryRate),
        oxygenSaturation: optionalNumber(vitalForm.oxygenSaturation),
        weightKg: optionalNumber(vitalForm.weightKg),
        heightCm: optionalNumber(vitalForm.heightCm),
        painScore: optionalNumber(vitalForm.painScore),
        recordedAt: new Date(vitalForm.recordedAt).toISOString(),
        notes: vitalForm.notes.trim() || null,
      };
      const url = editingVitalId
        ? `/api/erp/dental/patients/${contactId}/vitals/${editingVitalId}`
        : `/api/erp/dental/patients/${contactId}/vitals`;
      const response = await apiRequest(editingVitalId ? 'PATCH' : 'POST', url, payload);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to save vital signs');
      return json.data;
    },
    onSuccess: () => {
      setEditingVitalId(null);
      setVitalForm(emptyVitalForm());
      setVitalTouched({});
      invalidateVitals();
      toast({ title: t('erp.dental.patients.medical.vitalSaved', 'Vital signs saved') });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const deleteVital = useMutation({
    mutationFn: async (recordId: number) => {
      const response = await apiRequest('DELETE', `/api/erp/dental/patients/${contactId}/vitals/${recordId}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to delete vital signs');
    },
    onSuccess: () => { invalidateVitals(); toast({ title: t('erp.dental.patients.medical.vitalDeleted', 'Vital signs deleted') }); },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const saveTest = useMutation({
    mutationFn: async () => {
      const payload = { ...testForm, testDate: testForm.testDate || null, notes: testForm.notes.trim() || null };
      const url = editingTestId
        ? `/api/erp/dental/patients/${contactId}/infectious-tests/${editingTestId}`
        : `/api/erp/dental/patients/${contactId}/infectious-tests`;
      const response = await apiRequest(editingTestId ? 'PATCH' : 'POST', url, payload);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to save screening record');
      return json.data;
    },
    onSuccess: () => {
      setEditingTestId(null);
      setTestForm({ testType: 'hiv', status: 'unknown', testDate: '', notes: '' });
      invalidateTests();
      toast({ title: t('erp.dental.patients.medical.testSaved', 'Screening record saved') });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const deleteTest = useMutation({
    mutationFn: async (recordId: number) => {
      const response = await apiRequest('DELETE', `/api/erp/dental/patients/${contactId}/infectious-tests/${recordId}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || 'Failed to delete screening record');
    },
    onSuccess: () => { invalidateTests(); toast({ title: t('erp.dental.patients.medical.testDeleted', 'Screening record deleted') }); },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const updateCondition = (key: DentalConditionKey, patch: { status?: DentalConditionStatus | DentalPregnancyStatus; details?: string }) => {
    onChange({
      ...value,
      conditions: {
        ...value.conditions,
        [key]: { ...value.conditions[key], ...patch },
      },
    });
  };

  const latestByType = new Map<DentalInfectiousTestType, DentalPatientInfectiousTestRecord>();
  for (const record of tests) if (!latestByType.has(record.testType)) latestByType.set(record.testType, record);

  const hasEnteredBloodPressure = vitalForm.systolic !== '' || vitalForm.diastolic !== '';
  const enteredBloodPressureIsValid = !vitalErrors.systolic && !vitalErrors.diastolic;
  const previewSystolic = hasEnteredBloodPressure
    ? enteredBloodPressureIsValid ? Number(vitalForm.systolic) : undefined
    : vitals[0]?.systolic;
  const previewDiastolic = hasEnteredBloodPressure
    ? enteredBloodPressureIsValid ? Number(vitalForm.diastolic) : undefined
    : vitals[0]?.diastolic;
  const vitalStatus = patientAge != null && patientAge >= 18 && previewSystolic && previewDiastolic
    ? classifyAdultBloodPressure(previewSystolic, previewDiastolic)
    : null;
  const vitalStatusClass = vitalStatus === 'normal'
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
    : vitalStatus === 'elevated' || vitalStatus === 'stage_1'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
      : 'border-destructive/30 bg-destructive/10 text-destructive';

  return (
    <div className="space-y-4">
      <section id="patient-medical-conditions" className="scroll-mt-4 overflow-hidden rounded-xl border bg-card/40 shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-inner">
              <ClipboardPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight">{t('erp.dental.patients.medical.conditionsTitle', 'Medical conditions')}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('erp.dental.patients.medical.conditionsDescription', 'Review conditions that may affect patient care')}</p>
            </div>
          </div>
          <Button data-tour="components-erp-dental-patientmedicalhistory.button.sidebar.collapse"
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-expanded={conditionsExpanded}
            aria-label={conditionsExpanded ? t('sidebar.collapse', 'Collapse') : t('sidebar.expand', 'Expand')}
            title={conditionsExpanded ? t('sidebar.collapse', 'Collapse') : t('sidebar.expand', 'Expand')}
            onClick={() => setConditionsExpanded((expanded) => !expanded)}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${conditionsExpanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        {conditionsExpanded && <div className="space-y-3 border-t p-3 sm:p-4">
          <div className="grid gap-3 md:grid-cols-2">
            {DENTAL_CONDITION_KEYS.map((key) => {
              const answer = value.conditions[key];
              const statuses = key === 'pregnancy' ? DENTAL_PREGNANCY_STATUSES : DENTAL_CONDITION_STATUSES;
              const ConditionIcon = conditionIcons[key];
              return (
                <div key={key} className="min-w-0 space-y-3 rounded-lg border bg-muted/10 p-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                      <ConditionIcon className="h-4 w-4" />
                    </span>
                    <Label className="text-sm font-medium">{t(`erp.dental.patients.medical.condition.${key}`, conditionFallbacks[key])}</Label>
                  </div>
                  <Select
                    value={answer.status}
                    disabled={!canManage}
                    onValueChange={(status) => updateCondition(key, { status: status as DentalConditionStatus | DentalPregnancyStatus })}
                  >
                    <SelectTrigger className="h-9 bg-background/50"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {statuses.map((status) => <SelectItem key={status} value={status}>{displayStatus(status, t)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {answer.status === 'yes' && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-normal text-muted-foreground">{t('erp.dental.patients.medical.detailsPlaceholder', 'Relevant details (optional)')}</Label>
                      <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.detailsPlaceholder"
                        className="h-9 bg-background/50"
                        value={answer.details}
                        disabled={!canManage}
                        maxLength={2000}
                        placeholder={t('erp.dental.patients.medical.detailsPlaceholder', 'Relevant details (optional)')}
                        onChange={(event) => updateCondition(key, { details: event.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/10 p-3.5 md:grid-cols-[minmax(0,1fr)_minmax(15rem,1fr)] md:items-center">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                <Cigarette className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <Label className="text-sm font-medium">{t('erp.dental.patients.medical.smoking', 'Smoking status')}</Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t('erp.dental.patients.medical.smokingDescription', 'Include current and past usage')}</p>
              </div>
            </div>
            <div className="min-w-0 space-y-2">
              <Select
                value={value.smoking.status}
                disabled={!canManage}
                onValueChange={(status) => onChange({ ...value, smoking: { ...value.smoking, status: status as DentalSmokingStatus } })}
              >
                <SelectTrigger className="h-9 bg-background/50"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DENTAL_SMOKING_STATUSES.map((status) => <SelectItem key={status} value={status}>{displayStatus(status, t)}</SelectItem>)}
                </SelectContent>
              </Select>
              {(value.smoking.status === 'current' || value.smoking.status === 'former') && (
                <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.smokingDetailsPlaceholder"
                  className="h-9 bg-background/50"
                  value={value.smoking.details}
                  disabled={!canManage}
                  maxLength={2000}
                  placeholder={t('erp.dental.patients.medical.smokingDetailsPlaceholder', 'Frequency or history (optional)')}
                  onChange={(event) => onChange({ ...value, smoking: { ...value.smoking, details: event.target.value } })}
                />
              )}
            </div>
          </div>
        </div>}
      </section>

      <section id="patient-infectious-screening" className="scroll-mt-4 overflow-hidden rounded-xl border bg-card/40 shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 shadow-inner dark:text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight">{t('erp.dental.patients.medical.screeningTitle', 'Infectious screening')}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('erp.dental.patients.medical.screeningDescription', 'Record and review infectious disease screening')}</p>
            </div>
          </div>
          <Button data-tour="components-erp-dental-patientmedicalhistory.button.sidebar.collapse"
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-expanded={screeningExpanded}
            aria-label={screeningExpanded ? t('sidebar.collapse', 'Collapse') : t('sidebar.expand', 'Expand')}
            title={screeningExpanded ? t('sidebar.collapse', 'Collapse') : t('sidebar.expand', 'Expand')}
            onClick={() => setScreeningExpanded((expanded) => !expanded)}
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${screeningExpanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        {screeningExpanded && <div className="space-y-3 border-t p-3 sm:p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {DENTAL_INFECTIOUS_TEST_TYPES.map((testType) => {
              const latest = latestByType.get(testType);
              const isPositive = latest?.status === 'positive';
              return (
                <div key={testType} className={`flex min-w-0 items-center gap-3 rounded-lg border border-l-2 bg-background/40 p-3.5 shadow-sm ${isPositive ? 'border-l-destructive' : 'border-l-emerald-500'}`}>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${isPositive ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{t(`erp.dental.patients.medical.test.${testType}`, testFallbacks[testType])}</div>
                    <Badge variant={isPositive ? 'destructive' : 'secondary'} className="mt-1 h-5 rounded-full px-2 text-[11px] font-medium">
                      {displayStatus(latest?.status ?? 'unknown', t)}
                    </Badge>
                    <div className="mt-1 text-xs text-muted-foreground">{latest?.testDate ? formatDayMonthYear(latest.testDate) : t('erp.dental.patients.medical.noTestDate', 'No test date')}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {canManage && (
            <div className="rounded-lg border bg-muted/10 p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5"><Label className="text-xs font-medium">{t('erp.dental.patients.medical.testType', 'Test')}</Label><Select value={testForm.testType} onValueChange={(testType) => setTestForm((form) => ({ ...form, testType: testType as DentalInfectiousTestType }))}><SelectTrigger className="h-10 bg-background/50"><SelectValue /></SelectTrigger><SelectContent>{DENTAL_INFECTIOUS_TEST_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`erp.dental.patients.medical.test.${type}`, testFallbacks[type])}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs font-medium">{t('erp.dental.patients.medical.status', 'Status')}</Label><Select value={testForm.status} onValueChange={(status) => setTestForm((form) => ({ ...form, status: status as DentalInfectiousTestStatus }))}><SelectTrigger className="h-10 bg-background/50"><SelectValue /></SelectTrigger><SelectContent>{DENTAL_INFECTIOUS_TEST_STATUSES.map((status) => <SelectItem key={status} value={status}>{displayStatus(status, t)}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label className="text-xs font-medium">{t('erp.dental.patients.medical.testDate', 'Test date')}</Label><Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.testType" className="h-10 bg-background/50" type="date" value={testForm.testDate} onChange={(event) => setTestForm((form) => ({ ...form, testDate: event.target.value }))} /></div>
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <Label className="flex items-center gap-2 text-sm font-medium"><NotebookPen className="h-4 w-4 text-muted-foreground" />{t('erp.dental.patients.medical.notes', 'Notes')}</Label>
                  <Textarea data-tour="components-erp-dental-patientmedicalhistory.textarea.erp.dental.patients.medical.addNotes" className="min-h-14 min-w-0 resize-y bg-background/60 px-4 py-3 text-base" rows={2} maxLength={2000} placeholder={t('erp.dental.patients.medical.addNotes', 'Add notes...')} value={testForm.notes} onChange={(event) => setTestForm((form) => ({ ...form, notes: event.target.value }))} />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button data-tour="components-erp-dental-patientmedicalhistory.button.common.update" className={recordActionButtonClass} onClick={() => saveTest.mutate()} disabled={saveTest.isPending}>
                  {editingTestId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingTestId ? t('common.update', 'Update') : t('common.add', 'Add')}
                </Button>
                {editingTestId && <Button data-tour="components-erp-dental-patientmedicalhistory.button.common.cancel" size="sm" variant="outline" onClick={() => { setEditingTestId(null); setTestForm({ testType: 'hiv', status: 'unknown', testDate: '', notes: '' }); }}>{t('common.cancel', 'Cancel')}</Button>}
              </div>
            </div>
          )}

          {tests.length > 0 && (
            <div className="compact-scrollbar max-h-[30rem] space-y-2 overflow-y-auto pr-2 [scrollbar-gutter:stable]">
              {tests.map((record) => {
                const isPositive = record.status === 'positive';
                return (
                  <div key={record.id} className={`flex items-center gap-3 rounded-lg border border-l-2 bg-background/30 p-3.5 ${isPositive ? 'border-l-destructive' : 'border-l-emerald-500'}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isPositive ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                      <FileText className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold">{t(`erp.dental.patients.medical.test.${record.testType}`, testFallbacks[record.testType])}</span>
                        <Badge variant={isPositive ? 'destructive' : 'secondary'} className="h-5 rounded-full px-2 text-[11px] font-medium">{displayStatus(record.status, t)}</Badge>
                        <span className="text-muted-foreground">|</span>
                        <span className="text-xs text-muted-foreground">{record.testDate ? formatDayMonthYear(record.testDate) : t('erp.dental.patients.medical.noTestDate', 'No test date')}</span>
                      </div>
                      {record.notes && <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{record.notes}</p>}
                    </div>
                    {canManage && <div className="flex shrink-0 items-center gap-1"><Button className="h-9 w-9 border" size="icon" variant="ghost" onClick={() => { setEditingTestId(record.id); setTestForm({ testType: record.testType, status: record.status, testDate: record.testDate ?? '', notes: record.notes ?? '' }); }}><Pencil className="h-4 w-4" /></Button><Button data-tour="components-erp-dental-patientmedicalhistory.button.erp.dental.patients.medical.confirmDeleteTest" className="h-9 w-9 border" size="icon" variant="ghost" onClick={() => window.confirm(t('erp.dental.patients.medical.confirmDeleteTest', 'Delete this screening record?')) && deleteTest.mutate(record.id)}><Trash2 className="h-4 w-4" /></Button></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>}
      </section>

      <section id="patient-vital-signs" className="scroll-mt-4 min-w-0 overflow-hidden rounded-xl border bg-card/40 shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-inner">
              <Activity className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight">{t('erp.dental.patients.medical.vitalsTitle', 'Vital signs')}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('erp.dental.patients.medical.vitalsDescription', 'Record and track patient vital signs')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {vitalStatus && (
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${vitalStatusClass}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {t(`erp.dental.patients.medical.bp.${vitalStatus}`, vitalStatus.replace('_', ' '))}
              </span>
            )}
            <Button data-tour="components-erp-dental-patientmedicalhistory.button.sidebar.collapse"
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-expanded={vitalsExpanded}
              aria-label={vitalsExpanded ? t('sidebar.collapse', 'Collapse') : t('sidebar.expand', 'Expand')}
              title={vitalsExpanded ? t('sidebar.collapse', 'Collapse') : t('sidebar.expand', 'Expand')}
              onClick={() => setVitalsExpanded((expanded) => !expanded)}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${vitalsExpanded ? 'rotate-180' : ''}`} />
            </Button>
          </div>
        </div>

        {vitalsExpanded && <>
        {canManage && (
          <>
            <div className="mx-5 border-t sm:mx-6" />
            <div className="compact-scrollbar min-w-0 max-w-full overflow-x-auto px-5 py-6 sm:px-6 [scrollbar-gutter:stable]">
              <div className="grid w-full min-w-[76rem] grid-cols-5 gap-4">
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><HeartPulse className="h-4 w-4 text-emerald-500" />{t('erp.dental.patients.medical.systolic', 'Systolic')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.systolic" className={`min-w-0 border-l-2 border-l-emerald-500 bg-background/60 pl-4 pr-16 text-base font-semibold ${visibleVitalError('systolic') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('systolic'))} type="number" min={40} max={300} value={vitalForm.systolic} onChange={(event) => updateVitalField('systolic', event.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">mmHg</span>
                  </div>
                  {visibleVitalError('systolic') && <p className="text-xs text-destructive">{visibleVitalError('systolic')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><HeartPulse className="h-4 w-4 text-emerald-500" />{t('erp.dental.patients.medical.diastolic', 'Diastolic')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.diastolic" className={`min-w-0 border-l-2 border-l-emerald-500 bg-background/60 pl-4 pr-16 text-base font-semibold ${visibleVitalError('diastolic') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('diastolic'))} type="number" min={20} max={200} value={vitalForm.diastolic} onChange={(event) => updateVitalField('diastolic', event.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">mmHg</span>
                  </div>
                  {visibleVitalError('diastolic') && <p className="text-xs text-destructive">{visibleVitalError('diastolic')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><HeartPulse className="h-4 w-4 text-emerald-500" />{t('erp.dental.patients.medical.pulse', 'Pulse')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.pulse" className={`min-w-0 border-l-2 border-l-emerald-500 bg-background/60 pl-4 pr-12 text-base font-semibold ${visibleVitalError('pulse') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('pulse'))} type="number" min={20} max={250} value={vitalForm.pulse} onChange={(event) => updateVitalField('pulse', event.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">bpm</span>
                  </div>
                  {visibleVitalError('pulse') && <p className="text-xs text-destructive">{visibleVitalError('pulse')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><Thermometer className="h-4 w-4 text-orange-500" />{t('erp.dental.patients.medical.temperature', 'Temperature')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.temperature" className={`min-w-0 bg-background/60 pr-10 ${visibleVitalError('temperatureCelsius') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('temperatureCelsius'))} type="number" min={30} max={45} step="0.1" value={vitalForm.temperatureCelsius} onChange={(event) => updateVitalField('temperatureCelsius', event.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">°C</span>
                  </div>
                  {visibleVitalError('temperatureCelsius') && <p className="text-xs text-destructive">{visibleVitalError('temperatureCelsius')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><Wind className="h-4 w-4 text-sky-500" />{t('erp.dental.patients.medical.respiratoryRate', 'Respiratory rate')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.respiratoryRate" className={`min-w-0 bg-background/60 pr-12 ${visibleVitalError('respiratoryRate') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('respiratoryRate'))} type="number" min={4} max={80} value={vitalForm.respiratoryRate} onChange={(event) => updateVitalField('respiratoryRate', event.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">/min</span>
                  </div>
                  {visibleVitalError('respiratoryRate') && <p className="text-xs text-destructive">{visibleVitalError('respiratoryRate')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><Activity className="h-4 w-4 text-cyan-500" />{t('erp.dental.patients.medical.oxygenSaturation', 'Oxygen saturation')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.oxygenSaturation" className={`min-w-0 bg-background/60 pr-9 ${visibleVitalError('oxygenSaturation') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('oxygenSaturation'))} type="number" min={50} max={100} value={vitalForm.oxygenSaturation} onChange={(event) => updateVitalField('oxygenSaturation', event.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
                  </div>
                  {visibleVitalError('oxygenSaturation') && <p className="text-xs text-destructive">{visibleVitalError('oxygenSaturation')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><Weight className="h-4 w-4 text-violet-500" />{t('erp.dental.patients.medical.weight', 'Weight')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.weight" className={`min-w-0 bg-background/60 pr-10 ${visibleVitalError('weightKg') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('weightKg'))} type="number" min={1} max={500} step="0.1" value={vitalForm.weightKg} onChange={(event) => updateVitalField('weightKg', event.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">kg</span>
                  </div>
                  {visibleVitalError('weightKg') && <p className="text-xs text-destructive">{visibleVitalError('weightKg')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><Ruler className="h-4 w-4 text-violet-500" />{t('erp.dental.patients.medical.height', 'Height')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.height" className={`min-w-0 bg-background/60 pr-10 ${visibleVitalError('heightCm') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('heightCm'))} type="number" min={30} max={250} step="0.1" value={vitalForm.heightCm} onChange={(event) => updateVitalField('heightCm', event.target.value)} />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">cm</span>
                  </div>
                  {visibleVitalError('heightCm') && <p className="text-xs text-destructive">{visibleVitalError('heightCm')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><Gauge className="h-4 w-4 text-amber-500" />{t('erp.dental.patients.medical.painScore', 'Pain score')}</Label>
                  <div className="relative">
                    <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.painScore"
                      className={`min-w-0 bg-background/60 pr-12 ${visibleVitalError('painScore') ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                      aria-invalid={Boolean(visibleVitalError('painScore'))}
                      type="number"
                      min={0}
                      max={10}
                      step={1}
                      inputMode="numeric"
                      value={vitalForm.painScore}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        if (nextValue === '' || (/^\d{1,2}$/.test(nextValue) && Number(nextValue) <= 10)) {
                          updateVitalField('painScore', nextValue);
                        }
                      }}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">/10</span>
                  </div>
                  {visibleVitalError('painScore') && <p className="text-xs text-destructive">{visibleVitalError('painScore')}</p>}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="h-4 w-4 text-muted-foreground" />{t('erp.dental.patients.medical.recordedAt', 'Recorded at')}</Label>
                  <Input data-tour="components-erp-dental-patientmedicalhistory.input.erp.dental.patients.medical.systolic" className={`min-w-0 bg-background/60 px-4 text-base ${visibleVitalError('recordedAt') ? 'border-destructive focus-visible:ring-destructive' : ''}`} aria-invalid={Boolean(visibleVitalError('recordedAt'))} type="datetime-local" value={vitalForm.recordedAt} onChange={(event) => updateVitalField('recordedAt', event.target.value)} />
                  {visibleVitalError('recordedAt') && <p className="text-xs text-destructive">{visibleVitalError('recordedAt')}</p>}
                </div>
                <div className="col-span-5 min-w-0 space-y-2">
                  <Label className="flex items-center gap-2 text-sm font-medium"><NotebookPen className="h-4 w-4 text-muted-foreground" />{t('erp.dental.patients.medical.notes', 'Notes')}</Label>
                  <Textarea data-tour="components-erp-dental-patientmedicalhistory.textarea.erp.dental.patients.medical.addNotes" className="min-h-14 min-w-0 resize-y bg-background/60 px-4 py-3 text-base" rows={2} maxLength={2000} placeholder={t('erp.dental.patients.medical.addNotes', 'Add notes...')} value={vitalForm.notes} onChange={(event) => setVitalForm((form) => ({ ...form, notes: event.target.value }))} />
                </div>
              </div>
            </div>
            <div className="mx-5 border-t sm:mx-6" />
            <div className="flex flex-wrap gap-3 p-5 sm:p-6">
              <Button data-tour="components-erp-dental-patientmedicalhistory.button.common.update" className={recordActionButtonClass} onClick={() => saveVital.mutate()} disabled={saveVital.isPending || !isVitalFormValid}>
                {editingVitalId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingVitalId ? t('common.update', 'Update') : t('common.add', 'Add')}
              </Button>
              {editingVitalId && (
                <Button data-tour="components-erp-dental-patientmedicalhistory.button.common.cancel" className="h-10 min-w-24 gap-2 px-4" variant="outline" onClick={() => { setEditingVitalId(null); setVitalForm(emptyVitalForm()); setVitalTouched({}); }}>
                  <X className="h-4 w-4" />
                  {t('common.cancel', 'Cancel')}
                </Button>
              )}
            </div>
          </>
        )}

        <div className="border-t px-5 py-5 sm:px-6">
          <h4 className="mb-3 text-sm font-semibold">{t('erp.dental.patients.medical.vitalsHistory', 'Recorded history')}</h4>
          {vitals.length === 0 ? <p className="text-sm text-muted-foreground">{t('erp.dental.patients.medical.noVitals', 'No vital signs recorded.')}</p> : <div className="compact-scrollbar max-h-[30rem] space-y-2 overflow-y-auto pr-2 [scrollbar-gutter:stable]">{vitals.map((record) => {
            const category = patientAge != null && patientAge >= 18 ? classifyAdultBloodPressure(record.systolic, record.diastolic) : null;
            const bmi = calculateBmi(record.weightKg, record.heightCm);
            return <div key={record.id} className="flex items-center gap-3 rounded-lg border bg-background/30 px-4 py-3 text-sm"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-semibold">{record.systolic}/{record.diastolic} mmHg</span>{record.pulse != null && <span>{record.pulse} bpm</span>}{record.temperatureCelsius != null && <span>{record.temperatureCelsius} °C</span>}{record.respiratoryRate != null && <span>{record.respiratoryRate}/min</span>}{record.oxygenSaturation != null && <span>SpO₂ {record.oxygenSaturation}%</span>}{record.weightKg != null && <span>{record.weightKg} kg</span>}{record.heightCm != null && <span>{record.heightCm} cm</span>}{bmi != null && <span>{t('erp.dental.patients.medical.bmi', 'BMI')} {bmi.toFixed(1)}</span>}{record.painScore != null && <span>{t('erp.dental.patients.medical.pain', 'Pain')} {record.painScore}/10</span>}{category && <Badge variant={category === 'crisis' ? 'destructive' : category === 'normal' ? 'secondary' : 'outline'}>{t(`erp.dental.patients.medical.bp.${category}`, category.replace('_', ' '))}</Badge>}<span className="text-muted-foreground">{formatDateTime(record.recordedAt, companyTimezone)}</span></div>{record.notes && <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">{record.notes}</p>}</div>{canManage && <div className="flex shrink-0 items-center gap-1"><Button size="icon" variant="ghost" onClick={() => { setEditingVitalId(record.id); setVitalTouched({}); setVitalForm({ systolic: String(record.systolic), diastolic: String(record.diastolic), pulse: record.pulse == null ? '' : String(record.pulse), temperatureCelsius: record.temperatureCelsius == null ? '' : String(record.temperatureCelsius), respiratoryRate: record.respiratoryRate == null ? '' : String(record.respiratoryRate), oxygenSaturation: record.oxygenSaturation == null ? '' : String(record.oxygenSaturation), weightKg: record.weightKg == null ? '' : String(record.weightKg), heightCm: record.heightCm == null ? '' : String(record.heightCm), painScore: record.painScore == null ? '' : String(record.painScore), recordedAt: localDateTimeValue(new Date(record.recordedAt)), notes: record.notes ?? '' }); }}><Pencil className="h-4 w-4" /></Button><Button data-tour="components-erp-dental-patientmedicalhistory.button.erp.dental.patients.medical.confirmDeleteVital" size="icon" variant="ghost" onClick={() => window.confirm(t('erp.dental.patients.medical.confirmDeleteVital', 'Delete this vital-sign record?')) && deleteVital.mutate(record.id)}><Trash2 className="h-4 w-4" /></Button></div>}</div>;
          })}</div>}
        </div>
        </>}
      </section>
    </div>
  );
}

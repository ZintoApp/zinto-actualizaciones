import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import { DentalShellPage } from './dental-shell';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DENTAL_CLINICAL_DOCUMENT_CATEGORIES, DENTAL_CLINICAL_NOTE_TYPES } from '@shared/dental-clinical';
import { cn } from '@/lib/utils';
import { ClinicalTimelineList } from '@/components/erp/dental/ClinicalTimelineList';
import { ClinicalProgressNotes } from '@/components/erp/dental/ClinicalProgressNotes';
import { ConsentFormsDialog } from '@/components/erp/dental/ConsentFormsDialog';
import { RecentDocumentsList } from '@/components/erp/dental/RecentDocumentsList';
import {
  AllergiesSelector,
  normalizeAllergiesField,
  parseAllergyPartsForAlerts,
} from '@/components/erp/dental/AllergiesSelector';
import {
  PatientMedicalHistory,
  useDentalMedicalRecords,
  type DentalPatientInfectiousTestRecord,
} from '@/components/erp/dental/PatientMedicalHistory';
import {
  classifyAdultBloodPressure,
  defaultDentalMedicalHistoryDetails,
  normalizeDentalMedicalHistoryDetails,
  type DentalMedicalHistoryDetails,
} from '@shared/dental-medical-history';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { ContactCustomFieldsBadges } from '@/components/contacts/ContactCustomFieldsBadges';
import { ContactCustomFieldsEditor } from '@/components/contacts/ContactCustomFieldsEditor';
import { useCompanyContactCustomFields } from '@/hooks/use-company-contact-custom-fields';
import { missingRequiredContactCustomFields } from '@shared/contact-custom-fields';
import { ToothIcon } from '@/components/erp/dental/ToothIcon';
import {
  Activity,
  AlertTriangle,
  AlignLeft,
  ArrowLeft,
  Cake,
  CalendarClock,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Contact,
  DollarSign,
  Droplets,
  ExternalLink,
  FileText,
  FolderOpen,
  HeartPulse,
  History,
  Hourglass,
  Loader2,
  Mail,
  MoreHorizontal,
  Paperclip,
  Phone,
  Pill,
  Receipt,
  Save,
  ShieldCheck,
  Smile,
  StickyNote,
  Trash2,
  Upload,
  UserMinus,
  UserRound,
  Users,
} from 'lucide-react';

const SEX_OPTIONS = ['Male', 'Female', 'Other'] as const;
type SexOption = (typeof SEX_OPTIONS)[number];

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

type PatientDetail = {
  id: number;
  contactId: number;
  dateOfBirth: string | null;
  sex: string | null;
  allergies: string | null;
  bloodGroup: string | null;
  medicalHistoryDetails: DentalMedicalHistoryDetails | null;
  medicalHistorySummary: string | null;
  currentMedications: string | null;
  dentalHistorySummary: string | null;
  previousDentalTreatments: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  preferredProviderUserId: number | null;
  contact: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[] | null;
    avatarUrl?: string | null;
    customFields?: Record<string, unknown> | null;
  };
};

type TimelineEntry =
  | {
      kind: 'note';
      id: number;
      noteType: string;
      body: string;
      toothRefs: string[] | null;
      createdAt: string;
      updatedAt: string;
    }
  | {
      kind: 'system_event';
      id: number;
      title: string;
      description: string | null;
      occurredAt: string;
    };

type ClinicalDocument = {
  id: number;
  originalName: string;
  category: string;
  description: string | null;
  mimeType: string;
  fileSize: number;
  fileUrl: string;
  createdAt: string;
};

type ChartHistoryEntry = {
  id: number;
  version: number;
  numberingSystem: string;
  createdBy: number | null;
  createdAt: string;
};

type ScheduleAppointment = {
  id: number;
  contactId: number;
  title: string;
  scheduledAt: string;
  durationMinutes: number | null;
  type: string;
  status: string;
  providerName: string | null;
  chairName: string | null;
};

type TreatmentPlanSummary = {
  id: number;
  title: string;
  status: string;
  currency: string;
  estimatedTotal: string;
  procedureCount: number;
  updatedAt: string;
};

type TreatmentProcedure = {
  id: number;
  status: string;
};

type TreatmentPlanDetail = TreatmentPlanSummary & {
  procedures: TreatmentProcedure[];
};

type InvoiceSummary = {
  id: number;
  invoiceNumber: string;
  status: string;
  type: string;
  currency: string | null;
  amountDue: string;
  totalAmount: string;
};

type ProfileForm = {
  dateOfBirth: string;
  sexOption: SexOption | '';
  sexOtherDetail: string;
  bloodGroup: string;
  allergies: string;
  medicalHistoryDetails: DentalMedicalHistoryDetails;
  medicalHistorySummary: string;
  currentMedications: string;
  dentalHistorySummary: string;
  previousDentalTreatments: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
};

type TabKey = 'profile' | 'notes' | 'documents' | 'history';
type PatientAlertTarget = 'allergies' | 'conditions' | 'screening' | 'vitals';

function emptyForm(): ProfileForm {
  return {
    dateOfBirth: '',
    sexOption: '',
    sexOtherDetail: '',
    bloodGroup: '',
    allergies: '',
    medicalHistoryDetails: defaultDentalMedicalHistoryDetails(),
    medicalHistorySummary: '',
    currentMedications: '',
    dentalHistorySummary: '',
    previousDentalTreatments: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  };
}

function parseSex(stored: string | null | undefined): Pick<ProfileForm, 'sexOption' | 'sexOtherDetail'> {
  const value = (stored ?? '').trim();
  if (!value) return { sexOption: '', sexOtherDetail: '' };
  if (value === 'Male' || value === 'Female') return { sexOption: value, sexOtherDetail: '' };
  if (value === 'Other') return { sexOption: 'Other', sexOtherDetail: '' };
  const emDash = value.match(/^Other\s*[—–-]\s*(.+)$/i);
  if (emDash) return { sexOption: 'Other', sexOtherDetail: emDash[1].trim() };
  // Legacy free-text values land under Other + specify
  return { sexOption: 'Other', sexOtherDetail: value };
}

function composeSex(sexOption: SexOption | '', sexOtherDetail: string): string | null {
  if (!sexOption) return null;
  if (sexOption !== 'Other') return sexOption;
  const detail = sexOtherDetail.trim();
  return detail ? `Other — ${detail}` : 'Other';
}

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimeShort(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatTimelineDateHeader(
  value: string,
  t: (key: string, fallback: string) => string,
): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  if (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  ) {
    return t('erp.dental.clinical.timeline.today', 'Today');
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function parseLocalDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = parseLocalDateInput(dob);
  if (!birth) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 200 ? age : null;
}

function dobFromAge(age: number): string {
  const now = new Date();
  const birth = new Date(now.getFullYear() - age, now.getMonth(), now.getDate());
  const yyyy = birth.getFullYear();
  const mm = String(birth.getMonth() + 1).padStart(2, '0');
  const dd = String(birth.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatPatientId(id: number): string {
  return `P-${String(id).padStart(5, '0')}`;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function clinicalCategoryLabel(category: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    xray: t('erp.dental.clinical.category.xray', 'X-ray'),
    cbct: t('erp.dental.clinical.category.cbct', 'CBCT'),
    intraoral: t('erp.dental.clinical.category.intraoral', 'Intraoral photo'),
    consent: t('erp.dental.clinical.category.consent', 'Consent'),
    clinical_report: t('erp.dental.clinical.category.clinicalReport', 'Clinical report'),
    before_after: t('erp.dental.clinical.category.beforeAfter', 'Before / after'),
  };
  return labels[category] ?? category;
}

function clinicalCategoryTagLabel(category: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    xray: t('erp.dental.clinical.categoryTag.xray', 'X-Ray'),
    cbct: t('erp.dental.clinical.categoryTag.cbct', 'CBCT'),
    intraoral: t('erp.dental.clinical.categoryTag.intraoral', 'Photo'),
    consent: t('erp.dental.clinical.categoryTag.consent', 'Form'),
    clinical_report: t('erp.dental.clinical.categoryTag.clinicalReport', 'Report'),
    before_after: t('erp.dental.clinical.categoryTag.beforeAfter', 'Photo'),
  };
  return labels[category] ?? clinicalCategoryLabel(category, t);
}

function formatDocumentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function noteTypeLabel(noteType: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    note: t('erp.dental.clinical.noteType.note', 'Note'),
    diagnosis: t('erp.dental.clinical.noteType.diagnosis', 'Diagnosis'),
    observation: t('erp.dental.clinical.noteType.observation', 'Observation'),
  };
  return labels[noteType] ?? noteType;
}

function planStatusLabel(status: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    planned: t('erp.dental.treatmentPlans.status.planned', 'Planned'),
    in_progress: t('erp.dental.treatmentPlans.status.inProgress', 'In progress'),
    quoted: t('erp.dental.treatmentPlans.status.quoted', 'Quoted'),
    approved: t('erp.dental.treatmentPlans.status.approved', 'Approved'),
    invoiced: t('erp.dental.treatmentPlans.status.invoiced', 'Invoiced'),
    completed: t('erp.dental.treatmentPlans.status.completed', 'Completed'),
    cancelled: t('erp.dental.treatmentPlans.status.cancelled', 'Cancelled'),
  };
  return labels[status] ?? status;
}

/** Pick the most relevant plan for the summary card: in-progress first, else most recently updated non-cancelled. */
function pickActivePlan(plans: TreatmentPlanSummary[]): TreatmentPlanSummary | null {
  if (plans.length === 0) return null;
  const active = [...plans]
    .filter((p) => p.status !== 'cancelled')
    .sort((a, b) => {
      const aInProgress = a.status === 'in_progress' ? 1 : 0;
      const bInProgress = b.status === 'in_progress' ? 1 : 0;
      if (aInProgress !== bInProgress) return bInProgress - aInProgress;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  return active[0] ?? null;
}

export default function DentalPatientDetailPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_PATIENTS);
  const canManageContacts = hasPermission(PERMISSIONS.MANAGE_CONTACTS);
  const canEditNotes = hasPermission(PERMISSIONS.EDIT_DENTAL_CHART);
  const canViewImaging = hasPermission(PERMISSIONS.VIEW_DENTAL_IMAGING) || hasPermission(PERMISSIONS.MANAGE_DENTAL_IMAGING);
  const canManageImaging = hasPermission(PERMISSIONS.MANAGE_DENTAL_IMAGING);
  const canViewChart = hasPermission(PERMISSIONS.VIEW_DENTAL_CHART) || canEditNotes;
  const canViewSchedule =
    hasPermission(PERMISSIONS.VIEW_DENTAL_SCHEDULE) || hasPermission(PERMISSIONS.MANAGE_DENTAL_SCHEDULE);
  const canViewTreatmentPlans =
    hasPermission(PERMISSIONS.VIEW_DENTAL_TREATMENT_PLANS) ||
    hasPermission(PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS);
  const canViewInvoices =
    hasPermission(PERMISSIONS.VIEW_INVOICES) || hasPermission(PERMISSIONS.MANAGE_INVOICES);

  const queryClient = useQueryClient();
  const params = useParams<{ contactId: string }>();
  const [, setLocation] = useLocation();
  const contactId = Number(params.contactId);
  const contactIdValid = Number.isFinite(contactId) && contactId > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [alertFocusRequest, setAlertFocusRequest] = useState<{ section: PatientAlertTarget; requestId: number } | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const [savedForm, setSavedForm] = useState<ProfileForm>(emptyForm());
  const [contactCustomFieldValues, setContactCustomFieldValues] = useState<Record<string, unknown>>({});
  const [savedContactCustomFieldValues, setSavedContactCustomFieldValues] = useState<Record<string, unknown>>({});
  const [docCategory, setDocCategory] = useState<string>(DENTAL_CLINICAL_DOCUMENT_CATEGORIES[0]);
  const [docDescription, setDocDescription] = useState('');
  const [docFile, setDocFile] = useState<File | null>(null);

  const patientQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId],
    enabled: contactIdValid,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Patient not found');
      return json.data as PatientDetail;
    },
  });
  const { data: contactCustomFieldDefinitions = [] } = useCompanyContactCustomFields({ enabled: contactIdValid });

  const { vitalsQuery, testsQuery } = useDentalMedicalRecords(contactId, contactIdValid);

  const timelineQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'timeline'],
    enabled: contactIdValid && canViewChart,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/clinical-feed?filter=all&limit=100`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load timeline');
      return json.data as TimelineEntry[];
    },
  });

  const documentsQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'clinical-documents'],
    enabled: contactIdValid && canViewImaging,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/clinical-documents`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load clinical documents');
      return json.data as ClinicalDocument[];
    },
  });

  const chartHistoryQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', contactId, 'chart-history'],
    enabled: contactIdValid && canViewChart,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/patients/${contactId}/chart/history`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load chart history');
      return json.data as ChartHistoryEntry[];
    },
  });

  const scheduleQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule', 'patient', contactId],
    enabled: contactIdValid && canViewSchedule,
    queryFn: async () => {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setFullYear(to.getFullYear() + 2);
      const fromStr = from.toISOString().slice(0, 10);
      const toStr = to.toISOString().slice(0, 10);
      const res = await apiRequest('GET', `/api/erp/dental/schedule?from=${fromStr}&to=${toStr}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load schedule');
      return json.data as ScheduleAppointment[];
    },
  });

  const treatmentPlansQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans', 'patient', contactId],
    enabled: contactIdValid && canViewTreatmentPlans,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans?contactId=${contactId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load treatment plans');
      return (json.data?.data ?? []) as TreatmentPlanSummary[];
    },
  });

  const activePlan = useMemo(
    () => pickActivePlan(treatmentPlansQuery.data ?? []),
    [treatmentPlansQuery.data],
  );

  const activePlanDetailQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans', 'detail', activePlan?.id],
    enabled: contactIdValid && canViewTreatmentPlans && !!activePlan,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans/${activePlan!.id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load treatment plan');
      return json.data as TreatmentPlanDetail;
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ['/api/erp/invoices', 'patient', contactId],
    enabled: contactIdValid && canViewInvoices,
    queryFn: async () => {
      const res = await apiRequest(
        'GET',
        `/api/erp/invoices?contactId=${contactId}&type=sales_invoice`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load invoices');
      return (json.data?.data ?? []) as InvoiceSummary[];
    },
  });

  useEffect(() => {
    const patient = patientQuery.data;
    if (!patient) return;
    const sex = parseSex(patient.sex);
    const nextForm: ProfileForm = {
      dateOfBirth: patient.dateOfBirth ?? '',
      sexOption: sex.sexOption,
      sexOtherDetail: sex.sexOtherDetail,
      bloodGroup: patient.bloodGroup ?? '',
      allergies: normalizeAllergiesField(patient.allergies),
      medicalHistoryDetails: normalizeDentalMedicalHistoryDetails(patient.medicalHistoryDetails),
      medicalHistorySummary: patient.medicalHistorySummary ?? '',
      currentMedications: patient.currentMedications ?? '',
      dentalHistorySummary: patient.dentalHistorySummary ?? '',
      previousDentalTreatments: patient.previousDentalTreatments ?? '',
      emergencyContactName: patient.emergencyContactName ?? '',
      emergencyContactPhone: patient.emergencyContactPhone ?? '',
    };
    const nextCustomFields = patient.contact.customFields && typeof patient.contact.customFields === 'object'
      ? { ...patient.contact.customFields }
      : {};
    setForm(nextForm);
    setSavedForm(nextForm);
    setContactCustomFieldValues(nextCustomFields);
    setSavedContactCustomFieldValues(nextCustomFields);
  }, [patientQuery.data]);

  const invalidateClinical = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'timeline'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'clinical-notes'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId, 'clinical-documents'] });
  };

  const editableContactCustomFields = Object.fromEntries(
    contactCustomFieldDefinitions.map((definition) => [
      definition.fieldName,
      contactCustomFieldValues[definition.fieldName],
    ]),
  );
  const savedEditableContactCustomFields = Object.fromEntries(
    contactCustomFieldDefinitions.map((definition) => [
      definition.fieldName,
      savedContactCustomFieldValues[definition.fieldName],
    ]),
  );
  const profileHasChanges = JSON.stringify(form) !== JSON.stringify(savedForm);
  const customFieldsHaveChanges = JSON.stringify(editableContactCustomFields) !== JSON.stringify(savedEditableContactCustomFields);
  const missingRequiredCustomFields = missingRequiredContactCustomFields(
    contactCustomFieldDefinitions,
    contactCustomFieldValues,
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (canManage && profileHasChanges && !form.sexOption) {
        throw new Error(t('erp.dental.patients.fields.sexRequired', 'Sex is required'));
      }
      let savedCustomFields: Record<string, unknown> | undefined;
      if (canManageContacts && customFieldsHaveChanges) {
        const customFieldsRes = await apiRequest('PATCH', `/api/erp/dental/patients/${contactId}/contact-custom-fields`, {
          customFields: editableContactCustomFields,
        });
        const customFieldsJson = await customFieldsRes.json().catch(() => ({}));
        if (!customFieldsRes.ok) {
          throw new Error(t('custom_fields.editor.save_failed', 'Failed to save contact custom fields'));
        }
        savedCustomFields = customFieldsJson.data?.customFields ?? {};
      }
      if (canManage && profileHasChanges) {
        const profileRes = await apiRequest('PATCH', `/api/erp/dental/patients/${contactId}`, {
          dateOfBirth: form.dateOfBirth || null,
          sex: composeSex(form.sexOption, form.sexOtherDetail),
          bloodGroup: form.bloodGroup || null,
          allergies: form.allergies || null,
          medicalHistoryDetails: form.medicalHistoryDetails,
          medicalHistorySummary: form.medicalHistorySummary || null,
          currentMedications: form.currentMedications || null,
          dentalHistorySummary: form.dentalHistorySummary || null,
          previousDentalTreatments: form.previousDentalTreatments || null,
          emergencyContactName: form.emergencyContactName || null,
          emergencyContactPhone: form.emergencyContactPhone || null,
        });
        const profileJson = await profileRes.json().catch(() => ({}));
        if (!profileRes.ok) throw new Error(profileJson.error || 'Failed to save profile');
      }
      return { customFields: savedCustomFields };
    },
    onSuccess: (data) => {
      setSavedForm(form);
      if (data.customFields) {
        setContactCustomFieldValues(data.customFields);
        setSavedContactCustomFieldValues(data.customFields);
      } else {
        setSavedContactCustomFieldValues(contactCustomFieldValues);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients', contactId] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
      toast({ title: t('erp.dental.patients.saved', 'Patient profile saved') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: async () => {
      if (!docFile) throw new Error('No file selected');
      const formData = new FormData();
      formData.append('document', docFile);
      formData.append('category', docCategory);
      if (docDescription.trim()) formData.append('description', docDescription.trim());
      const res = await apiRequest('POST', `/api/contacts/${contactId}/documents`, formData);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to upload document');
      return json;
    },
    onSuccess: () => {
      setDocFile(null);
      setDocDescription('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      invalidateClinical();
      toast({ title: t('erp.dental.clinical.documentUploaded', 'Clinical document uploaded') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await apiRequest('DELETE', `/api/contacts/${contactId}/documents/${documentId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete document');
    },
    onSuccess: () => {
      invalidateClinical();
      toast({ title: t('erp.dental.clinical.documentDeleted', 'Clinical document deleted') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const removePatientMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/erp/dental/patients/${contactId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to remove patient');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
      toast({ title: t('erp.dental.patients.removed', 'Patient removed') });
      setLocation('/erp/dental/patients');
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const patient = patientQuery.data;
  const timeline = timelineQuery.data ?? [];

  const clinicalTimelineItems = useMemo(() => {
    type RawEvent = {
      key: string;
      when: string;
      description: string;
      subDescription?: string | null;
    };
    const events: RawEvent[] = [];

    for (const entry of timeline) {
      if (entry.kind === 'note') {
        events.push({
          key: `note-${entry.id}`,
          when: entry.createdAt,
          description: t('erp.dental.clinical.timeline.noteAdded', 'Clinical note added'),
        });
      } else {
        events.push({
          key: `event-${entry.id}`,
          when: entry.occurredAt,
          description: entry.title,
          subDescription: entry.description,
        });
      }
    }

    return events
      .sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime())
      .map((event) => ({
        key: event.key,
        dateLabel: formatTimelineDateHeader(event.when, t),
        timeLabel: formatTimeShort(event.when),
        description: event.description,
        subDescription: event.subDescription ?? null,
      }));
  }, [
    timeline,
    t,
  ]);

  const latestNote = useMemo(() => {
    const notes = timeline.filter(
      (e): e is Extract<TimelineEntry, { kind: 'note' }> => e.kind === 'note',
    );
    if (notes.length === 0) return null;
    return [...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  }, [timeline]);

  const alerts = useMemo(() => {
    const items: Array<{ key: string; label: string; severity: 'critical' | 'warning' | 'info'; target: PatientAlertTarget }> =
      parseAllergyPartsForAlerts(patient?.allergies).map((allergy) => ({
        key: `allergy-${allergy}`,
        label: t('erp.dental.patients.allergyAlert', '{{name}} Allergy', { name: allergy }),
        severity: 'warning' as const,
        target: 'allergies' as const,
      }));
    const history = normalizeDentalMedicalHistoryDetails(patient?.medicalHistoryDetails);
    const conditionLabels: Record<keyof typeof history.conditions, string> = {
      diabetes: t('erp.dental.patients.medical.condition.diabetes', 'Diabetes'),
      hypertension: t('erp.dental.patients.medical.condition.hypertension', 'Hypertension'),
      heartDisease: t('erp.dental.patients.medical.condition.heartDisease', 'Heart disease'),
      bleedingDisorder: t('erp.dental.patients.medical.condition.bleedingDisorder', 'Bleeding disorder'),
      pregnancy: t('erp.dental.patients.medical.condition.pregnancy', 'Pregnancy'),
      majorSurgeryHospitalization: t('erp.dental.patients.medical.condition.majorSurgeryHospitalization', 'Major surgery / hospitalization'),
    };
    for (const [key, answer] of Object.entries(history.conditions) as Array<[keyof typeof history.conditions, { status: string }]>) {
      if (answer.status === 'yes') items.push({ key: `condition-${key}`, label: conditionLabels[key], severity: 'warning', target: 'conditions' });
    }
    if (history.smoking.status === 'current') {
      items.push({ key: 'smoking', label: t('erp.dental.patients.medical.alert.currentSmoking', 'Current smoker'), severity: 'info', target: 'conditions' });
    }
    const latestTests = new Map<string, DentalPatientInfectiousTestRecord>();
    for (const record of testsQuery.data ?? []) if (!latestTests.has(record.testType)) latestTests.set(record.testType, record);
    const testNames: Record<string, string> = {
      hiv: t('erp.dental.patients.medical.test.hiv', 'HIV'),
      hepatitis_b: t('erp.dental.patients.medical.test.hepatitis_b', 'Hepatitis B'),
      hepatitis_c: t('erp.dental.patients.medical.test.hepatitis_c', 'Hepatitis C'),
    };
    for (const [testType, record] of latestTests) {
      if (record?.status === 'positive') {
        items.push({ key: `test-${testType}`, label: t('erp.dental.patients.medical.alert.positiveTest', '{{name}} positive', { name: testNames[testType] ?? testType }), severity: 'warning', target: 'screening' });
      }
    }
    const latestVital = vitalsQuery.data?.records[0];
    const age = calcAge(patient?.dateOfBirth);
    if (latestVital && age != null && age >= 18) {
      const category = classifyAdultBloodPressure(latestVital.systolic, latestVital.diastolic);
      if (category !== 'normal') {
        items.push({
          key: 'blood-pressure',
          label: t('erp.dental.patients.medical.alert.bloodPressure', 'Blood pressure: {{reading}} ({{category}})', {
            reading: `${latestVital.systolic}/${latestVital.diastolic}`,
            category: t(`erp.dental.patients.medical.bp.${category}`, category.replace('_', ' ')),
          }),
          severity: category === 'crisis' ? 'critical' : category === 'elevated' ? 'info' : 'warning',
          target: 'vitals',
        });
      }
    }
    return items;
  }, [patient?.allergies, patient?.medicalHistoryDetails, patient?.dateOfBirth, testsQuery.data, vitalsQuery.data, t]);

  useEffect(() => {
    if (!alertFocusRequest || activeTab !== 'profile') return;
    const targetIds: Record<PatientAlertTarget, string> = {
      allergies: 'patient-allergies',
      conditions: 'patient-medical-conditions',
      screening: 'patient-infectious-screening',
      vitals: 'patient-vital-signs',
    };
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.getElementById(targetIds[alertFocusRequest.section])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [activeTab, alertFocusRequest]);

  const openAlertSource = (target: PatientAlertTarget) => {
    setActiveTab('profile');
    setAlertFocusRequest({ section: target, requestId: Date.now() });
  };

  const recentDocuments = useMemo(() => (documentsQuery.data ?? []).slice(0, 3), [documentsQuery.data]);

  const recentDocumentItems = useMemo(
    () =>
      recentDocuments.map((doc) => ({
        key: String(doc.id),
        href: doc.fileUrl,
        title: `${clinicalCategoryLabel(doc.category, t)} (${formatDocumentDate(doc.createdAt)})`,
        tag: clinicalCategoryTagLabel(doc.category, t),
      })),
    [recentDocuments, t],
  );

  const nextAppointment = useMemo(() => {
    const list = scheduleQuery.data ?? [];
    const now = Date.now();
    return (
      list
        .filter(
          (appt) =>
            appt.contactId === contactId &&
            appt.status !== 'cancelled' &&
            new Date(appt.scheduledAt).getTime() >= now,
        )
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null
    );
  }, [scheduleQuery.data, contactId]);

  const planProgress = useMemo(() => {
    const detail = activePlanDetailQuery.data;
    if (!detail || detail.procedures.length === 0) return null;
    const total = detail.procedures.length;
    const completed = detail.procedures.filter((p) => p.status === 'completed').length;
    return { total, completed, percent: Math.round((completed / total) * 100) };
  }, [activePlanDetailQuery.data]);

  const outstandingBalance = useMemo(() => {
    const list = invoicesQuery.data ?? [];
    const relevant = list.filter((inv) => inv.status !== 'cancelled' && inv.status !== 'void');
    if (relevant.length === 0) return null;
    const total = relevant.reduce((sum, inv) => sum + Number(inv.amountDue || 0), 0);
    const currency = relevant.find((inv) => inv.currency)?.currency ?? 'USD';
    return { total, currency, count: relevant.length };
  }, [invoicesQuery.data]);

  const age = calcAge(patient?.dateOfBirth);
  const formAge = useMemo(() => calcAge(form.dateOfBirth), [form.dateOfBirth]);
  const sexLabel = patient?.sex ? parseSexLabel(patient.sex, t) : null;
  return (
    <DentalShellPage
      title={patient?.contact.name ?? t('erp.dental.patients.detailTitle', 'Patient')}
      description={t(
        'erp.dental.patients.detailDescription',
        'Clinical profile, timeline, and documents for this patient.',
      )}
    >
      {patientQuery.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('erp.common.loading', 'Loading...')}
        </div>
      ) : patientQuery.isError ? (
        <p className="text-sm text-destructive">{(patientQuery.error as Error).message}</p>
      ) : patient ? (
        <div className="space-y-4">
          {/* ---- Header ---- */}
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-4 min-w-0">
                <ContactAvatar
                  contact={patient.contact}
                  size="lg"
                  showRefreshButton={false}
                  className="shrink-0"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold break-words">{patient.contact.name}</h2>
                    <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10">
                      {t('erp.dental.patients.activePatient', 'Active Patient')}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/80">{formatPatientId(patient.id)}</span>
                    {sexLabel ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{sexLabel}</span>
                      </>
                    ) : null}
                    {age != null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>{t('erp.dental.patients.ageYears', '{{age}} yrs', { age })}</span>
                      </>
                    ) : null}
                    {formatDateShort(patient.dateOfBirth) ? (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {t('erp.dental.patients.fields.dob', 'Date of birth')}:{' '}
                          {formatDateShort(patient.dateOfBirth)}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {patient.contact.phone || t('erp.common.notSpecified', 'Not specified')}
                    </span>
                    <span className="inline-flex items-center gap-1 break-all">
                      <Mail className="h-3 w-3" /> {patient.contact.email || t('erp.common.notSpecified', 'Not specified')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 sm:justify-end">
                {(hasPermission(PERMISSIONS.VIEW_DENTAL_PATIENTS) || canManage) && <ConsentFormsDialog contactId={contactId} />}
                <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.backToList" asChild size="sm" variant="outline">
                  <Link href="/erp/dental/patients" className="inline-flex items-center gap-1.5">
                    <ArrowLeft className="h-4 w-4" />
                    {t('erp.dental.patients.backToList', 'Back to patients')}
                  </Link>
                </Button>
                {canViewChart && (
                  <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.openChart" asChild size="sm">
                    <Link href={`/erp/dental/chart?contactId=${contactId}`} className="inline-flex items-center gap-1.5">
                      <ToothIcon className="h-4 w-4" />
                      {t('erp.dental.patients.openChart', 'Open chart')}
                    </Link>
                  </Button>
                )}
                {canViewTreatmentPlans && (
                  <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.openTreatmentPlans" asChild size="sm" variant="outline">
                    <Link href={`/erp/dental/treatment-plans?contactId=${contactId}`} className="inline-flex items-center gap-1.5">
                      <ClipboardList className="h-4 w-4" />
                      {t('erp.dental.patients.openTreatmentPlans', 'Treatment plans')}
                    </Link>
                  </Button>
                )}
                {canViewSchedule && (
                  <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.schedule" asChild size="sm" variant="outline">
                    <Link href="/erp/dental/schedule" className="inline-flex items-center gap-1.5">
                      <CalendarClock className="h-4 w-4" />
                      {t('erp.dental.patients.schedule', 'Schedule')}
                    </Link>
                  </Button>
                )}
                {canViewInvoices && (
                  <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.invoice" asChild size="sm" variant="outline">
                    <Link href={`/erp/invoices?contactId=${contactId}`} className="inline-flex items-center gap-1.5">
                      <Receipt className="h-4 w-4" />
                      {t('erp.dental.patients.invoice', 'Invoice')}
                    </Link>
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="outline" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setLocation('/contacts')}>
                      <ExternalLink className="h-4 w-4 mr-2" />
                      {t('erp.dental.patients.openInContacts', 'Open in contacts')}
                    </DropdownMenuItem>
                    {canManage && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={removePatientMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                t(
                                  'erp.dental.patients.removeConfirm',
                                  'Remove this patient profile? The contact record is kept.',
                                ),
                              )
                            ) {
                              removePatientMutation.mutate();
                            }
                          }}
                        >
                          <UserMinus className="h-4 w-4 mr-2" />
                          {t('erp.dental.patients.removePatient', 'Remove patient')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>

          {/* ---- 3-column body ---- */}
          <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
            {/* Left rail */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t('erp.dental.patients.summary', 'Patient Summary')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Phone className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="break-all">{patient.contact.phone || t('erp.common.notSpecified', 'Not specified')}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                    <span className="break-all">{patient.contact.email || t('erp.common.notSpecified', 'Not specified')}</span>
                  </div>
                  <div className="flex items-start gap-2 text-muted-foreground">
                    <span className="mt-0.5 text-[11px] uppercase tracking-wide shrink-0">
                      {t('erp.dental.patients.address', 'Address')}
                    </span>
                    <span>{t('erp.common.notSpecified', 'Not specified')}</span>
                  </div>
                  {patient.contact.customFields && Object.keys(patient.contact.customFields).length > 0 ? (
                    <div className="border-t pt-2">
                      <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                        {t('erp.common.contactCustomFields', 'Contact custom fields')}
                      </div>
                      <ContactCustomFieldsBadges
                        customFields={patient.contact.customFields}
                        schema={contactCustomFieldDefinitions}
                        maxVisible={99}
                        showFileName={false}
                      />
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-border/80 bg-card/50 shadow-sm">
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive shadow-inner">
                      <AlertTriangle className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold tracking-tight">{t('erp.dental.patients.alerts', 'Patient Alerts')}</h3>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                        {t('erp.dental.patients.alertsDescription', 'Important health alerts and allergies')}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-center">
                    <Badge variant="destructive" className="min-w-10 justify-center rounded-xl px-3 py-1 text-sm font-semibold">
                      {alerts.length}
                    </Badge>
                    <div className="mt-1 text-[10px] text-muted-foreground">{t('erp.dental.patients.alertsActive', 'Active')}</div>
                  </div>
                </div>

                <div className="mx-3 border-t" />
                <CardContent className="p-0">
                  <div className="compact-scrollbar max-h-[30rem] space-y-2 overflow-y-auto p-3 [scrollbar-gutter:stable]">
                    {alerts.length === 0 ? (
                      <p className="px-1 py-3 text-sm text-muted-foreground">
                        {t('erp.dental.patients.alertsEmpty', 'No active alerts.')}
                      </p>
                    ) : (
                      alerts.map((alert) => (
                        <button
                          key={alert.key}
                          type="button"
                          className="group flex w-full items-center gap-2.5 rounded-lg border border-border/80 border-l-[3px] border-l-amber-400 bg-muted/20 px-2.5 py-2.5 text-left transition-colors hover:bg-amber-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                          onClick={() => openAlertSource(alert.target)}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                            <AlertTriangle className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1 text-sm font-medium leading-5 text-amber-600 dark:text-amber-300">
                            {alert.label}
                          </span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex items-center gap-2 border-t px-4 py-3 text-[11px] leading-4 text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-amber-500" />
                    <span>{t('erp.dental.patients.alertsFooter', 'Keep patient information up to date')}</span>
                  </div>
                </CardContent>
              </Card>

              {canViewChart && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <Activity className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.clinical.timelineTitle', 'Clinical Timeline')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {timelineQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('erp.common.loading', 'Loading...')}
                      </div>
                    ) : clinicalTimelineItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.clinical.timelineEmptyShort', 'No recent events.')}
                      </p>
                    ) : (
                      <ClinicalTimelineList items={clinicalTimelineItems.slice(0, 4)} />
                    )}
                    {clinicalTimelineItems.length > 0 && (
                      <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.viewFullTimeline"
                        variant="secondary"
                        size="sm"
                        className="mt-4 w-full px-6 py-2.5 text-muted-foreground"
                        onClick={() => setActiveTab('notes')}
                      >
                        {t('erp.dental.patients.viewFullTimeline', 'View full timeline')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}

              {canViewImaging && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.recentDocuments', 'Recent Documents')}
                    </CardTitle>
                    {(documentsQuery.data?.length ?? 0) > 0 && (
                      <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.viewAllDocuments"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-sm text-primary"
                        onClick={() => setActiveTab('documents')}
                      >
                        {t('erp.dental.patients.viewAllDocuments', 'View all')}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    {documentsQuery.isLoading ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {t('erp.common.loading', 'Loading...')}
                      </div>
                    ) : recentDocumentItems.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.clinical.documentsEmpty', 'No clinical documents uploaded yet.')}
                      </p>
                    ) : (
                      <RecentDocumentsList items={recentDocumentItems} />
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Center tabs */}
            <Card className="min-w-0">
              <CardContent className="p-4">
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
                  <TabsList>
                    <TabsTrigger data-tour="pages-erp-dental-patient-detail.tabstrigger.profile" value="profile">
                      <UserRound className="h-3.5 w-3.5" />
                      {t('erp.dental.patients.clinicalProfile', 'Clinical profile')}
                    </TabsTrigger>
                    {canViewChart && (
                      <TabsTrigger data-tour="pages-erp-dental-patient-detail.tabstrigger.notes" value="notes">
                        <StickyNote className="h-3.5 w-3.5" />
                        {t('erp.dental.clinical.notesTab', 'Clinical Progress Notes')}
                      </TabsTrigger>
                    )}
                    {canViewImaging && (
                      <TabsTrigger data-tour="pages-erp-dental-patient-detail.tabstrigger.documents" value="documents">
                        <FileText className="h-3.5 w-3.5" />
                        {t('erp.dental.clinical.documentsTitle', 'Clinical documents')}
                      </TabsTrigger>
                    )}
                    {canViewChart && (
                      <TabsTrigger data-tour="pages-erp-dental-patient-detail.tabstrigger.history" value="history">
                        <History className="h-3.5 w-3.5" />
                        {t('erp.dental.patients.historyTab', 'History')}
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {/* Clinical Profile */}
                  <TabsContent data-tour="pages-erp-dental-patient-detail.tabscontent.profile" value="profile" className="mt-4 space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Cake className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.dob', 'Date of birth')}
                        </Label>
                        <Input data-tour="pages-erp-dental-patient-detail.input.erp.dental.patients.fields.dob"
                          type="date"
                          value={form.dateOfBirth}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Hourglass className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.age', 'Age')}
                        </Label>
                        <Input data-tour="pages-erp-dental-patient-detail.input.erp.dental.patients.fields.dob"
                          type="number"
                          min={0}
                          max={199}
                          inputMode="numeric"
                          value={formAge ?? ''}
                          disabled={!canManage}
                          placeholder="—"
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              setForm((f) => ({ ...f, dateOfBirth: '' }));
                              return;
                            }
                            const parsed = Number.parseInt(raw, 10);
                            if (Number.isNaN(parsed) || parsed < 0 || parsed > 199) return;
                            setForm((f) => ({ ...f, dateOfBirth: dobFromAge(parsed) }));
                          }}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.sex', 'Sex')}
                        </Label>
                        <Select
                          value={form.sexOption || undefined}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            setForm((f) => ({
                              ...f,
                              sexOption: value as SexOption,
                              sexOtherDetail: value === 'Other' ? f.sexOtherDetail : '',
                            }))
                          }
                        >
                          <SelectTrigger data-tour="pages-erp-dental-patient-detail.selecttrigger.erp.dental.patients.fields.sexPlaceholder">
                            <SelectValue placeholder={t('erp.dental.patients.fields.sexPlaceholder', 'Select…')} />
                          </SelectTrigger>
                          <SelectContent searchable>
                            {SEX_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {t(`erp.dental.patients.fields.sex.${option.toLowerCase()}`, option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {form.sexOption === 'Other' && (
                          <Input data-tour="pages-erp-dental-patient-detail.input.erp.dental.patients.fields.sexOtherPlaceholder"
                            value={form.sexOtherDetail}
                            disabled={!canManage}
                            onChange={(e) => setForm((f) => ({ ...f, sexOtherDetail: e.target.value }))}
                            placeholder={t('erp.dental.patients.fields.sexOtherPlaceholder', 'Please specify (optional)')}
                          />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Droplets className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.bloodGroup', 'Blood group')}
                        </Label>
                        <Select
                          value={form.bloodGroup || undefined}
                          disabled={!canManage}
                          onValueChange={(value) => setForm((f) => ({ ...f, bloodGroup: value }))}
                        >
                          <SelectTrigger data-tour="pages-erp-dental-patient-detail.selecttrigger.erp.dental.patients.fields.bloodGroupPlaceholder">
                            <SelectValue placeholder={t('erp.dental.patients.fields.bloodGroupPlaceholder', 'Select…')} />
                          </SelectTrigger>
                          <SelectContent searchable>
                            {BLOOD_GROUP_OPTIONS.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div id="patient-allergies" className="scroll-mt-4">
                      <AllergiesSelector
                        value={form.allergies}
                        disabled={!canManage}
                        t={t}
                        onChange={(allergies) => setForm((f) => ({ ...f, allergies }))}
                      />
                    </div>

                    <PatientMedicalHistory
                      contactId={contactId}
                      value={form.medicalHistoryDetails}
                      onChange={(medicalHistoryDetails) => setForm((f) => ({ ...f, medicalHistoryDetails }))}
                      canManage={canManage}
                      patientAge={formAge}
                      vitals={vitalsQuery.data?.records ?? []}
                      companyTimezone={vitalsQuery.data?.timezone ?? 'UTC'}
                      tests={testsQuery.data ?? []}
                      t={t}
                      focusRequest={
                        alertFocusRequest && alertFocusRequest.section !== 'allergies'
                          ? { section: alertFocusRequest.section, requestId: alertFocusRequest.requestId }
                          : null
                      }
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <HeartPulse className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.medicalHistory', 'Additional medical history notes')}
                        </Label>
                        <Textarea data-tour="pages-erp-dental-patient-detail.textarea.erp.dental.patients.fields.medicalHistory"
                          value={form.medicalHistorySummary}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, medicalHistorySummary: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Pill className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.currentMedications', 'Current medications')}
                        </Label>
                        <Textarea data-tour="pages-erp-dental-patient-detail.textarea.erp.dental.patients.fields.medicalHistory"
                          value={form.currentMedications}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, currentMedications: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Smile className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.dentalHistory', 'Dental history summary')}
                        </Label>
                        <Textarea data-tour="pages-erp-dental-patient-detail.textarea.erp.dental.patients.fields.medicalHistory"
                          value={form.dentalHistorySummary}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, dentalHistorySummary: e.target.value }))}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <ClipboardCheck className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.previousDentalTreatments', 'Previous dental treatments')}
                        </Label>
                        <Textarea data-tour="pages-erp-dental-patient-detail.textarea.erp.dental.patients.fields.medicalHistory"
                          value={form.previousDentalTreatments}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, previousDentalTreatments: e.target.value }))}
                          rows={3}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Contact className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.emergencyName', 'Emergency contact name')}
                        </Label>
                        <Input data-tour="pages-erp-dental-patient-detail.input.erp.dental.patients.fields.emergencyName"
                          value={form.emergencyContactName}
                          disabled={!canManage}
                          onChange={(e) => setForm((f) => ({ ...f, emergencyContactName: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                          {t('erp.dental.patients.fields.emergencyPhone', 'Emergency contact phone')}
                        </Label>
                        <LocalizedPhoneInput
                          value={form.emergencyContactPhone}
                          disabled={!canManage}
                          onChange={(emergencyContactPhone) => setForm((f) => ({ ...f, emergencyContactPhone }))}
                        />
                      </div>
                    </div>

                    {contactCustomFieldDefinitions.length > 0 ? (
                      <div className="rounded-md border p-4 space-y-3">
                        <div>
                          <h3 className="text-sm font-semibold">
                            {t('erp.dental.patients.contactCustomFields', 'Contact custom fields')}
                          </h3>
                          <p className="text-xs text-muted-foreground">
                            {canManageContacts
                              ? t('erp.dental.patients.contactCustomFieldsHelp', 'These values are shared with the contact record.')
                              : t('erp.dental.patients.contactCustomFieldsReadOnly', 'Manage contacts permission is required to edit these values.')}
                          </p>
                        </div>
                        <ContactCustomFieldsEditor
                          definitions={contactCustomFieldDefinitions}
                          values={contactCustomFieldValues}
                          onChange={setContactCustomFieldValues}
                          disabled={!canManageContacts}
                          ownerType="contact"
                          ownerId={contactId}
                        />
                      </div>
                    ) : null}

                    {(canManage || canManageContacts) && (
                      <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.saveChanges"
                        onClick={() => saveMutation.mutate()}
                        disabled={
                          saveMutation.isPending ||
                          (!profileHasChanges && !customFieldsHaveChanges) ||
                          (canManage && profileHasChanges && !form.sexOption) ||
                          (canManageContacts && customFieldsHaveChanges && missingRequiredCustomFields.length > 0)
                        }
                        className="gap-1.5"
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        {t('erp.dental.patients.saveChanges', 'Save changes')}
                      </Button>
                    )}
                  </TabsContent>

                  {/* Clinical Notes */}
                  {canViewChart && (
                    <TabsContent data-tour="pages-erp-dental-patient-detail.tabscontent.notes" value="notes" className="mt-4">
                      <ClinicalProgressNotes contactId={contactId} />
                    </TabsContent>
                  )}
                  {/* Documents */}
                  {canViewImaging && (
                    <TabsContent data-tour="pages-erp-dental-patient-detail.tabscontent.documents" value="documents" className="mt-4 space-y-4">
                      {canManageImaging && (
                        <div className="rounded-md border p-3 space-y-3">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                            {t('erp.dental.clinical.uploadDocument', 'Upload document')}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="flex items-center gap-1.5">
                                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                                {t('erp.dental.clinical.documentCategory', 'Category')}
                              </Label>
                              <Select value={docCategory} onValueChange={setDocCategory}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent searchable>
                                  {DENTAL_CLINICAL_DOCUMENT_CATEGORIES.map((category) => (
                                    <SelectItem key={category} value={category}>
                                      {clinicalCategoryLabel(category, t)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="flex items-center gap-1.5">
                                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                {t('erp.dental.clinical.documentFile', 'File')}
                              </Label>
                              <Input data-tour="pages-erp-dental-patient-detail.input.erp.dental.clinical.documentCategory"
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,image/*,.doc,.docx,.txt"
                                onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5">
                              <AlignLeft className="h-3.5 w-3.5 text-muted-foreground" />
                              {t('erp.dental.clinical.documentDescription', 'Description (optional)')}
                            </Label>
                            <Input data-tour="pages-erp-dental-patient-detail.input.erp.dental.clinical.documentCategory"
                              value={docDescription}
                              onChange={(e) => setDocDescription(e.target.value)}
                            />
                          </div>
                          <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.clinical.uploadDocument"
                            onClick={() => uploadDocMutation.mutate()}
                            disabled={!docFile || uploadDocMutation.isPending}
                            className="gap-1.5"
                          >
                            {uploadDocMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                            {t('erp.dental.clinical.uploadDocument', 'Upload document')}
                          </Button>
                        </div>
                      )}

                      {documentsQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('erp.common.loading', 'Loading...')}
                        </div>
                      ) : (documentsQuery.data?.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('erp.dental.clinical.documentsEmpty', 'No clinical documents uploaded yet.')}
                        </p>
                      ) : (
                        <Table data-tour="pages-erp-dental-patient-detail.table.erp.dental.clinical.colName">
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('erp.dental.clinical.colName', 'Name')}</TableHead>
                              <TableHead>{t('erp.dental.clinical.colCategory', 'Category')}</TableHead>
                              <TableHead>{t('erp.dental.clinical.colUploaded', 'Uploaded')}</TableHead>
                              <TableHead className="w-[100px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {documentsQuery.data?.map((doc) => (
                              <TableRow key={doc.id}>
                                <TableCell>
                                  <a
                                    href={doc.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline"
                                  >
                                    <FileText className="h-4 w-4 shrink-0" />
                                    <span className="truncate max-w-[200px]">{doc.originalName}</span>
                                  </a>
                                </TableCell>
                                <TableCell>{clinicalCategoryLabel(doc.category, t)}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {formatWhen(doc.createdAt)}
                                </TableCell>
                                <TableCell>
                                  {canManageImaging && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => deleteDocMutation.mutate(doc.id)}
                                      disabled={deleteDocMutation.isPending}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </TabsContent>
                  )}

                  {/* History (chart snapshots) */}
                  {canViewChart && (
                    <TabsContent data-tour="pages-erp-dental-patient-detail.tabscontent.history" value="history" className="mt-4 space-y-3">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        <History className="h-3.5 w-3.5 text-muted-foreground" />
                        {t('erp.dental.patients.historyTab', 'History')}
                      </div>
                      {chartHistoryQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          {t('erp.common.loading', 'Loading...')}
                        </div>
                      ) : (chartHistoryQuery.data?.length ?? 0) === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          {t('erp.dental.patients.historyEmpty', 'No chart snapshots saved yet.')}
                        </p>
                      ) : (
                        <Table data-tour="pages-erp-dental-patient-detail.table.erp.dental.patients.historyVersion">
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t('erp.dental.patients.historyVersion', 'Version')}</TableHead>
                              <TableHead>{t('erp.dental.patients.historyNumbering', 'Numbering')}</TableHead>
                              <TableHead>{t('erp.dental.clinical.colUploaded', 'Uploaded')}</TableHead>
                              <TableHead className="w-[120px]" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {chartHistoryQuery.data?.map((entry) => (
                              <TableRow key={entry.id}>
                                <TableCell>
                                  <Badge variant="outline">v{entry.version}</Badge>
                                </TableCell>
                                <TableCell>{entry.numberingSystem}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">
                                  {formatWhen(entry.createdAt)}
                                </TableCell>
                                <TableCell>
                                  <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.openChart" asChild size="sm" variant="link" className="h-auto p-0">
                                    <Link
                                      href={`/erp/dental/chart?contactId=${contactId}`}
                                      className="inline-flex items-center gap-1.5"
                                    >
                                      <ToothIcon className="h-3.5 w-3.5" />
                                      {t('erp.dental.patients.openChart', 'Open chart')}
                                    </Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </TabsContent>
                  )}
                </Tabs>
              </CardContent>
            </Card>

            {/* Right rail */}
            <div className="space-y-4">
              {/* Next appointment */}
              {canViewSchedule && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <CalendarClock className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.nextAppointment', 'Next Appointment')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {scheduleQuery.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : nextAppointment ? (
                      <div className="space-y-0.5">
                        <div className="text-lg font-semibold">
                          {formatDateShort(nextAppointment.scheduledAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimeShort(nextAppointment.scheduledAt)} · {nextAppointment.title}
                        </div>
                        {nextAppointment.providerName ? (
                          <div className="text-xs text-muted-foreground">{nextAppointment.providerName}</div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.patients.noUpcomingAppointment', 'No upcoming appointments.')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Treatment plan */}
              {canViewTreatmentPlans && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.treatmentPlanCard', 'Treatment Plan')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {treatmentPlansQuery.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : activePlan ? (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{activePlan.title}</span>
                          <Badge variant="secondary" className="shrink-0">
                            {planStatusLabel(activePlan.status, t)}
                          </Badge>
                        </div>
                        {activePlanDetailQuery.isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : planProgress ? (
                          <div className="space-y-1">
                            <Progress value={planProgress.percent} className="h-2 bg-muted" />
                            <div className="text-xs text-muted-foreground">
                              {t('erp.dental.patients.planProgress', '{{done}} of {{total}} procedures completed', {
                                done: planProgress.completed,
                                total: planProgress.total,
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">
                            {t('erp.dental.patients.planNoProcedures', 'No procedures on this plan yet.')}
                          </div>
                        )}
                        <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.viewPlan" asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                          <Link href={`/erp/dental/treatment-plans?contactId=${contactId}`}>
                            {t('erp.dental.patients.viewPlan', 'View treatment plan')}
                          </Link>
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.patients.noTreatmentPlan', 'No treatment plan yet.')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Outstanding balance */}
              {canViewInvoices && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.outstandingBalance', 'Outstanding Balance')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {invoicesQuery.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : outstandingBalance == null ? (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.patients.noInvoices', 'No invoices yet.')}
                      </p>
                    ) : (
                      <div className="space-y-0.5">
                        <div
                          className={cn(
                            'text-2xl font-bold',
                            outstandingBalance.total > 0 ? 'text-destructive' : 'text-emerald-500',
                          )}
                        >
                          {formatMoney(outstandingBalance.total, outstandingBalance.currency)}
                        </div>
                        <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.viewInvoices" asChild size="sm" variant="link" className="h-auto p-0 text-xs">
                          <Link href={`/erp/invoices?contactId=${contactId}`}>
                            <Receipt className="h-3 w-3 mr-1" />
                            {t('erp.dental.patients.viewInvoices', 'View invoices')}
                          </Link>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Latest clinical note */}
              {canViewChart && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <StickyNote className="h-4 w-4 text-muted-foreground" />
                      {t('erp.dental.patients.latestNote', 'Latest Clinical Note')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {timelineQuery.isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : latestNote ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{noteTypeLabel(latestNote.noteType, t)}</Badge>
                          <span className="text-[11px] text-muted-foreground">{formatWhen(latestNote.createdAt)}</span>
                        </div>
                        <p className="line-clamp-4 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {latestNote.body}
                        </p>
                        <Button data-tour="pages-erp-dental-patient-detail.button.erp.dental.patients.viewAllNotes"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-xs"
                          onClick={() => setActiveTab('notes')}
                        >
                          {t('erp.dental.patients.viewAllNotes', 'View all notes')}
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {t('erp.dental.clinical.notesEmpty', 'No clinical notes yet.')}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </DentalShellPage>
  );
}

function parseSexLabel(stored: string, t: (key: string, fallback: string) => string): string {
  const parsed = parseSex(stored);
  if (!parsed.sexOption) return stored;
  if (parsed.sexOption === 'Other') {
    const base = t('erp.dental.patients.fields.sex.other', 'Other');
    return parsed.sexOtherDetail ? `${base} — ${parsed.sexOtherDetail}` : base;
  }
  return t(`erp.dental.patients.fields.sex.${parsed.sexOption.toLowerCase()}`, parsed.sexOption);
}

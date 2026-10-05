import { useQuickAction } from '@/hooks/use-quick-action';
import { ReminderBatchesDialog } from '@/components/erp/dental/ReminderBatchesDialog';
import { useDentalTimezone } from '@/hooks/use-dental-timezone';
import type { DentalTimezoneStatus } from '@shared/types/dental-timezone';
import { useEffect, useMemo, useRef, useState } from 'react';
import { enUS, es as esLocale } from 'date-fns/locale';
import { Link, useLocation } from 'wouter';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DentalShellPage } from './dental-shell';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CalendarDays,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Clock3,
  Download,
  Eye,
  FileText,
  Loader2,
  EllipsisVertical,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Search,
  Trash2,
  Tickets,
  UserPlus,
  XCircle,
  BellRing,
  Save,
  Variable,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getDentalAppointmentColorStyle,
  isMutedDentalAppointment,
} from '@/lib/dentalAppointmentColors';
import { DentalOfficeEditor, type DentalOffice } from '@/components/erp/dental/DentalOfficeEditor';
import { AddDentalPatientDialog } from '@/components/erp/dental/AddDentalPatientDialog';
import {
  DEFAULT_DENTAL_SLOT_STEP_MINUTES,
  resolveProviderDaySchedules,
  formatProviderWithSpecialties,
  type DentalBookingPolicy,
} from '@shared/types/dental-booking-types';
import { getZonedDateTimeParts } from '@shared/utils/agent-schedule';
import {
  buildDentalScheduleSearchParams,
  DEFAULT_DENTAL_SCHEDULE_SORT_COLUMN,
  DEFAULT_DENTAL_SCHEDULE_SORT_DIRECTION,
  sortDentalScheduleRows,
  type DentalScheduleSortColumn,
  type DentalScheduleSortDirection,
} from '@shared/types/dental-schedule-query';
import {
  addDaysToDateKey,
  escapeDentalScheduleCsv,
  formatDentalCalendarTime,
  getDentalCalendarRange,
  type DentalCalendarView,
} from '@shared/types/dental-schedule-calendar';
import { DentalScheduleCalendar } from '@/components/erp/dental/DentalScheduleCalendar';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { useActiveChannel, useChannelInfo } from '@/contexts/ActiveChannelContext';
import { useConversations } from '@/context/ConversationContext';
import { AppointmentMessageIcon } from '@/components/icons/AppointmentMessageIcon';
import type { WhatsAppTemplate } from '@/types/whatsapp-template';
import { WhatsAppTemplatePreview } from '@/components/templates/WhatsAppTemplatePreview';
import { WhatsAppTemplateVariableDialog } from '@/components/templates/WhatsAppTemplateVariableDialog';
import {
  getTemplateVariables,
  templateVariableHasValue,
  toTemplateComponentValues,
  translatedTemplateValidationError,
} from '@/lib/whatsapp-template-ui';

type TeamMember = { id: number; fullName?: string; username?: string };
type Chair = { id: number; code: string; name: string; sortOrder: number; isActive: boolean };
type ScheduleRow = {
  id: number;
  contactId: number;
  title: string;
  description: string | null;
  location: string | null;
  scheduledAt: string;
  durationMinutes: number | null;
  type: string;
  status: string;
  providerUserId: number | null;
  chairId: number | null;
  isRecall: boolean;
  recallDueAt: string | null;
  holdExpiresAt: string | null;
  contactName: string | null;
  contactAvatarUrl: string | null;
  contactPhone: string | null;
  providerName: string | null;
  providerAvatarUrl: string | null;
  chairName: string | null;
  bookingServiceKey: string | null;
  bookingServiceLabel: string | null;
  calendarColor: string | null;
  scheduleOverrideReason: string | null;
  scheduleOverrideKinds: string[] | null;
  scheduleOverriddenBy: number | null;
  scheduleOverriddenAt: string | null;
};

type ManualSlot = { scheduledAt: string; localTime: string; availableChairIds: number[] };
type ManualAvailability = {
  timezone: string;
  date: string;
  durationMinutes: number;
  requiresChair: boolean;
  specialtyOverrideRequired: boolean;
  slots: ManualSlot[];
};
type SlotEvaluation = {
  scheduledAt: string;
  timezone: string;
  durationMinutes: number;
  requiresChair: boolean;
  availableChairIds: number[];
  hardConflicts: Array<{ code: string; message: string }>;
  overrideViolations: Array<{ code: string; message: string }>;
};
type ReminderQuickTemplate = { id: number; name: string; content: string; usageCount?: number };
type ReminderTemplateMode = 'normal' | 'official';

const STATUS_OPTIONS = ['scheduled', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'] as const;
const STATUS_LABELS = {
  scheduled: ['erp.dental.schedule.statuses.scheduled', 'Scheduled'],
  confirmed: ['erp.dental.schedule.statuses.confirmed', 'Confirmed'],
  completed: ['erp.dental.schedule.statuses.completed', 'Completed'],
  cancelled: ['erp.dental.schedule.statuses.cancelled', 'Cancelled'],
  rescheduled: ['erp.dental.schedule.statuses.rescheduled', 'Rescheduled'],
  no_show: ['erp.dental.schedule.statuses.noShow', 'No-show'],
  held: ['erp.dental.schedule.statuses.held', 'Held'],
  pending_request: ['erp.dental.schedule.statuses.pendingRequest', 'Pending request'],
} as const;
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function toDateInputValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(iso: string, locale?: string, timezone?: string) {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  });
}

function fromDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatDatePickerValue(value: string) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function getPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, 4, 'ellipsis', totalPages];
  if (currentPage >= totalPages - 2) {
    return [1, 'ellipsis', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, 'ellipsis', currentPage - 1, currentPage, currentPage + 1, 'ellipsis', totalPages];
}

function zonedDateTimeParts(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    time: `${value('hour')}:${value('minute')}`,
  };
}

function isAwaitingStaff(status: string) {
  return status === 'held' || status === 'pending_request';
}

function statusPillClass(status: string) {
  if (status === 'scheduled') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (status === 'confirmed') return 'bg-blue-500/15 text-blue-600 dark:text-blue-400';
  if (status === 'completed') return 'bg-violet-500/15 text-violet-600 dark:text-violet-400';
  if (status === 'cancelled' || status === 'no_show') return 'bg-red-500/15 text-red-600 dark:text-red-400';
  if (status === 'rescheduled' || status === 'held') return 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
  if (status === 'pending_request') return 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
  return 'bg-muted text-muted-foreground';
}

function isCapacityBlockingStatus(status: string) {
  return status === 'scheduled' || status === 'confirmed' || status === 'held' || status === 'pending_request';
}

export default function DentalSchedulePage() {
  const { t, currentLanguage } = useTranslation();
  const { user } = useAuth();
  const locale = currentLanguage?.code?.replace('_', '-') || undefined;
  const calendarLocale = locale?.toLowerCase().startsWith('es') ? esLocale : enUS;
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_SCHEDULE);
  const [reminderBatchesOpen, setReminderBatchesOpen] = useState(false);
  const canManagePatients = hasPermission(PERMISSIONS.MANAGE_DENTAL_PATIENTS);
  const canMessage = hasPermission(PERMISSIONS.MANAGE_CONVERSATIONS);
  const canManageReminderTemplates = hasPermission(PERMISSIONS.MANAGE_TEMPLATES);
  const [, setLocation] = useLocation();
  const { data: channelConnections = [] } = useChannelConnections();
  const { getChannelDisplayName, getChannelIcon } = useChannelInfo();
  const { setActiveChannelId: setGlobalActiveChannelId } = useActiveChannel();
  const { setActiveChannelId: setConversationActiveChannelId } = useConversations();
  const queryClient = useQueryClient();
  const statusLabel = (status: string) => {
    const translation = STATUS_LABELS[status as keyof typeof STATUS_LABELS];
    return translation ? t(translation[0], translation[1]) : status;
  };

  const [day, setDay] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<DentalCalendarView>('month');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [providerFilter, setProviderFilter] = useState<string>('all');
  const [chairFilter, setChairFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<string>('all');
  const [tableSearch, setTableSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<DentalScheduleSortColumn>(DEFAULT_DENTAL_SCHEDULE_SORT_COLUMN);
  const [sortDirection, setSortDirection] = useState<DentalScheduleSortDirection>(DEFAULT_DENTAL_SCHEDULE_SORT_DIRECTION);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [tableScope, setTableScope] = useState<'range' | 'upcoming'>('range');
  const appointmentsTableRef = useRef<HTMLDivElement>(null);
  const [chairsOpen, setChairsOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [patientPickerOpen, setPatientPickerOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [debouncedPatientSearch, setDebouncedPatientSearch] = useState('');
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [walkInMode, setWalkInMode] = useState(false);

  const [selectedPatientName, setSelectedPatientName] = useState('');

  const [formContactId, setFormContactId] = useState<string>('');
  const [formDate, setFormDate] = useState(() => toDateInputValue(new Date()));
  const [formTitle, setFormTitle] = useState('');
  const [formCatalogItemId, setFormCatalogItemId] = useState('');
  const [formTime, setFormTime] = useState('09:00');
  const [formProviderId, setFormProviderId] = useState<string>('none');
  const [formChairId, setFormChairId] = useState<string>('none');
  const [formStatus, setFormStatus] = useState<string>('scheduled');
  const [formIsRecall, setFormIsRecall] = useState(false);
  const [formNotes, setFormNotes] = useState('');
  const [formCalendarColor, setFormCalendarColor] = useState<string | null>(null);

  const [officeEditor, setOfficeEditor] = useState<{ office: DentalOffice | null } | null>(null);
  const [assignmentOverrideOpen, setAssignmentOverrideOpen] = useState(false);
  const [pendingViolations, setPendingViolations] = useState<string[]>([]);
  const [overrideMode, setOverrideMode] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [pendingScheduledAt, setPendingScheduledAt] = useState<string | null>(null);
  const [schedulingTouched, setSchedulingTouched] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{
    id: number;
    patientLabel: string;
    timeLabel: string;
  } | null>(null);
  const [messageTarget, setMessageTarget] = useState<ScheduleRow | null>(null);
  const [reminderTarget, setReminderTarget] = useState<ScheduleRow | null>(null);
  const [reminderContent, setReminderContent] = useState('');
  const [reminderConversationId, setReminderConversationId] = useState<string>('');
  const [reminderTemplateId, setReminderTemplateId] = useState<number | null>(null);
  const [reminderTemplatePickerOpen, setReminderTemplatePickerOpen] = useState(false);
  const [reminderTemplateCreatorOpen, setReminderTemplateCreatorOpen] = useState(false);
  const [reminderTemplateName, setReminderTemplateName] = useState('');
  const [reminderTemplateEditing, setReminderTemplateEditing] = useState<ReminderQuickTemplate | null>(null);
  const [reminderTemplateToDelete, setReminderTemplateToDelete] = useState<ReminderQuickTemplate | null>(null);
  const [reminderTemplateMode, setReminderTemplateMode] = useState<ReminderTemplateMode>('normal');
  const [officialReminderTemplateId, setOfficialReminderTemplateId] = useState<number | null>(null);
  const [officialReminderValues, setOfficialReminderValues] = useState<Record<string, string>>({});
  const [officialVariableDialogOpen, setOfficialVariableDialogOpen] = useState(false);

  const timezoneQuery = useDentalTimezone();
  const companyTimezone = timezoneQuery.data?.timezone || 'UTC';

  useEffect(() => {
    if (!timezoneQuery.data || day) return;
    setDay(getZonedDateTimeParts(new Date(), companyTimezone).dateKey);
  }, [companyTimezone, day, timezoneQuery.data]);

  const visibleRange = useMemo(
    () => getDentalCalendarRange(calendarView, day || getZonedDateTimeParts(new Date(), companyTimezone).dateKey),
    [calendarView, companyTimezone, day],
  );

  const chairsQuery = useQuery({
    queryKey: ['/api/erp/dental/chairs'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/chairs');
      if (!res.ok) throw new Error('Failed to load offices');
      const json = await res.json();
      return (json.data ?? []) as Chair[];
    },
  });

  const policyQuery = useQuery({
    queryKey: ['/api/erp/dental/booking/settings', 'schedule'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/booking/settings');
      if (!res.ok) throw new Error('Failed to load booking settings');
      const json = await res.json();
      return json.data as DentalBookingPolicy;
    },
  });

  const scheduleQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule', visibleRange.from, visibleRange.to, providerFilter, chairFilter],
    queryFn: async () => {
      const params = buildDentalScheduleSearchParams({
        fromDate: visibleRange.from,
        toDate: visibleRange.to,
        providerUserId: providerFilter,
        chairId: chairFilter,
      });
      const res = await apiRequest('GET', `/api/erp/dental/schedule?${params}`);
      if (!res.ok) throw new Error('Failed to load schedule');
      const json = await res.json();
      return { rows: (json.data ?? []) as ScheduleRow[], timezone: String(json.timezone || 'UTC') };
    },
    enabled: Boolean(day && timezoneQuery.data),
  });

  const buildUpcomingParams = (limit: number, offset = 0, includeTableState = false) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (providerFilter !== 'all') params.set('providerUserId', providerFilter);
    if (chairFilter !== 'all') params.set('chairId', chairFilter);
    if (serviceFilter !== 'all') params.set('serviceKey', serviceFilter);
    if (includeTableState) {
      if (tableSearch.trim()) params.set('search', tableSearch.trim());
      if (locale) params.set('locale', locale);
      params.set('sortBy', sortColumn);
      params.set('sortOrder', sortDirection);
    }
    return params;
  };

  const upcomingPreviewQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule/upcoming', 'preview', providerFilter, chairFilter, serviceFilter],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/erp/dental/schedule/upcoming?${buildUpcomingParams(5)}`);
      if (!response.ok) throw new Error('Failed to load upcoming appointments');
      return response.json() as Promise<{ data: ScheduleRow[]; total: number; timezone: string }>;
    },
    enabled: Boolean(timezoneQuery.data),
  });

  const upcomingTableQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule/upcoming', 'table', providerFilter, chairFilter, serviceFilter, tableSearch, locale, sortColumn, sortDirection, page, pageSize],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/erp/dental/schedule/upcoming?${buildUpcomingParams(pageSize, (page - 1) * pageSize, true)}`);
      if (!response.ok) throw new Error('Failed to load upcoming appointments');
      return response.json() as Promise<{ data: ScheduleRow[]; total: number; timezone: string }>;
    },
    enabled: tableScope === 'upcoming' && Boolean(timezoneQuery.data),
  });

  const teamQuery = useQuery({
    queryKey: ['/api/team-members', 'dental-schedule'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      if (!res.ok) throw new Error('Failed to load team');
      return (await res.json()) as TeamMember[];
    },
  });

  const patientsQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule/patient-options', debouncedPatientSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (debouncedPatientSearch.trim()) params.set('search', debouncedPatientSearch.trim());
      const res = await apiRequest('GET', `/api/erp/dental/schedule/patient-options?${params}`);
      if (!res.ok) throw new Error('Failed to load patients');
      const json = await res.json();
      return (json.data ?? []) as Array<{ contactId: number; name: string }>;
    },
    enabled: editorOpen,
  });

  const selectedCatalogItem = useMemo(
    () => policyQuery.data?.bookableCatalog.find((item) => item.id === formCatalogItemId && item.isActive),
    [policyQuery.data, formCatalogItemId],
  );

  const bookableProviders = useMemo(() => {
    const policy = policyQuery.data;
    if (!policy) return [];
    const roster = new Set(policy.bookableDentistUserIds);
    return teamQuery.data
      ?.filter((member) => roster.has(member.id) || member.id === editing?.providerUserId)
      .map((member) => ({
        ...member,
        rostered: roster.has(member.id),
        specialtyMatch: selectedCatalogItem
          ? policy.specialistProfiles.some(
              (profile) => profile.userId === member.id && profile.specialtyIds.includes(selectedCatalogItem.specialtyId),
            )
          : true,
      }))
      .sort((a, b) => Number(b.rostered) - Number(a.rostered) || Number(b.specialtyMatch) - Number(a.specialtyMatch)) ?? [];
  }, [editing?.providerUserId, policyQuery.data, selectedCatalogItem, teamQuery.data]);

  const slotStepMinutes = policyQuery.data?.slotStepMinutes ?? DEFAULT_DENTAL_SLOT_STEP_MINUTES;
  const formDayIndex = formDate ? new Date(`${formDate}T12:00:00Z`).getUTCDay() : -1;
  const formProviderDay = policyQuery.data && formProviderId !== 'none'
    ? resolveProviderDaySchedules(policyQuery.data, Number(formProviderId)).find((entry) => entry.dayIndex === formDayIndex)
    : undefined;
  // Native time inputs use min as their step base, matching provider-relative availability.
  const timeGridStart = formProviderDay?.enabled ? formProviderDay.startTime : '00:00';

  const canLoadAvailability =
    editorOpen &&
    !overrideMode &&
    isCapacityBlockingStatus(formStatus) &&
    Boolean(formContactId && formCatalogItemId && formProviderId !== 'none' && formDate);

  const availabilityQuery = useQuery({
    queryKey: [
      '/api/erp/dental/schedule/availability',
      slotStepMinutes,
      formDate,
      formContactId,
      formProviderId,
      formCatalogItemId,
      editing?.id ?? null,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        date: formDate,
        contactId: formContactId,
        providerUserId: formProviderId,
        catalogItemId: formCatalogItemId,
      });
      if (editing) params.set('appointmentId', String(editing.id));
      const res = await apiRequest('GET', `/api/erp/dental/schedule/availability?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load available times');
      return json.data as ManualAvailability;
    },
    enabled: canLoadAvailability,
  });

  const customSlotQuery = useQuery({
    queryKey: [
      '/api/erp/dental/schedule/validate-slot',
      slotStepMinutes,
      formDate,
      formTime,
      formContactId,
      formProviderId,
      formCatalogItemId,
      formChairId,
      editing?.id ?? null,
    ],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/erp/dental/schedule/validate-slot', {
        date: formDate,
        time: formTime,
        contactId: Number(formContactId),
        providerUserId: Number(formProviderId),
        catalogItemId: formCatalogItemId,
        chairId: formChairId === 'none' ? null : Number(formChairId),
        appointmentId: editing?.id,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to validate appointment time');
      return json.data as SlotEvaluation;
    },
    enabled:
      editorOpen &&
      (overrideMode || !isCapacityBlockingStatus(formStatus)) &&
      Boolean(formContactId && formCatalogItemId && formProviderId !== 'none' && formDate && formTime),
  });

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedPatientSearch(patientSearch.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [patientSearch]);

  const activeChairs = useMemo(
    () => (chairsQuery.data ?? []).filter((c) => c.isActive),
    [chairsQuery.data],
  );

  const selectedSlot = useMemo(
    () => availabilityQuery.data?.slots.find((slot) => slot.localTime === formTime),
    [availabilityQuery.data, formTime],
  );
  const usesCustomTime = overrideMode || !isCapacityBlockingStatus(formStatus);
  const selectableChairIds = usesCustomTime
    ? (customSlotQuery.data?.availableChairIds ?? [])
    : (selectedSlot?.availableChairIds ?? []);
  const selectableChairs = activeChairs.filter((chair) => selectableChairIds.includes(chair.id));
  const requiresChair = usesCustomTime
    ? isCapacityBlockingStatus(formStatus) && Boolean(customSlotQuery.data?.requiresChair)
    : Boolean(availabilityQuery.data?.requiresChair);

  const selectedPatient = useMemo(() => {
    if (formContactId && selectedPatientName) {
      return { contactId: Number(formContactId), name: selectedPatientName };
    }
    const fromList = (patientsQuery.data ?? []).find((p) => String(p.contactId) === formContactId);
    if (fromList) return fromList;
    if (editing && String(editing.contactId) === formContactId) {
      return { contactId: editing.contactId, name: editing.contactName || `#${editing.contactId}` };
    }
    return undefined;
  }, [patientsQuery.data, formContactId, selectedPatientName, editing]);

  function handlePatientSearchChange(value: string) {
    setPatientSearch(value);
    if (formContactId && value.trim() !== selectedPatientName.trim()) {
      setFormContactId('');
      setSelectedPatientName('');
    }
  }

  function resetForm(row?: ScheduleRow | null) {
    if (row) {
      const parts = zonedDateTimeParts(row.scheduledAt, scheduleQuery.data?.timezone ?? 'UTC');
      setFormContactId(String(row.contactId));
      setFormDate(parts.date);
      setFormTitle(row.title);
      setFormCatalogItemId(row.bookingServiceKey ?? '');
      setFormTime(parts.time);
      setFormProviderId(row.providerUserId != null ? String(row.providerUserId) : 'none');
      setFormChairId(row.chairId != null ? String(row.chairId) : 'none');
      setFormStatus(row.status || 'scheduled');
      setFormIsRecall(Boolean(row.isRecall));
      setFormNotes(row.description ?? '');
      setFormCalendarColor(row.calendarColor ?? null);
      setOverrideMode(Boolean(row.scheduleOverrideKinds?.length));
      setOverrideReason(row.scheduleOverrideReason ?? '');
    } else {
      setFormContactId('');
      setSelectedPatientName('');
      const timezone = scheduleQuery.data?.timezone;
      setFormDate(
        day ?? (timezone
          ? getZonedDateTimeParts(new Date(), timezone).dateKey
          : toDateInputValue(new Date())),
      );
      setFormTitle('');
      setFormCatalogItemId('');
      setFormTime('09:00');
      setFormProviderId(
        providerFilter !== 'all' && policyQuery.data?.bookableDentistUserIds.includes(Number(providerFilter))
          ? providerFilter
          : 'none',
      );
      setFormChairId(chairFilter !== 'all' ? chairFilter : 'none');
      setFormStatus('scheduled');
      setFormIsRecall(false);
      setFormNotes('');
      setFormCalendarColor(null);
      setOverrideMode(false);
      setOverrideReason('');
    }
    setPendingScheduledAt(null);
    setSchedulingTouched(false);
  }

  function openCreate(prefill?: { date?: string; time?: string; chairId?: number | null; patient?: { contactId: number; name: string } }) {
    setEditing(null);
    resetForm(null);
    if (prefill?.date) setFormDate(prefill.date);
    if (prefill?.time) setFormTime(prefill.time);
    if (prefill?.chairId !== undefined) setFormChairId(prefill.chairId == null ? 'none' : String(prefill.chairId));
    if (prefill?.patient) {
      setFormContactId(String(prefill.patient.contactId));
      setSelectedPatientName(prefill.patient.name);
      setPatientSearch(prefill.patient.name);
    } else {
      setPatientSearch('');
      setSelectedPatientName('');
    }
    setPatientPickerOpen(false);
    setEditorOpen(true);
  }

  function openEdit(row: ScheduleRow) {
    setEditing(row);
    resetForm(row);
    setPatientSearch(row.contactName || '');
    setPatientPickerOpen(false);
    setEditorOpen(true);
  }

  const saveMutation = useMutation({
    mutationFn: async ({ scheduledAt, reason }: { scheduledAt: string; reason?: string }) => {
      if (editing && isAwaitingStaff(editing.status)) {
        throw new Error('Use Confirm/Approve or Decline on the schedule board for this booking.');
      }
      const body: Record<string, unknown> = {
        contactId: Number(formContactId),
        title: formTitle.trim() || selectedCatalogItem?.label,
        description: formNotes.trim() || null,
        status: formStatus,
        isRecall: formIsRecall,
        calendarColor: formCalendarColor,
      };
      if (!body.contactId) throw new Error('Select a patient');
      if (!formDate) throw new Error('Select a date');
      if (!editing || schedulingTouched) {
        body.catalogItemId = formCatalogItemId;
        body.scheduledAt = scheduledAt;
        body.providerUserId = formProviderId === 'none' ? null : Number(formProviderId);
        body.chairId = formChairId === 'none' ? null : Number(formChairId);
        body.overrideReason = reason || null;
      }
      if (editing) {
        const res = await apiRequest('PATCH', `/api/erp/dental/schedule/${editing.id}`, body);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Failed to update appointment');
        return json.data;
      }
      const res = await apiRequest('POST', '/api/erp/dental/schedule', body);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create appointment');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/availability'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/validate-slot'] });
      if (day) setDay(formDate);
      setAssignmentOverrideOpen(false);
      setPendingViolations([]);
      toast({
        title: editing
          ? t('erp.dental.schedule.updated', 'Appointment updated')
          : t('erp.dental.schedule.created', 'Appointment created'),
      });
      setEditorOpen(false);
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/availability'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/validate-slot'] });
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  function requestSave() {
    if (!formContactId) {
      toast({ title: t('ui.common.error', 'Error'), description: 'Select a patient', variant: 'destructive' });
      return;
    }
    if (editing && !schedulingTouched) {
      saveMutation.mutate({ scheduledAt: editing.scheduledAt });
      return;
    }
    if (!formCatalogItemId || formProviderId === 'none') {
      toast({ title: t('ui.common.error', 'Error'), description: 'Select a service and provider', variant: 'destructive' });
      return;
    }
    const evaluation = usesCustomTime ? customSlotQuery.data : null;
    if (usesCustomTime && !evaluation) {
      toast({ title: t('ui.common.error', 'Error'), description: 'Wait for time validation to finish', variant: 'destructive' });
      return;
    }
    if (isCapacityBlockingStatus(formStatus) && evaluation?.hardConflicts.length) {
      toast({
        title: t('ui.common.error', 'Error'),
        description: evaluation.hardConflicts.map((item) => item.message).join('. '),
        variant: 'destructive',
      });
      return;
    }
    const slot = usesCustomTime ? null : selectedSlot;
    if (!usesCustomTime && !slot) {
      toast({ title: t('ui.common.error', 'Error'), description: 'Select an available time', variant: 'destructive' });
      return;
    }
    if (requiresChair && formChairId === 'none') {
      toast({ title: t('ui.common.error', 'Error'), description: 'Select an available office', variant: 'destructive' });
      return;
    }
    const scheduledAt = evaluation?.scheduledAt ?? slot!.scheduledAt;
    const violations = isCapacityBlockingStatus(formStatus)
      ? evaluation?.overrideViolations.map((item) => item.message) ??
      (availabilityQuery.data?.specialtyOverrideRequired
        ? ['Provider specialty does not match the selected service']
        : [])
      : [];
    setPendingScheduledAt(scheduledAt);
    if (violations.length > 0) {
      setPendingViolations(violations);
      setAssignmentOverrideOpen(true);
      return;
    }
    saveMutation.mutate({ scheduledAt });
  }

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest('PATCH', `/api/erp/dental/schedule/${id}`, { status });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update status');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule'] });
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const bookingActionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: 'confirm' | 'approve' | 'decline' }) => {
      const res = await apiRequest('POST', `/api/erp/dental/booking/${id}/${action}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update booking');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/booking/pending'] });
      toast({ title: t('erp.dental.schedule.bookingUpdated', 'Booking updated') });
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/erp/dental/schedule/${id}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule'] });
      toast({ title: t('erp.dental.schedule.deleted', 'Appointment deleted') });
      setPendingDelete(null);
      setEditorOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const requestDelete = (row: Pick<ScheduleRow, 'id' | 'contactId' | 'contactName' | 'scheduledAt'>) => {
    setPendingDelete({
      id: row.id,
      patientLabel: row.contactName || `#${row.contactId}`,
      timeLabel: `${formatDate(row.scheduledAt, locale, scheduleQuery.data?.timezone)} ${formatDentalCalendarTime(row.scheduledAt, scheduleQuery.data?.timezone || companyTimezone, locale)}`,
    });
  };

  const shiftCalendar = (direction: -1 | 1) => {
    if (!day) return;
    if (calendarView === 'month') {
      const [year, month, date] = day.split('-').map(Number);
      setDay(toDateInputValue(new Date(year, month - 1 + direction, date, 12)));
      return;
    }
    setDay(addDaysToDateKey(day, direction * (calendarView === 'week' ? 7 : 1)));
  };

  const allRangeRows = scheduleQuery.data?.rows ?? [];
  const filterByService = (values: ScheduleRow[]) => serviceFilter === 'all'
    ? values
    : values.filter((row) => row.bookingServiceKey === serviceFilter);
  const rows = filterByService(allRangeRows);
  const team = teamQuery.data ?? [];
  const normalizedSearch = tableSearch.trim().toLocaleLowerCase(locale);
  const rangeSearchedRows = useMemo(() => {
    if (!normalizedSearch) return rows;
    return rows.filter((row) => [
      row.contactName,
      row.contactPhone,
      row.bookingServiceLabel,
      row.title,
      row.providerName,
      row.chairName,
      statusLabel(row.status),
    ].some((value) => String(value || '').toLocaleLowerCase(locale).includes(normalizedSearch)));
  }, [locale, normalizedSearch, rows]);
  const sortedRangeRows = useMemo(
    () => sortDentalScheduleRows(rangeSearchedRows, sortColumn, sortDirection, locale),
    [locale, rangeSearchedRows, sortColumn, sortDirection],
  );
  const sortedRows = tableScope === 'upcoming' ? (upcomingTableQuery.data?.data ?? []) : sortedRangeRows;
  const tableTotal = tableScope === 'upcoming' ? (upcomingTableQuery.data?.total ?? 0) : sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(tableTotal / pageSize));
  const activePage = Math.min(page, totalPages);
  const pageOffset = (activePage - 1) * pageSize;
  const visibleRows = tableScope === 'upcoming' ? sortedRows : sortedRows.slice(pageOffset, pageOffset + pageSize);
  const showingFrom = tableTotal === 0 ? 0 : pageOffset + 1;
  const showingTo = Math.min(pageOffset + visibleRows.length, tableTotal);
  const paginationItems = getPaginationItems(activePage, totalPages);
  const selectedDay = day ? fromDateInputValue(day) : undefined;
  const rangeLabel = visibleRange.from === visibleRange.to
    ? formatDate(`${visibleRange.from}T12:00:00Z`, locale, 'UTC')
    : `${formatDate(`${visibleRange.from}T12:00:00Z`, locale, 'UTC')} – ${formatDate(`${visibleRange.to}T12:00:00Z`, locale, 'UTC')}`;
  const countStatuses = (values: ScheduleRow[]) => ({
    total: values.length,
    scheduled: values.filter((row) => row.status === 'scheduled').length,
    confirmed: values.filter((row) => row.status === 'confirmed').length,
    cancelled: values.filter((row) => row.status === 'cancelled').length,
    noShow: values.filter((row) => row.status === 'no_show').length,
  });
  const scheduleSummary = countStatuses(rows);
  const summaryCards = [
    {
      key: 'total',
      label: t('erp.dental.schedule.summary.total', 'Total appointments'),
      value: scheduleSummary.total,
      icon: CalendarDays,
      iconClass: 'border-blue-500/25 bg-blue-500/15 text-blue-500',
    },
    {
      key: 'scheduled',
      label: t('erp.dental.schedule.summary.scheduled', 'Scheduled'),
      value: scheduleSummary.scheduled,
      icon: CheckCircle2,
      iconClass: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-500',
    },
    {
      key: 'confirmed',
      label: t('erp.dental.schedule.summary.confirmed', 'Confirmed'),
      value: scheduleSummary.confirmed,
      icon: Clock3,
      iconClass: 'border-amber-500/25 bg-amber-500/15 text-amber-500',
    },
    {
      key: 'cancelled',
      label: t('erp.dental.schedule.summary.cancelled', 'Cancelled'),
      value: scheduleSummary.cancelled,
      icon: XCircle,
      iconClass: 'border-red-500/25 bg-red-500/15 text-red-500',
    },
    {
      key: 'no-show',
      label: t('erp.dental.schedule.summary.noShow', 'No-show'),
      value: scheduleSummary.noShow,
      icon: RotateCcw,
      iconClass: 'border-purple-500/25 bg-purple-500/15 text-purple-500',
    },
  ];

  useEffect(() => {
    setPage(1);
  }, [day, providerFilter, chairFilter, serviceFilter, tableSearch, pageSize, sortColumn, sortDirection, tableScope]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const legacyUntouched = Boolean(editing && !schedulingTouched);
  const slotReady = usesCustomTime
    ? Boolean(
        customSlotQuery.data &&
        (!isCapacityBlockingStatus(formStatus) || customSlotQuery.data.hardConflicts.length === 0),
      )
    : Boolean(selectedSlot);
  const saveDisabled =
    saveMutation.isPending ||
    !formContactId ||
    (!legacyUntouched && (
      !formCatalogItemId ||
      formProviderId === 'none' ||
      !slotReady ||
      (requiresChair && formChairId === 'none')
    ));

  function providerLabel(name: string, userId: number | null | undefined) {
    return formatProviderWithSpecialties(name, userId, policyQuery.data, {
      resolveLabel: (specialtyId, fallbackLabel) =>
        t(`erp.dental.specialties.${specialtyId}`, fallbackLabel),
      formatOne: (providerName, specialty) =>
        t('erp.dental.schedule.providerWithSpecialty', '{{name}} — {{specialty}}', {
          name: providerName,
          specialty,
        }),
      formatMore: (providerName, specialty, extraCount) =>
        t('erp.dental.schedule.providerWithSpecialtyMore', '{{name}} — {{specialty}} +{{count}}', {
          name: providerName,
          specialty,
          count: extraCount,
        }),
    });
  }

  function toggleSort(column: DentalScheduleSortColumn) {
    if (sortColumn === column) {
      setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortColumn(column);
    setSortDirection('asc');
  }

  function sortableHeader(column: DentalScheduleSortColumn, label: string) {
    const active = sortColumn === column;
    const SortIcon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown;
    const directionLabel = sortDirection === 'asc'
      ? t('erp.common.sortDescending', 'Sort descending')
      : t('erp.common.sortAscending', 'Sort ascending');
    return (
      <Button data-tour="pages-erp-dental-schedule.button.erp.common.sortAscending"
        type="button"
        variant="ghost"
        className="-ml-3 h-9 px-3 font-medium hover:bg-muted/60"
        onClick={() => toggleSort(column)}
        aria-label={`${label}: ${active ? directionLabel : t('erp.common.sortAscending', 'Sort ascending')}`}
      >
        {label}
        <SortIcon className={cn('h-3.5 w-3.5', !active && 'text-muted-foreground')} />
      </Button>
    );
  }

  async function exportAppointments() {
    const headings = [
      t('erp.dental.schedule.dateAndTime', 'Date & time'),
      t('erp.dental.schedule.patient', 'Patient'),
      t('erp.dental.schedule.phone', 'Phone'),
      t('erp.dental.schedule.service', 'Service'),
      t('erp.dental.schedule.provider', 'Provider'),
      t('erp.dental.schedule.chair', 'Office'),
      t('erp.dental.schedule.status', 'Status'),
    ];
    let exportRows = sortedRows;
    if (tableScope === 'upcoming' && tableTotal > sortedRows.length) {
      const collected: ScheduleRow[] = [];
      for (let offset = 0; offset < tableTotal; offset += 100) {
        const response = await apiRequest('GET', `/api/erp/dental/schedule/upcoming?${buildUpcomingParams(100, offset, true)}`);
        if (!response.ok) throw new Error(t('erp.dental.schedule.upcoming.exportError', 'Unable to export upcoming appointments.'));
        const result = await response.json();
        collected.push(...(result.data || []));
      }
      exportRows = collected;
    }
    const values = exportRows.map((row) => [
      `${formatDate(row.scheduledAt, locale, scheduleQuery.data?.timezone)} ${formatDentalCalendarTime(row.scheduledAt, scheduleQuery.data?.timezone || companyTimezone, locale)}`,
      row.contactName || `#${row.contactId}`,
      row.contactPhone || '',
      row.bookingServiceLabel || row.title,
      row.providerName || '',
      row.chairName || '',
      statusLabel(row.status),
    ]);
    const csv = [headings, ...values].map((line) => line.map(escapeDentalScheduleCsv).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = tableScope === 'upcoming' ? 'dental-upcoming-appointments.csv' : `dental-appointments-${visibleRange.from}-${visibleRange.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const activeMessageChannels = channelConnections.filter((channel: any) => channel.status === 'active');
  const reminderContextQuery = useQuery({
    queryKey: ['/api/erp/dental/schedule/reminder-context', reminderTarget?.id, timezoneQuery.data?.timezone],
    staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true,
    enabled: Boolean(reminderTarget && canMessage),
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/erp/dental/schedule/${reminderTarget!.id}/reminder-context`);
      if (!response.ok) throw new Error('REMINDER_CONTEXT_FAILED');
      return (await response.json()).data as { timezone: DentalTimezoneStatus; variables: Record<string, string> | null; defaultConversationId: number | null; conversations: Array<{ id: number; channelId: number; channelType: string; requiresApprovedTemplate: boolean }> };
    },
  });
  const selectedReminderConversation = reminderContextQuery.data?.conversations.find((item) => String(item.id) === reminderConversationId);
  const reminderTemplatesQuery = useQuery({
    queryKey: ['quick-reply-templates', 'dental_appointment_reminder'],
    enabled: Boolean(reminderTarget && canMessage),
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/quick-replies');
      if (!response.ok) throw new Error('REMINDER_TEMPLATES_FAILED');
      const data = await response.json();
      return (data.data || []).filter((item: any) => item.category === 'dental_appointment_reminder') as ReminderQuickTemplate[];
    },
  });
  const officialReminderTemplatesQuery = useQuery<WhatsAppTemplate[]>({
    queryKey: ['/api/whatsapp-templates'],
    enabled: Boolean(reminderTarget && selectedReminderConversation?.channelType === 'whatsapp_official'),
    staleTime: 30000,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/whatsapp-templates');
      if (!response.ok) throw new Error('OFFICIAL_TEMPLATES_FAILED');
      const data = await response.json();
      return (data.data || data || []) as WhatsAppTemplate[];
    },
  });
  const officialReminderTemplates = useMemo(() => {
    if (!selectedReminderConversation) return [];
    return officialReminderTemplatesQuery.data
      ?.filter(template => template.isActive !== false
        && template.whatsappTemplateStatus === 'approved'
        && template.whatsappChannelType === 'official'
        && Number(template.connectionId) === selectedReminderConversation.channelId)
      .sort((left, right) => `${left.name}:${left.whatsappTemplateLanguage || ''}`.localeCompare(`${right.name}:${right.whatsappTemplateLanguage || ''}`)) || [];
  }, [officialReminderTemplatesQuery.data, selectedReminderConversation]);
  const selectedOfficialReminderTemplate = officialReminderTemplates.find(template => template.id === officialReminderTemplateId) || null;
  const officialReminderContext = useMemo(() => ({
    ...(reminderContextQuery.data?.variables || {}),
    contact: {
      name: reminderTarget?.contactName || '',
      phone: reminderTarget?.contactPhone || '',
    },
  }), [reminderContextQuery.data?.variables, reminderTarget?.contactName, reminderTarget?.contactPhone]);
  const officialTemplateStorageKey = selectedReminderConversation
    ? `bothive:appointment-reminder:official-template:${user?.companyId || 'company'}:${user?.id || 'user'}:${selectedReminderConversation.channelId}`
    : null;
  useEffect(() => {
    if (reminderContextQuery.data?.defaultConversationId) setReminderConversationId(current => current || String(reminderContextQuery.data!.defaultConversationId));
  }, [reminderContextQuery.data]);

  useEffect(() => {
    const isOfficial = selectedReminderConversation?.channelType === 'whatsapp_official';
    setReminderTemplateMode(isOfficial && selectedReminderConversation.requiresApprovedTemplate ? 'official' : 'normal');
    setOfficialReminderValues({});
    setOfficialVariableDialogOpen(false);
  }, [selectedReminderConversation?.id, selectedReminderConversation?.channelType, selectedReminderConversation?.requiresApprovedTemplate]);

  useEffect(() => {
    if (!officialTemplateStorageKey || officialReminderTemplatesQuery.isLoading) return;
    const storedId = Number(window.localStorage.getItem(officialTemplateStorageKey));
    const storedTemplate = officialReminderTemplates.find(template => template.id === storedId);
    setOfficialReminderTemplateId(storedTemplate?.id || null);
    if (!storedTemplate && storedId) window.localStorage.removeItem(officialTemplateStorageKey);
  }, [officialReminderTemplates, officialReminderTemplatesQuery.isLoading, officialTemplateStorageKey]);

  const sendReminderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/erp/dental/schedule/${reminderTarget!.id}/reminder`, {
        conversationId: Number(reminderConversationId),
        content: reminderContent,
        ...(reminderTemplateId ? { templateId: reminderTemplateId } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code || 'REMINDER_SEND_FAILED');
      return data;
    },
    onSuccess: () => {
      setReminderTarget(null);
      toast({ title: t('erp.dental.schedule.reminder.sent', 'Reminder sent'), description: t('erp.dental.schedule.reminder.sentDescription', 'The appointment reminder was sent successfully.') });
    },
    onError: (error: Error) => {
      if ((error as Error & { errorCode?: string }).errorCode === 'DENTAL_TIMEZONE_REQUIRED') {
        void timezoneQuery.refetch();
        void reminderContextQuery.refetch();
      }
      const descriptions: Record<string, string> = {
        DENTAL_TIMEZONE_REQUIRED: t('erp.dental.reminders.timezoneRequired', 'Save a valid company timezone in General Settings before sending dental reminders.'),
        OFFICIAL_TEMPLATE_REQUIRED: t('erp.dental.schedule.reminder.officialTemplateRequired', 'An approved WhatsApp template is required outside the messaging window.'),
        CHANNEL_UNAVAILABLE: t('erp.dental.schedule.reminder.channelUnavailable', 'The selected channel is no longer available. Choose another channel and try again.'),
        INVALID_REMINDER_CHANNEL: t('erp.dental.schedule.reminder.invalidChannel', 'This channel does not belong to the selected patient.'),
        PATIENT_CHANNEL_IDENTITY_MISSING: t('erp.dental.schedule.reminder.missingIdentity', 'The patient does not have a valid address for this channel.'),
      };
      toast({
        title: t('erp.dental.schedule.reminder.failed', 'Reminder not sent'),
        description: descriptions[(error as Error & { errorCode?: string }).errorCode || error.message] || t('erp.dental.schedule.reminder.failedDescription', 'The reminder could not be sent. Please verify the channel connection and try again.'),
        variant: 'destructive',
      });
    },
  });
  const sendOfficialReminderMutation = useMutation({
    mutationFn: async ({ template, values }: { template: WhatsAppTemplate; values: Record<string, string> }) => {
      if (!selectedReminderConversation || !reminderTarget) throw new Error('OFFICIAL_TEMPLATE_REQUIRED');
      const response = await apiRequest('POST', `/api/conversations/${selectedReminderConversation.id}/send-template`, {
        templateId: template.id,
        templateName: template.whatsappTemplateName || template.name,
        languageCode: template.whatsappTemplateLanguage || 'en',
        variables: values,
        componentValues: toTemplateComponentValues(getTemplateVariables(template), values),
        dentalAppointmentId: reminderTarget.id,
      });
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || data.message || 'OFFICIAL_TEMPLATE_SEND_FAILED') as Error & { errorCode?: string };
        error.errorCode = data.code || data.errorCode;
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      if (officialTemplateStorageKey && selectedOfficialReminderTemplate) {
        window.localStorage.setItem(officialTemplateStorageKey, String(selectedOfficialReminderTemplate.id));
      }
      if (selectedReminderConversation) {
        void queryClient.invalidateQueries({ queryKey: ['conversations', selectedReminderConversation.id, 'messages'] });
      }
      setOfficialVariableDialogOpen(false);
      setReminderTarget(null);
      toast({
        title: t('erp.dental.schedule.reminder.sent', 'Reminder sent'),
        description: t('erp.dental.schedule.reminder.officialSentDescription', 'The approved WhatsApp template was sent successfully.'),
      });
    },
    onError: (error: Error & { errorCode?: string }) => {
      if (error.errorCode === 'DENTAL_TIMEZONE_REQUIRED') {
        void timezoneQuery.refetch();
        void reminderContextQuery.refetch();
      }
      toast({
        title: t('erp.dental.schedule.reminder.failed', 'Reminder not sent'),
        description: error.errorCode === 'DENTAL_TIMEZONE_REQUIRED'
          ? t('erp.dental.reminders.timezoneRequired', 'Save a valid company timezone in General Settings before sending dental reminders.')
          : error.message || t('erp.dental.schedule.reminder.officialSendFailed', 'The approved WhatsApp template could not be sent.'),
        variant: 'destructive',
      });
    },
  });
  const prepareReminderConversationMutation = useMutation({
    mutationFn: async (channelId: number) => {
      const response = await apiRequest('POST', `/api/erp/dental/schedule/${reminderTarget!.id}/reminder-conversation`, { channelId });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code || 'CHANNEL_UNAVAILABLE');
      return data.data as { id: number };
    },
    onSuccess: (conversation) => {
      setReminderConversationId(String(conversation.id));
      reminderContextQuery.refetch();
    },
    onError: () => toast({ title: t('erp.dental.schedule.reminder.channelFailed', 'Channel unavailable'), description: t('erp.dental.schedule.reminder.channelFailedDescription', 'This channel cannot start a patient conversation.'), variant: 'destructive' }),
  });
  const saveReminderTemplateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/quick-replies', { name: reminderTemplateName, content: reminderContent, category: 'dental_appointment_reminder', variables: [] });
      if (!response.ok) throw new Error('SAVE_TEMPLATE_FAILED');
      return (await response.json()).data as { id: number; name: string; content: string };
    },
    onSuccess: (template) => {
      setReminderTemplateName('');
      setReminderTemplateCreatorOpen(false);
      setReminderTemplateId(template.id);
      queryClient.invalidateQueries({ queryKey: ['quick-reply-templates'] });
      toast({ title: t('erp.dental.schedule.reminder.templateSaved', 'Reminder template saved') });
    },
  });
  const updateReminderTemplateMutation = useMutation({
    mutationFn: async (template: ReminderQuickTemplate) => {
      const response = await apiRequest('PUT', `/api/quick-replies/${template.id}`, {
        name: template.name,
        content: template.content,
        category: 'dental_appointment_reminder',
      });
      return (await response.json()).data as ReminderQuickTemplate;
    },
    onSuccess: (template) => {
      if (reminderTemplateId === template.id) setReminderContent(template.content);
      setReminderTemplateEditing(null);
      queryClient.invalidateQueries({ queryKey: ['quick-reply-templates'] });
      toast({ title: t('erp.dental.schedule.reminder.templateUpdated', 'Reminder template updated') });
    },
    onError: () => toast({ title: t('erp.dental.schedule.reminder.templateUpdateFailed', 'Template not updated'), description: t('erp.dental.schedule.reminder.templateUpdateFailedDescription', 'The reminder template could not be updated.'), variant: 'destructive' }),
  });
  const deleteReminderTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      await apiRequest('DELETE', `/api/quick-replies/${templateId}`);
      return templateId;
    },
    onSuccess: (templateId) => {
      if (reminderTemplateId === templateId) setReminderTemplateId(null);
      setReminderTemplateEditing((template) => template?.id === templateId ? null : template);
      setReminderTemplateToDelete(null);
      queryClient.invalidateQueries({ queryKey: ['quick-reply-templates'] });
      toast({ title: t('erp.dental.schedule.reminder.templateDeleted', 'Reminder template deleted') });
    },
    onError: () => toast({ title: t('erp.dental.schedule.reminder.templateDeleteFailed', 'Template not deleted'), description: t('erp.dental.schedule.reminder.templateDeleteFailedDescription', 'The reminder template could not be deleted.'), variant: 'destructive' }),
  });

  const openMessageChannel = (row: ScheduleRow, channel: any) => {
    localStorage.setItem('selectedContactId', String(row.contactId));
    localStorage.setItem('selectedChannelId', String(channel.id));
    localStorage.setItem('selectedChannelType', channel.channelType);
    setConversationActiveChannelId(channel.id);
    setGlobalActiveChannelId(channel.id);
    setMessageTarget(null);
    setLocation('/inbox');
  };

  const openReminder = (row: ScheduleRow) => {
    setReminderTarget(row);
    setReminderConversationId('');
    setReminderTemplateId(null);
    setReminderTemplatePickerOpen(false);
    setReminderTemplateCreatorOpen(false);
    setReminderTemplateName('');
    setReminderTemplateEditing(null);
    setReminderTemplateToDelete(null);
    setReminderTemplateMode('normal');
    setOfficialReminderTemplateId(null);
    setOfficialReminderValues({});
    setOfficialVariableDialogOpen(false);
    setReminderContent(t('erp.dental.schedule.reminder.defaultMessage', 'Hello {{contact.name}}, this is a reminder for your appointment on {{appointment.date}} at {{appointment.start_time}}.'));
  };
  const selectedReminderTemplate = reminderTemplatesQuery.data?.find((item) => item.id === reminderTemplateId);
  const reminderTimezone = reminderContextQuery.data?.timezone;
  const reminderTimezoneReady = !timezoneQuery.isError && !timezoneQuery.isFetching && timezoneQuery.data?.status === 'valid'
    && !reminderContextQuery.isError && !reminderContextQuery.isFetching && reminderTimezone?.status === 'valid'
    && reminderTimezone.timezone === timezoneQuery.data.timezone && !!reminderContextQuery.data?.variables;
  const reminderTimezoneMessage = timezoneQuery.isFetching || reminderContextQuery.isFetching
    ? t('erp.dental.reminders.timezoneLoading', 'Checking company timezone...')
    : t('erp.dental.reminders.timezoneRequired', 'Save a valid company timezone in General Settings before sending dental reminders.');
  const reminderPreview = reminderTimezoneReady ? reminderContent.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,
    (match, variable: string) => reminderContextQuery.data!.variables![variable.trim()] ?? match) : reminderTimezoneMessage;
  const selectOfficialReminderTemplate = (templateId: string) => {
    const template = officialReminderTemplates.find(item => item.id === Number(templateId)) || null;
    setOfficialReminderTemplateId(template?.id || null);
    setOfficialReminderValues(Object.fromEntries((template ? getTemplateVariables(template) : []).map(variable => [variable.id, ''])));
    if (template && officialTemplateStorageKey) window.localStorage.setItem(officialTemplateStorageKey, String(template.id));
  };
  const sendOfficialReminder = () => {
    if (!selectedOfficialReminderTemplate) return;
    const definitions = getTemplateVariables(selectedOfficialReminderTemplate);
    const validationError = translatedTemplateValidationError(t, definitions);
    if (validationError) {
      toast({ title: t('templates.send_error', 'Error'), description: validationError, variant: 'destructive' });
      return;
    }
    const unresolved = definitions.some(definition => !templateVariableHasValue(
      selectedOfficialReminderTemplate,
      definition,
      officialReminderValues,
      officialReminderContext,
      ['appointment.', 'contact.', 'company.'],
    ));
    if (unresolved) {
      setOfficialVariableDialogOpen(true);
      return;
    }
    sendOfficialReminderMutation.mutate({ template: selectedOfficialReminderTemplate, values: officialReminderValues });
  };
  useEffect(() => {
    if (reminderTarget) { void timezoneQuery.refetch(); void reminderContextQuery.refetch(); }
  }, [reminderTarget?.id]);

  useQuickAction('create-appointment', { open: editorOpen, onOpen: () => openCreate(), ready: !timezoneQuery.isLoading && !policyQuery.isLoading && !chairsQuery.isLoading, unavailable: !!timezoneQuery.error || !!policyQuery.error || !!chairsQuery.error });

  return (
    <DentalShellPage
      title={t('erp.dental.schedule.appointmentsTitle', 'Appointments')}
      description={t(
        'erp.dental.schedule.description',
        'Manage appointments across providers, offices, and dates.',
      )}
      actions={(
        <>
          <Button data-tour="pages-erp-dental-schedule.button.erp.dental.batches.title" type="button" variant="outline" className="h-11 px-5" onClick={() => setReminderBatchesOpen(true)}>
            <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
            {t('erp.dental.batches.title', 'Reminders')}
          </Button>
          {canManage && <>
          <Button data-tour="pages-erp-dental-schedule.button.erp.dental.queue.title" variant="outline" asChild>
            <Link href="/erp/dental/queue">
              <Tickets className="h-4 w-4 text-primary" aria-hidden="true" />
              {t('erp.dental.queue.title', 'Digital Turn')}
            </Link>
          </Button>
          {canManagePatients ? <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.createWalkIn"
            type="button"
            variant="outline"
            className="h-11 px-5"
            onClick={() => {
              setWalkInMode(true);
              setAddPatientOpen(true);
            }}
          >
            <UserPlus className="h-4 w-4 text-primary" />
            {t('erp.dental.schedule.createWalkIn', 'Create walk-in')}
          </Button> : null}
          <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.new"
            type="button"
            className="h-11 px-5 shadow-sm"
            onClick={() => openCreate()}
          >
            <Plus className="h-4 w-4" />
            {t('erp.dental.schedule.new', 'New appointment')}
          </Button>
          </>}
        </>
      )}
      contentClassName="custom-scrollbar"
    >
      {reminderBatchesOpen && <ReminderBatchesDialog open={reminderBatchesOpen} onOpenChange={setReminderBatchesOpen} canManage={canManage} />}
      <div className="flex flex-col gap-[18px]">
        <section className="rounded-xl border bg-card/70 p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 xl:items-end">
            <div className="min-w-0 space-y-2">
              <Label>{t('erp.dental.schedule.dateRange', 'Date range')}</Label>
              <div className="flex min-w-0 items-center">
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 min-w-0 flex-1 justify-start px-4 font-normal"
                    >
                      <CalendarDays className="h-4 w-4 shrink-0" />
                      <span className="truncate tabular-nums">
                        {rangeLabel}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarPicker
                      mode="single"
                      locale={calendarLocale}
                      weekStartsOn={1}
                      classNames={{
                        day_selected: 'bg-brand-primary text-white hover:bg-brand-primary hover:text-white focus:bg-brand-primary focus:text-white',
                      }}
                      selected={selectedDay}
                      onSelect={(date) => {
                        if (!date) return;
                        setDay(toDateInputValue(date));
                        setDatePickerOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="min-w-0 space-y-2">
              <Label>{t('erp.dental.schedule.view', 'View')}</Label>
              <Select value={calendarView} onValueChange={(value) => setCalendarView(value as DentalCalendarView)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>{(['day', 'week', 'month', 'rooms'] as DentalCalendarView[]).map((view) => <SelectItem key={view} value={view}>{t(`erp.dental.schedule.views.${view}`, view)}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2">
              <Label>{t('erp.dental.schedule.provider', 'Provider')}</Label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('erp.dental.schedule.allProviders', 'All providers')}</SelectItem>
                  {team.map((member) => (
                    <SelectItem key={member.id} value={String(member.id)}>
                      {providerLabel(member.fullName || member.username || String(member.id), member.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2">
              <Label>{t('erp.dental.schedule.service', 'Service')}</Label>
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="all">{t('erp.dental.schedule.allServices', 'All services')}</SelectItem>
                  {(policyQuery.data?.bookableCatalog ?? []).filter((item) => item.isActive).map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0 space-y-2">
              <Label>{t('erp.dental.schedule.chair', 'Office')}</Label>
              <Select value={chairFilter} onValueChange={setChairFilter}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('erp.dental.schedule.allChairs', 'All offices')}</SelectItem>
                  {activeChairs.map((chair) => (
                    <SelectItem key={chair.id} value={String(chair.id)}>
                      {chair.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="flex min-h-[88px] items-center gap-3 rounded-xl border bg-card/70 px-4 py-3 shadow-sm">
                <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border', item.iconClass)}>
                  <Icon className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="text-xl font-semibold tabular-nums">{item.value}</span></div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">{item.label}</div>
                </div>
              </div>
            );
          })}
        </section>

        {day ? <DentalScheduleCalendar
          appointments={rows}
          upcomingAppointments={upcomingPreviewQuery.data?.data ?? []}
          upcomingLoading={upcomingPreviewQuery.isLoading}
          upcomingError={upcomingPreviewQuery.isError}
          chairs={activeChairs}
          policy={policyQuery.data}
          timezone={scheduleQuery.data?.timezone || companyTimezone}
          locale={locale}
          view={calendarView}
          range={visibleRange}
          selectedDate={day}
          rangeLabel={rangeLabel}
          statusLabel={statusLabel}
          canEdit={canManage}
          canMessage={canMessage}
          onViewChange={setCalendarView}
          onSelectedDateChange={setDay}
          onPrevious={() => shiftCalendar(-1)}
          onNext={() => shiftCalendar(1)}
          onToday={() => setDay(getZonedDateTimeParts(new Date(), companyTimezone).dateKey)}
          onEdit={(row) => openEdit(row as ScheduleRow)}
          onMessage={(row) => setMessageTarget(row as ScheduleRow)}
          onReminder={(row) => openReminder(row as ScheduleRow)}
          onViewAllUpcoming={() => {
            setTableScope('upcoming');
            setSortColumn('scheduledAt');
            setSortDirection('asc');
            setPage(1);
            window.setTimeout(() => appointmentsTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
          }}
          onCreate={(date, time, chairId) => openCreate({ date, time, chairId })}
          t={t}
        /> : null}

        <section ref={appointmentsTableRef} className="scroll-mt-4 overflow-hidden rounded-xl border bg-card/40 shadow-sm">
          <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><div className="flex flex-wrap items-center gap-2"><h2 data-tour="pages-erp-dental-schedule.h2.erp.dental.schedule.upcoming.allTitle" className="font-semibold">{tableScope === 'upcoming' ? t('erp.dental.schedule.upcoming.allTitle', 'All upcoming appointments') : t('erp.dental.schedule.allAppointments', 'All appointments')}</h2>{tableScope === 'upcoming' ? <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.upcoming.returnToRange" variant="ghost" size="sm" className="h-7" onClick={() => { setTableScope('range'); setSortColumn(DEFAULT_DENTAL_SCHEDULE_SORT_COLUMN); setSortDirection(DEFAULT_DENTAL_SCHEDULE_SORT_DIRECTION); setPage(1); }}>{t('erp.dental.schedule.upcoming.returnToRange', 'Return to calendar range')}</Button> : null}</div><p className="text-xs text-muted-foreground">{t('erp.dental.schedule.pagination.showing', 'Showing {{from}} to {{to}} of {{total}} appointments', { from: showingFrom, to: showingTo, total: tableTotal })}</p></div>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <div className="relative w-full min-w-0 sm:w-64"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.search" value={tableSearch} onChange={(event) => setTableSearch(event.target.value)} className="pl-9" placeholder={t('erp.dental.schedule.search', 'Search appointments...')} /></div>
              <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.export" className="min-w-0 flex-1 sm:flex-none" variant="outline" onClick={exportAppointments} disabled={sortedRows.length === 0}><Download className="h-4 w-4" />{t('erp.dental.schedule.export', 'Export')}</Button>
              {canManage ? <DropdownMenu><DropdownMenuTrigger asChild><Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.moreActions" size="icon" variant="outline" aria-label={t('erp.dental.schedule.moreActions', 'More actions')}><EllipsisVertical className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setChairsOpen(true)}><Settings2 className="h-4 w-4" />{t('erp.dental.chairs.manage', 'Offices')}</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : null}
            </div>
          </div>
          <div className="custom-scrollbar overflow-x-auto overscroll-x-contain">
          <Table data-tour="pages-erp-dental-schedule.table.erp.dental.schedule.dateAndTime" className="min-w-[1080px] border-separate border-spacing-0">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[150px] px-4">
                  {sortableHeader('scheduledAt', t('erp.dental.schedule.dateAndTime', 'Date & time'))}
                </TableHead>
                <TableHead className="w-[170px] px-4">
                  {sortableHeader('patient', t('erp.dental.schedule.patient', 'Patient'))}
                </TableHead>
                <TableHead className="min-w-[180px] px-4">
                  {sortableHeader('title', t('erp.dental.schedule.titleCol', 'Title'))}
                </TableHead>
                <TableHead className="min-w-[250px] px-4">
                  {sortableHeader('provider', t('erp.dental.schedule.provider', 'Provider'))}
                </TableHead>
                <TableHead className="min-w-[145px] px-4">
                  {sortableHeader('chair', t('erp.dental.schedule.chair', 'Office'))}
                </TableHead>
                <TableHead className="w-[150px] px-4">
                  {sortableHeader('status', t('erp.dental.schedule.status', 'Status'))}
                </TableHead>
                {canManage ? (
                  <TableHead className="w-[80px] px-4 text-center">{t('erp.dental.schedule.action', 'Action')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tableScope === 'upcoming' ? upcomingTableQuery.isLoading : scheduleQuery.isLoading) ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={canManage ? 7 : 6} className="h-40 text-center">
                    <span className="inline-flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('erp.common.loading', 'Loading...')}
                    </span>
                  </TableCell>
                </TableRow>
              ) : (tableScope === 'upcoming' ? upcomingTableQuery.isError : scheduleQuery.isError) ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={canManage ? 7 : 6} className="h-40 text-center text-destructive">
                    {(tableScope === 'upcoming' ? upcomingTableQuery.error : scheduleQuery.error) instanceof Error
                      ? (tableScope === 'upcoming' ? upcomingTableQuery.error : scheduleQuery.error)?.message
                      : t('erp.dental.schedule.loadError', 'Failed to load schedule.')}
                  </TableCell>
                </TableRow>
              ) : tableTotal === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={canManage ? 7 : 6} className="h-40 text-center text-muted-foreground">
                    {tableScope === 'upcoming'
                      ? t('erp.dental.schedule.upcoming.empty', 'No upcoming appointments.')
                      : day
                      ? t('erp.dental.schedule.empty', 'No appointments for this day.')
                      : t('erp.dental.schedule.emptyAll', 'No appointments found.')}
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => (
                  <TableRow
                    key={row.id}
                    style={getDentalAppointmentColorStyle(row)}
                    className={cn(
                      'h-[80px] border-l-4 text-foreground transition-[filter,opacity] hover:brightness-95 dark:hover:brightness-110',
                      canManage && 'cursor-pointer',
                      isMutedDentalAppointment(row) && 'opacity-55 grayscale-[35%]',
                    )}
                    onClick={() => canManage && openEdit(row)}
                  >
                    <TableCell className="whitespace-nowrap px-4">
                      <div className="font-medium tabular-nums">
                        {formatDate(row.scheduledAt, locale, tableScope === 'upcoming' ? upcomingTableQuery.data?.timezone : scheduleQuery.data?.timezone)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {formatDentalCalendarTime(row.scheduledAt, (tableScope === 'upcoming' ? upcomingTableQuery.data?.timezone : scheduleQuery.data?.timezone) || companyTimezone, locale)} · {row.durationMinutes ?? 60}m
                      </div>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border border-border">
                          <AvatarImage
                            src={row.contactAvatarUrl || undefined}
                            alt={row.contactName || t('erp.dental.schedule.patient', 'Patient')}
                            className="object-cover"
                          />
                          <AvatarFallback className="text-xs font-medium text-muted-foreground">
                            {row.contactName?.trim().charAt(0).toUpperCase() || '#'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{row.contactName || `#${row.contactId}`}</span>
                          {canManage && timezoneQuery.data?.status === 'valid' && ['scheduled', 'confirmed'].includes(row.status) && getZonedDateTimeParts(new Date(row.scheduledAt), companyTimezone).dateKey === getZonedDateTimeParts(new Date(), companyTimezone).dateKey && <a className="text-xs text-primary hover:underline" href={`/erp/dental/queue?appointmentId=${row.id}`} onClick={event => event.stopPropagation()}>{t('erp.dental.queue.checkIn', 'Check in')}</a>}
                          {row.contactPhone ? <span className="block truncate text-xs text-muted-foreground">{row.contactPhone}</span> : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4">
                      <div className="font-medium">{row.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{row.type}</div>
                    </TableCell>
                    <TableCell className="px-4">
                      {row.providerUserId != null ? <div className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarImage src={row.providerAvatarUrl || undefined} /><AvatarFallback>{row.providerName?.slice(0, 2).toUpperCase() || '#'}</AvatarFallback></Avatar><span className="min-w-0 truncate">{providerLabel(row.providerName || '—', row.providerUserId)}</span></div> : '—'}
                    </TableCell>
                    <TableCell className="px-4">{row.chairName || '—'}</TableCell>
                    <TableCell className="px-4">
                      <div className="flex flex-col items-start gap-1.5">
                        <Badge className={cn('border-0 px-3 py-1 font-medium', statusPillClass(row.status))}>
                          {statusLabel(row.status)}
                        </Badge>
                        {row.scheduleOverrideKinds?.length ? (
                          <Badge
                            className="border-0 bg-purple-500/15 px-3 py-1 font-medium text-purple-600 dark:text-purple-400"
                            title={row.scheduleOverrideKinds.join(', ')}
                          >
                            {t('erp.dental.schedule.overrideBadge', 'Override')}
                          </Badge>
                        ) : null}
                        {row.holdExpiresAt && isAwaitingStaff(row.status) ? (
                          <span className="text-xs text-muted-foreground">
                            {t('erp.dental.schedule.expires', 'Expires')}{' '}
                            {formatDentalCalendarTime(row.holdExpiresAt, scheduleQuery.data?.timezone || companyTimezone, locale)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    {canManage ? (
                      <TableCell className="px-4 text-center" onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.actionsMenu"
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full"
                              aria-label={t('erp.dental.schedule.actionsMenu', 'Appointment actions')}
                              title={t('erp.dental.schedule.actionsMenu', 'Appointment actions')}
                            >
                              <EllipsisVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-[160px]">
                            <DropdownMenuItem onSelect={() => openEdit(row)}>
                              <Pencil />
                              {t('erp.dental.schedule.edit', 'Edit appointment')}
                            </DropdownMenuItem>
                            {row.status === 'held' ? (
                              <>
                                <DropdownMenuItem
                                  disabled={bookingActionMutation.isPending}
                                  onSelect={() => bookingActionMutation.mutate({ id: row.id, action: 'confirm' })}
                                >
                                  <CheckCircle2 className="text-emerald-500" />
                                  {t('erp.dental.schedule.confirm', 'Confirm')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={bookingActionMutation.isPending}
                                  onSelect={() => bookingActionMutation.mutate({ id: row.id, action: 'decline' })}
                                >
                                  <XCircle className="text-amber-500" />
                                  {t('erp.dental.schedule.decline', 'Decline')}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                            {row.status === 'pending_request' ? (
                              <>
                                <DropdownMenuItem
                                  disabled={bookingActionMutation.isPending}
                                  onSelect={() => bookingActionMutation.mutate({ id: row.id, action: 'approve' })}
                                >
                                  <CheckCircle2 className="text-emerald-500" />
                                  {t('erp.dental.schedule.approve', 'Approve')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={bookingActionMutation.isPending}
                                  onSelect={() => bookingActionMutation.mutate({ id: row.id, action: 'decline' })}
                                >
                                  <XCircle className="text-amber-500" />
                                  {t('erp.dental.schedule.decline', 'Decline')}
                                </DropdownMenuItem>
                              </>
                            ) : null}
                            {!isAwaitingStaff(row.status) && row.status !== 'no_show' ? (
                              <DropdownMenuItem
                                disabled={statusMutation.isPending}
                                onSelect={() => statusMutation.mutate({ id: row.id, status: 'no_show' })}
                              >
                                <Clock3 className="text-amber-500" />
                                {t('erp.dental.schedule.noShow', 'No-show')}
                              </DropdownMenuItem>
                            ) : null}
                            {!isAwaitingStaff(row.status) && row.status !== 'cancelled' ? (
                              <DropdownMenuItem
                                disabled={statusMutation.isPending}
                                onSelect={() => statusMutation.mutate({ id: row.id, status: 'cancelled' })}
                              >
                                <XCircle className="text-red-500" />
                                {t('erp.dental.schedule.cancel', 'Cancel')}
                              </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              disabled={deleteMutation.isPending}
                              onSelect={() => requestDelete(row)}
                            >
                              <Trash2 />
                              {t('erp.dental.schedule.delete', 'Delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>

          {tableTotal > 0 ? (
            <div className="flex flex-col gap-3 border-t px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="text-muted-foreground">
                {t('erp.dental.schedule.pagination.showing', 'Showing {{from}} to {{to}} of {{total}} appointments', {
                  from: showingFrom,
                  to: showingTo,
                  total: tableTotal,
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.pagination.previous"
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={activePage === 1}
                    onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                    aria-label={t('erp.dental.schedule.pagination.previous', 'Previous page')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {paginationItems.map((item, index) => item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="flex h-9 w-7 items-center justify-center text-muted-foreground">…</span>
                  ) : (
                    <Button
                      key={item}
                      type="button"
                      size="icon"
                      variant="outline"
                      className={cn(
                        'h-9 w-9',
                        item === activePage && 'border-emerald-500/60 !bg-emerald-500/10 !text-emerald-600 dark:!text-emerald-400',
                      )}
                      onClick={() => setPage(item)}
                      aria-current={item === activePage ? 'page' : undefined}
                    >
                      {item}
                    </Button>
                  ))}
                  <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.pagination.next"
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={activePage === totalPages}
                    onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                    aria-label={t('erp.dental.schedule.pagination.next', 'Next page')}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number])}
                >
                  <SelectTrigger className="h-9 w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {t('erp.dental.schedule.pagination.perPage', '{{count}} / page', { count: size })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <Dialog open={Boolean(messageTarget)} onOpenChange={(open) => !open && setMessageTarget(null)}>
        <DialogContent data-tour="pages-erp-dental-schedule.dialogcontent.erp.dental.schedule.messaging.chooseChannel" className="custom-scrollbar max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader><DialogTitle>{t('erp.dental.schedule.messaging.chooseChannel', 'Choose a channel')}</DialogTitle><DialogDescription>{t('erp.dental.schedule.messaging.chooseChannelDescription', 'Select a channel to open this patient in the Inbox.')}</DialogDescription></DialogHeader>
          <div className="grid gap-2">
            {activeMessageChannels.length ? activeMessageChannels.map((channel: any) => <Button key={channel.id} variant="outline" className="h-auto justify-start py-3" onClick={() => messageTarget && openMessageChannel(messageTarget, channel)}><span className="mr-2">{getChannelIcon(channel.channelType)}</span><span className="truncate">{getChannelDisplayName(channel)}</span></Button>) : <p className="py-4 text-sm text-muted-foreground">{t('inbox.no_active_channels', 'No active channels available')}</p>}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(reminderTarget)} onOpenChange={(open) => !open && setReminderTarget(null)}>
        <DialogContent data-tour="pages-erp-dental-schedule.dialogcontent.erp.dental.schedule.reminder.title" className="max-h-[92dvh] w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl [&_[data-slot=dialog-body]]:min-w-0 [&_[data-slot=dialog-body]]:overflow-x-hidden">
          <DialogHeader className="border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-5 py-4 pr-12">
            <DialogTitle className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><BellRing className="h-5 w-5" /></span>
              <span>{t('erp.dental.schedule.reminder.title', 'Appointment reminder')}</span>
            </DialogTitle>
            <DialogDescription className="pl-[3.25rem]">{t('erp.dental.schedule.reminder.description', 'Review the message and channel before sending it to the patient.')}</DialogDescription>
          </DialogHeader>

          <div className="min-w-0 max-w-full space-y-5 overflow-x-hidden">
            <div className="flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-3">
              <Avatar className="h-11 w-11 shrink-0 border border-primary/20">
                <AvatarImage src={reminderTarget?.contactAvatarUrl || undefined} alt={reminderTarget?.contactName || ''} />
                <AvatarFallback>{reminderTarget?.contactName?.slice(0, 2).toUpperCase() || '#'}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{reminderTarget?.contactName}</div>
                <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{reminderTarget ? formatDate(reminderTarget.scheduledAt, locale, companyTimezone) : ''}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-semibold tabular-nums">{reminderTarget ? formatDentalCalendarTime(reminderTarget.scheduledAt, companyTimezone, locale) : ''}</span>
                </div>
              </div>
              {reminderTarget ? <Badge className={cn('shrink-0 border-0', statusPillClass(reminderTarget.status))}>{statusLabel(reminderTarget.status)}</Badge> : null}
            </div>

            <div className="grid min-w-0 max-w-full gap-2 overflow-hidden">
              <Label className="flex items-center gap-2"><AppointmentMessageIcon className="h-4 w-4 text-muted-foreground" />{t('erp.dental.schedule.reminder.channel', 'Sending channel')}</Label>
              <Select value={reminderConversationId} onValueChange={setReminderConversationId}>
                <SelectTrigger data-tour="pages-erp-dental-schedule.selecttrigger.erp.dental.schedule.reminder.selectChannel" className="h-11 min-w-0 max-w-full overflow-hidden"><SelectValue placeholder={t('erp.dental.schedule.reminder.selectChannel', 'Select a patient channel')} /></SelectTrigger>
                <SelectContent>
                  {(reminderContextQuery.data?.conversations || []).map((conversation) => {
                    const channel: any = channelConnections.find((item: any) => item.id === conversation.channelId);
                    return <SelectItem key={conversation.id} value={String(conversation.id)}><span className="flex items-center gap-2"><span>{getChannelIcon(channel?.channelType || conversation.channelType)}</span><span>{channel ? getChannelDisplayName(channel) : conversation.channelType}</span></span></SelectItem>;
                  })}
                </SelectContent>
              </Select>
              {reminderContextQuery.isLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('erp.dental.schedule.reminder.loadingChannels', 'Loading patient channels...')}</div> : null}
              {!reminderContextQuery.isLoading && !(reminderContextQuery.data?.conversations.length) ? <div className="grid gap-2 rounded-lg border border-dashed bg-muted/20 p-3"><p className="text-xs text-muted-foreground">{t('erp.dental.schedule.reminder.noPatientChannel', 'No recent patient channel was found. Choose a WhatsApp channel to start one.')}</p>{activeMessageChannels.filter((channel: any) => ['whatsapp','whatsapp_unofficial','whatsapp_official'].includes(channel.channelType)).map((channel: any) => <Button key={channel.id} variant="outline" className="justify-start" disabled={prepareReminderConversationMutation.isPending} onClick={() => prepareReminderConversationMutation.mutate(channel.id)}><span className="mr-2">{getChannelIcon(channel.channelType)}</span>{getChannelDisplayName(channel)}</Button>)}</div> : null}
            </div>

            {!reminderTimezoneReady && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{reminderTimezoneMessage} <Button data-tour="pages-erp-dental-schedule.button.erp.dental.reminders.retry" type="button" variant="link" onClick={() => { void timezoneQuery.refetch(); void reminderContextQuery.refetch(); }}>{t('erp.dental.reminders.retry', 'Retry')}</Button></p>}
            {selectedReminderConversation?.channelType === 'whatsapp_official' && (
              <div className="grid gap-2">
                <Label>{t('erp.dental.schedule.reminder.templateMode', 'Message type')}</Label>
                <RadioGroup
                  value={reminderTemplateMode}
                  onValueChange={value => {
                    if (value === 'normal' && selectedReminderConversation.requiresApprovedTemplate) return;
                    setReminderTemplateMode(value as ReminderTemplateMode);
                  }}
                  className="grid gap-2 sm:grid-cols-2"
                >
                  <Label
                    htmlFor="reminder-mode-normal"
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal transition-colors',
                      reminderTemplateMode === 'normal' && 'border-primary bg-primary/5',
                      selectedReminderConversation.requiresApprovedTemplate && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    <RadioGroupItem id="reminder-mode-normal" value="normal" disabled={selectedReminderConversation.requiresApprovedTemplate} className="mt-0.5" />
                    <span><span className="block font-medium">{t('erp.dental.schedule.reminder.normalMode', 'Normal template')}</span><span className="block text-xs text-muted-foreground">{t('erp.dental.schedule.reminder.normalModeDescription', 'Use a saved reminder or edit the message.')}</span></span>
                  </Label>
                  <Label htmlFor="reminder-mode-official" className={cn('flex cursor-pointer items-start gap-3 rounded-xl border p-3 font-normal transition-colors', reminderTemplateMode === 'official' && 'border-primary bg-primary/5')}>
                    <RadioGroupItem id="reminder-mode-official" value="official" className="mt-0.5" />
                    <span><span className="block font-medium">{t('erp.dental.schedule.reminder.officialMode', 'WhatsApp Official template')}</span><span className="block text-xs text-muted-foreground">{t('erp.dental.schedule.reminder.officialModeDescription', 'Send an approved Meta template for this channel.')}</span></span>
                  </Label>
                </RadioGroup>
                {selectedReminderConversation.requiresApprovedTemplate && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">{t('erp.dental.schedule.reminder.officialTemplateRequired', 'An approved WhatsApp template is required outside the messaging window.')}</p>
                )}
              </div>
            )}

            {selectedReminderConversation?.channelType === 'whatsapp_official' && reminderTemplateMode === 'official' ? (
              <div className="grid min-w-0 gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                <div className="grid gap-2">
                  <Label htmlFor="official-reminder-template">{t('erp.dental.schedule.reminder.officialTemplate', 'Approved WhatsApp template')}</Label>
                  <Select value={officialReminderTemplateId ? String(officialReminderTemplateId) : undefined} onValueChange={selectOfficialReminderTemplate}>
                    <SelectTrigger data-tour="pages-erp-dental-schedule.selecttrigger.erp.dental.schedule.reminder.loadingOfficialTemplates" id="official-reminder-template" className="h-11 w-full">
                      <SelectValue placeholder={officialReminderTemplatesQuery.isLoading
                        ? t('erp.dental.schedule.reminder.loadingOfficialTemplates', 'Loading approved templates...')
                        : t('erp.dental.schedule.reminder.selectOfficialTemplate', 'Select an approved template')} />
                    </SelectTrigger>
                    <SelectContent>
                      {officialReminderTemplates.map(template => (
                        <SelectItem key={template.id} value={String(template.id)}>
                          {template.name} · {(template.whatsappTemplateLanguage || 'en').replace('_', '-').toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!officialReminderTemplatesQuery.isLoading && officialReminderTemplates.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('erp.dental.schedule.reminder.noOfficialTemplates', 'No active approved templates are available for this channel.')}</p>
                  )}
                  {officialReminderTemplatesQuery.isError && (
                    <p className="text-xs text-destructive">{t('erp.dental.schedule.reminder.officialTemplatesFailed', 'Approved templates could not be loaded. Please try again.')}</p>
                  )}
                </div>

                {selectedOfficialReminderTemplate && (
                  <>
                    <WhatsAppTemplatePreview
                      template={selectedOfficialReminderTemplate}
                      values={officialReminderValues}
                      context={officialReminderContext}
                    />
                    {getTemplateVariables(selectedOfficialReminderTemplate).length > 0 && (
                      <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.reviewVariables" type="button" variant="outline" onClick={() => setOfficialVariableDialogOpen(true)}>
                        <Variable className="h-4 w-4" />
                        {t('erp.dental.schedule.reminder.reviewVariables', 'Review variables')}
                      </Button>
                    )}
                  </>
                )}
              </div>
            ) : <>
              <div className="grid min-w-0 max-w-full gap-2 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />{t('erp.dental.schedule.reminder.quickTemplate', 'Quick template')}</Label>
                  {canManageReminderTemplates ? <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.createTemplate" type="button" size="sm" variant="ghost" className="h-8 text-primary" onClick={() => { setReminderTemplateEditing(null); setReminderTemplateCreatorOpen((open) => !open); }}><Plus className="h-4 w-4" />{t('erp.dental.schedule.reminder.createTemplate', 'Create template')}</Button> : null}
                </div>
                <Popover open={reminderTemplatePickerOpen} onOpenChange={setReminderTemplatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.selectTemplate" type="button" variant="outline" role="combobox" aria-expanded={reminderTemplatePickerOpen} className="h-auto min-h-11 w-full min-w-0 max-w-full justify-between overflow-hidden px-3 py-2 text-left font-normal">
                      <span className="min-w-0 flex-1 overflow-hidden"><span className="block max-w-full truncate font-medium">{selectedReminderTemplate?.name || t('erp.dental.schedule.reminder.selectTemplate', 'Select a saved reminder')}</span>{selectedReminderTemplate ? <span className="block max-w-full truncate text-xs text-muted-foreground">{selectedReminderTemplate.content}</span> : null}</span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    collisionPadding={16}
                    className="max-w-[calc(100vw-2rem)] overflow-hidden p-0"
                    style={{ width: 'var(--radix-popover-trigger-width)' }}
                  >
                    <Command className="min-w-0 overflow-hidden">
                      <CommandInput placeholder={t('erp.dental.schedule.reminder.searchTemplates', 'Search reminder templates...')} />
                      <CommandList className="custom-scrollbar max-h-72 min-w-0 overflow-x-hidden">
                        <CommandEmpty>{t('erp.dental.schedule.reminder.noTemplates', 'No reminder templates found.')}</CommandEmpty>
                        {(reminderTemplatesQuery.data || []).map((template) => (
                          <CommandItem
                            key={template.id}
                            value={`${template.name} ${template.content}`}
                            onSelect={() => { setReminderTemplateId(template.id); setReminderContent(template.content); setReminderTemplatePickerOpen(false); }}
                            className="group w-full min-w-0 max-w-full items-start gap-2 overflow-hidden py-2.5"
                          >
                            <Check className={cn('mt-0.5 h-4 w-4 shrink-0', reminderTemplateId === template.id ? 'opacity-100' : 'opacity-0')} />
                            <span className="min-w-0 max-w-full flex-1 overflow-hidden">
                              <span className="block max-w-full break-words font-medium [overflow-wrap:anywhere]">{template.name}</span>
                              <span className="line-clamp-2 max-w-full break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{template.content}</span>
                            </span>
                            {canManageReminderTemplates ? <span className="flex shrink-0 items-center gap-0.5 opacity-80 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                              <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.editTemplate"
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                aria-label={t('erp.dental.schedule.reminder.editTemplate', 'Edit reminder template')}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) => { event.preventDefault(); event.stopPropagation(); setReminderTemplateCreatorOpen(false); setReminderTemplateEditing({ ...template }); setReminderTemplatePickerOpen(false); }}
                              ><Pencil className="h-3.5 w-3.5" /></Button>
                              <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.deleteTemplate"
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label={t('erp.dental.schedule.reminder.deleteTemplate', 'Delete reminder template')}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={(event) => { event.preventDefault(); event.stopPropagation(); setReminderTemplatePickerOpen(false); setReminderTemplateToDelete(template); }}
                              ><Trash2 className="h-3.5 w-3.5" /></Button>
                            </span> : null}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {canManageReminderTemplates && reminderTemplateCreatorOpen ? <div className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="min-w-0"><div className="truncate font-medium">{t('erp.dental.schedule.reminder.newTemplate', 'New reminder template')}</div><p className="break-words text-xs text-muted-foreground">{t('erp.dental.schedule.reminder.newTemplateDescription', 'Save the current message so your team can reuse it.')}</p></div><Input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.reminder.templateName" className="min-w-0 max-w-full" value={reminderTemplateName} onChange={(event) => setReminderTemplateName(event.target.value)} placeholder={t('erp.dental.schedule.reminder.templateName', 'Template name')} maxLength={120} /><div className="flex flex-wrap justify-end gap-2"><Button data-tour="pages-erp-dental-schedule.button.ui.common.cancel" type="button" size="sm" variant="ghost" onClick={() => { setReminderTemplateCreatorOpen(false); setReminderTemplateName(''); }}>{t('ui.common.cancel', 'Cancel')}</Button><Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.saveTemplateAction" type="button" size="sm" disabled={!reminderTemplateName.trim() || !reminderContent.trim() || saveReminderTemplateMutation.isPending} onClick={() => saveReminderTemplateMutation.mutate()}>{saveReminderTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t('erp.dental.schedule.reminder.saveTemplateAction', 'Save template')}</Button></div></div> : null}

              {canManageReminderTemplates && reminderTemplateEditing ? <div className="grid min-w-0 max-w-full gap-3 overflow-hidden rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="min-w-0"><div className="truncate font-medium">{t('erp.dental.schedule.reminder.editTemplateTitle', 'Edit reminder template')}</div><p className="break-words text-xs text-muted-foreground">{t('erp.dental.schedule.reminder.editTemplateDescription', 'Update the reusable template name and message.')}</p></div><Input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.reminder.templateName" className="min-w-0 max-w-full" value={reminderTemplateEditing.name} onChange={(event) => setReminderTemplateEditing((template) => template ? { ...template, name: event.target.value } : null)} placeholder={t('erp.dental.schedule.reminder.templateName', 'Template name')} maxLength={120} /><Textarea data-tour="pages-erp-dental-schedule.textarea.reminderTemplateEditing.content" value={reminderTemplateEditing.content} onChange={(event) => setReminderTemplateEditing((template) => template ? { ...template, content: event.target.value } : null)} rows={5} maxLength={8000} showExpandButton={false} className="min-w-0 max-w-full resize-y break-words" /><div className="flex flex-wrap justify-end gap-2"><Button data-tour="pages-erp-dental-schedule.button.ui.common.cancel" type="button" size="sm" variant="ghost" onClick={() => setReminderTemplateEditing(null)}>{t('ui.common.cancel', 'Cancel')}</Button><Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.updateTemplateAction" type="button" size="sm" disabled={!reminderTemplateEditing.name.trim() || !reminderTemplateEditing.content.trim() || updateReminderTemplateMutation.isPending} onClick={() => updateReminderTemplateMutation.mutate(reminderTemplateEditing)}>{updateReminderTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{t('erp.dental.schedule.reminder.updateTemplateAction', 'Update template')}</Button></div></div> : null}

              <div className="grid min-w-0 max-w-full gap-2 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2"><Label>{t('erp.dental.schedule.reminder.message', 'Reminder message')}</Label><Popover><PopoverTrigger asChild><Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.variables" size="sm" variant="outline"><Variable className="h-4 w-4" />{t('erp.dental.schedule.reminder.variables', 'Variables')}</Button></PopoverTrigger><PopoverContent align="end" className="custom-scrollbar max-h-72 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto p-2"><div className="mb-2 px-2 text-xs font-medium text-muted-foreground">{t('erp.dental.schedule.reminder.insertVariable', 'Insert a verified appointment variable')}</div><div className="grid gap-1 sm:grid-cols-2">{['contact.name','contact.phone','contact.email','appointment.date','appointment.start_time','appointment.end_time','appointment.duration','appointment.service','appointment.provider','appointment.office','appointment.status','appointment.notes','company.name','company.timezone'].map((variable) => <Button key={variable} variant="ghost" size="sm" className="h-8 justify-start px-2 font-mono text-[11px]" onClick={() => setReminderContent((value) => `${value}{{${variable}}}`)}>{`{{${variable}}}`}</Button>)}</div></PopoverContent></Popover></div>
                <div className="relative min-w-0 max-w-full overflow-hidden"><Textarea data-tour="pages-erp-dental-schedule.textarea.erp.dental.schedule.reminder.message" value={reminderContent} onChange={(event) => setReminderContent(event.target.value)} rows={6} maxLength={8000} className="min-h-36 min-w-0 max-w-full resize-y break-words pb-7" /><span className="pointer-events-none absolute bottom-2 right-3 text-[10px] tabular-nums text-muted-foreground">{reminderContent.length}/8000</span></div>
              </div>

              <div className="min-w-0 max-w-full overflow-hidden rounded-xl border bg-muted/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground"><Eye className="h-4 w-4" />{t('erp.dental.schedule.reminder.preview', 'Preview')}{reminderTimezoneReady ? ` · ${reminderTimezone?.timezone}` : ''}</div>
                <div className="ml-auto min-w-0 max-w-[92%] overflow-hidden rounded-2xl rounded-br-sm border bg-background px-3 py-2.5 shadow-sm"><p className="max-w-full whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{reminderPreview || t('erp.dental.schedule.reminder.emptyPreview', 'Your reminder preview will appear here.')}</p></div>
              </div>
            </>}
          </div>

          <DialogFooter className="border-t bg-background/95 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <Button data-tour="pages-erp-dental-schedule.button.ui.common.cancel" variant="outline" onClick={() => setReminderTarget(null)}>{t('ui.common.cancel', 'Cancel')}</Button>
            {selectedReminderConversation?.channelType === 'whatsapp_official' && reminderTemplateMode === 'official' ? (
              <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.sendOfficial"
                disabled={!reminderTimezoneReady || !reminderConversationId || !selectedOfficialReminderTemplate || sendOfficialReminderMutation.isPending}
                onClick={sendOfficialReminder}
              >
                {sendOfficialReminderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                {t('erp.dental.schedule.reminder.sendOfficial', 'Send Official template')}
              </Button>
            ) : (
              <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.reminder.send" disabled={!reminderTimezoneReady || !reminderConversationId || !reminderContent.trim() || sendReminderMutation.isPending} onClick={() => sendReminderMutation.mutate()}>{sendReminderMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}{t('erp.dental.schedule.reminder.send', 'Send reminder')}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplateVariableDialog
        open={officialVariableDialogOpen}
        onOpenChange={setOfficialVariableDialogOpen}
        template={selectedOfficialReminderTemplate}
        values={officialReminderValues}
        onValuesChange={setOfficialReminderValues}
        context={officialReminderContext}
        requireMappedResolution={['appointment.', 'contact.', 'company.']}
        elevated
        pending={sendOfficialReminderMutation.isPending}
        confirmLabel={t('erp.dental.schedule.reminder.sendOfficial', 'Send Official template')}
        pendingLabel={t('common.sending', 'Sending...')}
        onConfirm={() => selectedOfficialReminderTemplate && sendOfficialReminderMutation.mutate({ template: selectedOfficialReminderTemplate, values: officialReminderValues })}
      />

      <AlertDialog open={Boolean(reminderTemplateToDelete)} onOpenChange={(open) => !open && setReminderTemplateToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.dental.schedule.reminder.deleteTemplateTitle', 'Delete reminder template?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('erp.dental.schedule.reminder.deleteTemplateDescription', '“{{name}}” will be removed from the reminder template list. This action cannot be undone.', { name: reminderTemplateToDelete?.name || '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteReminderTemplateMutation.isPending}>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteReminderTemplateMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (reminderTemplateToDelete) deleteReminderTemplateMutation.mutate(reminderTemplateToDelete.id);
              }}
            >
              {deleteReminderTemplateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t('erp.dental.schedule.reminder.deleteTemplateAction', 'Delete template')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent data-tour="pages-erp-dental-schedule.dialogcontent.erp.dental.schedule.edit" className="custom-scrollbar max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('erp.dental.schedule.edit', 'Edit appointment')
                : t('erp.dental.schedule.new', 'New appointment')}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {editing
                ? t('erp.dental.schedule.editDescription', 'Update appointment details.')
                : t('erp.dental.schedule.newDescription', 'Create a new appointment.')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.patient', 'Patient')}</Label>
              {editing ? (
                <Input value={editing.contactName || `#${editing.contactId}`} disabled />
              ) : (
                <div className="space-y-1.5">
                  <Popover open={patientPickerOpen} onOpenChange={setPatientPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.selectPatient" type="button" variant="outline" role="combobox" className="w-full justify-between">
                        <span className="truncate text-left">
                          {selectedPatient?.name || t('erp.dental.schedule.selectPatient', 'Search patients')}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder={t('erp.dental.schedule.searchPatient', 'Search patients by name')}
                          value={patientSearch}
                          onValueChange={handlePatientSearchChange}
                        />
                        <CommandList className="max-h-72">
                          {patientsQuery.isLoading ? (
                            <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              {t('erp.common.loading', 'Loading...')}
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>
                                {t('erp.dental.schedule.noPatients', 'No patients found')}
                              </CommandEmpty>
                              {(patientsQuery.data ?? []).map((p) => (
                                <CommandItem
                                  key={p.contactId}
                                  value={`${p.name} ${p.contactId}`}
                                  onSelect={() => {
                                    setFormContactId(String(p.contactId));
                                    setSelectedPatientName(p.name);
                                    setPatientSearch(p.name);
                                    setPatientPickerOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'h-4 w-4',
                                      formContactId === String(p.contactId) ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                  {p.name}
                                </CommandItem>
                              ))}
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {canManagePatients ? (
                    <Button data-tour="pages-erp-dental-schedule.button.erp.dental.patients.add"
                      type="button"
                      variant="link"
                      className="h-auto p-0 text-sm"
                      onClick={() => {
                        setWalkInMode(false);
                        setAddPatientOpen(true);
                      }}
                    >
                      <UserPlus className="h-3.5 w-3.5 mr-1" />
                      {t('erp.dental.patients.add', 'Add Patient')}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.service', 'Service')}</Label>
              <Select
                value={formCatalogItemId}
                onValueChange={(value) => {
                  setFormCatalogItemId(value);
                  setSchedulingTouched(true);
                  setFormTime('');
                  setFormChairId('none');
                  const item = policyQuery.data?.bookableCatalog.find((entry) => entry.id === value);
                  if (!formTitle.trim() || formTitle === selectedCatalogItem?.label) setFormTitle(item?.label ?? '');
                }}
              >
                <SelectTrigger data-tour="pages-erp-dental-schedule.selecttrigger.erp.dental.schedule.selectService"><SelectValue placeholder={t('erp.dental.schedule.selectService', 'Select service')} /></SelectTrigger>
                <SelectContent searchable>
                  {(policyQuery.data?.bookableCatalog ?? []).filter((item) => item.isActive).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label} ({item.durationMinutes} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing && !editing.bookingServiceKey && !formCatalogItemId ? (
                <p className="text-xs text-muted-foreground">
                  {t('erp.dental.schedule.legacyServiceHelp', 'Select a service only if you need to reschedule this legacy appointment.')}
                </p>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('erp.dental.schedule.provider', 'Provider')}</Label>
                <Select value={formProviderId} onValueChange={(value) => {
                  setFormProviderId(value);
                  setFormTime('');
                  setFormChairId('none');
                  setSchedulingTouched(true);
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="none">{t('erp.dental.schedule.selectProvider', 'Select provider')}</SelectItem>
                    {bookableProviders.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {providerLabel(m.fullName || m.username || String(m.id), m.id)}
                        {!m.rostered
                          ? ` — ${t('erp.dental.schedule.legacyProvider', 'legacy provider')}`
                          : !m.specialtyMatch
                            ? ` — ${t('erp.dental.schedule.overrideRequired', 'override required')}`
                            : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('erp.dental.schedule.date', 'Date')}</Label>
                <Input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.provider" type="date" value={formDate} onChange={(e) => {
                  setFormDate(e.target.value);
                  setFormTime('');
                  setFormChairId('none');
                  setSchedulingTouched(true);
                }} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('erp.dental.schedule.time', 'Available time')}</Label>
                {usesCustomTime ? (
                  <Input data-tour="pages-erp-dental-schedule.input.formTime" type="time" step={slotStepMinutes * 60} min={timeGridStart} value={formTime} onChange={(e) => {
                    setFormTime(e.target.value);
                    setFormChairId('none');
                    setSchedulingTouched(true);
                  }} />
                ) : (
                  <Select value={formTime} onValueChange={(value) => {
                    setFormTime(value);
                    setFormChairId('none');
                    setSchedulingTouched(true);
                  }} disabled={!canLoadAvailability || availabilityQuery.isLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder={availabilityQuery.isLoading ? 'Loading…' : 'Select available time'} />
                    </SelectTrigger>
                    <SelectContent searchable>
                      {(availabilityQuery.data?.slots ?? []).map((slot) => (
                        <SelectItem key={slot.scheduledAt} value={slot.localTime}>{slot.localTime}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {!usesCustomTime && canLoadAvailability && !availabilityQuery.isLoading && availabilityQuery.data?.slots.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('erp.dental.schedule.noAvailableTimes', 'No available times for this date.')}</p>
                ) : null}
                {!usesCustomTime && availabilityQuery.error ? (
                  <p className="text-xs text-destructive">{availabilityQuery.error.message}</p>
                ) : null}
                {(availabilityQuery.data?.timezone || customSlotQuery.data?.timezone) ? (
                  <p className="text-xs text-muted-foreground">
                    {t('erp.dental.schedule.companyTimezone', 'Company timezone')}: {availabilityQuery.data?.timezone || customSlotQuery.data?.timezone}
                  </p>
                ) : null}
                {isCapacityBlockingStatus(formStatus) ? <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.useAvailableTimes"
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    setOverrideMode((value) => !value);
                    setFormTime('');
                    setFormChairId('none');
                    setSchedulingTouched(true);
                  }}
                >
                  {overrideMode
                    ? t('erp.dental.schedule.useAvailableTimes', 'Use available times')
                    : t('erp.dental.schedule.bookOutsideAvailability', 'Book outside availability')}
                </Button> : null}
              </div>
              <div className="space-y-1">
                <Label>{t('erp.dental.schedule.chair', 'Office')}</Label>
                <Select value={formChairId} onValueChange={(value) => {
                  setFormChairId(value);
                  setSchedulingTouched(true);
                }} disabled={!formTime || (requiresChair && selectableChairs.length === 0)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    {!requiresChair ? <SelectItem value="none">—</SelectItem> : null}
                    {selectableChairs.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {usesCustomTime && isCapacityBlockingStatus(formStatus) && customSlotQuery.data ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                {customSlotQuery.data.hardConflicts.length > 0 ? (
                  <p className="text-destructive">{customSlotQuery.data.hardConflicts.map((item) => item.message).join('. ')}</p>
                ) : customSlotQuery.data.overrideViolations.length > 0 ? (
                  <p>{customSlotQuery.data.overrideViolations.map((item) => item.message).join('. ')}</p>
                ) : (
                  <p>{t('erp.dental.schedule.customTimeAvailable', 'This custom time is available.')}</p>
                )}
              </div>
            ) : null}
            {usesCustomTime && customSlotQuery.error ? (
              <p className="text-sm text-destructive">{customSlotQuery.error.message}</p>
            ) : null}
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.duration', 'Duration')}</Label>
              <Input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.patient" value={selectedCatalogItem ? `${selectedCatalogItem.durationMinutes} min` : ''} disabled />
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.titleCol', 'Title')}</Label>
              <Input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.patient" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Consultation" />
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.appointmentColor', 'Appointment color')}</Label>
              <div className="flex items-center gap-2 rounded-md border p-2">
                <input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.appointmentColor"
                  type="color"
                  className="h-9 w-12 shrink-0 cursor-pointer rounded border bg-background p-1"
                  value={formCalendarColor ?? '#3B82F6'}
                  onChange={(event) => setFormCalendarColor(event.target.value.toUpperCase())}
                  aria-label={t('erp.dental.schedule.appointmentColor', 'Appointment color')}
                />
                <div
                  className="h-8 min-w-12 flex-1 rounded border-l-4"
                  style={formCalendarColor ? {
                    borderLeftColor: formCalendarColor,
                    backgroundColor: `${formCalendarColor}2E`,
                  } : undefined}
                />
                <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.automaticColor"
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={!formCalendarColor}
                  onClick={() => setFormCalendarColor(null)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('erp.dental.schedule.automaticColor', 'Automatic color')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {formCalendarColor
                  ? t('erp.dental.schedule.customColorHelp', 'This appointment uses a custom calendar color.')
                  : t('erp.dental.schedule.automaticColorHelp', 'Color is selected automatically from the service.')}
              </p>
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.status', 'Status')}</Label>
              <Select
                value={formStatus}
                onValueChange={(value) => {
                  setFormStatus(value);
                  if (editing && !isCapacityBlockingStatus(editing.status) && isCapacityBlockingStatus(value)) {
                    setSchedulingTouched(true);
                  }
                }}
                disabled={Boolean(editing && isAwaitingStaff(editing.status))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent searchable>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {statusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editing && isAwaitingStaff(editing.status) && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'erp.dental.schedule.awaitingStaffStatusHelp',
                    'Use Confirm/Approve or Decline on the schedule board to resolve this booking.',
                  )}
                </p>
              )}
            </div>
            {editing?.scheduleOverrideKinds?.length ? (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <div className="font-medium">{t('erp.dental.schedule.overrideDetails', 'Scheduling override')}</div>
                <div className="mt-1 text-muted-foreground">{editing.scheduleOverrideKinds.join(', ')}</div>
                {editing.scheduleOverrideReason ? <div className="mt-1">{editing.scheduleOverrideReason}</div> : null}
                {editing.scheduleOverriddenAt ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t('erp.dental.schedule.overrideRecorded', 'Recorded {{time}} by user #{{userId}}', {
                      time: new Date(editing.scheduleOverriddenAt).toLocaleString(),
                      userId: editing.scheduleOverriddenBy ?? '—',
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Checkbox
                id="isRecall"
                checked={formIsRecall}
                onCheckedChange={(v) => setFormIsRecall(v === true)}
              />
              <Label htmlFor="isRecall">{t('erp.dental.schedule.recall', 'Recall visit')}</Label>
            </div>
            <div className="space-y-1">
              <Label>{t('erp.dental.schedule.notes', 'Notes')}</Label>
              <Input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.patient" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editing && (
              <Button data-tour="pages-erp-dental-schedule.button.erp.dental.schedule.delete"
                type="button"
                variant="destructive"
                disabled={deleteMutation.isPending}
                onClick={() => requestDelete(editing)}
              >
                {t('erp.dental.schedule.delete', 'Delete')}
              </Button>
            )}
            <Button data-tour="pages-erp-dental-schedule.button.ui.common.cancel" type="button" variant="outline" onClick={() => setEditorOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-dental-schedule.button.ui.common.save" type="button" disabled={saveDisabled} onClick={requestSave}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('ui.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open && !deleteMutation.isPending) setPendingDelete(null);
        }}
      >
        <AlertDialogContent className="custom-scrollbar max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('erp.dental.schedule.deleteConfirmTitle', 'Delete appointment?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'erp.dental.schedule.deleteConfirmBody',
                'Delete appointment for {{patient}} at {{time}}? This cannot be undone.',
                {
                  patient: pendingDelete?.patientLabel ?? '',
                  time: pendingDelete?.timeLabel ?? '',
                },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>
              {t('ui.common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending || pendingDelete == null}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) deleteMutation.mutate(pendingDelete.id);
              }}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('erp.dental.schedule.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={assignmentOverrideOpen} onOpenChange={setAssignmentOverrideOpen}>
        <AlertDialogContent className="custom-scrollbar max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('erp.dental.schedule.assignmentOverrideTitle', 'Confirm scheduling override')}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {t(
                    'erp.dental.schedule.assignmentOverrideBody',
                    'This appointment is outside one or more scheduling rules. Enter a reason to continue.',
                  )}
                </p>
                <ul className="list-disc pl-5">
                  {pendingViolations.map((violation) => (
                    <li key={violation}>{violation}</li>
                  ))}
                </ul>
                <div className="space-y-1 pt-2">
                  <Label htmlFor="schedule-override-reason">
                    {t('erp.dental.schedule.overrideReason', 'Override reason')}
                  </Label>
                  <Input data-tour="pages-erp-dental-schedule.input.erp.dental.schedule.overrideReasonPlaceholder"
                    id="schedule-override-reason"
                    value={overrideReason}
                    maxLength={500}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    placeholder={t('erp.dental.schedule.overrideReasonPlaceholder', 'Explain why this exception is necessary')}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingScheduledAt || overrideReason.trim().length < 3 || saveMutation.isPending}
              onClick={() => {
                if (!pendingScheduledAt) return;
                saveMutation.mutate({ scheduledAt: pendingScheduledAt, reason: overrideReason.trim() });
              }}
            >
              {t('erp.dental.schedule.assignmentOverrideConfirm', 'Save anyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={chairsOpen} onOpenChange={setChairsOpen}>
        <DialogContent data-tour="pages-erp-dental-schedule.dialogcontent.erp.dental.chairs.manage" className="custom-scrollbar max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('erp.dental.chairs.manage', 'Offices')}</DialogTitle>
            <DialogDescription className="sr-only">
              {t('erp.dental.chairs.manageDescription', 'Add, edit or disable shared clinic offices.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Button data-tour="pages-erp-dental-schedule.button.erp.dental.chairs.add" type="button" className="w-full" disabled={!canManage} onClick={() => setOfficeEditor({ office: null })}>
              <Plus className="mr-2 h-4 w-4" />{t('erp.dental.chairs.add', 'Add office')}
            </Button>
            <div className="custom-scrollbar max-h-64 overflow-y-auto rounded-md border">
              <Table data-tour="pages-erp-dental-schedule.table.erp.dental.chairs.disabled">
                <TableBody>
                  {(chairsQuery.data ?? []).map((chair) => (
                    <TableRow key={chair.id}>
                      <TableCell>
                        <div className="font-medium">{chair.name}</div>
                        {!chair.isActive && <Badge variant="secondary">{t('erp.dental.chairs.disabled', 'Disabled')}</Badge>}
                        <div className="text-xs text-muted-foreground">{chair.code}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button data-tour="pages-erp-dental-schedule.button.erp.dental.chairs.editNamed"
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!canManage}
                          aria-label={t('erp.dental.chairs.editNamed', 'Edit office {{name}}', { name: chair.name })}
                          onClick={() => setOfficeEditor({ office: chair })}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DentalOfficeEditor open={officeEditor !== null} office={officeEditor?.office ?? null} onOpenChange={(open) => { if (!open) setOfficeEditor(null); }} />

      <AddDentalPatientDialog
        open={addPatientOpen}
        onOpenChange={(open) => {
          setAddPatientOpen(open);
          if (!open) setWalkInMode(false);
        }}
        initialMode={walkInMode ? 'new' : 'existing'}
        title={walkInMode ? t('erp.dental.schedule.createWalkIn', 'Create walk-in') : undefined}
        description={walkInMode ? t('erp.dental.schedule.walkInDescription', 'Create a patient record, then schedule today\'s visit.') : undefined}
        onSuccess={(patient) => {
          if (walkInMode) {
            setWalkInMode(false);
            openCreate({
              date: getZonedDateTimeParts(new Date(), companyTimezone).dateKey,
              patient,
            });
          } else {
            setFormContactId(String(patient.contactId));
            setSelectedPatientName(patient.name);
            setPatientSearch(patient.name);
          }
          queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/patient-options'] });
        }}
      />
    </DentalShellPage>
  );
}

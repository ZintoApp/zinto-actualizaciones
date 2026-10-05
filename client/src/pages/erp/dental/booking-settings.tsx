import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DentalShellPage } from './dental-shell';
import { DentalOfficeEditor, type DentalOffice } from '@/components/erp/dental/DentalOfficeEditor';
import { Badge } from '@/components/ui/badge';
import { AutomaticReminderSettings } from '@/components/erp/dental/AutomaticReminderSettings';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  WeeklyScheduleEditor,
  WeeklyScheduleQuickActions,
} from '@/components/flow-builder/WeeklyScheduleEditor';
import {
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Clock,
  FileText,
  Loader2,
  Plus,
  Pencil,
  Shield,
  Trash2,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { DaySchedule } from '@shared/types/calendar-types';
import {
  DEFAULT_DENTAL_SPECIALTY_ID,
  dentalSlotStepMinutesSchema,
  DENTAL_AUTHORITY_MODES,
  DENTAL_CAPACITY_MODES,
  DENTAL_HOLD_TIMEOUT_MAX_MINUTES,
  DENTAL_HOLD_TIMEOUT_MIN_MINUTES,
  DENTAL_SYSTEM_SPECIALTIES,
  DENTAL_POLICY_MAX_CUSTOM_SPECIALTIES,
  catalogFieldsFromServiceProduct,
  listResolvableSpecialties,
  type DentalBookableCatalogItem,
  type DentalBookingPolicy,
  type DentalDaySchedule,
  type DentalSpecialistProfile,
} from '@shared/types/dental-booking-types';

type TeamMember = { id: number; fullName?: string; username?: string };
type AutoAddPreview = { eligibleContactCount: number; existingPatientCount: number };
type FieldError = { path: string; message: string };
type OfficeChair = { id: number; code: string; name: string; isActive: boolean };
type ServiceProductOption = {
  id: number;
  name: string;
  sku: string | null;
  estimatedDurationMinutes: number | null;
};

function toDentalSchedule(schedule: DaySchedule[]): DentalDaySchedule[] {
  return schedule.map((day) => ({
    dayName: day.dayName,
    dayIndex: day.dayIndex,
    enabled: day.enabled,
    startTime: day.startTime,
    endTime: day.endTime,
    breaks: (day.breaks ?? []).map((window) => ({ ...window })),
  }));
}

function offDaysOf(schedule: DentalDaySchedule[]): number[] {
  return schedule.filter((day) => !day.enabled).map((day) => day.dayIndex);
}

function emptyCatalogRow(): DentalBookableCatalogItem {
  return {
    id: '',
    label: '',
    durationMinutes: 30,
    specialtyId: DEFAULT_DENTAL_SPECIALTY_ID,
    isActive: true,
  };
}

function SettingsSectionCard({
  icon: Icon,
  title,
  description,
  headerActions,
  headerActionsClassName,
  children,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  headerActions?: ReactNode;
  headerActionsClassName?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('w-full min-w-0 max-w-full overflow-hidden', className)}>
      <CardHeader className="flex min-w-0 flex-col gap-4 space-y-0 p-4 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            <CardDescription className="mt-1">{description}</CardDescription>
          </div>
        </div>
        {headerActions ? (
          <div className={cn("flex min-w-0 w-full flex-wrap items-stretch gap-2 lg:w-auto lg:items-center lg:justify-end lg:pt-0.5", headerActionsClassName)}>
            {headerActions}
          </div>
        ) : null}
      </CardHeader>
      {children != null ? (
        <CardContent className="w-full min-w-0 max-w-full p-4 pt-0 sm:p-6 sm:pt-0">{children}</CardContent>
      ) : null}
    </Card>
  );
}

export default function DentalBookingSettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_SCHEDULE);
  const queryClient = useQueryClient();

  const [officeEditor, setOfficeEditor] = useState<{ office: DentalOffice | null } | null>(null);
  const [draft, setDraft] = useState<DentalBookingPolicy | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [autoAddConfirmOpen, setAutoAddConfirmOpen] = useState(false);
  const [serviceDeleteIndex, setServiceDeleteIndex] = useState<number | null>(null);
  const [providerToAdd, setProviderToAdd] = useState<string>('');
  const [customSpecialtyLabel, setCustomSpecialtyLabel] = useState('');
  const [editingSpecialty, setEditingSpecialty] = useState<{ id: string; label: string; source: 'system' | 'custom' } | null>(null);
  const [productPickerOpenIndex, setProductPickerOpenIndex] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [expandedProviderHours, setExpandedProviderHours] = useState<Set<number>>(() => new Set());

  const policyQuery = useQuery({
    queryKey: ['/api/erp/dental/booking/settings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/booking/settings');
      if (!res.ok) throw new Error('Failed to load booking settings');
      const json = await res.json();
      return json.data as DentalBookingPolicy;
    },
  });

  const teamQuery = useQuery({
    queryKey: ['/api/team-members', 'dental-booking-settings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      if (!res.ok) throw new Error('Failed to load team');
      return (await res.json()) as TeamMember[];
    },
  });

  const chairsQuery = useQuery({
    queryKey: ['/api/erp/dental/chairs', 'booking-settings'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/chairs');
      if (!res.ok) throw new Error('Failed to load offices');
      const json = await res.json();
      return (json.data ?? []) as OfficeChair[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ['/api/erp/dental/booking/product-options', productSearch],
    enabled: canManage && productPickerOpenIndex != null,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (productSearch.trim()) params.set('search', productSearch.trim());
      const res = await apiRequest('GET', `/api/erp/dental/booking/product-options?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load service products');
      return (json.data ?? []) as ServiceProductOption[];
    },
  });

  const previewQuery = useQuery({
    queryKey: ['/api/erp/dental/booking/settings/auto-add-preview'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/booking/settings/auto-add-preview');
      if (!res.ok) throw new Error('Failed to load preview');
      const json = await res.json();
      return json.data as AutoAddPreview;
    },
    enabled: autoAddConfirmOpen,
  });

  const saved = policyQuery.data;

  useEffect(() => {
    if (saved && !draft) setDraft(structuredClone(saved));
  }, [saved, draft]);

  const isDirty = useMemo(() => {
    if (!saved || !draft) return false;
    return JSON.stringify(saved) !== JSON.stringify(draft);
  }, [saved, draft]);

  const saveMutation = useMutation({
    mutationFn: async (policy: DentalBookingPolicy) => {
      const res = await apiRequest('PATCH', '/api/erp/dental/booking/settings', policy);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errors = (json.details ?? []) as FieldError[];
        setFieldErrors(Array.isArray(errors) ? errors : []);
        throw new Error(json.error || 'Failed to save booking settings');
      }
      setFieldErrors([]);
      return {
        policy: json.data as DentalBookingPolicy,
        autoAdd: (json.autoAdd ?? {
          backfilled: 0,
          unlinked: 0,
          keptWithHistory: 0,
        }) as { backfilled: number; unlinked: number; keptWithHistory: number },
      };
    },
    onSuccess: ({ policy, autoAdd }) => {
      queryClient.setQueryData(['/api/erp/dental/booking/settings'], policy);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/booking/settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/clinical-note-specialties'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/availability'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/schedule/validate-slot'] });
      setDraft(structuredClone(policy));
      if (autoAdd.backfilled > 0) {
        toast({
          title: t('erp.dental.booking.settings.saved', 'Booking settings saved'),
          description: t(
            'erp.dental.booking.settings.autoAdd.backfillDone',
            'Added {{count}} contacts as patients.',
            { count: autoAdd.backfilled },
          ),
        });
      } else if (autoAdd.unlinked > 0 || autoAdd.keptWithHistory > 0) {
        toast({
          title: t('erp.dental.booking.settings.saved', 'Booking settings saved'),
          description: t(
            'erp.dental.booking.settings.autoAdd.unlinkDone',
            'Removed {{removed}} empty auto-patients; kept {{kept}} with clinical history.',
            { removed: autoAdd.unlinked, kept: autoAdd.keptWithHistory },
          ),
        });
      } else {
        toast({ title: t('erp.dental.booking.settings.saved', 'Booking settings saved') });
      }
    },
    onError: (error: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' });
    },
  });

  const update = useCallback((patch: Partial<DentalBookingPolicy>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const handleClinicHoursChange = useCallback((schedule: DaySchedule[]) => {
    setDraft((current) => (current ? { ...current, clinicHours: toDentalSchedule(schedule) } : current));
  }, []);

  const handleProviderHoursChange = useCallback((userId: number, schedule: DaySchedule[]) => {
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        providerHours: current.providerHours.map((entry) =>
          entry.userId === userId ? { ...entry, weeklySchedule: toDentalSchedule(schedule) } : entry,
        ),
      };
    });
  }, []);

  const team = teamQuery.data ?? [];
  const offices = chairsQuery.data ?? [];
  const memberName = useCallback(
    (userId: number) => {
      const member = team.find((m) => m.id === userId);
      return member?.fullName || member?.username || `#${userId}`;
    },
    [team],
  );

  const specialtyOptions = useMemo(() => {
    const list = draft
      ? listResolvableSpecialties(draft)
      : DENTAL_SYSTEM_SPECIALTIES.map((s) => ({ ...s, source: 'system' as const }));
    return list.map((specialty) =>
      specialty.source === 'system' && !Object.prototype.hasOwnProperty.call(draft?.specialtyLabelOverrides ?? {}, specialty.id)
        ? {
            ...specialty,
            label: t(`erp.dental.specialties.${specialty.id}`, specialty.label),
          }
        : specialty,
    );
  }, [draft, t]);

  const upsertProfile = useCallback((userId: number, patch: Partial<DentalSpecialistProfile>) => {
    setDraft((current) => {
      if (!current) return current;
      const existing = current.specialistProfiles.find((profile) => profile.userId === userId);
      const nextProfile: DentalSpecialistProfile = {
        userId,
        specialtyIds: existing?.specialtyIds ?? [],
        allowedChairIds: existing?.allowedChairIds ?? [],
        ...patch,
      };
      const without = current.specialistProfiles.filter((profile) => profile.userId !== userId);
      return { ...current, specialistProfiles: [...without, nextProfile] };
    });
  }, []);

  const toggleRosterMember = useCallback((userId: number, checked: boolean) => {
    setDraft((current) => {
      if (!current) return current;
      if (checked) {
        const profiles = current.specialistProfiles.some((p) => p.userId === userId)
          ? current.specialistProfiles
          : [...current.specialistProfiles, { userId, specialtyIds: [], allowedChairIds: [] }];
        return {
          ...current,
          bookableDentistUserIds: current.bookableDentistUserIds.includes(userId)
            ? current.bookableDentistUserIds
            : [...current.bookableDentistUserIds, userId],
          specialistProfiles: profiles,
        };
      }
      return {
        ...current,
        bookableDentistUserIds: current.bookableDentistUserIds.filter((id) => id !== userId),
        specialistProfiles: current.specialistProfiles.filter((p) => p.userId !== userId),
      };
    });
  }, []);

  const overridableProviders = useMemo(() => {
    if (!draft) return [];
    const overridden = new Set(draft.providerHours.map((entry) => entry.userId));
    const roster = draft.bookableDentistUserIds.length > 0
      ? team.filter((m) => draft.bookableDentistUserIds.includes(m.id))
      : team;
    return roster.filter((m) => !overridden.has(m.id));
  }, [draft, team]);

  const handleSave = useCallback(() => {
    if (!draft || !dentalSlotStepMinutesSchema.safeParse(draft.slotStepMinutes).success) return;
    const incomplete = draft.bookableDentistUserIds.filter((userId) => {
      const profile = draft.specialistProfiles.find((p) => p.userId === userId);
      return !profile || profile.specialtyIds.length === 0 || profile.allowedChairIds.length === 0;
    });
    if (incomplete.length > 0) {
      toast({
        title: t('erp.dental.booking.settings.specialists.incompleteTitle', 'Specialists incomplete'),
        description: t(
          'erp.dental.booking.settings.specialists.incompleteBody',
          '{{count}} specialist(s) are missing a specialty or allowed office. They will stay on the roster but the AI will not book them until both are set.',
          { count: incomplete.length },
        ),
      });
    }
    const missingProduct = draft.bookableCatalog.filter((item) => item.productId == null);
    if (missingProduct.length > 0) {
      toast({
        title: t('ui.common.error', 'Error'),
        description: t(
          'erp.dental.booking.settings.catalog.productRequired',
          'Select a service product for every bookable service before saving.',
        ),
        variant: 'destructive',
      });
      return;
    }
    const invalidDuration = draft.bookableCatalog.filter(
      (item) =>
        !Number.isFinite(item.durationMinutes) ||
        !Number.isInteger(item.durationMinutes) ||
        item.durationMinutes < 5,
    );
    if (invalidDuration.length > 0) {
      toast({
        title: t('ui.common.error', 'Error'),
        description: t(
          'erp.dental.booking.settings.catalog.durationRequired',
          'Every bookable service needs a valid duration in minutes before saving.',
        ),
        variant: 'destructive',
      });
      return;
    }
    const missingSpecialty = draft.bookableCatalog.filter((item) => !item.specialtyId?.trim());
    if (missingSpecialty.length > 0) {
      toast({
        title: t('ui.common.error', 'Error'),
        description: t(
          'erp.dental.booking.settings.catalog.specialtyRequired',
          'Every bookable service needs a specialty before saving.',
        ),
        variant: 'destructive',
      });
      return;
    }
    saveMutation.mutate(draft);
  }, [draft, saveMutation, t, toast]);

  const usedProductIds = useMemo(() => {
    if (!draft) return new Set<number>();
    return new Set(
      draft.bookableCatalog
        .map((item) => item.productId)
        .filter((id): id is number => typeof id === 'number'),
    );
  }, [draft]);

  const applyCatalogProduct = useCallback(
    (index: number, product: ServiceProductOption) => {
      setDraft((current) => {
        if (!current) return current;
        const existing = current.bookableCatalog[index];
        if (!existing) return current;
        const filled = catalogFieldsFromServiceProduct(product, current.bookableCatalog, {
          specialtyId: existing.specialtyId || DEFAULT_DENTAL_SPECIALTY_ID,
          visitType: existing.visitType,
          isActive: existing.isActive,
        });
        return {
          ...current,
          bookableCatalog: current.bookableCatalog.map((row, i) => (i === index ? filled : row)),
        };
      });
      setProductPickerOpenIndex(null);
      setProductSearch('');
    },
    [],
  );

  const addCustomSpecialty = useCallback(() => {
    if (!draft || !canManage || draft.customSpecialties.length >= DENTAL_POLICY_MAX_CUSTOM_SPECIALTIES) return;
    const label = customSpecialtyLabel.trim();
    if (!label || label.length > 120) return;
    const baseId = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48);
    const taken = new Set([
      ...DENTAL_SYSTEM_SPECIALTIES.map((s) => s.id),
      ...draft.customSpecialties.map((s) => s.id),
    ]);
    let id = baseId || `custom_${draft.customSpecialties.length + 1}`;
    let n = 2;
    while (taken.has(id)) {
      id = `${baseId || 'custom'}_${n}`;
      n += 1;
    }
    update({
      customSpecialties: [...draft.customSpecialties, { id, label }],
    });
    setCustomSpecialtyLabel('');
  }, [canManage, customSpecialtyLabel, draft, update]);

  if (policyQuery.isLoading || !draft) {
    return (
      <DentalShellPage
        title={t('erp.dental.booking.settings.title', 'Booking settings')}
        description={t(
          'erp.dental.booking.settings.description',
          'Services, specialists, offices, hours and booking authority used by the schedule and the AI assistant.',
        )}
        contentClassName="booking-settings-scrollbar"
      >
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('erp.common.loading', 'Loading...')}
        </div>
      </DentalShellPage>
    );
  }

  const intervalInvalid = !dentalSlotStepMinutesSchema.safeParse(draft.slotStepMinutes).success;
  const showHoldTimeout = draft.authorityMode !== 'instant';

  return (
    <DentalShellPage
      title={t('erp.dental.booking.settings.title', 'Booking settings')}
      description={t(
        'erp.dental.booking.settings.description',
        'Services, specialists, offices, hours and booking authority used by the schedule and the AI assistant.',
      )}
      contentClassName="booking-settings-scrollbar"
      actions={
        canManage ? (
          <>
            <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.discard"
              type="button"
              variant="outline"
              className="w-full sm:w-auto"
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => {
                setFieldErrors([]);
                setDraft(saved ? structuredClone(saved) : null);
              }}
            >
              {t('erp.dental.booking.settings.discard', 'Discard changes')}
            </Button>
            <Button data-tour="pages-erp-dental-booking-settings.button.erp.common.save"
              type="button"
              className="w-full sm:w-auto"
              disabled={!isDirty || saveMutation.isPending || intervalInvalid}
              onClick={handleSave}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {t('erp.common.save', 'Save')}
            </Button>
          </>
        ) : null
      }
    >
      {!canManage && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {t(
            'erp.dental.booking.settings.readOnly',
            'You have read-only access. The manage dental schedule permission is required to change these settings.',
          )}
        </div>
      )}

      {fieldErrors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          <div className="font-medium">
            {t('erp.dental.booking.settings.validationFailed', 'Some settings could not be saved')}
          </div>
          <ul className="mt-1 list-disc pl-5">
            {fieldErrors.map((error, index) => (
              <li key={`${error.path}-${index}`}>
                {error.path ? `${error.path}: ` : ''}
                {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <SettingsSectionCard
        icon={Calendar}
        title={t('erp.dental.booking.settings.catalog.title', 'Bookable services')}
        description={t(
          'erp.dental.booking.settings.catalog.description',
          'Choose active ERP products of type Service. Duration drives the slots offered; the visit type is written onto the appointment.',
        )}
        headerActions={
          canManage ? (
            <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.catalog.add"
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() =>
                update({
                  bookableCatalog: [...draft.bookableCatalog, emptyCatalogRow()],
                })
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('erp.dental.booking.settings.catalog.add', 'Add service')}
            </Button>
          ) : null
        }
      >
        <div className="space-y-3">
          {draft.bookableCatalog.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('erp.dental.booking.settings.catalog.empty', 'No services yet. Add one to make online booking possible.')}
            </p>
          ) : (
            <div className="booking-settings-scrollbar -mx-1 max-h-[60vh] w-full max-w-full overflow-scroll rounded-md border [scrollbar-gutter:stable] sm:mx-0">
              <Table data-tour="pages-erp-dental-booking-settings.table.erp.dental.booking.settings.catalog.product" className="min-w-[64rem] table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[23%]">
                      {t('erp.dental.booking.settings.catalog.product', 'Service')}
                    </TableHead>
                    <TableHead className="w-[20%]">
                      {t('erp.dental.booking.settings.catalog.label', 'Label')}
                    </TableHead>
                    <TableHead className="w-[9%]">
                      {t('erp.dental.booking.settings.catalog.duration', 'Minutes')}
                    </TableHead>
                    <TableHead className="w-[18%]">
                      {t('erp.dental.booking.settings.catalog.visitType', 'Visit type')}
                    </TableHead>
                    <TableHead className="w-[18%]">
                      {t('erp.dental.booking.settings.catalog.specialty', 'Specialty')}
                    </TableHead>
                    <TableHead className="w-[7%]">
                      {t('erp.dental.booking.settings.catalog.active', 'Active')}
                    </TableHead>
                    <TableHead className="w-[5%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {draft.bookableCatalog.map((item, index) => (
                    <TableRow key={item.productId ?? `row-${index}`}>
                      <TableCell>
                        <Popover
                          open={productPickerOpenIndex === index}
                          onOpenChange={(open) => {
                            setProductPickerOpenIndex(open ? index : null);
                            if (!open) setProductSearch('');
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.catalog.pickProduct"
                              type="button"
                              variant="ghost"
                              role="combobox"
                              disabled={!canManage}
                              className="h-auto w-full justify-between px-2 py-1.5 font-normal hover:bg-muted/50"
                            >
                              <span className="min-w-0 truncate text-left">
                                <span className="block text-sm">
                                  {item.label ||
                                    t(
                                      'erp.dental.booking.settings.catalog.pickProduct',
                                      'Select a service product…',
                                    )}
                                </span>
                                {item.id ? (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {t('erp.dental.booking.settings.catalog.id', 'Key')}: {item.id}
                                  </span>
                                ) : null}
                              </span>
                              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput
                                placeholder={t(
                                  'erp.dental.booking.settings.catalog.searchProducts',
                                  'Search services…',
                                )}
                                value={productSearch}
                                onValueChange={setProductSearch}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {productsQuery.isLoading
                                    ? t('erp.common.loading', 'Loading...')
                                    : t(
                                        'erp.dental.booking.settings.catalog.noProducts',
                                        'No service products found — create one under ERP Products',
                                      )}
                                </CommandEmpty>
                                {(productsQuery.data ?? [])
                                  .filter(
                                    (product) =>
                                      product.id === item.productId || !usedProductIds.has(product.id),
                                  )
                                  .map((product) => (
                                    <CommandItem
                                      key={product.id}
                                      value={String(product.id)}
                                      onSelect={() => applyCatalogProduct(index, product)}
                                    >
                                      <Check
                                        className={cn(
                                          'mr-2 h-4 w-4',
                                          item.productId === product.id ? 'opacity-100' : 'opacity-0',
                                        )}
                                      />
                                      <div>
                                        <div>{product.name}</div>
                                        <div className="text-xs text-muted-foreground">
                                          {product.sku ? `${product.sku} · ` : ''}
                                          {product.estimatedDurationMinutes != null
                                            ? t(
                                                'erp.dental.booking.settings.catalog.productDuration',
                                                '{{minutes}} min',
                                                { minutes: product.estimatedDurationMinutes },
                                              )
                                            : t(
                                                'erp.dental.booking.settings.catalog.productNoDuration',
                                                'No estimated duration',
                                              )}
                                        </div>
                                      </div>
                                    </CommandItem>
                                  ))}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        <Input data-tour="pages-erp-dental-booking-settings.input.erp.dental.booking.settings.catalog.labelPlaceholder"
                          value={item.label}
                          disabled={!canManage || item.productId == null}
                          placeholder={t('erp.dental.booking.settings.catalog.labelPlaceholder', 'Cleaning')}
                          onChange={(e) =>
                            update({
                              bookableCatalog: draft.bookableCatalog.map((row, i) =>
                                i === index ? { ...row, label: e.target.value } : row,
                              ),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input data-tour="pages-erp-dental-booking-settings.input.item.durationMinutes"
                          type="number"
                          min={5}
                          step={5}
                          value={item.durationMinutes}
                          disabled={!canManage || item.productId == null}
                          onChange={(e) =>
                            update({
                              bookableCatalog: draft.bookableCatalog.map((row, i) =>
                                i === index ? { ...row, durationMinutes: Number(e.target.value) } : row,
                              ),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Input data-tour="pages-erp-dental-booking-settings.input.erp.dental.booking.settings.catalog.visitTypePlaceholder"
                          value={item.visitType ?? ''}
                          disabled={!canManage}
                          placeholder={t('erp.dental.booking.settings.catalog.visitTypePlaceholder', 'consultation')}
                          onChange={(e) =>
                            update({
                              bookableCatalog: draft.bookableCatalog.map((row, i) =>
                                i === index
                                  ? { ...row, visitType: e.target.value.trim() ? e.target.value : undefined }
                                  : row,
                              ),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Select
                          value={item.specialtyId || DEFAULT_DENTAL_SPECIALTY_ID}
                          disabled={!canManage}
                          onValueChange={(value) =>
                            update({
                              bookableCatalog: draft.bookableCatalog.map((row, i) =>
                                i === index ? { ...row, specialtyId: value } : row,
                              ),
                            })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent searchable>
                            {specialtyOptions.map((specialty) => (
                              <SelectItem key={specialty.id} value={specialty.id}>
                                {specialty.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.isActive}
                          disabled={!canManage}
                          onCheckedChange={(checked) =>
                            update({
                              bookableCatalog: draft.bookableCatalog.map((row, i) =>
                                i === index ? { ...row, isActive: checked } : row,
                              ),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.catalog.remove"
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={!canManage}
                          aria-label={t('erp.dental.booking.settings.catalog.remove', 'Remove service')}
                          onClick={() => setServiceDeleteIndex(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={Users}
        title={t('erp.dental.booking.settings.specialists.title', 'Specialists')}
        description={t(
          'erp.dental.booking.settings.specialists.description',
          'Add specialists from your team, assign specialties and allowed offices. AI booking requires both. Add or edit shared clinic offices below.',
        )}
        headerActionsClassName="lg:w-[380px] xl:w-[420px] lg:shrink-0"
        headerActions={
          canManage ? (
            <div className="w-full space-y-2 rounded-xl border bg-muted/20 p-3">
              <Label htmlFor="new-dental-specialty" className="text-sm font-medium">
                {t('erp.dental.booking.settings.specialties.customTitle', 'Custom specialties')}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input data-tour="pages-erp-dental-booking-settings.input.erp.dental.booking.settings.specialties.addPlaceholder"
                  id="new-dental-specialty"
                  value={customSpecialtyLabel}
                  maxLength={120}
                  placeholder={t('erp.dental.booking.settings.specialties.addPlaceholder', 'e.g. Implantology')}
                  onChange={(e) => setCustomSpecialtyLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addCustomSpecialty();
                    }
                  }}
                  className="h-10 w-full min-w-0 bg-background sm:flex-1"
                  aria-label={t('erp.dental.booking.settings.specialties.addLabel', 'New specialty')}
                  disabled={draft.customSpecialties.length >= DENTAL_POLICY_MAX_CUSTOM_SPECIALTIES}
                />
                <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.specialties.add" type="button" variant="brand" className="h-10 w-full shrink-0 px-3 sm:w-auto"
                  disabled={!customSpecialtyLabel.trim() || draft.customSpecialties.length >= DENTAL_POLICY_MAX_CUSTOM_SPECIALTIES}
                  onClick={addCustomSpecialty}>
                  <Plus className="h-4 w-4" />
                  {t('erp.dental.booking.settings.specialties.add', 'Add specialty')}
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        <div className="space-y-4">
          {draft.customSpecialties.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draft.customSpecialties.map((specialty) => (
                <div
                  key={specialty.id}
                  className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border px-2 py-1 text-sm"
                >
                  <span className="truncate">{specialty.label}</span>
                  {canManage && (
                    <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.specialties.editNamed" type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                      aria-label={t('erp.dental.booking.settings.specialties.editNamed', 'Edit specialty {{name}}', { name: specialty.label })}
                      onClick={() => setEditingSpecialty({ ...specialty, source: 'custom' })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canManage && (
                    <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.specialties.remove"
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      aria-label={t('erp.dental.booking.settings.specialties.remove', 'Remove specialty')}
                      onClick={() =>
                        update({
                          customSpecialties: draft.customSpecialties.filter((s) => s.id !== specialty.id),
                          specialistProfiles: draft.specialistProfiles.map((profile) => ({
                            ...profile,
                            specialtyIds: profile.specialtyIds.filter((id) => id !== specialty.id),
                          })),
                          bookableCatalog: draft.bookableCatalog.map((item) =>
                            item.specialtyId === specialty.id
                              ? { ...item, specialtyId: DEFAULT_DENTAL_SPECIALTY_ID }
                              : item,
                          ),
                        })
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {teamQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('erp.common.loading', 'Loading...')}
            </div>
          ) : team.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('erp.dental.booking.settings.specialists.empty', 'No team members found.')}
            </p>
          ) : (
            <div className="min-w-0 space-y-3">
              {team.map((member) => {
                const checked = draft.bookableDentistUserIds.includes(member.id);
                const profile =
                  draft.specialistProfiles.find((p) => p.userId === member.id) ?? {
                    userId: member.id,
                    specialtyIds: [] as string[],
                    allowedChairIds: [] as number[],
                  };
                const aiReady =
                  checked && profile.specialtyIds.length > 0 &&
                  offices.some((office) => office.isActive && profile.allowedChairIds.includes(office.id));
                return (
                  <div key={member.id} className="space-y-3 rounded-lg border bg-muted/20 p-3 sm:p-4">
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <Checkbox
                        className="mt-0.5"
                        checked={checked}
                        disabled={!canManage}
                        onCheckedChange={(value) => toggleRosterMember(member.id, value === true)}
                      />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {member.fullName || member.username || `#${member.id}`}
                        </span>
                        {checked && (
                          <span
                            className={`mt-0.5 block text-xs font-medium ${aiReady ? 'text-primary' : 'text-amber-600 dark:text-amber-400'}`}
                          >
                            {aiReady
                              ? t('erp.dental.booking.settings.specialists.aiReady', 'AI bookable')
                              : t(
                                  'erp.dental.booking.settings.specialists.aiIncomplete',
                                  'Needs specialty + office',
                                )}
                          </span>
                        )}
                      </div>
                    </label>
                    {checked && (
                      <div className="grid min-w-0 gap-3 md:grid-cols-2 md:pl-6">
                        <div className="min-w-0 space-y-2">
                          <div className="flex h-8 items-center">
                            <Label>{t('erp.dental.booking.settings.specialists.specialties', 'Specialties')}</Label>
                          </div>
                          <div className="booking-settings-scrollbar max-h-40 min-w-0 space-y-1 overflow-auto rounded-md border p-2">
                            {specialtyOptions.map((specialty) => {
                              const selected = profile.specialtyIds.includes(specialty.id);
                              return (
                                <div key={specialty.id} className="flex items-center gap-2 rounded px-1 text-sm hover:bg-muted/40">
                                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1">
                                    <Checkbox
                                      checked={selected}
                                      disabled={!canManage}
                                      onCheckedChange={(value) => {
                                        const specialtyIds = value === true
                                          ? [...profile.specialtyIds, specialty.id]
                                          : profile.specialtyIds.filter((id) => id !== specialty.id);
                                        upsertProfile(member.id, { specialtyIds });
                                      }}
                                    />
                                    <span className="min-w-0 truncate" title={specialty.label}>{specialty.label}</span>
                                  </label>
                                  {canManage && (
                                    <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.specialties.editNamed" type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                                      aria-label={t('erp.dental.booking.settings.specialties.editNamed', 'Edit specialty {{name}}', { name: specialty.label })}
                                      onClick={() => setEditingSpecialty(specialty)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="min-w-0 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label>{t('erp.dental.booking.settings.specialists.offices', 'Allowed offices')}</Label>
                            {canManage && (
                              <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.chairs.add" type="button" size="icon" variant="brand" className="h-8 w-8 shrink-0"
                                aria-label={t('erp.dental.chairs.add', 'Add office')}
                                onClick={() => setOfficeEditor({ office: null })}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          {chairsQuery.isLoading ? (
                            <p className="text-xs text-muted-foreground">{t('erp.common.loading', 'Loading...')}</p>
                          ) : chairsQuery.isError ? (
                            <p role="alert" className="text-xs text-destructive">{t('erp.dental.chairs.loadFailed', 'Could not load offices. Please try again.')}</p>
                          ) : offices.length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('erp.dental.booking.settings.specialists.noOffices', 'No offices yet. Use + to add a clinic office.')}</p>
                          ) : (
                            <div className="booking-settings-scrollbar max-h-40 min-w-0 space-y-1 overflow-auto rounded-md border p-2">
                              {offices.map((office) => {
                                const selected = profile.allowedChairIds.includes(office.id);
                                return (
                                  <div key={office.id} className="flex items-center gap-2 text-sm">
                                    <label className="flex min-w-0 flex-1 items-center gap-2">
                                      <Checkbox checked={selected} disabled={!canManage || (!office.isActive && !selected)}
                                        onCheckedChange={(value) => {
                                          if (value === true && !office.isActive) return;
                                          const allowedChairIds = value === true
                                            ? [...profile.allowedChairIds, office.id]
                                            : profile.allowedChairIds.filter((id) => id !== office.id);
                                          upsertProfile(member.id, { allowedChairIds });
                                        }} />
                                      <span className="min-w-0 truncate">{office.name} ({office.code})</span>
                                    </label>
                                    {!office.isActive && <Badge variant="secondary">{t('erp.dental.chairs.disabled', 'Disabled')}</Badge>}
                                    {canManage && (
                                      <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.chairs.editNamed" type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0"
                                        aria-label={t('erp.dental.chairs.editNamed', 'Edit office {{name}}', { name: office.name })}
                                        onClick={() => setOfficeEditor({ office })}>
                                        <Pencil className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {chairsQuery.isSuccess && !offices.some((office) => office.isActive && profile.allowedChairIds.includes(office.id)) && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">{t('erp.dental.booking.settings.specialists.noActiveOffice', 'This specialist has no active allowed office. Assign or enable an office for AI booking.')}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={Shield}
        title={t('erp.dental.booking.settings.rules.title', 'Capacity and authority')}
        description={t(
          'erp.dental.booking.settings.rules.description',
          'What has to be free for a slot to count, and how much a booking request can do on its own. Specialists with allowed offices always book into those offices for AI.',
        )}
      >
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <div className="min-w-0 space-y-1 md:col-span-2">
            <Label htmlFor="dental-slot-interval">{t('erp.dental.booking.settings.interval.label', 'Appointment time interval (minutes)')}</Label>
            <Input data-tour="pages-erp-dental-booking-settings.input.dental-slot-interval" id="dental-slot-interval" className="max-w-xs" type="number" min={5} max={60} step={5}
              value={draft.slotStepMinutes || ''} disabled={!canManage} aria-invalid={intervalInvalid}
              aria-describedby={intervalInvalid ? 'dental-interval-error' : 'dental-interval-help'}
              onChange={(event) => update({ slotStepMinutes: Number(event.target.value) })} />
            <p id="dental-interval-help" className="text-xs text-muted-foreground">{t('erp.dental.booking.settings.interval.help', 'Choose a multiple of 5 from 5 to 60. Controls start times for staff and AI bookings; service durations and conflict checks still apply.')}</p>
            {intervalInvalid && <p id="dental-interval-error" role="alert" className="text-xs text-destructive">{t('erp.dental.booking.settings.interval.invalid', 'Enter a whole number from 5 to 60 in multiples of 5.')}</p>}
          </div>
          <div className="min-w-0 space-y-1">
            <Label>{t('erp.dental.booking.settings.rules.capacityMode', 'Capacity mode')}</Label>
            <Select
              value={draft.capacityMode}
              disabled={!canManage}
              onValueChange={(value) => update({ capacityMode: value as DentalBookingPolicy['capacityMode'] })}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent searchable>
                {DENTAL_CAPACITY_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {mode === 'provider'
                      ? t('erp.dental.booking.settings.rules.capacityProvider', 'Provider only')
                      : t('erp.dental.booking.settings.rules.capacityProviderChair', 'Provider and office')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {draft.capacityMode === 'provider'
                ? t(
                    'erp.dental.booking.settings.rules.capacityProviderHelp',
                    'Only the specialist has to be free. Offices are ignored when checking availability unless the specialist has allowed offices configured.',
                  )
                : t(
                    'erp.dental.booking.settings.rules.capacityProviderChairHelp',
                    'A free office is also required, so clinics without offices will have no bookable slots.',
                  )}
            </p>
          </div>

          <div className="min-w-0 space-y-1">
            <Label>{t('erp.dental.booking.settings.rules.authorityMode', 'Booking authority')}</Label>
            <Select
              value={draft.authorityMode}
              disabled={!canManage}
              onValueChange={(value) => update({ authorityMode: value as DentalBookingPolicy['authorityMode'] })}
            >
              <SelectTrigger className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent searchable>
                {DENTAL_AUTHORITY_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {mode === 'instant'
                      ? t('erp.dental.booking.settings.rules.authorityInstant', 'Instant booking')
                      : mode === 'hold'
                        ? t('erp.dental.booking.settings.rules.authorityHold', 'Hold the slot')
                        : t('erp.dental.booking.settings.rules.authorityRequest', 'Request approval')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {draft.authorityMode === 'instant'
                ? t(
                    'erp.dental.booking.settings.rules.authorityInstantHelp',
                    'The appointment is confirmed straight away.',
                  )
                : draft.authorityMode === 'hold'
                  ? t(
                      'erp.dental.booking.settings.rules.authorityHoldHelp',
                      'The slot is held until it expires or staff confirm it.',
                    )
                  : t(
                      'erp.dental.booking.settings.rules.authorityRequestHelp',
                      'Nothing is booked until staff approve the request.',
                    )}
            </p>
          </div>

          {showHoldTimeout && (
            <div className="min-w-0 space-y-1 md:col-span-2 lg:col-span-1">
              <Label>{t('erp.dental.booking.settings.rules.holdTimeout', 'Hold expires after (minutes)')}</Label>
              <Input data-tour="pages-erp-dental-booking-settings.input.erp.dental.booking.settings.rules.holdTimeout"
                type="number"
                min={DENTAL_HOLD_TIMEOUT_MIN_MINUTES}
                max={DENTAL_HOLD_TIMEOUT_MAX_MINUTES}
                value={draft.holdTimeoutMinutes}
                disabled={!canManage}
                onChange={(e) => update({ holdTimeoutMinutes: Number(e.target.value) })}
              />
            </div>
          )}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={Clock}
        title={t('erp.dental.booking.settings.hours.title', 'Clinic hours')}
        description={t(
          'erp.dental.booking.settings.hours.description',
          'Wall-clock opening hours and breaks, interpreted in the company default timezone. Dentists without an override follow these hours.',
        )}
        headerActions={
          <WeeklyScheduleQuickActions
            schedule={draft.clinicHours}
            offDays={offDaysOf(draft.clinicHours)}
            onScheduleChange={handleClinicHoursChange}
            onOffDaysChange={() => {}}
            disabled={!canManage}
            highlightWeekdays
            className="w-full sm:w-auto"
          />
        }
      >
        <div className="booking-settings-scrollbar max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
          <WeeklyScheduleEditor
            schedule={draft.clinicHours}
            offDays={offDaysOf(draft.clinicHours)}
            onScheduleChange={handleClinicHoursChange}
            onOffDaysChange={() => {}}
            disabled={!canManage}
            scrollbarClassName="booking-settings-scrollbar"
            showQuickActions={false}
          />
        </div>
      </SettingsSectionCard>

      <div className="grid min-w-0 gap-4 xl:grid-cols-2">
        <SettingsSectionCard
          icon={CalendarClock}
          title={t('erp.dental.booking.settings.providerHours.title', 'Per-dentist hours')}
          description={t(
            'erp.dental.booking.settings.providerHours.description',
            'Optional overrides. A dentist without an override is bookable during clinic hours.',
          )}
          className="min-w-0"
        >
          <div className="min-w-0 space-y-4">
            {draft.providerHours.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {t(
                  'erp.dental.booking.settings.providerHours.empty',
                  'No overrides. Every dentist follows clinic hours.',
                )}
              </p>
            )}

            {draft.providerHours.map((entry) => {
              const expanded = expandedProviderHours.has(entry.userId);
              return (
                <Collapsible
                  key={entry.userId}
                  open={expanded}
                  onOpenChange={(open) => {
                    setExpandedProviderHours((current) => {
                      const next = new Set(current);
                      if (open) next.add(entry.userId);
                      else next.delete(entry.userId);
                      return next;
                    });
                  }}
                >
                  <div className="min-w-0 overflow-hidden rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-1 p-2 sm:gap-2 sm:p-3">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium hover:text-primary"
                        >
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                              !expanded && '-rotate-90',
                            )}
                          />
                          <span className="truncate">{memberName(entry.userId)}</span>
                        </button>
                      </CollapsibleTrigger>
                      <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.providerHours.remove"
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={!canManage}
                        className="h-8 w-8 shrink-0"
                        aria-label={t(
                          'erp.dental.booking.settings.providerHours.remove',
                          'Use clinic hours',
                        )}
                        onClick={() => {
                          setExpandedProviderHours((current) => {
                            const next = new Set(current);
                            next.delete(entry.userId);
                            return next;
                          });
                          update({
                            providerHours: draft.providerHours.filter((row) => row.userId !== entry.userId),
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CollapsibleContent className="min-w-0 border-t px-1 pb-3 pt-2 sm:px-3">
                      <div className="booking-settings-scrollbar max-w-full min-w-0 overflow-x-auto overscroll-x-contain">
                        <WeeklyScheduleEditor
                          schedule={entry.weeklySchedule}
                          offDays={offDaysOf(entry.weeklySchedule)}
                          onScheduleChange={(schedule) => handleProviderHoursChange(entry.userId, schedule)}
                          onOffDaysChange={() => {}}
                          disabled={!canManage}
                          scrollbarClassName="booking-settings-scrollbar"
                          showQuickActions={false}
                          compact
                        />
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}

            {canManage && overridableProviders.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="w-full space-y-1 sm:w-auto sm:min-w-[220px]">
                  <Label>{t('erp.dental.booking.settings.providerHours.add', 'Add override')}</Label>
                  <Select value={providerToAdd} onValueChange={setProviderToAdd}>
                    <SelectTrigger data-tour="pages-erp-dental-booking-settings.selecttrigger.erp.dental.booking.settings.providerHours.selectDentist" className="w-full sm:w-[220px]">
                      <SelectValue
                        placeholder={t(
                          'erp.dental.booking.settings.providerHours.selectDentist',
                          'Select a dentist',
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent searchable>
                      {overridableProviders.map((member) => (
                        <SelectItem key={member.id} value={String(member.id)}>
                          {member.fullName || member.username || `#${member.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.providerHours.addButton"
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={!providerToAdd}
                  onClick={() => {
                    const userId = Number(providerToAdd);
                    if (!userId) return;
                    update({
                      providerHours: [
                        ...draft.providerHours,
                        { userId, weeklySchedule: structuredClone(draft.clinicHours) },
                      ],
                    });
                    setExpandedProviderHours((current) => new Set(current).add(userId));
                    setProviderToAdd('');
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('erp.dental.booking.settings.providerHours.addButton', 'Add')}
                </Button>
              </div>
            )}
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          icon={FileText}
          title={t('erp.dental.booking.settings.autoAdd.title', 'Automatic patient records')}
          description={t(
            'erp.dental.booking.settings.autoAdd.description',
            'Create a dental patient record for every contact instead of adding patients by hand.',
          )}
          className="min-w-0"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Switch
              checked={draft.autoAddPatients}
              disabled={!canManage}
              onCheckedChange={(checked) => {
                if (checked) {
                  setAutoAddConfirmOpen(true);
                  return;
                }
                update({ autoAddPatients: false });
              }}
            />
            <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
              <Label>{t('erp.dental.booking.settings.autoAdd.toggle', 'Add every contact as a patient')}</Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'erp.dental.booking.settings.autoAdd.help',
                  'Off by default. Saving with this on converts existing contacts and auto-adds new ones. Turning it off removes empty auto-created patient records only.',
                )}
              </p>
            </div>
          </div>
        </SettingsSectionCard>
        <AutomaticReminderSettings value={draft.automaticReminders}
          onChange={automaticReminders => update({ automaticReminders })} disabled={!canManage} />
      </div>

      <Dialog open={editingSpecialty !== null} onOpenChange={(open) => { if (!open) setEditingSpecialty(null); }}>
        <DialogContent data-tour="pages-erp-dental-booking-settings.dialogcontent.erp.dental.booking.settings.specialties.editTitle" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('erp.dental.booking.settings.specialties.editTitle', 'Edit specialty')}</DialogTitle>
            <DialogDescription>{t('erp.dental.booking.settings.specialties.editHelp', 'This name is shared across the clinic. Provider and service assignments stay the same. Save booking settings to publish the change.')}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (!canManage || !editingSpecialty?.label.trim()) return;
            const label = editingSpecialty.label.trim();
            if (editingSpecialty.source === 'custom') {
              update({ customSpecialties: draft.customSpecialties.map((specialty) =>
                specialty.id === editingSpecialty.id ? { ...specialty, label } : specialty) });
            } else {
              update({ specialtyLabelOverrides: { ...draft.specialtyLabelOverrides, [editingSpecialty.id]: label } });
            }
            setEditingSpecialty(null);
          }}>
            <div className="space-y-2">
              <Label htmlFor="dental-specialty-name">{t('erp.dental.booking.settings.specialties.name', 'Specialty name')}</Label>
              <Input data-tour="pages-erp-dental-booking-settings.input.dental-specialty-name" id="dental-specialty-name" required maxLength={120} disabled={!canManage}
                value={editingSpecialty?.label ?? ''}
                onChange={(event) => setEditingSpecialty((current) => current ? { ...current, label: event.target.value } : null)} />
            </div>
            <DialogFooter>
              <Button data-tour="pages-erp-dental-booking-settings.button.ui.common.cancel" type="button" variant="outline" onClick={() => setEditingSpecialty(null)}>{t('ui.common.cancel', 'Cancel')}</Button>
              <Button data-tour="pages-erp-dental-booking-settings.button.erp.dental.booking.settings.specialties.apply" type="submit" disabled={!canManage || !editingSpecialty?.label.trim()}>{t('erp.dental.booking.settings.specialties.apply', 'Apply change')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DentalOfficeEditor open={officeEditor !== null} office={officeEditor?.office ?? null} onOpenChange={(open) => { if (!open) setOfficeEditor(null); }} />

      <AlertDialog open={autoAddConfirmOpen} onOpenChange={setAutoAddConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('erp.dental.booking.settings.autoAdd.confirmTitle', 'Add every contact as a patient?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {previewQuery.isLoading
                ? t('erp.common.loading', 'Loading...')
                : t(
                    'erp.dental.booking.settings.autoAdd.confirmBody',
                    '{{eligible}} contacts have no patient record yet and {{existing}} are already patients. Saving will convert the eligible contacts and new contacts will become patients automatically.',
                    {
                      eligible: previewQuery.data?.eligibleContactCount ?? 0,
                      existing: previewQuery.data?.existingPatientCount ?? 0,
                    },
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                update({ autoAddPatients: true });
                setAutoAddConfirmOpen(false);
              }}
            >
              {t('erp.dental.booking.settings.autoAdd.confirmAction', 'Turn on')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={serviceDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setServiceDeleteIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('erp.dental.booking.settings.catalog.removeConfirmTitle', 'Remove bookable service?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'erp.dental.booking.settings.catalog.removeConfirmBody',
                'Are you sure you want to remove {{service}} from bookable services? This change will take effect after you save.',
                {
                  service:
                    serviceDeleteIndex !== null
                      ? draft.bookableCatalog[serviceDeleteIndex]?.label ||
                        t('erp.dental.booking.settings.catalog.unnamedService', 'this service')
                      : '',
                },
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (serviceDeleteIndex === null) return;
                update({
                  bookableCatalog: draft.bookableCatalog.filter((_, index) => index !== serviceDeleteIndex),
                });
                setServiceDeleteIndex(null);
              }}
            >
              {t('erp.dental.booking.settings.catalog.removeConfirmAction', 'Remove service')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DentalShellPage>
  );
}

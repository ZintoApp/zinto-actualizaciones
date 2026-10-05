import { useQuickAction } from '@/hooks/use-quick-action';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { DentalShellPage } from './dental-shell';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { AddDentalPatientDialog } from '@/components/erp/dental/AddDentalPatientDialog';
import { ToothIcon } from '@/components/erp/dental/ToothIcon';
import {
  Calendar,
  CalendarClock,
  ClipboardList,
  Filter,
  Loader2,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  UserPlus2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type PatientListItem = {
  id: number;
  contactId: number;
  dateOfBirth: string | null;
  sex: string | null;
  lastVisitAt: string | null;
  contact: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    tags: string[] | null;
    avatarUrl: string | null;
    isActive: boolean | null;
  };
};

type PatientStats = {
  total: number;
  newThisMonth: number;
  upcomingAppointmentsNext7Days: number;
  withActiveTreatmentPlans: number;
  availableTags: string[];
};

type FilterDraft = {
  search: string;
  status: 'all' | 'active' | 'inactive';
  tag: string;
  sex: string;
};

const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const SEX_FILTER_OPTIONS = ['Male', 'Female', 'Other'] as const;

function formatPatientId(id: number): string {
  return `P-${String(id).padStart(5, '0')}`;
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function emptyFilters(): FilterDraft {
  return { search: '', status: 'all', tag: 'all', sex: 'all' };
}

export default function DentalPatientsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { PERMISSIONS, hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_PATIENTS);
  const canViewChart =
    hasPermission(PERMISSIONS.VIEW_DENTAL_CHART) || hasPermission(PERMISSIONS.EDIT_DENTAL_CHART);
  const queryClient = useQueryClient();

  const [draftFilters, setDraftFilters] = useState<FilterDraft>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const offset = (page - 1) * pageSize;

  const patientsQuery = useQuery({
    queryKey: ['/api/erp/dental/patients', appliedFilters, pageSize, offset],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(offset),
      });
      if (appliedFilters.search.trim()) params.set('search', appliedFilters.search.trim());
      if (appliedFilters.status !== 'all') params.set('status', appliedFilters.status);
      if (appliedFilters.tag !== 'all') params.set('tag', appliedFilters.tag);
      if (appliedFilters.sex !== 'all') params.set('sex', appliedFilters.sex);
      const res = await apiRequest('GET', `/api/erp/dental/patients?${params}`);
      if (!res.ok) throw new Error('Failed to load patients');
      const json = await res.json();
      return json.data as { data: PatientListItem[]; total: number };
    },
  });

  const statsQuery = useQuery({
    queryKey: ['/api/erp/dental/patients/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/dental/patients/stats');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load patient stats');
      return json.data as PatientStats;
    },
  });

  const removePatientMutation = useMutation({
    mutationFn: async (contactId: number) => {
      const res = await apiRequest('DELETE', `/api/erp/dental/patients/${contactId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to remove patient');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
      toast({ title: t('erp.dental.patients.removed', 'Patient removed') });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const patients = patientsQuery.data?.data ?? [];
  const total = patientsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const availableTags = statsQuery.data?.availableTags ?? [];
  const stats = statsQuery.data;

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageNumbers = useMemo(() => {
    const pages: Array<number | 'ellipsis'> = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i += 1) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push('ellipsis');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i += 1) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  }, [page, totalPages]);

  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + pageSize, total);

  const applyFilters = () => {
    setAppliedFilters({ ...draftFilters });
    setPage(1);
  };

  const clearFilters = () => {
    const empty = emptyFilters();
    setDraftFilters(empty);
    setAppliedFilters(empty);
    setPage(1);
  };

  const filtersDirty =
    draftFilters.search !== appliedFilters.search ||
    draftFilters.status !== appliedFilters.status ||
    draftFilters.tag !== appliedFilters.tag ||
    draftFilters.sex !== appliedFilters.sex;

  useQuickAction('create-patient', { open: addOpen, onOpen: () => setAddOpen(true) });

  return (
    <DentalShellPage
      title={t('erp.dental.patients.title', 'Patients')}
      description={t(
        'erp.dental.patients.description',
        'Patients are contacts with a dental clinical profile. Clinic-specific extras stay on contact custom fields.',
      )}
      actions={
        canManage ? (
          <Button data-tour="pages-erp-dental-patients.button.erp.dental.patients.add" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('erp.dental.patients.add', 'Add Patient')}
          </Button>
        ) : undefined
      }
    >
      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Users className="h-4 w-4 text-emerald-500" />}
          iconClass="bg-emerald-500/10"
          label={t('erp.dental.patients.stats.total', 'Total Patients')}
          value={statsQuery.isLoading ? null : stats?.total ?? 0}
          hint={t('erp.dental.patients.stats.totalHint', 'All registered patients')}
        />
        <StatCard
          icon={<UserPlus2 className="h-4 w-4 text-sky-500" />}
          iconClass="bg-sky-500/10"
          label={t('erp.dental.patients.stats.newThisMonth', 'New This Month')}
          value={statsQuery.isLoading ? null : stats?.newThisMonth ?? 0}
          hint={t('erp.dental.patients.stats.newThisMonthHint', 'Profiles created this month')}
        />
        <StatCard
          icon={<CalendarClock className="h-4 w-4 text-violet-500" />}
          iconClass="bg-violet-500/10"
          label={t('erp.dental.patients.stats.upcoming', 'Upcoming Appointments')}
          value={statsQuery.isLoading ? null : stats?.upcomingAppointmentsNext7Days ?? 0}
          hint={t('erp.dental.patients.stats.upcomingHint', 'Next 7 days')}
        />
        <StatCard
          icon={<ClipboardList className="h-4 w-4 text-orange-500" />}
          iconClass="bg-orange-500/10"
          label={t('erp.dental.patients.stats.withPlans', 'With Treatment Plans')}
          value={statsQuery.isLoading ? null : stats?.withActiveTreatmentPlans ?? 0}
          hint={t('erp.dental.patients.stats.withPlansHint', 'Active plans')}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input data-tour="pages-erp-dental-patients.input.erp.dental.patients.searchPlaceholder"
                className="pl-8"
                value={draftFilters.search}
                onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyFilters();
                }}
                placeholder={t(
                  'erp.dental.patients.searchPlaceholder',
                  'Search patients by name, email, or phone...',
                )}
              />
            </div>
            <Select
              value={draftFilters.status}
              onValueChange={(value) =>
                setDraftFilters((f) => ({ ...f, status: value as FilterDraft['status'] }))
              }
            >
              <SelectTrigger data-tour="pages-erp-dental-patients.selecttrigger.erp.dental.patients.filter.allStatus" className="w-full lg:w-[140px]">
                <SelectValue placeholder={t('erp.dental.patients.filter.allStatus', 'All Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('erp.dental.patients.filter.allStatus', 'All Status')}</SelectItem>
                <SelectItem value="active">{t('erp.dental.patients.status.active', 'Active')}</SelectItem>
                <SelectItem value="inactive">{t('erp.dental.patients.status.inactive', 'Inactive')}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={draftFilters.tag}
              onValueChange={(value) => setDraftFilters((f) => ({ ...f, tag: value }))}
            >
              <SelectTrigger data-tour="pages-erp-dental-patients.selecttrigger.erp.dental.patients.filter.allTags" className="w-full lg:w-[140px]">
                <SelectValue placeholder={t('erp.dental.patients.filter.allTags', 'All Tags')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('erp.dental.patients.filter.allTags', 'All Tags')}</SelectItem>
                {availableTags.map((tag) => (
                  <SelectItem key={tag} value={tag}>
                    {tag}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
              <PopoverTrigger asChild>
                <Button data-tour="pages-erp-dental-patients.button.erp.dental.patients.filter.more" variant="outline" className={cn(draftFilters.sex !== 'all' && 'border-primary text-primary')}>
                  <Filter className="h-4 w-4 mr-2" />
                  {t('erp.dental.patients.filter.more', 'More Filters')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-3" align="start">
                <div className="space-y-1.5">
                  <Label>{t('erp.dental.patients.fields.sex', 'Sex')}</Label>
                  <Select
                    value={draftFilters.sex}
                    onValueChange={(value) => setDraftFilters((f) => ({ ...f, sex: value }))}
                  >
                    <SelectTrigger data-tour="pages-erp-dental-patients.selecttrigger.erp.dental.patients.filter.allSex">
                      <SelectValue placeholder={t('erp.dental.patients.filter.allSex', 'All')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('erp.dental.patients.filter.allSex', 'All')}</SelectItem>
                      {SEX_FILTER_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {t(`erp.dental.patients.fields.sex.${option.toLowerCase()}`, option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex gap-2 lg:ml-auto">
              <Button data-tour="pages-erp-dental-patients.button.common.clear" variant="ghost" onClick={clearFilters}>
                {t('common.clear', 'Clear')}
              </Button>
              <Button data-tour="pages-erp-dental-patients.button.common.apply" onClick={applyFilters} disabled={!filtersDirty}>
                {t('common.apply', 'Apply')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {patientsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('erp.common.loading', 'Loading...')}
            </div>
          ) : patients.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              {t('erp.dental.patients.empty', 'No patients yet. Add a patient from an existing contact.')}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table data-tour="pages-erp-dental-patients.table.erp.dental.patients.columns.patient">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('erp.dental.patients.columns.patient', 'Patient')}</TableHead>
                    <TableHead>{t('erp.dental.patients.columns.phone', 'Phone')}</TableHead>
                    <TableHead>{t('erp.dental.patients.columns.email', 'Email')}</TableHead>
                    <TableHead>{t('erp.dental.patients.columns.lastVisit', 'Last Visit')}</TableHead>
                    <TableHead>{t('erp.dental.patients.columns.status', 'Status')}</TableHead>
                    <TableHead className="text-right">{t('erp.dental.patients.columns.actions', 'Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {patients.map((patient) => {
                    const isActive = patient.contact.isActive !== false;
                    const lastVisit = formatDateShort(patient.lastVisitAt);
                    return (
                      <TableRow key={patient.id} className="hover:bg-muted/40">
                        <TableCell>
                          <div className="flex items-center gap-3 min-w-0">
                            <ContactAvatar
                              contact={patient.contact}
                              size="sm"
                              showRefreshButton={false}
                              className="shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{patient.contact.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {t('erp.dental.patients.idLabel', 'ID: #{{id}}', {
                                  id: formatPatientId(patient.id),
                                })}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Phone className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[160px]">
                              {patient.contact.phone || '—'}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Mail className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate max-w-[200px]">
                              {patient.contact.email || '—'}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            {lastVisit || '—'}
                          </span>
                        </TableCell>
                        <TableCell>
                          {isActive ? (
                            <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/15">
                              {t('erp.dental.patients.status.active', 'Active')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-muted-foreground">
                              {t('erp.dental.patients.status.inactive', 'Inactive')}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {canManage && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
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
                                        removePatientMutation.mutate(patient.contactId);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {t('erp.dental.patients.removePatient', 'Remove patient')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {canViewChart && (
                              <Button data-tour="pages-erp-dental-patients.button.erp.dental.patients.openChart" asChild size="icon" className="h-8 w-8 shrink-0">
                                <Link
                                  href={`/erp/dental/chart?contactId=${patient.contactId}`}
                                  title={t('erp.dental.patients.openChart', 'Open chart')}
                                  aria-label={t('erp.dental.patients.openChart', 'Open chart')}
                                >
                                  <ToothIcon className="h-5 w-5" />
                                </Link>
                              </Button>
                            )}
                            <Button data-tour="pages-erp-dental-patients.button.erp.dental.patients.open" asChild size="sm">
                              <Link href={`/erp/dental/patients/${patient.contactId}`}>
                                {t('erp.dental.patients.open', 'Open')}
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <div>
              {t('erp.dental.patients.pagination.showing', 'Showing {{from}} to {{to}} of {{total}} patients', {
                from: showingFrom,
                to: showingTo,
                total,
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {pageNumbers.map((item, idx) =>
                item === 'ellipsis' ? (
                  <span key={`e-${idx}`} className="px-2">
                    …
                  </span>
                ) : (
                  <Button
                    key={item}
                    size="sm"
                    variant={item === page ? 'default' : 'outline'}
                    className="h-8 w-8 p-0"
                    onClick={() => setPage(item)}
                  >
                    {item}
                  </Button>
                ),
              )}
            </div>
            <div className="flex items-center gap-2">
              <span>{t('erp.dental.patients.pagination.rowsPerPage', 'Rows per page')}</span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  setPageSize(Number(value) as (typeof PAGE_SIZE_OPTIONS)[number]);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-[72px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <AddDentalPatientDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        navigateOnSuccess
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/patients'] });
        }}
      />
    </DentalShellPage>
  );
}

function StatCard({
  icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  iconClass: string;
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-start gap-3">
        <div className={cn('rounded-full p-2.5 shrink-0', iconClass)}>{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-0.5 tabular-nums">
            {value == null ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
        </div>
      </CardContent>
    </Card>
  );
}

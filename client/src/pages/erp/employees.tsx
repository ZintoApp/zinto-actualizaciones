import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Search, Pencil, Trash2, Eye } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

type TeamMember = {
  id: number;
  fullName: string;
  email: string;
  companyId: number | null;
};

type DepartmentRow = {
  id: number;
  name: string;
  companyId: number;
};

type EmployeeRow = {
  id: number;
  companyId: number;
  userId: number;
  employeeId: string;
  departmentId: number | null;
  position: string | null;
  hireDate: string | null;
  terminationDate?: string | null;
  employmentType: string;
  salary: string | null;
  salaryFrequency: string;
  currency: string | null;
  managerId?: number | null;
  status: string;
  fullName?: string | null;
  departmentName?: string | null;
  emergencyContact?: Record<string, string> | null;
  bankDetails?: Record<string, string> | null;
};

const STATUS_OPTIONS = ['all', 'active', 'on_leave', 'terminated'] as const;
const EMP_TYPES = ['full_time', 'part_time', 'contractor', 'intern'] as const;
const SAL_FREQ = ['hourly', 'weekly', 'biweekly', 'monthly', 'annual'] as const;

function formatDate(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return s;
  }
}

export default function ERPEmployeesPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const canManage = hasPermission(PERMISSIONS.MANAGE_HR);

  const [searchTerm, setSearchTerm] = useState('');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeRow | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);

  const [formUserId, setFormUserId] = useState('');
  const [formDeptId, setFormDeptId] = useState<string>('none');
  const [formPosition, setFormPosition] = useState('');
  const [formEmpType, setFormEmpType] = useState('full_time');
  const [formSalary, setFormSalary] = useState('');
  const [formSalFreq, setFormSalFreq] = useState('monthly');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formHireDate, setFormHireDate] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formEmerLine1, setFormEmerLine1] = useState('');
  const [formEmerPhone, setFormEmerPhone] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formBankAccount, setFormBankAccount] = useState('');

  const filtersKey = useMemo(
    () => ({ searchTerm, deptFilter, statusFilter, page, limit }),
    [searchTerm, deptFilter, statusFilter, page, limit]
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/hr/employees'] });
  };

  const { data: departments = [] } = useQuery({
    queryKey: ['/api/erp/hr/departments', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/hr/departments');
      const json = await res.json();
      return (json.data ?? []) as DepartmentRow[];
    },
    enabled: !!companyId,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/team-members', companyId, 'employees'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      return (await res.json()) as TeamMember[];
    },
    enabled: !!companyId && dialogOpen,
  });

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['/api/erp/hr/employees/detail', companyId, profileId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/hr/employees/${profileId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || t('erp.employees.errors.failedLoadEmployee', 'Failed to load employee'));
      return json.data as EmployeeRow;
    },
    enabled: !!companyId && profileId != null,
  });

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['/api/erp/hr/employees', companyId, filtersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (deptFilter !== 'all') params.set('departmentId', deptFilter);
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));
      const res = await apiRequest('GET', `/api/erp/hr/employees?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: EmployeeRow[]; total: number };
    },
    enabled: !!companyId,
  });

  const rows = listResult?.data ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const resetForm = () => {
    setFormUserId('');
    setFormDeptId('none');
    setFormPosition('');
    setFormEmpType('full_time');
    setFormSalary('');
    setFormSalFreq('monthly');
    setFormCurrency('USD');
    setFormHireDate('');
    setFormStatus('active');
    setFormEmerLine1('');
    setFormEmerPhone('');
    setFormBankName('');
    setFormBankAccount('');
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (e: EmployeeRow) => {
    setEditing(e);
    setFormUserId(String(e.userId));
    setFormDeptId(e.departmentId != null ? String(e.departmentId) : 'none');
    setFormPosition(e.position ?? '');
    setFormEmpType(e.employmentType);
    setFormSalary(e.salary ?? '');
    setFormSalFreq(e.salaryFrequency);
    setFormCurrency(e.currency ?? 'USD');
    setFormHireDate(e.hireDate ? e.hireDate.slice(0, 10) : '');
    setFormStatus(e.status);
    const em = (e as { emergencyContact?: Record<string, string> }).emergencyContact ?? {};
    const bk = (e as { bankDetails?: Record<string, string> }).bankDetails ?? {};
    setFormEmerLine1(em.line1 ?? '');
    setFormEmerPhone(em.phone ?? '');
    setFormBankName(bk.bank ?? '');
    setFormBankAccount(bk.account ?? '');
    setDialogOpen(true);
  };

  const buildPayload = () => {
    const emergencyContact: Record<string, string> = {};
    if (formEmerLine1.trim()) emergencyContact.line1 = formEmerLine1.trim();
    if (formEmerPhone.trim()) emergencyContact.phone = formEmerPhone.trim();
    const bankDetails: Record<string, string> = {};
    if (formBankName.trim()) bankDetails.bank = formBankName.trim();
    if (formBankAccount.trim()) bankDetails.account = formBankAccount.trim();
    return {
      userId: parseInt(formUserId, 10),
      departmentId: formDeptId === 'none' ? null : parseInt(formDeptId, 10),
      position: formPosition.trim() || null,
      employmentType: formEmpType,
      salary: formSalary.trim() || null,
      salaryFrequency: formSalFreq,
      currency: formCurrency || 'USD',
      hireDate: formHireDate.trim() ? new Date(formHireDate).toISOString() : null,
      emergencyContact: Object.keys(emergencyContact).length ? emergencyContact : undefined,
      bankDetails: Object.keys(bankDetails).length ? bankDetails : undefined,
      status: formStatus as 'active' | 'on_leave' | 'terminated',
    };
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/hr/employees', buildPayload());
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.employees.toast.created', 'Employee created') });
      setDialogOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error(t('erp.employees.errors.noEmployee', 'No employee'));
      const { userId: _u, ...rest } = buildPayload();
      const res = await apiRequest('PUT', `/api/erp/hr/employees/${editing.id}`, rest);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.employees.toast.updated', 'Employee updated') });
      setDialogOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (e: EmployeeRow) => {
      const res = await apiRequest('DELETE', `/api/erp/hr/employees/${e.id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({ title: t('erp.employees.toast.archived', 'Employee archived') });
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err: Error) => toast({ title: t('ui.common.error', 'Error'), description: err.message, variant: 'destructive' }),
  });

  const submitForm = () => {
    if (!editing && !formUserId.trim()) {
      toast({ title: t('erp.employees.validation.userRequired', 'User is required'), variant: 'destructive' });
      return;
    }
    if (editing) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 data-tour="pages-erp-employees.h1.erp.employees.title" className="text-2xl">{t('erp.employees.title', 'Employees')}</h1>
                <p className="text-muted-foreground text-sm">{t('erp.employees.subtitle', 'Company employee directory')}</p>
              </div>
              {canManage && (
                <Button data-tour="pages-erp-employees.button.erp.employees.actions.addEmployee" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('erp.employees.actions.addEmployee', 'Add employee')}
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input data-tour="pages-erp-employees.input.erp.employees.searchPlaceholder"
                      placeholder={t('erp.employees.searchPlaceholder', 'Search name, employee ID, position...')}
                      className="pl-9"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="w-full sm:w-44">
                    <Label className="text-xs text-muted-foreground">{t('erp.employees.filters.department', 'Department')}</Label>
                    <Select
                      value={deptFilter}
                      onValueChange={(v) => {
                        setDeptFilter(v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('erp.common.all', 'All')}</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={String(d.id)}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full sm:w-44">
                    <Label className="text-xs text-muted-foreground">{t('erp.common.status', 'Status')}</Label>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => {
                        setStatusFilter(v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s === 'all'
                              ? t('erp.common.all', 'All')
                              : s === 'active'
                                ? t('erp.common.active', 'Active')
                                : s === 'on_leave'
                                  ? t('erp.employees.status.onLeave', 'On leave')
                                  : t('erp.employees.status.terminated', 'Terminated')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table data-tour="pages-erp-employees.table.erp.employees.table.employeeId">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.employees.table.employeeId', 'Employee ID')}</TableHead>
                        <TableHead>{t('erp.common.name', 'Name')}</TableHead>
                        <TableHead>{t('erp.employees.filters.department', 'Department')}</TableHead>
                        <TableHead>{t('erp.employees.table.position', 'Position')}</TableHead>
                        <TableHead>{t('erp.common.type', 'Type')}</TableHead>
                        <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                        <TableHead>{t('erp.employees.table.hireDate', 'Hire date')}</TableHead>
                        <TableHead className="text-right w-[1%]">{t('erp.employees.table.profile', 'Profile')}</TableHead>
                        {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={canManage ? 9 : 8}
                            className="text-center text-muted-foreground py-12"
                          >
                            {t('erp.employees.empty', 'No employees yet')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-mono text-sm">{e.employeeId}</TableCell>
                            <TableCell className="font-medium">{e.fullName ?? '—'}</TableCell>
                            <TableCell>{e.departmentName ?? '—'}</TableCell>
                            <TableCell>{e.position ?? '—'}</TableCell>
                            <TableCell className="text-sm">{t(`erp.employees.employmentType.${e.employmentType}`, e.employmentType.replace('_', ' '))}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{t(`erp.employees.status.${e.status}`, e.status.replace('_', ' '))}</Badge>
                            </TableCell>
                            <TableCell>{formatDate(e.hireDate)}</TableCell>
                            <TableCell className="text-right">
                              <Button data-tour="pages-erp-employees.button.erp.employees.actions.viewProfile"
                                variant="ghost"
                                size="icon"
                                title={t('erp.employees.actions.viewProfile', 'View profile')}
                                onClick={() => setProfileId(e.id)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                            {canManage && (
                              <TableCell className="text-right space-x-2">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(e)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {t('erp.employees.pagination.summary', 'Page {{page}} of {{totalPages}} ({{count}} employees)', {
                  page: String(page),
                  totalPages: String(totalPages),
                  count: String(total),
                })}
              </span>
              <div className="flex gap-2">
                <Button data-tour="pages-erp-employees.button.erp.common.previous"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('erp.common.previous', 'Previous')}
                </Button>
                <Button data-tour="pages-erp-employees.button.erp.common.next"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('erp.common.next', 'Next')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog
        open={profileId != null}
        onOpenChange={(open) => {
          if (!open) setProfileId(null);
        }}
      >
        <DialogContent data-tour="pages-erp-employees.dialogcontent.erp.employees.profile.title" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('erp.employees.profile.title', 'Employee profile')}</DialogTitle>
          </DialogHeader>
          {profileLoading || !profile ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground text-xs">{t('erp.common.name', 'Name')}</p>
                  <p className="font-medium">{profile.fullName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t('erp.employees.table.employeeId', 'Employee ID')}</p>
                  <p className="font-mono">{profile.employeeId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t('erp.employees.filters.department', 'Department')}</p>
                  <p>{profile.departmentName ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t('erp.employees.table.position', 'Position')}</p>
                  <p>{profile.position ?? '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t('erp.common.status', 'Status')}</p>
                  <Badge variant="outline">{t(`erp.employees.status.${profile.status}`, profile.status.replace('_', ' '))}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t('erp.employees.form.employmentType', 'Employment type')}</p>
                  <p>{t(`erp.employees.employmentType.${profile.employmentType}`, profile.employmentType.replace('_', ' '))}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t('erp.employees.table.hireDate', 'Hire date')}</p>
                  <p>{formatDate(profile.hireDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">{t('erp.employees.profile.termination', 'Termination')}</p>
                  <p>{formatDate(profile.terminationDate ?? null)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">{t('erp.employees.profile.compensation', 'Compensation')}</p>
                  <p>
                    {profile.salary ?? '—'} {profile.currency ?? ''} ({profile.salaryFrequency})
                  </p>
                </div>
              </div>
              {(profile.emergencyContact && Object.keys(profile.emergencyContact).length > 0) ||
              (profile.bankDetails && Object.keys(profile.bankDetails).length > 0) ? (
                <div className="border-t pt-3 space-y-2">
                  {profile.emergencyContact && Object.keys(profile.emergencyContact).length > 0 && (
                    <div>
                      <p className="font-medium mb-1">{t('erp.employees.form.emergencyContact', 'Emergency contact')}</p>
                      <pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(profile.emergencyContact, null, 2)}
                      </pre>
                    </div>
                  )}
                  {profile.bankDetails && Object.keys(profile.bankDetails).length > 0 && (
                    <div>
                      <p className="font-medium mb-1">{t('erp.employees.form.bankDetails', 'Bank details')}</p>
                      <pre className="text-xs bg-muted/50 rounded-md p-2 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(profile.bankDetails, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter>
            <Button data-tour="pages-erp-employees.button.erp.common.close" variant="outline" onClick={() => setProfileId(null)}>
              {t('erp.common.close', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-tour="pages-erp-employees.dialogcontent.erp.employees.dialog.editTitle" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('erp.employees.dialog.editTitle', 'Edit employee') : t('erp.employees.dialog.newTitle', 'New employee')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            {!editing && (
              <div>
                <Label>{t('erp.employees.form.user', 'User')}</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger data-tour="pages-erp-employees.selecttrigger.erp.employees.form.selectTeamMember">
                    <SelectValue placeholder={t('erp.employees.form.selectTeamMember', 'Select team member')} />
                  </SelectTrigger>
                  <SelectContent searchable>
                    {teamMembers
                      .filter((m) => m.companyId === companyId)
                      .map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.fullName} ({m.email})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>{t('erp.employees.filters.department', 'Department')}</Label>
              <Select value={formDeptId} onValueChange={setFormDeptId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('erp.employees.table.position', 'Position')}</Label>
              <Input data-tour="pages-erp-employees.input.erp.employees.form.user" value={formPosition} onChange={(e) => setFormPosition(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.employees.form.employmentType', 'Employment type')}</Label>
                <Select value={formEmpType} onValueChange={setFormEmpType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    {EMP_TYPES.map((employmentType) => (
                      <SelectItem key={employmentType} value={employmentType}>
                        {t(`erp.employees.employmentType.${employmentType}`, employmentType.replace('_', ' '))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('erp.employees.form.salaryFrequency', 'Salary frequency')}</Label>
                <Select value={formSalFreq} onValueChange={setFormSalFreq}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    {SAL_FREQ.map((salaryFrequency) => (
                      <SelectItem key={salaryFrequency} value={salaryFrequency}>
                        {t(`erp.employees.salaryFrequency.${salaryFrequency}`, salaryFrequency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.employees.form.salary', 'Salary')}</Label>
                <Input data-tour="pages-erp-employees.input.erp.employees.form.salaryPlaceholder" value={formSalary} onChange={(e) => setFormSalary(e.target.value)} placeholder={t('erp.employees.form.salaryPlaceholder', '0.00')} />
              </div>
              <div>
                <Label>{t('erp.common.currency', 'Currency')}</Label>
                <Input data-tour="pages-erp-employees.input.erp.employees.form.salary" value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.employees.table.hireDate', 'Hire date')}</Label>
                <Input data-tour="pages-erp-employees.input.erp.employees.table.hireDate" type="date" value={formHireDate} onChange={(e) => setFormHireDate(e.target.value)} />
              </div>
              <div>
                <Label>{t('erp.common.status', 'Status')}</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="active">{t('erp.common.active', 'Active')}</SelectItem>
                    <SelectItem value="on_leave">{t('erp.employees.status.onLeave', 'On leave')}</SelectItem>
                    <SelectItem value="terminated">{t('erp.employees.status.terminated', 'Terminated')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">{t('erp.employees.form.emergencyContact', 'Emergency contact')}</p>
              <Input data-tour="pages-erp-employees.input.erp.employees.form.line1"
                placeholder={t('erp.employees.form.line1', 'Line1')}
                value={formEmerLine1}
                onChange={(e) => setFormEmerLine1(e.target.value)}
              />
              <LocalizedPhoneInput
                placeholder={t('erp.common.phone', 'Phone')}
                value={formEmerPhone}
                onChange={setFormEmerPhone}
              />
            </div>
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">{t('erp.employees.form.bankDetails', 'Bank details')}</p>
              <Input data-tour="pages-erp-employees.input.erp.employees.form.bank" placeholder={t('erp.employees.form.bank', 'Bank')} value={formBankName} onChange={(e) => setFormBankName(e.target.value)} />
              <Input data-tour="pages-erp-employees.input.erp.accounting.table.account"
                placeholder={t('erp.accounting.table.account', 'Account')}
                value={formBankAccount}
                onChange={(e) => setFormBankAccount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button data-tour="pages-erp-employees.button.ui.common.cancel" variant="outline" onClick={() => setDialogOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-employees.button.erp.common.save" onClick={submitForm} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.employees.archive.title', 'Archive employee?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('erp.employees.archive.description', 'This marks {{employee}} as terminated and keeps payroll, attendance, and leave history intact.', {
                employee: deleteTarget?.fullName ?? deleteTarget?.employeeId ?? '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('erp.employees.archive.action', 'Archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

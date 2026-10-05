import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Building2 as TabIconBuilding2,
  CalendarDays as TabIconCalendarDays,
  ClipboardCheck as TabIconClipboardCheck,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

type TeamMember = { id: number; fullName: string; email: string; companyId: number | null };

type DepartmentRow = {
  id: number;
  name: string;
  companyId: number;
  managerId: number | null;
  parentDepartmentId: number | null;
  description: string | null;
};

function descendantIdsOf(rootId: number, depts: DepartmentRow[]): Set<number> {
  const byParent = new Map<number | null, number[]>();
  for (const d of depts) {
    const p = d.parentDepartmentId ?? null;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p)!.push(d.id);
  }
  const out = new Set<number>();
  const walk = (id: number) => {
    out.add(id);
    for (const c of byParent.get(id) ?? []) walk(c);
  };
  walk(rootId);
  return out;
}

type EmployeeOption = { id: number; userId: number; employeeId: string; fullName?: string | null };

type LeaveRow = {
  id: number;
  employeeId: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: string;
  status: string;
  approvedBy: number | null;
  reason: string | null;
  employeeName?: string | null;
  approvedByName?: string | null;
};

type AttendanceRow = {
  id: number;
  employeeId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  hoursWorked: string | null;
  status: string;
  employeeName?: string | null;
};

const LEAVE_TYPES = ['annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid'] as const;
const LEAVE_STATUS = ['all', 'pending', 'approved', 'rejected', 'cancelled'] as const;
const ATT_STATUS = ['all', 'present', 'absent', 'late', 'half_day', 'remote'] as const;

function fmtDt(s: string | null) {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s;
  }
}

function fmtDay(s: string) {
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return s;
  }
}

function toDateInputValue(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function ERPHRPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const canManage = hasPermission(PERMISSIONS.MANAGE_HR);
  const canApprove = hasPermission(PERMISSIONS.APPROVE_LEAVE);

  const invalidateLeave = () =>
    queryClient.invalidateQueries({ queryKey: ['/api/erp/hr/leave-requests'] });
  const invalidateAtt = () => queryClient.invalidateQueries({ queryKey: ['/api/erp/hr/attendance'] });
  const invalidateDept = () => queryClient.invalidateQueries({ queryKey: ['/api/erp/hr/departments'] });

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
    queryKey: ['/api/team-members', companyId, 'hr'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/team-members');
      return (await res.json()) as TeamMember[];
    },
    enabled: !!companyId,
  });

  const empFiltersKey = useMemo(() => ['picker'], []);

  const { data: employeesList } = useQuery({
    queryKey: ['/api/erp/hr/employees', companyId, empFiltersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('offset', '0');
      const res = await apiRequest('GET', `/api/erp/hr/employees?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: EmployeeOption[]; total: number };
    },
    enabled: !!companyId && canManage,
  });
  const employees = employeesList?.data ?? [];
  const currentEmployeeLabel = user?.fullName ?? t('erp.hr.leave.yourEmployeeRecord', 'your employee record');

  // ----- Leave tab state -----
  const [leaveStatus, setLeaveStatus] = useState('all');
  const [leaveTypeF, setLeaveTypeF] = useState('all');
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const leaveQueryKey = useMemo(
    () => ({ leaveStatus, leaveTypeF, leaveFrom, leaveTo }),
    [leaveStatus, leaveTypeF, leaveFrom, leaveTo]
  );

  const [leaveDialog, setLeaveDialog] = useState(false);
  const [editingLeave, setEditingLeave] = useState<LeaveRow | null>(null);
  const [deleteLeave, setDeleteLeave] = useState<LeaveRow | null>(null);
  const [lEmpId, setLEmpId] = useState('');
  const [lType, setLType] = useState('annual');
  const [lStart, setLStart] = useState('');
  const [lEnd, setLEnd] = useState('');
  const [lDays, setLDays] = useState('');
  const [lReason, setLReason] = useState('');

  const { data: leaveResult, isLoading: leaveLoading } = useQuery({
    queryKey: ['/api/erp/hr/leave-requests', companyId, leaveQueryKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (leaveStatus !== 'all') params.set('status', leaveStatus);
      if (leaveTypeF !== 'all') params.set('leaveType', leaveTypeF);
      if (leaveFrom) params.set('dateFrom', new Date(leaveFrom).toISOString());
      if (leaveTo) params.set('dateTo', new Date(leaveTo).toISOString());
      params.set('limit', '100');
      const res = await apiRequest('GET', `/api/erp/hr/leave-requests?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: LeaveRow[]; total: number };
    },
    enabled: !!companyId,
  });
  const leaveRows = leaveResult?.data ?? [];

  const saveLeaveMut = useMutation({
    mutationFn: async () => {
      const days = Number(lDays.trim() || '1');
      if (!Number.isFinite(days) || days <= 0) {
        throw new Error(t('erp.hr.errors.daysPositive', 'Days must be positive'));
      }
      if (new Date(lStart).getTime() > new Date(lEnd).getTime()) {
        throw new Error(t('erp.hr.errors.endDateAfterStart', 'End date must be on or after start date'));
      }
      const body: Record<string, unknown> = {
        leaveType: lType,
        startDate: new Date(lStart).toISOString(),
        endDate: new Date(lEnd).toISOString(),
        days: lDays.trim() || '1',
        reason: lReason.trim() || undefined,
      };
      if (canManage) {
        body.employeeId = parseInt(lEmpId, 10);
      }
      const res = editingLeave
        ? await apiRequest('PUT', `/api/erp/hr/leave-requests/${editingLeave.id}`, body)
        : await apiRequest('POST', '/api/erp/hr/leave-requests', body);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({
        title: editingLeave
          ? t('erp.hr.toast.leaveUpdated', 'Leave request updated')
          : t('erp.hr.toast.leaveSubmitted', 'Leave request submitted'),
      });
      setLeaveDialog(false);
      setEditingLeave(null);
      invalidateLeave();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deleteLeaveMut = useMutation({
    mutationFn: async (row: LeaveRow) => {
      const res = await apiRequest('DELETE', `/api/erp/hr/leave-requests/${row.id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({ title: t('erp.hr.toast.leaveDeleted', 'Leave request deleted') });
      setDeleteLeave(null);
      invalidateLeave();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const openLeaveCreate = () => {
    setEditingLeave(null);
    setLEmpId(canManage && employees[0] ? String(employees[0].id) : 'self');
    setLType('annual');
    setLStart('');
    setLEnd('');
    setLDays('');
    setLReason('');
    setLeaveDialog(true);
  };

  const openLeaveEdit = (row: LeaveRow) => {
    setEditingLeave(row);
    setLEmpId(String(row.employeeId));
    setLType(row.leaveType);
    setLStart(toDateInputValue(row.startDate));
    setLEnd(toDateInputValue(row.endDate));
    setLDays(String(row.days ?? ''));
    setLReason(row.reason ?? '');
    setLeaveDialog(true);
  };

  const approveLeaveMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/hr/leave-requests/${id}/approve`, {});
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({ title: t('erp.hr.toast.leaveApproved', 'Leave approved') });
      invalidateLeave();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const rejectLeaveMut = useMutation({
    mutationFn: async ({ id, notes }: { id: number; notes?: string }) => {
      const res = await apiRequest('POST', `/api/erp/hr/leave-requests/${id}/reject`, { notes });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({ title: t('erp.hr.toast.leaveRejected', 'Leave rejected') });
      invalidateLeave();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  // ----- Attendance -----
  const [attEmp, setAttEmp] = useState('all');
  const [attStatus, setAttStatus] = useState('all');
  const [attFrom, setAttFrom] = useState('');
  const [attTo, setAttTo] = useState('');
  const attKey = useMemo(() => ({ attEmp, attStatus, attFrom, attTo }), [attEmp, attStatus, attFrom, attTo]);

  const [attDialog, setAttDialog] = useState(false);
  const [editingAttendance, setEditingAttendance] = useState<AttendanceRow | null>(null);
  const [deleteAttendance, setDeleteAttendance] = useState<AttendanceRow | null>(null);
  const [aEmpId, setAEmpId] = useState('');
  const [aDate, setADate] = useState('');
  const [aIn, setAIn] = useState('');
  const [aOut, setAOut] = useState('');
  const [aStatus, setAStatus] = useState('present');

  const { data: attResult, isLoading: attLoading } = useQuery({
    queryKey: ['/api/erp/hr/attendance', companyId, attKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (attEmp !== 'all') params.set('employeeId', attEmp);
      if (attStatus !== 'all') params.set('status', attStatus);
      if (attFrom) params.set('dateFrom', new Date(attFrom).toISOString());
      if (attTo) params.set('dateTo', new Date(attTo).toISOString());
      params.set('limit', '100');
      const res = await apiRequest('GET', `/api/erp/hr/attendance?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: AttendanceRow[]; total: number };
    },
    enabled: !!companyId,
  });
  const attRows = attResult?.data ?? [];

  const saveAttMut = useMutation({
    mutationFn: async () => {
      if (aIn.trim() && aOut.trim() && new Date(aOut).getTime() <= new Date(aIn).getTime()) {
        throw new Error(t('erp.hr.errors.checkoutAfterCheckin', 'Check-out must be after check-in'));
      }
      const body: Record<string, unknown> = { status: aStatus };
      body.employeeId = parseInt(aEmpId, 10);
      if (aDate) body.date = new Date(aDate).toISOString();
      if (aIn.trim()) body.checkIn = new Date(aIn).toISOString();
      if (aOut.trim()) body.checkOut = new Date(aOut).toISOString();
      const res = editingAttendance
        ? await apiRequest('PUT', `/api/erp/hr/attendance/${editingAttendance.id}`, body)
        : await apiRequest('POST', '/api/erp/hr/attendance', body);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({
        title: editingAttendance
          ? t('erp.hr.toast.attendanceUpdated', 'Attendance updated')
          : t('erp.hr.toast.attendanceRecorded', 'Attendance recorded'),
      });
      setAttDialog(false);
      setEditingAttendance(null);
      setAEmpId('');
      setADate('');
      setAIn('');
      setAOut('');
      setAStatus('present');
      invalidateAtt();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deleteAttMut = useMutation({
    mutationFn: async (row: AttendanceRow) => {
      const res = await apiRequest('DELETE', `/api/erp/hr/attendance/${row.id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({ title: t('erp.hr.toast.attendanceDeleted', 'Attendance deleted') });
      setDeleteAttendance(null);
      invalidateAtt();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const openAttendanceCreate = () => {
    setEditingAttendance(null);
    setAEmpId(employees[0] ? String(employees[0].id) : '');
    setADate('');
    setAIn('');
    setAOut('');
    setAStatus('present');
    setAttDialog(true);
  };

  const openAttendanceEdit = (row: AttendanceRow) => {
    setEditingAttendance(row);
    setAEmpId(String(row.employeeId));
    setADate(toDateInputValue(row.date));
    setAIn(toDateTimeLocalValue(row.checkIn));
    setAOut(toDateTimeLocalValue(row.checkOut));
    setAStatus(row.status || 'present');
    setAttDialog(true);
  };

  // ----- Departments -----
  const [deptDialog, setDeptDialog] = useState(false);
  const [editingDept, setEditingDept] = useState<DepartmentRow | null>(null);
  const [deleteDept, setDeleteDept] = useState<DepartmentRow | null>(null);
  const [dName, setDName] = useState('');
  const [dDesc, setDDesc] = useState('');
  const [dManager, setDManager] = useState('none');
  const [dParent, setDParent] = useState('none');

  const deptById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments]);

  const renderDepartmentRows = (parentId: number | null, depth: number): ReactNode[] => {
    const children = departments
      .filter((d) => (d.parentDepartmentId ?? null) === parentId)
      .sort((a, b) => a.name.localeCompare(b.name));
    return children.flatMap((d) => {
      const mgr = teamMembers.find((u) => u.id === d.managerId);
      const parentLabel = d.parentDepartmentId != null ? deptById.get(d.parentDepartmentId)?.name : null;
      return [
        <TableRow key={d.id}>
          <TableCell className="font-medium" style={{ paddingLeft: `${12 + depth * 20}px` }}>
            {d.name}
          </TableCell>
          <TableCell className="text-sm text-muted-foreground">
            {parentLabel ?? '—'}
          </TableCell>
          <TableCell>{mgr?.fullName ?? '—'}</TableCell>
          <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
            {d.description ?? '—'}
          </TableCell>
          {canManage && (
            <TableCell className="text-right space-x-2">
              <Button variant="ghost" size="icon" onClick={() => openDeptEdit(d)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleteDept(d)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </TableCell>
          )}
        </TableRow>,
        ...renderDepartmentRows(d.id, depth + 1),
      ];
    });
  };

  const openDeptCreate = () => {
    setEditingDept(null);
    setDName('');
    setDDesc('');
    setDManager('none');
    setDParent('none');
    setDeptDialog(true);
  };

  const openDeptEdit = (d: DepartmentRow) => {
    setEditingDept(d);
    setDName(d.name);
    setDDesc(d.description ?? '');
    setDManager(d.managerId != null ? String(d.managerId) : 'none');
    setDParent(d.parentDepartmentId != null ? String(d.parentDepartmentId) : 'none');
    setDeptDialog(true);
  };

  const saveDeptMut = useMutation({
    mutationFn: async () => {
      const body = {
        name: dName.trim(),
        description: dDesc.trim() || undefined,
        managerId: dManager === 'none' ? null : parseInt(dManager, 10),
        parentDepartmentId: dParent === 'none' ? null : parseInt(dParent, 10),
      };
      if (editingDept) {
        const res = await apiRequest('PUT', `/api/erp/hr/departments/${editingDept.id}`, body);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || res.statusText);
        }
      } else {
        const res = await apiRequest('POST', '/api/erp/hr/departments', body);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || res.statusText);
        }
      }
    },
    onSuccess: () => {
      toast({ title: editingDept ? t('erp.hr.toast.departmentUpdated', 'Department updated') : t('erp.hr.toast.departmentCreated', 'Department created') });
      setDeptDialog(false);
      invalidateDept();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const delDeptMut = useMutation({
    mutationFn: async (d: DepartmentRow) => {
      const res = await apiRequest('DELETE', `/api/erp/hr/departments/${d.id}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({ title: t('erp.hr.toast.departmentDeleted', 'Department deleted') });
      setDeleteDept(null);
      invalidateDept();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
            <div>
              <h1 data-tour="pages-erp-hr.h1.erp.hr.title" className="text-2xl">{t('erp.hr.title', 'HR')}</h1>
              <p className="text-muted-foreground text-sm">{t('erp.hr.subtitle', 'Leave, attendance, and departments')}</p>
            </div>

            <Tabs defaultValue="leave" className="w-full">
              <TabsList>
                <TabsTrigger icon={TabIconCalendarDays} data-tour="pages-erp-hr.tabstrigger.leave" value="leave">{t('erp.hr.tabs.leave', 'Leave')}</TabsTrigger>
                <TabsTrigger icon={TabIconClipboardCheck} data-tour="pages-erp-hr.tabstrigger.attendance" value="attendance">{t('erp.hr.tabs.attendance', 'Attendance')}</TabsTrigger>
                <TabsTrigger icon={TabIconBuilding2} data-tour="pages-erp-hr.tabstrigger.departments" value="departments">{t('erp.hr.tabs.departments', 'Departments')}</TabsTrigger>
              </TabsList>

              <TabsContent data-tour="pages-erp-hr.tabscontent.leave" value="leave" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-6 flex flex-col gap-4">
                    <div className="flex flex-wrap gap-4 items-end">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.status', 'Status')}</Label>
                        <Select value={leaveStatus} onValueChange={setLeaveStatus}>
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LEAVE_STATUS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t(`erp.hr.leave.status.${s}`, s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.type', 'Type')}</Label>
                        <Select value={leaveTypeF} onValueChange={setLeaveTypeF}>
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('erp.common.all', 'All')}</SelectItem>
                            {LEAVE_TYPES.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t(`erp.hr.leave.type.${s}`, s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.fromDate', 'From date')}</Label>
                        <Input data-tour="pages-erp-hr.input.erp.common.status" type="date" value={leaveFrom} onChange={(e) => setLeaveFrom(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.toDate', 'To date')}</Label>
                        <Input data-tour="pages-erp-hr.input.erp.common.status" type="date" value={leaveTo} onChange={(e) => setLeaveTo(e.target.value)} />
                      </div>
                      <Button data-tour="pages-erp-hr.button.erp.hr.leave.newRequest"
                        className="ml-auto"
                        onClick={openLeaveCreate}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        {t('erp.hr.leave.newRequest', 'New leave request')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-0">
                    {leaveLoading ? (
                      <div className="flex justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <Table data-tour="pages-erp-hr.table.erp.hr.table.employee">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('erp.hr.table.employee', 'Employee')}</TableHead>
                            <TableHead>{t('erp.common.type', 'Type')}</TableHead>
                            <TableHead>{t('erp.hr.table.start', 'Start')}</TableHead>
                            <TableHead>{t('erp.hr.table.end', 'End')}</TableHead>
                            <TableHead>{t('erp.hr.table.days', 'Days')}</TableHead>
                            <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                            <TableHead>{t('erp.hr.table.approvedBy', 'Approved by')}</TableHead>
                            {(canApprove || canManage) && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {leaveRows.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={canApprove || canManage ? 8 : 7}
                                className="text-center text-muted-foreground py-12"
                              >
                                {t('erp.hr.leave.empty', 'No leave requests')}
                              </TableCell>
                            </TableRow>
                          ) : (
                            leaveRows.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell>{r.employeeName ?? '—'}</TableCell>
                                <TableCell>{t(`erp.hr.leave.type.${r.leaveType}`, r.leaveType)}</TableCell>
                                <TableCell>{fmtDay(r.startDate)}</TableCell>
                                <TableCell>{fmtDay(r.endDate)}</TableCell>
                                <TableCell>{r.days}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{t(`erp.hr.leave.status.${r.status}`, r.status)}</Badge>
                                </TableCell>
                                <TableCell>{r.approvedByName ?? '—'}</TableCell>
                                {(canApprove || canManage) && (
                                  <TableCell className="text-right space-x-1">
                                    {canManage && (
                                      <>
                                        <Button data-tour="pages-erp-hr.button.erp.hr.leave.editAction"
                                          variant="ghost"
                                          size="icon"
                                          title={t('erp.hr.leave.editAction', 'Edit leave request')}
                                          onClick={() => openLeaveEdit(r)}
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button data-tour="pages-erp-hr.button.erp.hr.leave.deleteAction"
                                          variant="ghost"
                                          size="icon"
                                          title={t('erp.hr.leave.deleteAction', 'Delete leave request')}
                                          onClick={() => setDeleteLeave(r)}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </>
                                    )}
                                    {r.status === 'pending' && canApprove && (
                                      <>
                                        <Button data-tour="pages-erp-hr.button.erp.hr.actions.approve"
                                          variant="ghost"
                                          size="icon"
                                          title={t('erp.hr.actions.approve', 'Approve')}
                                          onClick={() => approveLeaveMut.mutate(r.id)}
                                        >
                                          <Check className="h-4 w-4 text-green-600" />
                                        </Button>
                                        <Button data-tour="pages-erp-hr.button.erp.hr.actions.reject"
                                          variant="ghost"
                                          size="icon"
                                          title={t('erp.hr.actions.reject', 'Reject')}
                                          onClick={() => rejectLeaveMut.mutate({ id: r.id })}
                                        >
                                          <X className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </>
                                    )}
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
              </TabsContent>

              <TabsContent data-tour="pages-erp-hr.tabscontent.attendance" value="attendance" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-6 flex flex-col gap-4">
                    <div className="flex flex-wrap gap-4 items-end">
                      {canManage && (
                        <div>
                          <Label className="text-xs text-muted-foreground">{t('erp.hr.table.employee', 'Employee')}</Label>
                          <Select value={attEmp} onValueChange={setAttEmp}>
                            <SelectTrigger className="w-[200px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">{t('erp.common.all', 'All')}</SelectItem>
                              {employees.map((e) => (
                                <SelectItem key={e.id} value={String(e.id)}>
                                  {e.fullName ?? e.employeeId}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.status', 'Status')}</Label>
                        <Select value={attStatus} onValueChange={setAttStatus}>
                          <SelectTrigger className="w-[160px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ATT_STATUS.map((s) => (
                              <SelectItem key={s} value={s}>
                                {t(`erp.hr.attendance.status.${s}`, s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.fromDate', 'From date')}</Label>
                        <Input data-tour="pages-erp-hr.input.erp.hr.table.employee" type="date" value={attFrom} onChange={(e) => setAttFrom(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.toDate', 'To date')}</Label>
                        <Input data-tour="pages-erp-hr.input.erp.hr.table.employee" type="date" value={attTo} onChange={(e) => setAttTo(e.target.value)} />
                      </div>
                      {canManage && (
                        <Button data-tour="pages-erp-hr.button.erp.hr.attendance.record" className="ml-auto" onClick={openAttendanceCreate}>
                          <Plus className="mr-2 h-4 w-4" />
                          {t('erp.hr.attendance.record', 'Record attendance')}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-0">
                    {attLoading ? (
                      <div className="flex justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <Table data-tour="pages-erp-hr.table.erp.hr.table.employee">
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('erp.hr.table.employee', 'Employee')}</TableHead>
                            <TableHead>{t('erp.common.date', 'Date')}</TableHead>
                            <TableHead>{t('erp.hr.table.checkIn', 'Check in')}</TableHead>
                            <TableHead>{t('erp.hr.table.checkOut', 'Check out')}</TableHead>
                            <TableHead>{t('erp.hr.table.hours', 'Hours')}</TableHead>
                            <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                            {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {attRows.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={canManage ? 7 : 6} className="text-center text-muted-foreground py-12">
                                {t('erp.hr.attendance.empty', 'No attendance records')}
                              </TableCell>
                            </TableRow>
                          ) : (
                            attRows.map((r) => (
                              <TableRow key={r.id}>
                                <TableCell>{r.employeeName ?? '—'}</TableCell>
                                <TableCell>{fmtDay(r.date)}</TableCell>
                                <TableCell>{fmtDt(r.checkIn)}</TableCell>
                                <TableCell>{fmtDt(r.checkOut)}</TableCell>
                                <TableCell>{r.hoursWorked ?? '—'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{t(`erp.hr.attendance.status.${r.status}`, r.status)}</Badge>
                                </TableCell>
                                {canManage && (
                                  <TableCell className="text-right space-x-1">
                                    <Button data-tour="pages-erp-hr.button.erp.hr.attendance.editAction"
                                      variant="ghost"
                                      size="icon"
                                      title={t('erp.hr.attendance.editAction', 'Edit attendance')}
                                      onClick={() => openAttendanceEdit(r)}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button data-tour="pages-erp-hr.button.erp.hr.attendance.deleteAction"
                                      variant="ghost"
                                      size="icon"
                                      title={t('erp.hr.attendance.deleteAction', 'Delete attendance')}
                                      onClick={() => setDeleteAttendance(r)}
                                    >
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
              </TabsContent>

              <TabsContent data-tour="pages-erp-hr.tabscontent.departments" value="departments" className="space-y-4 mt-4">
                <Card>
                  <CardContent className="pt-6 flex justify-end">
                    {canManage && (
                      <Button data-tour="pages-erp-hr.button.erp.hr.departments.add" onClick={openDeptCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        {t('erp.hr.departments.add', 'Add department')}
                      </Button>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-0">
                    <Table data-tour="pages-erp-hr.table.erp.common.name">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('erp.common.name', 'Name')}</TableHead>
                          <TableHead>{t('erp.hr.departments.reportsTo', 'Reports to')}</TableHead>
                          <TableHead>{t('erp.hr.departments.manager', 'Manager')}</TableHead>
                          <TableHead>{t('erp.common.description', 'Description')}</TableHead>
                          {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {departments.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                              {t('erp.hr.departments.empty', 'No departments')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          renderDepartmentRows(null, 0)
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog open={leaveDialog} onOpenChange={setLeaveDialog}>
        <DialogContent data-tour="pages-erp-hr.dialogcontent.erp.hr.leave.editTitle">
          <DialogHeader>
            <DialogTitle>
              {editingLeave
                ? t('erp.hr.leave.editTitle', 'Edit leave request')
                : t('erp.hr.leave.newRequest', 'New leave request')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {canManage ? (
              <div>
                <Label>{t('erp.hr.table.employee', 'Employee')}</Label>
                <Select value={lEmpId} onValueChange={setLEmpId}>
                  <SelectTrigger data-tour="pages-erp-hr.selecttrigger.erp.common.select">
                    <SelectValue placeholder={t('erp.common.select', 'Select')} />
                  </SelectTrigger>
                  <SelectContent searchable>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.fullName ?? e.employeeId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>{t('erp.hr.table.employee', 'Employee')}</Label>
                <Input data-tour="pages-erp-hr.input.erp.hr.table.employee" value={currentEmployeeLabel} disabled />
              </div>
            )}
            <div>
              <Label>{t('erp.common.type', 'Type')}</Label>
              <Select value={lType} onValueChange={setLType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent searchable>
                  {LEAVE_TYPES.map((leaveType) => (
                    <SelectItem key={leaveType} value={leaveType}>
                      {t(`erp.hr.leave.type.${leaveType}`, leaveType)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.hr.table.start', 'Start')}</Label>
                <Input data-tour="pages-erp-hr.input.erp.hr.table.start" type="date" value={lStart} onChange={(e) => setLStart(e.target.value)} />
              </div>
              <div>
                <Label>{t('erp.hr.table.end', 'End')}</Label>
                <Input data-tour="pages-erp-hr.input.erp.hr.table.start" type="date" value={lEnd} onChange={(e) => setLEnd(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t('erp.hr.table.days', 'Days')}</Label>
              <Input data-tour="pages-erp-hr.input.erp.hr.leave.daysPlaceholder" value={lDays} onChange={(e) => setLDays(e.target.value)} placeholder={t('erp.hr.leave.daysPlaceholder', '1')} />
            </div>
            <div>
              <Label>{t('erp.hr.leave.reason', 'Reason')}</Label>
              <Input data-tour="pages-erp-hr.input.erp.hr.table.employee" value={lReason} onChange={(e) => setLReason(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-hr.button.ui.common.cancel" variant="outline" onClick={() => setLeaveDialog(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-hr.button.erp.hr.actions.submit"
              onClick={() => saveLeaveMut.mutate()}
              disabled={(canManage && !lEmpId) || !lStart || !lEnd || saveLeaveMut.isPending}
            >
              {saveLeaveMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.hr.actions.submit', 'Submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteLeave} onOpenChange={() => setDeleteLeave(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.hr.leave.deleteTitle', 'Delete leave request?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteLeave
                ? t('erp.hr.leave.deleteDescription', 'Remove leave request for "{{employee}}" from {{start}} to {{end}}?', {
                    employee: deleteLeave.employeeName ?? '—',
                    start: fmtDay(deleteLeave.startDate),
                    end: fmtDay(deleteLeave.endDate),
                  })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteLeave && deleteLeaveMut.mutate(deleteLeave)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('erp.common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={attDialog} onOpenChange={setAttDialog}>
        <DialogContent data-tour="pages-erp-hr.dialogcontent.erp.hr.attendance.editTitle">
          <DialogHeader>
            <DialogTitle>
              {editingAttendance
                ? t('erp.hr.attendance.editTitle', 'Edit attendance')
                : t('erp.hr.attendance.record', 'Record attendance')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('erp.hr.table.employee', 'Employee')}</Label>
              <Select value={aEmpId} onValueChange={setAEmpId}>
                <SelectTrigger data-tour="pages-erp-hr.selecttrigger.erp.common.select">
                  <SelectValue placeholder={t('erp.common.select', 'Select')} />
                </SelectTrigger>
                <SelectContent searchable>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.fullName ?? e.employeeId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('erp.common.date', 'Date')}</Label>
              <Input data-tour="pages-erp-hr.input.erp.hr.table.employee" type="date" value={aDate} onChange={(e) => setADate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.hr.table.checkIn', 'Check in')}</Label>
                <Input data-tour="pages-erp-hr.input.erp.hr.table.checkIn" type="datetime-local" value={aIn} onChange={(e) => setAIn(e.target.value)} />
              </div>
              <div>
                <Label>{t('erp.hr.table.checkOut', 'Check out')}</Label>
                <Input data-tour="pages-erp-hr.input.erp.hr.table.checkIn" type="datetime-local" value={aOut} onChange={(e) => setAOut(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t('erp.common.status', 'Status')}</Label>
              <Select value={aStatus} onValueChange={setAStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent searchable>
                  {ATT_STATUS.filter((s) => s !== 'all').map((s) => (
                    <SelectItem key={s} value={s}>
                      {t(`erp.hr.attendance.status.${s}`, s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-hr.button.ui.common.cancel" variant="outline" onClick={() => setAttDialog(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-hr.button.erp.common.save" onClick={() => saveAttMut.mutate()} disabled={!aEmpId || saveAttMut.isPending}>
              {saveAttMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteAttendance} onOpenChange={() => setDeleteAttendance(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.hr.attendance.deleteTitle', 'Delete attendance?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteAttendance
                ? t('erp.hr.attendance.deleteDescription', 'Remove attendance for "{{employee}}" on {{date}}?', {
                    employee: deleteAttendance.employeeName ?? '—',
                    date: fmtDay(deleteAttendance.date),
                  })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAttendance && deleteAttMut.mutate(deleteAttendance)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('erp.common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={deptDialog} onOpenChange={setDeptDialog}>
        <DialogContent data-tour="pages-erp-hr.dialogcontent.erp.hr.departments.editTitle">
          <DialogHeader>
            <DialogTitle>{editingDept ? t('erp.hr.departments.editTitle', 'Edit department') : t('erp.hr.departments.newTitle', 'New department')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('erp.common.name', 'Name')}</Label>
              <Input data-tour="pages-erp-hr.input.erp.common.name" value={dName} onChange={(e) => setDName(e.target.value)} />
            </div>
            <div>
              <Label>{t('erp.common.description', 'Description')}</Label>
              <Input data-tour="pages-erp-hr.input.erp.common.name" value={dDesc} onChange={(e) => setDDesc(e.target.value)} />
            </div>
            <div>
              <Label>{t('erp.hr.departments.parentDepartment', 'Parent department')}</Label>
              <Select value={dParent} onValueChange={setDParent}>
                <SelectTrigger data-tour="pages-erp-hr.selecttrigger.erp.hr.departments.topLevel">
                  <SelectValue placeholder={t('erp.hr.departments.topLevel', 'Top-level')} />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="none">{t('erp.hr.departments.noneTopLevel', 'None (top-level)')}</SelectItem>
                  {departments
                    .filter((d) => {
                      if (!editingDept) return true;
                      const banned = descendantIdsOf(editingDept.id, departments);
                      banned.add(editingDept.id);
                      return !banned.has(d.id);
                    })
                    .map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('erp.hr.departments.manager', 'Manager')}</Label>
              <Select value={dManager} onValueChange={setDManager}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
                  {teamMembers
                    .filter((m) => m.companyId === companyId)
                    .map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.fullName}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-hr.button.ui.common.cancel" variant="outline" onClick={() => setDeptDialog(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-hr.button.erp.common.save"
              onClick={() => saveDeptMut.mutate()}
              disabled={!dName.trim() || saveDeptMut.isPending}
            >
              {saveDeptMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteDept} onOpenChange={() => setDeleteDept(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.hr.departments.deleteTitle', 'Delete department?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDept
                ? t('erp.hr.departments.deleteDescription', 'Remove "{{name}}"?', { name: deleteDept.name })
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDept && delDeptMut.mutate(deleteDept)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('erp.common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

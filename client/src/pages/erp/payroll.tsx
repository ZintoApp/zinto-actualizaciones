import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
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
import { Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

type PayrollRunRow = {
  id: number;
  companyId: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  totalGross: string;
  totalDeductions: string;
  totalNet: string;
  currency: string | null;
};

type PayrollItemRow = {
  id: number;
  payrollRunId: number;
  employeeId: number;
  baseSalary: string;
  bonuses: string;
  deductions: string;
  netPay: string;
  employeeName?: string | null;
};

type EmployeeOption = { id: number; employeeId: string; fullName?: string | null };

function money(n: string | null | undefined) {
  const x = Number(n ?? 0);
  return x.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDay(s: string) {
  try {
    return new Date(s).toLocaleDateString();
  } catch {
    return s;
  }
}

export default function ERPPayrollPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const canManage = hasPermission(PERMISSIONS.MANAGE_PAYROLL);

  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [runDialog, setRunDialog] = useState(false);
  const [pStart, setPStart] = useState('');
  const [pEnd, setPEnd] = useState('');
  const [pNotes, setPNotes] = useState('');

  const [detailRunId, setDetailRunId] = useState<number | null>(null);

  const [itemDialog, setItemDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<PayrollItemRow | null>(null);
  const [iEmp, setIEmp] = useState('');
  const [iBase, setIBase] = useState('');
  const [iBonus, setIBonus] = useState('0');
  const [iDed, setIDed] = useState('0');

  const filtersKey = useMemo(() => ({ statusFilter, page, limit }), [statusFilter, page, limit]);
  const detailQueryKey = useMemo(
    () => ['/api/erp/payroll', companyId, detailRunId, 'detail'],
    [companyId, detailRunId]
  );

  useEffect(() => {
    setDetailRunId(null);
  }, [companyId]);

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/payroll'] });
  };

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['/api/erp/payroll', companyId, filtersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));
      const res = await apiRequest('GET', `/api/erp/payroll?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: PayrollRunRow[]; total: number };
    },
    enabled: !!companyId,
  });

  const runs = listResult?.data ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const { data: detailResult, isLoading: detailLoading } = useQuery({
    queryKey: detailQueryKey,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/payroll/${detailRunId}`);
      const json = await res.json();
      return json.data as { run: PayrollRunRow; items: PayrollItemRow[] };
    },
    enabled: !!companyId && detailRunId != null,
  });

  const { data: employeesList } = useQuery({
    queryKey: ['/api/erp/hr/employees', companyId, 'payroll-picker'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('offset', '0');
      const res = await apiRequest('GET', `/api/erp/hr/employees?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: EmployeeOption[]; total: number };
    },
    enabled: !!companyId && itemDialog,
  });
  const employees = employeesList?.data ?? [];

  const createRunMut = useMutation({
    mutationFn: async () => {
      if (new Date(pStart).getTime() >= new Date(pEnd).getTime()) {
        throw new Error(t('erp.payroll.errors.periodEndAfterStart', 'Period end must be after period start'));
      }
      const res = await apiRequest('POST', '/api/erp/payroll', {
        periodStart: new Date(pStart).toISOString(),
        periodEnd: new Date(pEnd).toISOString(),
        currency: 'USD',
        notes: pNotes.trim() || undefined,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.payroll.toast.runCreated', 'Payroll run created') });
      setRunDialog(false);
      setPStart('');
      setPEnd('');
      setPNotes('');
      invalidateList();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const completeMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/payroll/${id}/complete`, {});
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({ title: t('erp.payroll.toast.completed', 'Payroll completed') });
      invalidateList();
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const saveItemMut = useMutation({
    mutationFn: async () => {
      if (!detailRunId) throw new Error(t('erp.payroll.errors.noRun', 'No run'));
      const amounts = [iBase.trim() || '0', iBonus.trim() || '0', iDed.trim() || '0'].map(Number);
      if (amounts.some((amount) => !Number.isFinite(amount) || amount < 0)) {
        throw new Error(t('erp.payroll.errors.amountsNonNegative', 'Payroll amounts must be non-negative finite numbers'));
      }
      if (amounts[0] + amounts[1] - amounts[2] < 0) {
        throw new Error(t('erp.payroll.errors.netPayNonNegative', 'Net pay cannot be negative'));
      }
      const body = {
        employeeId: parseInt(iEmp, 10),
        baseSalary: iBase.trim() || '0',
        bonuses: iBonus.trim() || '0',
        deductions: iDed.trim() || '0',
      };
      if (editingItem) {
        const res = await apiRequest(
          'PUT',
          `/api/erp/payroll/${detailRunId}/items/${editingItem.id}`,
          body
        );
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || res.statusText);
        }
      } else {
        const res = await apiRequest('POST', `/api/erp/payroll/${detailRunId}/items`, body);
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || res.statusText);
        }
      }
    },
    onSuccess: () => {
      toast({ title: editingItem ? t('erp.payroll.toast.itemUpdated', 'Item updated') : t('erp.payroll.toast.itemAdded', 'Item added') });
      setItemDialog(false);
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      invalidateList();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const delItemMut = useMutation({
    mutationFn: async (itemId: number) => {
      if (!detailRunId) throw new Error(t('erp.payroll.errors.noRun', 'No run'));
      const res = await apiRequest('DELETE', `/api/erp/payroll/${detailRunId}/items/${itemId}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || res.statusText);
      }
    },
    onSuccess: () => {
      toast({ title: t('erp.payroll.toast.itemRemoved', 'Item removed') });
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      invalidateList();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const openNewItem = () => {
    setEditingItem(null);
    setIEmp(employees[0] ? String(employees[0].id) : '');
    setIBase('');
    setIBonus('0');
    setIDed('0');
    setItemDialog(true);
  };

  const openEditItem = (it: PayrollItemRow) => {
    setEditingItem(it);
    setIEmp(String(it.employeeId));
    setIBase(it.baseSalary);
    setIBonus(it.bonuses);
    setIDed(it.deductions);
    setItemDialog(true);
  };

  const detailRun = detailResult?.run;
  const derivedNetPay = useMemo(() => {
    const base = Number(iBase || 0);
    const bonuses = Number(iBonus || 0);
    const deductions = Number(iDed || 0);
    if (![base, bonuses, deductions].every(Number.isFinite)) return '0.00';
    return (base + bonuses - deductions).toFixed(2);
  }, [iBase, iBonus, iDed]);

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 data-tour="pages-erp-payroll.h1.erp.payroll.title" className="text-2xl">{t('erp.payroll.title', 'Payroll')}</h1>
                <p className="text-muted-foreground text-sm">{t('erp.payroll.subtitle', 'Payroll runs and payouts')}</p>
              </div>
              {canManage && (
                <Button data-tour="pages-erp-payroll.button.erp.payroll.actions.newRun"
                  onClick={() => {
                    setRunDialog(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('erp.payroll.actions.newRun', 'New payroll run')}
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('erp.common.status', 'Status')}</Label>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => {
                        setStatusFilter(v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('erp.common.all', 'All')}</SelectItem>
                        <SelectItem value="draft">{t('erp.payroll.status.draft', 'Draft')}</SelectItem>
                        <SelectItem value="processing">{t('erp.payroll.status.processing', 'Processing')}</SelectItem>
                        <SelectItem value="completed">{t('erp.payroll.status.completed', 'Completed')}</SelectItem>
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
                  <Table data-tour="pages-erp-payroll.table.erp.payroll.table.periodStart">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.payroll.table.periodStart', 'Period start')}</TableHead>
                        <TableHead>{t('erp.payroll.table.periodEnd', 'Period end')}</TableHead>
                        <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                        <TableHead className="text-right">{t('erp.payroll.table.gross', 'Gross')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.deductions', 'Deductions')}</TableHead>
                        <TableHead className="text-right">{t('erp.payroll.table.net', 'Net')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                            {t('erp.payroll.empty', 'No payroll runs')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        runs.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell>{fmtDay(r.periodStart)}</TableCell>
                            <TableCell>{fmtDay(r.periodEnd)}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{t(`erp.payroll.status.${r.status}`, r.status)}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">{money(r.totalGross)}</TableCell>
                            <TableCell className="text-right font-mono">{money(r.totalDeductions)}</TableCell>
                            <TableCell className="text-right font-mono">{money(r.totalNet)}</TableCell>
                            <TableCell className="text-right">
                              <Button data-tour="pages-erp-payroll.button.erp.common.open" variant="outline" size="sm" onClick={() => setDetailRunId(r.id)}>
                                {t('erp.common.open', 'Open')}
                              </Button>
                            </TableCell>
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
                {t('erp.payroll.pagination.summary', 'Page {{page}} of {{totalPages}} ({{count}} runs)', {
                  page: String(page),
                  totalPages: String(totalPages),
                  count: String(total),
                })}
              </span>
              <div className="flex gap-2">
                <Button data-tour="pages-erp-payroll.button.erp.common.previous"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('erp.common.previous', 'Previous')}
                </Button>
                <Button data-tour="pages-erp-payroll.button.erp.common.next"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('erp.common.next', 'Next')}
                </Button>
              </div>
            </div>

            {detailRunId != null && (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 data-tour="pages-erp-payroll.h2.erp.payroll.runTitle" className="text-lg font-semibold">{t('erp.payroll.runTitle', 'Run #{{id}}', { id: String(detailRunId) })}</h2>
                      {detailRun && (
                        <p className="text-sm text-muted-foreground">
                          {fmtDay(detailRun.periodStart)} – {fmtDay(detailRun.periodEnd)} ·{' '}
                          <Badge variant="outline">{t(`erp.payroll.status.${detailRun.status}`, detailRun.status)}</Badge>
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button data-tour="pages-erp-payroll.button.erp.payroll.actions.closeDetail" variant="outline" size="sm" onClick={() => setDetailRunId(null)}>
                        {t('erp.payroll.actions.closeDetail', 'Close detail')}
                      </Button>
                      {canManage && detailRun?.status === 'draft' && (
                        <>
                          <Button data-tour="pages-erp-payroll.button.erp.payroll.actions.addEmployee" variant="outline" size="sm" onClick={openNewItem}>
                            <Plus className="mr-1 h-4 w-4" />
                            {t('erp.payroll.actions.addEmployee', 'Add employee')}
                          </Button>
                          <Button data-tour="pages-erp-payroll.button.erp.payroll.actions.completePayroll" size="sm" onClick={() => completeMut.mutate(detailRunId)}>
                            {completeMut.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                            {t('erp.payroll.actions.completePayroll', 'Complete payroll')}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {detailLoading ? (
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Table data-tour="pages-erp-payroll.table.erp.hr.table.employee">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('erp.hr.table.employee', 'Employee')}</TableHead>
                          <TableHead className="text-right">{t('erp.payroll.table.base', 'Base')}</TableHead>
                          <TableHead className="text-right">{t('erp.payroll.table.bonuses', 'Bonuses')}</TableHead>
                          <TableHead className="text-right">{t('erp.common.deductions', 'Deductions')}</TableHead>
                          <TableHead className="text-right">{t('erp.payroll.table.netPay', 'Net pay')}</TableHead>
                          {canManage && detailRun?.status === 'draft' && (
                            <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>
                          )}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(detailResult?.items ?? []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={canManage && detailRun?.status === 'draft' ? 6 : 5}
                              className="text-center text-muted-foreground py-8"
                            >
                              {t('erp.payroll.table.noLineItems', 'No line items')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          (detailResult?.items ?? []).map((it) => (
                            <TableRow key={it.id}>
                              <TableCell>{it.employeeName ?? '—'}</TableCell>
                              <TableCell className="text-right font-mono">{money(it.baseSalary)}</TableCell>
                              <TableCell className="text-right font-mono">{money(it.bonuses)}</TableCell>
                              <TableCell className="text-right font-mono">{money(it.deductions)}</TableCell>
                              <TableCell className="text-right font-mono">{money(it.netPay)}</TableCell>
                              {canManage && detailRun?.status === 'draft' && (
                                <TableCell className="text-right space-x-1">
                                  <Button variant="ghost" size="icon" onClick={() => openEditItem(it)}>
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => delItemMut.mutate(it.id)}>
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
            )}
          </div>
        </div>
      </div>

      <Dialog open={runDialog} onOpenChange={setRunDialog}>
        <DialogContent data-tour="pages-erp-payroll.dialogcontent.erp.payroll.dialog.newRunTitle">
          <DialogHeader>
            <DialogTitle>{t('erp.payroll.dialog.newRunTitle', 'New payroll run')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('erp.payroll.table.periodStart', 'Period start')}</Label>
              <Input data-tour="pages-erp-payroll.input.erp.payroll.table.periodStart" type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
            </div>
            <div>
              <Label>{t('erp.payroll.table.periodEnd', 'Period end')}</Label>
              <Input data-tour="pages-erp-payroll.input.erp.payroll.table.periodStart" type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} />
            </div>
            <div>
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Input data-tour="pages-erp-payroll.input.erp.payroll.table.periodStart" value={pNotes} onChange={(e) => setPNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-payroll.button.ui.common.cancel" variant="outline" onClick={() => setRunDialog(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-payroll.button.erp.common.create"
              onClick={() => createRunMut.mutate()}
              disabled={!pStart || !pEnd || createRunMut.isPending}
            >
              {createRunMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={itemDialog} onOpenChange={setItemDialog}>
        <DialogContent data-tour="pages-erp-payroll.dialogcontent.erp.payroll.dialog.editLineTitle">
          <DialogHeader>
            <DialogTitle>{editingItem ? t('erp.payroll.dialog.editLineTitle', 'Edit payroll line') : t('erp.payroll.dialog.addLineTitle', 'Add payroll line')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('erp.hr.table.employee', 'Employee')}</Label>
              <Select
                value={iEmp}
                onValueChange={setIEmp}
                disabled={!!editingItem}
              >
                <SelectTrigger data-tour="pages-erp-payroll.selecttrigger.erp.common.select">
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
              <Label>{t('erp.payroll.form.baseSalary', 'Base salary')}</Label>
              <Input data-tour="pages-erp-payroll.input.erp.hr.table.employee" value={iBase} onChange={(e) => setIBase(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.payroll.table.bonuses', 'Bonuses')}</Label>
                <Input data-tour="pages-erp-payroll.input.erp.payroll.table.bonuses" value={iBonus} onChange={(e) => setIBonus(e.target.value)} />
              </div>
              <div>
                <Label>{t('erp.common.deductions', 'Deductions')}</Label>
                <Input data-tour="pages-erp-payroll.input.erp.payroll.table.bonuses" value={iDed} onChange={(e) => setIDed(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t('erp.payroll.table.netPay', 'Net pay')}</Label>
              <Input data-tour="pages-erp-payroll.input.erp.hr.table.employee" value={derivedNetPay} disabled />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-payroll.button.ui.common.cancel" variant="outline" onClick={() => setItemDialog(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-payroll.button.erp.common.save"
              onClick={() => saveItemMut.mutate()}
              disabled={!iEmp || saveItemMut.isPending}
            >
              {saveItemMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'wouter';
import { DentalShellPage } from './dental-shell';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES,
  DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES,
  DENTAL_TREATMENT_PLAN_STATUSES,
  isDentalTreatmentPlanBillingLockedStatus,
  type DentalTreatmentPlanClinicalStatus,
  type DentalTreatmentPlanStatus,
  type DentalTreatmentProcedureClinicalStatus,
  type DentalTreatmentProcedureStatus,
} from '@shared/dental-clinical';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Circle,
  CircleDot,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddDentalPatientDialog } from '@/components/erp/dental/AddDentalPatientDialog';

type PlanListRow = {
  id: number;
  contactId: number;
  title: string;
  description: string | null;
  status: DentalTreatmentPlanStatus;
  currency: string;
  estimatedTotal: string;
  salesOrderId: number | null;
  contactName: string | null;
  procedureCount: number;
  updatedAt: string;
};

type ProcedureRow = {
  id: number;
  productId: number | null;
  description: string;
  toothRefs: string[] | null;
  surfaces: string | null;
  phase: number;
  status: DentalTreatmentProcedureStatus;
  quantity: string;
  unitPrice: string;
  estimatedAmount: string;
  sortOrder: number;
  notes: string | null;
};

type PlanDetail = PlanListRow & {
  procedures: ProcedureRow[];
  salesOrderStatus: string | null;
  createdAt?: string | null;
};

type ProductOption = {
  id: number;
  name: string;
  sku: string | null;
  unitPrice: string | null;
  currency: string | null;
};

type PatientOption = { contactId: number; name: string };

type ProcedureDraft = {
  productId: number | null;
  description: string;
  toothRefs: string;
  surfaces: string;
  phase: string;
  status: DentalTreatmentProcedureStatus;
  quantity: string;
  unitPrice: string;
  notes: string;
};

function emptyProcedureDraft(): ProcedureDraft {
  return {
    productId: null,
    description: '',
    toothRefs: '',
    surfaces: '',
    phase: '1',
    status: 'planned',
    quantity: '1',
    unitPrice: '0',
    notes: '',
  };
}

function parseToothRefs(value: string): string[] | null {
  const refs = value
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return refs.length > 0 ? refs : null;
}

function formatMoney(amount: string | number, currency: string) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return `${amount} ${currency}`;
  return `${num.toFixed(2)} ${currency}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function ProcedureStatusIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  }
  if (status === 'in_progress') {
    return <CircleDot className="h-4 w-4 shrink-0 text-sky-500" />;
  }
  return <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function statusLabel(status: string, t: (key: string, fallback: string) => string) {
  const map: Record<string, string> = {
    planned: t('erp.dental.treatmentPlans.status.planned', 'Planned'),
    in_progress: t('erp.dental.treatmentPlans.status.inProgress', 'In progress'),
    quoted: t('erp.dental.treatmentPlans.status.quoted', 'Quoted'),
    approved: t('erp.dental.treatmentPlans.status.approved', 'Approved'),
    invoiced: t('erp.dental.treatmentPlans.status.invoiced', 'Invoiced'),
    completed: t('erp.dental.treatmentPlans.status.completed', 'Completed'),
    cancelled: t('erp.dental.treatmentPlans.status.cancelled', 'Cancelled'),
  };
  return map[status] ?? status;
}

export default function DentalTreatmentPlansPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { PERMISSIONS, hasPermission, hasAnyPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.MANAGE_DENTAL_TREATMENT_PLANS);
  const canManagePatients = hasPermission(PERMISSIONS.MANAGE_DENTAL_PATIENTS);
  const canCreateQuote = hasAnyPermission([PERMISSIONS.CREATE_QUOTATIONS, PERMISSIONS.MANAGE_SALES_ORDERS]);
  const canInvoice = hasPermission(PERMISSIONS.MANAGE_INVOICES);
  const [approvalNotes, setApprovalNotes] = useState('');

  const planLinesLocked = (plan: PlanDetail | undefined) => {
    if (!plan) return false;
    if (plan.status === 'approved' || plan.status === 'invoiced') return true;
    return !!plan.salesOrderId && plan.salesOrderStatus !== 'cancelled';
  };

  const canCreateOrRecreateQuote = (plan: PlanDetail) =>
    canCreateQuote &&
    plan.status !== 'cancelled' &&
    plan.status !== 'approved' &&
    plan.status !== 'invoiced' &&
    (!plan.salesOrderId || plan.salesOrderStatus === 'cancelled');

  const isProcedureClinicalStatus = (status: string): status is DentalTreatmentProcedureClinicalStatus =>
    (DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES as readonly string[]).includes(status);
  const [searchParams] = useSearchParams();
  const contactIdFilter = useMemo(() => {
    const raw = searchParams.get('contactId');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createContactId, setCreateContactId] = useState<number | null>(contactIdFilter);
  const [patientSearch, setPatientSearch] = useState('');
  const [patientOpen, setPatientOpen] = useState(false);
  const [addPatientOpen, setAddPatientOpen] = useState(false);
  const [selectedPatientName, setSelectedPatientName] = useState('');
  const [procedureDraft, setProcedureDraft] = useState<ProcedureDraft>(emptyProcedureDraft());
  const [editingProcedureId, setEditingProcedureId] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productOpen, setProductOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<DentalTreatmentPlanStatus>('planned');

  useEffect(() => {
    setCreateContactId(contactIdFilter);
  }, [contactIdFilter]);

  const plansQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans', contactIdFilter, statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (contactIdFilter) params.set('contactId', String(contactIdFilter));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load treatment plans');
      return json.data as { data: PlanListRow[]; total: number };
    },
  });

  const planDetailQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId],
    enabled: selectedPlanId != null,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans/${selectedPlanId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load plan');
      return json.data as PlanDetail;
    },
  });

  useEffect(() => {
    const plan = planDetailQuery.data;
    if (!plan) return;
    setEditTitle(plan.title);
    setEditDescription(plan.description ?? '');
    setEditStatus(plan.status);
  }, [planDetailQuery.data]);

  const patientsQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans/patient-options', patientSearch],
    enabled: createOpen && canManage,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (patientSearch.trim()) params.set('search', patientSearch.trim());
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans/patient-options?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load patients');
      return json.data as PatientOption[];
    },
  });

  const productsQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans/product-options', productSearch],
    enabled: (selectedPlanId != null || editingProcedureId != null) && canManage,
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50' });
      if (productSearch.trim()) params.set('search', productSearch.trim());
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans/product-options?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load products');
      return json.data as ProductOption[];
    },
  });

  const resetProcedureForm = () => {
    setProcedureDraft(emptyProcedureDraft());
    setEditingProcedureId(null);
    setProductSearch('');
  };

  useEffect(() => {
    resetProcedureForm();
  }, [selectedPlanId]);

  const startEditProcedure = (procedure: ProcedureRow) => {
    setEditingProcedureId(procedure.id);
    setProcedureDraft({
      productId: procedure.productId,
      description: procedure.description,
      toothRefs: procedure.toothRefs?.join(', ') ?? '',
      surfaces: procedure.surfaces ?? '',
      phase: String(procedure.phase ?? 1),
      status: procedure.status,
      quantity: procedure.quantity,
      unitPrice: procedure.unitPrice,
      notes: procedure.notes ?? '',
    });
  };

  const invalidatePlans = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!createContactId) throw new Error('Select a patient');
      const res = await apiRequest('POST', '/api/erp/dental/treatment-plans', {
        contactId: createContactId,
        title: createTitle.trim(),
        description: createDescription.trim() || null,
        status: 'planned',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create plan');
      return json.data as PlanDetail;
    },
    onSuccess: (data) => {
      toast({ title: t('erp.dental.treatmentPlans.created', 'Treatment plan created') });
      setCreateOpen(false);
      setCreateTitle('');
      setCreateDescription('');
      invalidatePlans();
      setSelectedPlanId(data.id);
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const updatePlanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlanId) throw new Error('No plan selected');
      const payload: {
        title: string;
        description: string | null;
        status?: DentalTreatmentPlanClinicalStatus;
      } = {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
      };
      if (
        planDetailQuery.data &&
        !isDentalTreatmentPlanBillingLockedStatus(planDetailQuery.data.status) &&
        (DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES as readonly string[]).includes(editStatus)
      ) {
        payload.status = editStatus as DentalTreatmentPlanClinicalStatus;
      }
      const res = await apiRequest('PATCH', `/api/erp/dental/treatment-plans/${selectedPlanId}`, payload);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update plan');
      return json.data;
    },
    onSuccess: () => {
      toast({ title: t('erp.dental.treatmentPlans.updated', 'Treatment plan updated') });
      invalidatePlans();
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId] });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const deletePlanMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest('DELETE', `/api/erp/dental/treatment-plans/${planId}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete plan');
    },
    onSuccess: () => {
      toast({ title: t('erp.dental.treatmentPlans.deleted', 'Treatment plan deleted') });
      setSelectedPlanId(null);
      invalidatePlans();
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const approvalsQuery = useQuery({
    queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId, 'approvals'],
    enabled: selectedPlanId != null,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/dental/treatment-plans/${selectedPlanId}/approvals`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to load approvals');
      return json.data as Array<{
        id: number;
        decision: string;
        notes: string | null;
        approvedAt: string;
      }>;
    },
  });

  const createQuotationMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlanId) throw new Error('No plan selected');
      const res = await apiRequest('POST', `/api/erp/dental/treatment-plans/${selectedPlanId}/create-quotation`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create quotation');
      return json.data;
    },
    onSuccess: (data: { salesOrder?: { id: number; orderNumber?: string } }) => {
      toast({
        title: t('erp.dental.treatmentPlans.quoteCreated', 'Quotation created'),
        description: data.salesOrder?.orderNumber
          ? t('erp.dental.treatmentPlans.quoteCreatedDesc', 'Order {{number}}', {
              number: data.salesOrder.orderNumber,
            })
          : undefined,
      });
      invalidatePlans();
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId] });
      queryClient.invalidateQueries({
        queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId, 'approvals'],
      });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const approveMutation = useMutation({
    mutationFn: async (decision: 'approved' | 'rejected') => {
      if (!selectedPlanId) throw new Error('No plan selected');
      const res = await apiRequest('POST', `/api/erp/dental/treatment-plans/${selectedPlanId}/approvals`, {
        decision,
        notes: approvalNotes.trim() || null,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to record approval');
      return json.data;
    },
    onSuccess: (_data, decision) => {
      toast({
        title:
          decision === 'approved'
            ? t('erp.dental.treatmentPlans.approved', 'Plan approved')
            : t('erp.dental.treatmentPlans.rejected', 'Approval rejected'),
      });
      setApprovalNotes('');
      invalidatePlans();
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId] });
      queryClient.invalidateQueries({
        queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId, 'approvals'],
      });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlanId) throw new Error('No plan selected');
      const res = await apiRequest('POST', `/api/erp/dental/treatment-plans/${selectedPlanId}/create-invoice`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to create invoice');
      return json.data as { invoice?: { id: number; invoiceNumber?: string } };
    },
    onSuccess: (data) => {
      toast({
        title: t('erp.dental.treatmentPlans.invoiceCreated', 'Invoice created'),
        description: data.invoice?.invoiceNumber
          ? t('erp.dental.treatmentPlans.invoiceCreatedDesc', 'Invoice {{number}}', {
              number: data.invoice.invoiceNumber,
            })
          : undefined,
      });
      invalidatePlans();
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId] });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const saveProcedureMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPlanId) throw new Error('No plan selected');
      const quantity = Number(procedureDraft.quantity) || 1;
      const unitPrice = Number(procedureDraft.unitPrice) || 0;
      const payload = {
        productId: procedureDraft.productId,
        description: procedureDraft.description.trim(),
        toothRefs: parseToothRefs(procedureDraft.toothRefs),
        surfaces: procedureDraft.surfaces.trim() || null,
        phase: Number(procedureDraft.phase) || 1,
        status: procedureDraft.status,
        quantity,
        unitPrice,
        estimatedAmount: quantity * unitPrice,
        notes: procedureDraft.notes.trim() || null,
      };
      const url = editingProcedureId
        ? `/api/erp/dental/treatment-plans/${selectedPlanId}/procedures/${editingProcedureId}`
        : `/api/erp/dental/treatment-plans/${selectedPlanId}/procedures`;
      const res = await apiRequest(editingProcedureId ? 'PATCH' : 'POST', url, payload);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to save procedure');
      return json.data;
    },
    onSuccess: () => {
      const wasEditing = editingProcedureId != null;
      resetProcedureForm();
      toast({
        title: wasEditing
          ? t('erp.dental.treatmentPlans.procedureUpdated', 'Procedure updated')
          : t('erp.dental.treatmentPlans.procedureAdded', 'Procedure added'),
      });
      invalidatePlans();
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId] });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const updateProcedureStatusMutation = useMutation({
    mutationFn: async ({ procedureId, status }: { procedureId: number; status: DentalTreatmentProcedureStatus }) => {
      const res = await apiRequest(
        'PATCH',
        `/api/erp/dental/treatment-plans/${selectedPlanId}/procedures/${procedureId}`,
        { status },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to update procedure');
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId] });
      invalidatePlans();
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const deleteProcedureMutation = useMutation({
    mutationFn: async (procedureId: number) => {
      const res = await apiRequest(
        'DELETE',
        `/api/erp/dental/treatment-plans/${selectedPlanId}/procedures/${procedureId}`,
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to delete procedure');
    },
    onSuccess: (_data, procedureId) => {
      if (editingProcedureId === procedureId) resetProcedureForm();
      toast({ title: t('erp.dental.treatmentPlans.procedureDeleted', 'Procedure deleted') });
      invalidatePlans();
      queryClient.invalidateQueries({ queryKey: ['/api/erp/dental/treatment-plans', selectedPlanId] });
    },
    onError: (error: Error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const plans = plansQuery.data?.data ?? [];
  const plan = planDetailQuery.data;

  const patientName = contactIdFilter
    ? plans.find((row) => row.contactId === contactIdFilter)?.contactName ??
      (plan?.contactId === contactIdFilter ? plan?.contactName : null) ??
      null
    : null;

  const activeProcedures = useMemo(
    () =>
      (plan?.procedures ?? [])
        .filter((procedure) => procedure.status !== 'cancelled')
        .slice()
        .sort((a, b) => a.phase - b.phase || a.sortOrder - b.sortOrder || a.id - b.id),
    [plan?.procedures],
  );
  const completedCount = activeProcedures.filter((p) => p.status === 'completed').length;
  const progressPercent =
    activeProcedures.length > 0
      ? Math.round((completedCount / activeProcedures.length) * 100)
      : 0;

  return (
    <DentalShellPage
      title={t('erp.dental.treatmentPlans.title', 'Treatment plans')}
      description={t(
        'erp.dental.treatmentPlans.description',
        'Build multi-step treatment plans with procedure lines and cost estimates, then create a quotation, record approval, and generate an invoice.',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
        <div className="space-y-2">
          {contactIdFilter ? (
            <>
              <Link
                href="/erp/dental/patients"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                {t('erp.dental.patients.backToList', 'Back to patients')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">
                  {t('erp.dental.treatmentPlans.filteredPatient', 'Patient #{{id}}', { id: contactIdFilter })}
                  {patientName ? ` | ${patientName}` : ''}
                </span>
                <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.patients.openProfile" asChild size="sm" variant="outline">
                  <Link href={`/erp/dental/patients/${contactIdFilter}`}>
                    {t('erp.dental.patients.openProfile', 'Patient profile')}
                  </Link>
                </Button>
                <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.patients.openChart" asChild size="sm" variant="outline">
                  <Link href={`/erp/dental/chart?contactId=${contactIdFilter}`}>
                    {t('erp.dental.patients.openChart', 'Open chart')}
                  </Link>
                </Button>
              </div>
            </>
          ) : null}
        </div>
        {canManage && (
          <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.treatmentPlans.new" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            {t('erp.dental.treatmentPlans.new', 'New plan')}
          </Button>
        )}
      </div>

      <div className="grid gap-4 items-start xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        <Card className="flex flex-col overflow-hidden xl:max-h-[calc(100vh-13rem)]">
          <CardHeader className="pb-3 space-y-3 shrink-0">
            <CardTitle className="text-base">{t('erp.dental.treatmentPlans.listTitle', 'Plans')}</CardTitle>
            <div className="space-y-2">
              <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.searchPlaceholder"
                placeholder={t('erp.dental.treatmentPlans.searchPlaceholder', 'Search plans…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all', 'All')}</SelectItem>
                  {DENTAL_TREATMENT_PLAN_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {statusLabel(status, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-3 pt-0 flex-1 min-h-0 overflow-y-auto">
            {plansQuery.isLoading ? (
              <div className="p-1 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('erp.common.loading', 'Loading...')}
              </div>
            ) : plans.length === 0 ? (
              <p className="p-1 text-sm text-muted-foreground">
                {t('erp.dental.treatmentPlans.empty', 'No treatment plans yet.')}
              </p>
            ) : (
              <div className="space-y-2">
                {plans.map((row) => {
                  const selected = selectedPlanId === row.id;
                  return (
                    <button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.treatmentPlans.procedures"
                      key={row.id}
                      type="button"
                      onClick={() => setSelectedPlanId(row.id)}
                      aria-pressed={selected}
                      className={cn(
                        'w-full rounded-lg border p-3 text-left transition-colors',
                        selected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                          : 'hover:bg-muted/50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium leading-tight">{row.title}</span>
                        <Badge variant="outline" className="shrink-0">
                          {statusLabel(row.status, t)}
                        </Badge>
                      </div>
                      {!contactIdFilter ? (
                        <div className="mt-1 text-xs text-muted-foreground truncate">
                          {row.contactName ?? `#${row.contactId}`}
                        </div>
                      ) : null}
                      <div className="mt-1 text-xs text-muted-foreground">
                        {row.procedureCount} {t('erp.dental.treatmentPlans.procedures', 'procedures')} ·{' '}
                        {formatMoney(row.estimatedTotal, row.currency)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {plan
                  ? plan.title
                  : t('erp.dental.treatmentPlans.detailPlaceholder', 'Select a plan')}
              </CardTitle>
              {plan ? <Badge variant="outline">{statusLabel(plan.status, t)}</Badge> : null}
            </div>
            {plan ? (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                {formatDateTime(plan.createdAt) ? (
                  <span>
                    {t('erp.dental.treatmentPlans.created', 'Created')}: {formatDateTime(plan.createdAt)}
                  </span>
                ) : null}
                {formatDateTime(plan.updatedAt) ? (
                  <span>
                    {t('erp.dental.treatmentPlans.lastUpdated', 'Last updated')}: {formatDateTime(plan.updatedAt)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </CardHeader>
          <CardContent>
            {!selectedPlanId ? (
              <p className="text-sm text-muted-foreground">
                {t('erp.dental.treatmentPlans.selectHint', 'Choose a plan from the list to view and edit procedures.')}
              </p>
            ) : planDetailQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('erp.common.loading', 'Loading...')}
              </div>
            ) : planDetailQuery.isError ? (
              <p className="text-sm text-destructive">{(planDetailQuery.error as Error).message}</p>
            ) : plan ? (
              <div className="space-y-4">
                {!contactIdFilter ? (
                  <Badge variant="secondary">{plan.contactName ?? `#${plan.contactId}`}</Badge>
                ) : null}

                <div className="rounded-md border bg-muted/30 p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="text-xs font-medium text-muted-foreground">
                        {t('erp.dental.treatmentPlans.estimatedTotal', 'Estimated total')}
                      </div>
                      <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(plan.estimatedTotal, plan.currency)}
                      </div>
                      {plan.salesOrderId ? (
                        <Link href="/erp/sales-orders" className="text-xs text-muted-foreground hover:underline">
                          {t('erp.dental.treatmentPlans.linkedOrder', 'Linked order #{{id}}', {
                            id: plan.salesOrderId,
                          })}
                          {plan.salesOrderStatus === 'cancelled'
                            ? ` (${t('erp.dental.treatmentPlans.orderCancelled', 'cancelled')})`
                            : ''}
                        </Link>
                      ) : (
                        <div className="text-xs text-muted-foreground">
                          {t('erp.dental.treatmentPlans.noQuoteYet', 'Not linked to a quotation yet')}
                        </div>
                      )}
                    </div>
                    {(canCreateQuote || canManage || canInvoice) && plan.status !== 'cancelled' && (
                      <div className="flex flex-wrap gap-2">
                        {canCreateOrRecreateQuote(plan) && (
                        <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.treatmentPlans.recreateQuote"
                          size="sm"
                          onClick={() => createQuotationMutation.mutate()}
                          disabled={
                            createQuotationMutation.isPending ||
                            plan.procedures.filter((p) => p.status !== 'cancelled').length === 0
                          }
                        >
                          {createQuotationMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {plan.salesOrderStatus === 'cancelled'
                            ? t('erp.dental.treatmentPlans.recreateQuote', 'Recreate quotation')
                            : t('erp.dental.treatmentPlans.createQuote', 'Create quotation')}
                        </Button>
                      )}
                      {canManage && plan.status === 'quoted' && (
                        <>
                          <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.treatmentPlans.recordApproval"
                            size="sm"
                            onClick={() => approveMutation.mutate('approved')}
                            disabled={approveMutation.isPending}
                          >
                            {approveMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {t('erp.dental.treatmentPlans.recordApproval', 'Record approval')}
                          </Button>
                          <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.treatmentPlans.recordRejection"
                            size="sm"
                            variant="outline"
                            onClick={() => approveMutation.mutate('rejected')}
                            disabled={approveMutation.isPending}
                          >
                            {t('erp.dental.treatmentPlans.recordRejection', 'Record rejection')}
                          </Button>
                        </>
                      )}
                      {canInvoice && (plan.status === 'approved' || plan.status === 'invoiced') && (
                        <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.treatmentPlans.alreadyInvoiced"
                          size="sm"
                          onClick={() => createInvoiceMutation.mutate()}
                          disabled={createInvoiceMutation.isPending || plan.status === 'invoiced'}
                        >
                          {createInvoiceMutation.isPending && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          {plan.status === 'invoiced'
                            ? t('erp.dental.treatmentPlans.alreadyInvoiced', 'Already invoiced')
                            : t('erp.dental.treatmentPlans.createInvoice', 'Generate invoice')}
                        </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {canManage && plan.status === 'quoted' && (
                    <div className="space-y-1.5">
                      <Label>{t('erp.dental.treatmentPlans.approvalNotes', 'Approval notes')}</Label>
                        <Textarea data-tour="pages-erp-dental-treatment-plans.textarea.erp.dental.treatmentPlans.approvalNotesPlaceholder"
                          value={approvalNotes}
                          onChange={(e) => setApprovalNotes(e.target.value)}
                          rows={2}
                          placeholder={t(
                            'erp.dental.treatmentPlans.approvalNotesPlaceholder',
                            'Optional notes about patient/clinic approval',
                          )}
                        />
                      </div>
                    )}
                    {(approvalsQuery.data?.length ?? 0) > 0 && (
                      <div className="space-y-1 text-xs text-muted-foreground">
                        {approvalsQuery.data!.map((row) => (
                          <div key={row.id}>
                            {row.decision} · {new Date(row.approvedAt).toLocaleString()}
                            {row.notes ? ` — ${row.notes}` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                {canManage && (
                  <div className="space-y-3 rounded-md border p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t('erp.dental.treatmentPlans.fields.title', 'Title')}</Label>
                        <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.fields.title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('erp.dental.treatmentPlans.fields.status', 'Status')}</Label>
                        {isDentalTreatmentPlanBillingLockedStatus(plan.status) ? (
                          <div className="flex h-10 items-center">
                            <Badge variant="outline">{statusLabel(plan.status, t)}</Badge>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {t(
                                'erp.dental.treatmentPlans.billingStatusLocked',
                                'Set by quotation / approval / invoice actions',
                              )}
                            </span>
                          </div>
                        ) : (
                          <Select
                            value={editStatus}
                            onValueChange={(value) =>
                              setEditStatus(value as DentalTreatmentPlanClinicalStatus)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent searchable>
                              {DENTAL_TREATMENT_PLAN_CLINICAL_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {statusLabel(status, t)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('erp.dental.treatmentPlans.fields.description', 'Description')}</Label>
                      <Textarea data-tour="pages-erp-dental-treatment-plans.textarea.erp.dental.treatmentPlans.fields.title"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button data-tour="pages-erp-dental-treatment-plans.button.common.save"
                        size="sm"
                        onClick={() => updatePlanMutation.mutate()}
                        disabled={!editTitle.trim() || updatePlanMutation.isPending}
                      >
                        {updatePlanMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {t('common.save', 'Save')}
                      </Button>
                      <Button data-tour="pages-erp-dental-treatment-plans.button.common.delete"
                        size="sm"
                        variant="destructive"
                        onClick={() => deletePlanMutation.mutate(plan.id)}
                        disabled={deletePlanMutation.isPending || planLinesLocked(plan)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('common.delete', 'Delete')}
                      </Button>
                    </div>
                  </div>
                )}

                <div>
                  <h3 className="text-sm font-medium mb-2">
                    {t('erp.dental.treatmentPlans.proceduresTitle', 'Procedures')}
                  </h3>
                  {planLinesLocked(plan) ? (
                    <p className="text-xs text-muted-foreground mb-3">
                      {t(
                        'erp.dental.treatmentPlans.linesLocked',
                        'Procedure lines and clinical statuses are locked while an active quotation is linked or the plan is approved/invoiced.',
                      )}
                    </p>
                  ) : null}
                  {plan.procedures.length === 0 ? (
                    <p className="text-sm text-muted-foreground mb-3">
                      {t('erp.dental.treatmentPlans.noProcedures', 'No procedure lines yet.')}
                    </p>
                  ) : (
                      <Table data-tour="pages-erp-dental-treatment-plans.table.erp.dental.treatmentPlans.colPhase" erpSortable={false}>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('erp.dental.treatmentPlans.colPhase', 'Phase')}</TableHead>
                          <TableHead>{t('erp.dental.treatmentPlans.colProcedure', 'Procedure')}</TableHead>
                          <TableHead>{t('erp.dental.treatmentPlans.colTeeth', 'Teeth')}</TableHead>
                          <TableHead>{t('erp.dental.treatmentPlans.colStatus', 'Status')}</TableHead>
                          <TableHead className="text-right">{t('erp.dental.treatmentPlans.colAmount', 'Amount')}</TableHead>
                          {canManage && !planLinesLocked(plan) ? <TableHead className="w-[90px]" /> : null}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plan.procedures.map((procedure) => (
                          <TableRow
                            key={procedure.id}
                            data-state={editingProcedureId === procedure.id ? 'selected' : undefined}
                          >
                            <TableCell>{procedure.phase}</TableCell>
                            <TableCell>
                              <div className="font-medium">{procedure.description}</div>
                              {procedure.surfaces ? (
                                <div className="text-xs text-muted-foreground">{procedure.surfaces}</div>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs">
                              {procedure.toothRefs?.join(', ') || '—'}
                            </TableCell>
                            <TableCell>
                              {canManage &&
                              !planLinesLocked(plan) &&
                              isProcedureClinicalStatus(procedure.status) ? (
                                <Select
                                  value={procedure.status}
                                  onValueChange={(value) =>
                                    updateProcedureStatusMutation.mutate({
                                      procedureId: procedure.id,
                                      status: value as DentalTreatmentProcedureClinicalStatus,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[130px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent searchable>
                                    {DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES.map((status) => (
                                      <SelectItem key={status} value={status}>
                                        {statusLabel(status, t)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Badge variant="outline">{statusLabel(procedure.status, t)}</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatMoney(procedure.estimatedAmount, plan.currency)}
                            </TableCell>
                            {canManage && !planLinesLocked(plan) ? (
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => startEditProcedure(procedure)}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => deleteProcedureMutation.mutate(procedure.id)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            ) : null}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>

                {canManage && !planLinesLocked(plan) && (
                  <div className="rounded-md border p-3 space-y-3">
                    <h4 className="text-sm font-medium">
                      {editingProcedureId
                        ? t('erp.dental.treatmentPlans.editProcedure', 'Edit procedure')
                        : t('erp.dental.treatmentPlans.addProcedure', 'Add procedure')}
                    </h4>
                    <div className="space-y-1.5">
                      <Label>{t('erp.dental.treatmentPlans.fields.product', 'Service product')}</Label>
                      <Popover open={productOpen} onOpenChange={setProductOpen}>
                        <PopoverTrigger asChild>
                          <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.treatmentPlans.pickProduct" variant="outline" role="combobox" className="w-full justify-between">
                            {procedureDraft.description ||
                              t('erp.dental.treatmentPlans.pickProduct', 'Pick a service product…')}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[360px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput
                              placeholder={t('erp.dental.treatmentPlans.searchProducts', 'Search services…')}
                              value={productSearch}
                              onValueChange={setProductSearch}
                            />
                            <CommandList>
                              <CommandEmpty>
                                {productsQuery.isLoading
                                  ? t('erp.common.loading', 'Loading...')
                                  : t('erp.dental.treatmentPlans.noProducts', 'No service products found')}
                              </CommandEmpty>
                              {productsQuery.data?.map((product) => (
                                <CommandItem
                                  key={product.id}
                                  value={String(product.id)}
                                  onSelect={() => {
                                    setProcedureDraft((draft) => ({
                                      ...draft,
                                      productId: product.id,
                                      description: product.name,
                                      unitPrice: product.unitPrice ?? '0',
                                    }));
                                    setProductOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      procedureDraft.productId === product.id ? 'opacity-100' : 'opacity-0',
                                    )}
                                  />
                                  <div>
                                    <div>{product.name}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {product.sku ? `${product.sku} · ` : ''}
                                      {formatMoney(product.unitPrice ?? '0', product.currency ?? plan.currency)}
                                    </div>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>{t('erp.dental.treatmentPlans.fields.description', 'Description')}</Label>
                        <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.fields.description"
                          value={procedureDraft.description}
                          onChange={(e) => setProcedureDraft((d) => ({ ...d, description: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('erp.dental.treatmentPlans.fields.toothRefs', 'Tooth refs')}</Label>
                        <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.fields.description"
                          value={procedureDraft.toothRefs}
                          onChange={(e) => setProcedureDraft((d) => ({ ...d, toothRefs: e.target.value }))}
                          placeholder="11, 21"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('erp.dental.treatmentPlans.fields.surfaces', 'Surfaces')}</Label>
                        <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.fields.description"
                          value={procedureDraft.surfaces}
                          onChange={(e) => setProcedureDraft((d) => ({ ...d, surfaces: e.target.value }))}
                          placeholder="MOD, B"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('erp.dental.treatmentPlans.fields.phase', 'Phase')}</Label>
                        <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.fields.description"
                          value={procedureDraft.phase}
                          onChange={(e) => setProcedureDraft((d) => ({ ...d, phase: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('erp.dental.treatmentPlans.fields.quantity', 'Qty')}</Label>
                        <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.fields.description"
                          value={procedureDraft.quantity}
                          onChange={(e) => setProcedureDraft((d) => ({ ...d, quantity: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t('erp.dental.treatmentPlans.fields.unitPrice', 'Unit price')}</Label>
                        <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.fields.description"
                          value={procedureDraft.unitPrice}
                          onChange={(e) => setProcedureDraft((d) => ({ ...d, unitPrice: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>{t('erp.dental.treatmentPlans.fields.status', 'Status')}</Label>
                        <Select
                          value={procedureDraft.status}
                          onValueChange={(value) =>
                            setProcedureDraft((d) => ({
                              ...d,
                              status: value as DentalTreatmentProcedureStatus,
                            }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent searchable>
                            {DENTAL_TREATMENT_PROCEDURE_CLINICAL_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>
                                {statusLabel(status, t)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button data-tour="pages-erp-dental-treatment-plans.button.common.save"
                        size="sm"
                        onClick={() => saveProcedureMutation.mutate()}
                        disabled={!procedureDraft.description.trim() || saveProcedureMutation.isPending}
                      >
                        {saveProcedureMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : editingProcedureId ? null : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        {editingProcedureId
                          ? t('common.save', 'Save')
                          : t('erp.dental.treatmentPlans.addProcedure', 'Add procedure')}
                      </Button>
                      {editingProcedureId ? (
                        <Button data-tour="pages-erp-dental-treatment-plans.button.common.cancel" size="sm" variant="outline" onClick={resetProcedureForm}>
                          {t('common.cancel', 'Cancel')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('erp.dental.treatmentPlans.planSummary', 'Plan Summary')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPlanId ? (
              <p className="text-sm text-muted-foreground">
                {t('erp.dental.treatmentPlans.summaryHint', 'Select a plan to see its summary and progress.')}
              </p>
            ) : planDetailQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('erp.common.loading', 'Loading...')}
              </div>
            ) : plan ? (
              <div className="space-y-4">
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {t('erp.dental.treatmentPlans.fields.status', 'Status')}
                    </dt>
                    <dd>
                      <Badge variant="outline">{statusLabel(plan.status, t)}</Badge>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {t('erp.dental.treatmentPlans.totalProcedures', 'Total procedures')}
                    </dt>
                    <dd className="font-medium">{plan.procedures.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">
                      {t('erp.dental.treatmentPlans.estimatedTotal', 'Estimated total')}
                    </dt>
                    <dd className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatMoney(plan.estimatedTotal, plan.currency)}
                    </dd>
                  </div>
                  {formatDateTime(plan.createdAt) ? (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">
                        {t('erp.dental.treatmentPlans.created', 'Created')}
                      </dt>
                      <dd className="text-xs">{formatDateTime(plan.createdAt)}</dd>
                    </div>
                  ) : null}
                  {formatDateTime(plan.updatedAt) ? (
                    <div className="flex items-center justify-between gap-2">
                      <dt className="text-muted-foreground">
                        {t('erp.dental.treatmentPlans.lastUpdated', 'Last updated')}
                      </dt>
                      <dd className="text-xs">{formatDateTime(plan.updatedAt)}</dd>
                    </div>
                  ) : null}
                </dl>

                <hr className="border-border" />

                <div className="space-y-3">
                  <h3 className="text-sm font-medium">
                    {t('erp.dental.treatmentPlans.planProgress', 'Plan Progress')}
                  </h3>
                  {activeProcedures.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('erp.dental.treatmentPlans.noProceduresProgress', 'Add procedures to track progress.')}
                    </p>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="relative h-[72px] w-[72px] shrink-0">
                        <div
                          className="h-[72px] w-[72px] rounded-full"
                          style={{
                            background: `conic-gradient(hsl(var(--primary)) ${progressPercent * 3.6}deg, hsl(var(--muted)) ${progressPercent * 3.6}deg)`,
                          }}
                        />
                        <div className="absolute inset-2 grid place-items-center rounded-full bg-card text-sm font-semibold">
                          {progressPercent}%
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t(
                          'erp.dental.treatmentPlans.stepsCompleted',
                          '{{completed}} of {{total}} steps completed',
                          { completed: completedCount, total: activeProcedures.length },
                        )}
                      </p>
                    </div>
                  )}
                </div>

                {activeProcedures.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">
                      {t('erp.dental.treatmentPlans.nextSteps', 'Next Steps')}
                    </h3>
                    <ul className="space-y-1.5">
                      {activeProcedures.map((procedure) => (
                        <li key={procedure.id} className="flex items-start gap-2 text-sm">
                          <ProcedureStatusIcon status={procedure.status} />
                          <span
                            className={cn(
                              'leading-tight',
                              procedure.status === 'completed' && 'text-muted-foreground line-through',
                            )}
                          >
                            {procedure.description}
                            {procedure.toothRefs?.length ? ` (${procedure.toothRefs.join(', ')})` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-tour="pages-erp-dental-treatment-plans.dialogcontent.erp.dental.treatmentPlans.new">
          <DialogHeader>
            <DialogTitle>{t('erp.dental.treatmentPlans.new', 'New plan')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('erp.dental.treatmentPlans.fields.patient', 'Patient')}</Label>
              <Popover open={patientOpen} onOpenChange={setPatientOpen}>
                <PopoverTrigger asChild>
                  <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.treatmentPlans.pickPatient" variant="outline" role="combobox" className="w-full justify-between">
                    {selectedPatientName ||
                      (createContactId
                        ? `#${createContactId}`
                        : t('erp.dental.treatmentPlans.pickPatient', 'Select patient…'))}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder={t('erp.dental.treatmentPlans.searchPatients', 'Search patients…')}
                      value={patientSearch}
                      onValueChange={(value) => {
                        setPatientSearch(value);
                        if (selectedPatientName && value !== selectedPatientName) {
                          setCreateContactId(null);
                          setSelectedPatientName('');
                        }
                      }}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {patientsQuery.isLoading
                          ? t('erp.common.loading', 'Loading...')
                          : t('erp.dental.treatmentPlans.noPatients', 'No patients found')}
                      </CommandEmpty>
                      {patientsQuery.data?.map((patient) => (
                        <CommandItem
                          key={patient.contactId}
                          value={String(patient.contactId)}
                          onSelect={() => {
                            setCreateContactId(patient.contactId);
                            setSelectedPatientName(patient.name);
                            setPatientSearch(patient.name);
                            setPatientOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              createContactId === patient.contactId ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          {patient.name}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {canManagePatients ? (
                <Button data-tour="pages-erp-dental-treatment-plans.button.erp.dental.patients.add"
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => setAddPatientOpen(true)}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1" />
                  {t('erp.dental.patients.add', 'Add Patient')}
                </Button>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>{t('erp.dental.treatmentPlans.fields.title', 'Title')}</Label>
              <Input data-tour="pages-erp-dental-treatment-plans.input.erp.dental.treatmentPlans.fields.patient" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('erp.dental.treatmentPlans.fields.description', 'Description')}</Label>
              <Textarea data-tour="pages-erp-dental-treatment-plans.textarea.erp.dental.treatmentPlans.fields.patient" value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-dental-treatment-plans.button.common.cancel" variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-dental-treatment-plans.button.common.create"
              onClick={() => createMutation.mutate()}
              disabled={!createContactId || !createTitle.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddDentalPatientDialog
        open={addPatientOpen}
        onOpenChange={setAddPatientOpen}
        onSuccess={(patient) => {
          setCreateContactId(patient.contactId);
          setSelectedPatientName(patient.name);
          setPatientSearch(patient.name);
          queryClient.invalidateQueries({
            queryKey: ['/api/erp/dental/treatment-plans/patient-options'],
          });
        }}
      />
    </DentalShellPage>
  );
}

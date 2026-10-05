import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LocalizedPhoneInput } from '@/components/ui/localized-phone-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Plus,
  Search,
  Pencil,
  Trash2,
  Star,
  Info as TabIconInfo,
  Package as TabIconPackage,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { useErpCurrencies } from '@/hooks/use-erp-currencies';

type SupplierRow = {
  id: number;
  companyId: number;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
  taxId: string | null;
  paymentTerms: string | null;
  currency: string | null;
  notes: string | null;
  status: string;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
};

type SupplierProductRow = {
  id: number;
  supplierId: number;
  productId: number;
  companyId: number;
  supplierSku: string | null;
  supplierPrice: string | null;
  leadTimeDays: number | null;
  minOrderQty: number | null;
  isPreferred: boolean | null;
  productName?: string | null;
  productSku?: string | null;
};

type SupplierUsageRow = {
  linkedProducts: number;
  openPurchaseOrders: number;
  unpaidInvoices: number;
  openAccountsPayable: number;
};

type ProductPicker = { id: number; name: string; sku: string | null };

const STATUS_OPTIONS = ['all', 'active', 'inactive'] as const;

function StarsDisplay({ rating }: { rating: number | null }) {
  if (rating == null || rating < 1) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" title={`${rating}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i < rating ? 'fill-current' : 'text-muted-foreground/30'}`}
        />
      ))}
    </span>
  );
}

export default function ERPSuppliersPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const canManage = hasPermission(PERMISSIONS.MANAGE_SUPPLIERS);
  const {
    currencies,
    availableCurrencyCodes,
    baseCurrencyCode,
    isLoading: currenciesLoading,
  } = useErpCurrencies();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierRow | null>(null);
  const [deleteLinkTarget, setDeleteLinkTarget] = useState<SupplierProductRow | null>(null);
  const [deleteForceConfirmed, setDeleteForceConfirmed] = useState(false);

  const [formName, setFormName] = useState('');
  const [formContactName, setFormContactName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formAddrLine1, setFormAddrLine1] = useState('');
  const [formAddrCity, setFormAddrCity] = useState('');
  const [formAddrCountry, setFormAddrCountry] = useState('');
  const [formTaxId, setFormTaxId] = useState('');
  const [formPaymentTerms, setFormPaymentTerms] = useState('');
  const [formCurrency, setFormCurrency] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formRating, setFormRating] = useState<string>('');

  const [linkProductId, setLinkProductId] = useState('');
  const [linkSupplierSku, setLinkSupplierSku] = useState('');
  const [linkPrice, setLinkPrice] = useState('');
  const [linkLeadDays, setLinkLeadDays] = useState('');
  const [linkMinQty, setLinkMinQty] = useState('');
  const [linkPreferred, setLinkPreferred] = useState(false);

  useEffect(() => {
    if (currenciesLoading || formCurrency) return;
    setFormCurrency(baseCurrencyCode);
  }, [currenciesLoading, baseCurrencyCode, formCurrency]);

  const filtersKey = useMemo(
    () => ({ searchTerm, statusFilter, page, limit }),
    [searchTerm, statusFilter, page, limit]
  );

  const invalidateSuppliers = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/suppliers'] });
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeleteForceConfirmed(false);
  };

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['/api/erp/suppliers', companyId, filtersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));
      const res = await apiRequest('GET', `/api/erp/suppliers?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: SupplierRow[]; total: number };
    },
    enabled: !!companyId,
  });

  const suppliers = listResult?.data ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const { data: productsList } = useQuery({
    queryKey: ['/api/erp/products', companyId, 'suppliers-picker'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('offset', '0');
      const res = await apiRequest('GET', `/api/erp/products?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: ProductPicker[]; total: number };
    },
    enabled: !!companyId && dialogOpen,
  });
  const products = productsList?.data ?? [];

  const { data: linkedProducts = [], isLoading: linkedLoading } = useQuery({
    queryKey: ['/api/erp/suppliers', editing?.id, 'products'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/suppliers/${editing!.id}/products`);
      const json = await res.json();
      return (json.data ?? []) as SupplierProductRow[];
    },
    enabled: !!editing?.id && dialogOpen,
  });

  const { data: deleteUsage, isLoading: deleteUsageLoading } = useQuery({
    queryKey: ['/api/erp/suppliers', deleteTarget?.id, 'usage'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/suppliers/${deleteTarget!.id}/usage`);
      const json = await res.json();
      return json.data as SupplierUsageRow;
    },
    enabled: !!deleteTarget?.id,
  });
  const deleteHasBlockers =
    (deleteUsage?.openPurchaseOrders ?? 0) > 0 ||
    (deleteUsage?.unpaidInvoices ?? 0) > 0 ||
    (deleteUsage?.openAccountsPayable ?? 0) > 0;

  const resetForm = () => {
    setFormName('');
    setFormContactName('');
    setFormEmail('');
    setFormPhone('');
    setFormAddrLine1('');
    setFormAddrCity('');
    setFormAddrCountry('');
    setFormTaxId('');
    setFormPaymentTerms('');
    setFormCurrency(baseCurrencyCode);
    setFormNotes('');
    setFormStatus('active');
    setFormRating('');
    setLinkProductId('');
    setLinkSupplierSku('');
    setLinkPrice('');
    setLinkLeadDays('');
    setLinkMinQty('');
    setLinkPreferred(false);
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (s: SupplierRow) => {
    setEditing(s);
    setFormName(s.name);
    setFormContactName(s.contactName ?? '');
    setFormEmail(s.email ?? '');
    setFormPhone(s.phone ?? '');
    const addr = (s.address ?? {}) as Record<string, string>;
    setFormAddrLine1(addr.line1 ?? '');
    setFormAddrCity(addr.city ?? '');
    setFormAddrCountry(addr.country ?? '');
    setFormTaxId(s.taxId ?? '');
    setFormPaymentTerms(s.paymentTerms ?? '');
    setFormCurrency(s.currency?.trim().toUpperCase() || baseCurrencyCode);
    setFormNotes(s.notes ?? '');
    setFormStatus(s.status);
    setFormRating(s.rating != null ? String(s.rating) : '');
    setLinkProductId('');
    setLinkSupplierSku('');
    setLinkPrice('');
    setLinkLeadDays('');
    setLinkMinQty('');
    setLinkPreferred(false);
    setDialogOpen(true);
  };

  const buildPayload = () => {
    const address: Record<string, string> = {};
    if (formAddrLine1.trim()) address.line1 = formAddrLine1.trim();
    if (formAddrCity.trim()) address.city = formAddrCity.trim();
    if (formAddrCountry.trim()) address.country = formAddrCountry.trim();
    return {
      name: formName,
      contactName: formContactName.trim() || undefined,
      email: formEmail.trim() || undefined,
      phone: formPhone.trim() || undefined,
      address: Object.keys(address).length ? address : undefined,
      taxId: formTaxId.trim() || undefined,
      paymentTerms: formPaymentTerms.trim() || undefined,
      currency: formCurrency || baseCurrencyCode || 'USD',
      notes: formNotes.trim() || undefined,
      status: formStatus as 'active' | 'inactive',
      rating: formRating.trim() ? parseInt(formRating, 10) : null,
    };
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/suppliers', buildPayload());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.suppliers.toast.created', 'Supplier created') });
      setDialogOpen(false);
      invalidateSuppliers();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('No supplier');
      const res = await apiRequest('PUT', `/api/erp/suppliers/${editing.id}`, buildPayload());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.suppliers.toast.updated', 'Supplier updated') });
      invalidateSuppliers();
      queryClient.invalidateQueries({ queryKey: ['/api/erp/suppliers', editing?.id, 'products'] });
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ supplier, force = false }: { supplier: SupplierRow; force?: boolean }) => {
      const suffix = force ? '?force=true' : '';
      await apiRequest('DELETE', `/api/erp/suppliers/${supplier.id}${suffix}`);
    },
    onSuccess: (_data, variables) => {
      toast({ title: variables.force ? t('erp.suppliers.toast.forceDeleted', 'Supplier force deleted') : t('erp.suppliers.toast.deleted', 'Supplier deleted') });
      closeDeleteDialog();
      invalidateSuppliers();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const addLinkMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('Save supplier first');
      const body: Record<string, unknown> = {
        productId: parseInt(linkProductId, 10),
        supplierSku: linkSupplierSku.trim() || undefined,
        supplierPrice: linkPrice.trim() || undefined,
        leadTimeDays: linkLeadDays.trim() ? parseInt(linkLeadDays, 10) : undefined,
        minOrderQty: linkMinQty.trim() ? parseInt(linkMinQty, 10) : undefined,
        isPreferred: linkPreferred,
      };
      await apiRequest('POST', `/api/erp/suppliers/${editing.id}/products`, body);
    },
    onSuccess: () => {
      toast({ title: t('erp.suppliers.toast.productLinked', 'Product linked') });
      setLinkProductId('');
      setLinkSupplierSku('');
      setLinkPrice('');
      setLinkLeadDays('');
      setLinkMinQty('');
      setLinkPreferred(false);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/suppliers', editing?.id, 'products'] });
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async ({ spId }: { spId: number }) => {
      if (!editing) throw new Error('No supplier');
      await apiRequest('DELETE', `/api/erp/suppliers/${editing.id}/products/${spId}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.suppliers.toast.linkRemoved', 'Link removed') });
      setDeleteLinkTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/suppliers', editing?.id, 'products'] });
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const submitForm = () => {
    if (!formName.trim()) {
      toast({ title: t('erp.suppliers.validation.nameRequired', 'Name is required'), variant: 'destructive' });
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
                <h1 data-tour="pages-erp-suppliers.h1.erp.suppliers.title" className="text-2xl">{t('erp.suppliers.title', 'Suppliers')}</h1>
                <p className="text-muted-foreground text-sm">{t('erp.suppliers.subtitle', 'Manage vendors and product sourcing')}</p>
              </div>
              {canManage && (
                <Button data-tour="pages-erp-suppliers.button.erp.suppliers.actions.addSupplier" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('erp.suppliers.actions.addSupplier', 'Add supplier')}
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input data-tour="pages-erp-suppliers.input.erp.suppliers.searchPlaceholder"
                      placeholder={t('erp.suppliers.searchPlaceholder', 'Search name, contact, email…')}
                      className="pl-9"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                    />
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
                                : s === 'inactive'
                                  ? t('erp.common.inactive', 'Inactive')
                                  : s}
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
                  <Table data-tour="pages-erp-suppliers.table.erp.common.name">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.common.name', 'Name')}</TableHead>
                        <TableHead>{t('erp.suppliers.table.contact', 'Contact')}</TableHead>
                        <TableHead>{t('erp.common.email', 'Email')}</TableHead>
                        <TableHead>{t('erp.common.phone', 'Phone')}</TableHead>
                        <TableHead>{t('erp.suppliers.table.paymentTerms', 'Payment terms')}</TableHead>
                        <TableHead>{t('erp.common.currency', 'Currency')}</TableHead>
                        <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                        <TableHead>{t('erp.suppliers.table.rating', 'Rating')}</TableHead>
                        {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suppliers.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={canManage ? 9 : 8}
                            className="text-center text-muted-foreground py-12"
                          >
                            {t('erp.suppliers.empty', 'No suppliers yet')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        suppliers.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{s.contactName || '—'}</TableCell>
                            <TableCell className="text-sm">{s.email || '—'}</TableCell>
                            <TableCell>{s.phone || '—'}</TableCell>
                            <TableCell>{s.paymentTerms || '—'}</TableCell>
                            <TableCell>{s.currency || baseCurrencyCode}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{s.status}</Badge>
                            </TableCell>
                            <TableCell>
                              <StarsDisplay rating={s.rating} />
                            </TableCell>
                            {canManage && (
                              <TableCell className="text-right space-x-2">
                                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setDeleteForceConfirmed(false);
                                    setDeleteTarget(s);
                                  }}
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

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {t('erp.suppliers.pagination.summary', 'Page {{page}} of {{totalPages}} ({{count}} suppliers)', {
                  page: String(page),
                  totalPages: String(totalPages),
                  count: String(total),
                })}
              </span>
              <div className="flex gap-2">
                <Button data-tour="pages-erp-suppliers.button.erp.common.previous"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('erp.common.previous', 'Previous')}
                </Button>
                <Button data-tour="pages-erp-suppliers.button.erp.common.next"
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-tour="pages-erp-suppliers.dialogcontent.erp.suppliers.dialog.editTitle" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('erp.suppliers.dialog.editTitle', 'Edit supplier') : t('erp.suppliers.dialog.newTitle', 'New supplier')}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger icon={TabIconInfo} data-tour="pages-erp-suppliers.tabstrigger.details" value="details">{t('erp.common.details', 'Details')}</TabsTrigger>
              <TabsTrigger icon={TabIconPackage} data-tour="pages-erp-suppliers.tabstrigger.products" value="products" disabled={!editing}>
                {t('erp.suppliers.tabs.linkedProducts', 'Linked products')}
              </TabsTrigger>
            </TabsList>
            <TabsContent data-tour="pages-erp-suppliers.tabscontent.details" value="details" className="space-y-3 pt-3">
              <div>
                <Label>{t('erp.common.name', 'Name')}</Label>
                <Input data-tour="pages-erp-suppliers.input.erp.common.name" value={formName} onChange={(e) => setFormName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t('erp.suppliers.form.contactName', 'Contact name')}</Label>
                  <Input data-tour="pages-erp-suppliers.input.erp.suppliers.form.contactName" value={formContactName} onChange={(e) => setFormContactName(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.common.phone', 'Phone')}</Label>
                  <LocalizedPhoneInput value={formPhone} onChange={setFormPhone} />
                </div>
              </div>
              <div>
                <Label>{t('erp.common.email', 'Email')}</Label>
                <Input data-tour="pages-erp-suppliers.input.erp.common.name" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
              </div>
              <div>
                <Label>{t('erp.common.address', 'Address')}</Label>
                <Input data-tour="pages-erp-suppliers.input.erp.suppliers.form.line1"
                  placeholder={t('erp.suppliers.form.line1', 'Line 1')}
                  value={formAddrLine1}
                  onChange={(e) => setFormAddrLine1(e.target.value)}
                  className="mb-2"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input data-tour="pages-erp-suppliers.input.erp.common.city" placeholder={t('erp.common.city', 'City')} value={formAddrCity} onChange={(e) => setFormAddrCity(e.target.value)} />
                  <Input data-tour="pages-erp-suppliers.input.erp.common.country"
                    placeholder={t('erp.common.country', 'Country')}
                    value={formAddrCountry}
                    onChange={(e) => setFormAddrCountry(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t('erp.suppliers.form.taxId', 'Tax ID')}</Label>
                  <Input data-tour="pages-erp-suppliers.input.erp.suppliers.form.taxId" value={formTaxId} onChange={(e) => setFormTaxId(e.target.value)} />
                </div>
                <div>
                  <Label>{t('erp.suppliers.table.paymentTerms', 'Payment terms')}</Label>
                  <Input data-tour="pages-erp-suppliers.input.erp.suppliers.form.net30"
                    placeholder={t('erp.suppliers.form.net30', 'Net 30')}
                    value={formPaymentTerms}
                    onChange={(e) => setFormPaymentTerms(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>{t('erp.common.currency', 'Currency')}</Label>
                  <Select value={formCurrency} onValueChange={setFormCurrency}>
                    <SelectTrigger data-tour="pages-erp-suppliers.selecttrigger.erp.common.loading" disabled={currenciesLoading && currencies.length === 0}>
                      <SelectValue
                        placeholder={
                          currenciesLoading && currencies.length === 0
                            ? t('erp.common.loading', 'Loading…')
                            : undefined
                        }
                      />
                    </SelectTrigger>
                    <SelectContent searchable>
                      {formCurrency &&
                        !availableCurrencyCodes.includes(formCurrency) && (
                          <SelectItem key="__legacy__" value={formCurrency}>
                            {formCurrency}
                          </SelectItem>
                        )}
                      {currencies
                        .filter((c) => c.isActive !== false)
                        .map((c) => {
                          if (!c.code?.trim()) return null;
                          const code = c.code.trim().toUpperCase();
                          return (
                            <SelectItem key={c.id} value={code}>
                              {c.code} — {c.name}
                              {c.symbol ? ` (${c.symbol})` : ''}
                            </SelectItem>
                          );
                        })}
                      {!currenciesLoading &&
                        currencies.filter((c) => c.isActive !== false).length === 0 &&
                        availableCurrencyCodes.map((code) => (
                          <SelectItem key={code} value={code}>
                            {code}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('erp.common.status', 'Status')}</Label>
                  <Select value={formStatus} onValueChange={setFormStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent searchable>
                      <SelectItem value="active">{t('erp.common.active', 'Active')}</SelectItem>
                      <SelectItem value="inactive">{t('erp.common.inactive', 'Inactive')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t('erp.suppliers.form.rating', 'Rating (1-5)')}</Label>
                <Select value={formRating || 'none'} onValueChange={(v) => setFormRating(v === 'none' ? '' : v)}>
                  <SelectTrigger data-tour="pages-erp-suppliers.selecttrigger.erp.common.optional">
                    <SelectValue placeholder={t('erp.common.optional', 'Optional')} />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('erp.common.notes', 'Notes')}</Label>
                <Textarea data-tour="pages-erp-suppliers.textarea.erp.common.name" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
              </div>
            </TabsContent>
            <TabsContent data-tour="pages-erp-suppliers.tabscontent.products" value="products" className="space-y-3 pt-3">
              {linkedLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Table data-tour="pages-erp-suppliers.table.erp.common.product">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('erp.common.product', 'Product')}</TableHead>
                      <TableHead>{t('erp.suppliers.linked.supplierSku', 'Supplier SKU')}</TableHead>
                      <TableHead>{t('erp.common.price', 'Price')}</TableHead>
                      {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linkedProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={canManage ? 4 : 3} className="text-muted-foreground text-center">
                          {t('erp.suppliers.linked.empty', 'No linked products')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      linkedProducts.map((lp) => (
                        <TableRow key={lp.id}>
                          <TableCell>
                            <div className="font-medium">{lp.productName ?? `#${lp.productId}`}</div>
                            <div className="text-xs text-muted-foreground font-mono">{lp.productSku ?? ''}</div>
                          </TableCell>
                          <TableCell>{lp.supplierSku || '—'}</TableCell>
                          <TableCell>{lp.supplierPrice ?? '—'}</TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteLinkTarget(lp)}
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
              {canManage && editing && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="font-medium text-sm">{t('erp.suppliers.linked.addLink', 'Add link')}</div>
                  <Select value={linkProductId} onValueChange={setLinkProductId}>
                    <SelectTrigger data-tour="pages-erp-suppliers.selecttrigger.erp.common.product">
                      <SelectValue placeholder={t('erp.common.product', 'Product')} />
                    </SelectTrigger>
                    <SelectContent searchable>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Input data-tour="pages-erp-suppliers.input.erp.suppliers.linked.supplierSku"
                      placeholder={t('erp.suppliers.linked.supplierSku', 'Supplier SKU')}
                      value={linkSupplierSku}
                      onChange={(e) => setLinkSupplierSku(e.target.value)}
                    />
                    <Input data-tour="pages-erp-suppliers.input.erp.common.price" placeholder={t('erp.common.price', 'Price')} value={linkPrice} onChange={(e) => setLinkPrice(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input data-tour="pages-erp-suppliers.input.erp.suppliers.linked.leadTimeDays"
                      placeholder={t('erp.suppliers.linked.leadTimeDays', 'Lead time (days)')}
                      value={linkLeadDays}
                      onChange={(e) => setLinkLeadDays(e.target.value)}
                    />
                    <Input data-tour="pages-erp-suppliers.input.erp.suppliers.linked.minOrderQty"
                      placeholder={t('erp.suppliers.linked.minOrderQty', 'Min order qty')}
                      value={linkMinQty}
                      onChange={(e) => setLinkMinQty(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="pref"
                      checked={linkPreferred}
                      onCheckedChange={(c) => setLinkPreferred(c === true)}
                    />
                    <Label htmlFor="pref" className="font-normal">
                      {t('erp.suppliers.linked.preferred', 'Preferred')}
                    </Label>
                  </div>
                  <Button data-tour="pages-erp-suppliers.button.erp.suppliers.linked.addLink"
                    size="sm"
                    disabled={!linkProductId}
                    onClick={() => addLinkMutation.mutate()}
                  >
                    {t('erp.suppliers.linked.addLink', 'Add link')}
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button data-tour="pages-erp-suppliers.button.erp.common.close" variant="outline" onClick={() => setDialogOpen(false)}>
              {t('erp.common.close', 'Close')}
            </Button>
            {canManage && (
              <Button data-tour="pages-erp-suppliers.button.erp.common.save"
                onClick={submitForm}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {(createMutation.isPending || updateMutation.isPending) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editing ? t('erp.common.save', 'Save') : t('erp.common.create', 'Create')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.suppliers.delete.title', 'Delete supplier?')}</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2">
                <p>{t('erp.suppliers.delete.description', 'This will remove {{supplier}} and related catalog links.', { supplier: deleteTarget?.name ?? t('erp.suppliers.delete.thisSupplier', 'this supplier') })}</p>
                {deleteUsageLoading ? (
                  <p>{t('erp.suppliers.delete.loadingDeps', 'Loading dependency counts...')}</p>
                ) : deleteUsage ? (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3 text-sm">
                    <div>{t('erp.suppliers.delete.linkedProducts', 'Linked products')}: {deleteUsage.linkedProducts}</div>
                    <div>{t('erp.suppliers.delete.openPurchaseOrders', 'Open purchase orders')}: {deleteUsage.openPurchaseOrders}</div>
                    <div>{t('erp.suppliers.delete.unpaidInvoices', 'Unpaid invoices')}: {deleteUsage.unpaidInvoices}</div>
                    <div>{t('erp.suppliers.delete.openAccountsPayable', 'Open accounts payable')}: {deleteUsage.openAccountsPayable}</div>
                  </div>
                ) : null}
                {deleteHasBlockers ? (
                  <>
                    <p className="text-destructive">
                      {t('erp.suppliers.delete.blockedMessage', 'Regular delete is blocked while open dependencies exist. Resolve them first, or explicitly confirm a force delete.')}
                    </p>
                    <div className="flex items-start gap-2 rounded-md border border-destructive/20 p-3 text-sm">
                      <Checkbox
                        id="force-delete-supplier"
                        checked={deleteForceConfirmed}
                        onCheckedChange={(checked) => setDeleteForceConfirmed(checked === true)}
                      />
                      <Label htmlFor="force-delete-supplier" className="font-normal leading-5">
                        {t('erp.suppliers.delete.forceConfirm', 'I understand force delete can orphan related records and should only be used deliberately.')}
                      </Label>
                    </div>
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <Button data-tour="pages-erp-suppliers.button.erp.common.delete"
              variant="destructive"
              disabled={deleteUsageLoading || deleteMutation.isPending || deleteHasBlockers}
              onClick={() => deleteTarget && deleteMutation.mutate({ supplier: deleteTarget })}
            >
              {t('erp.common.delete', 'Delete')}
            </Button>
            {deleteHasBlockers ? (
              <Button data-tour="pages-erp-suppliers.button.erp.suppliers.delete.forceDelete"
                variant="destructive"
                disabled={deleteUsageLoading || deleteMutation.isPending || !deleteForceConfirmed}
                onClick={() => deleteTarget && deleteMutation.mutate({ supplier: deleteTarget, force: true })}
              >
                {t('erp.suppliers.delete.forceDelete', 'Force delete')}
              </Button>
            ) : null}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteLinkTarget} onOpenChange={() => setDeleteLinkTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.suppliers.removeLink.title', 'Remove linked product?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('erp.suppliers.removeLink.description', 'This will unlink {{product}} from {{supplier}}.', {
                product: deleteLinkTarget?.productName ?? t('erp.suppliers.removeLink.thisProduct', 'this product'),
                supplier: editing?.name ?? t('erp.suppliers.delete.thisSupplier', 'this supplier'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteLinkTarget && deleteLinkMutation.mutate({ spId: deleteLinkTarget.id })}
            >
              {t('erp.suppliers.removeLink.action', 'Remove link')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

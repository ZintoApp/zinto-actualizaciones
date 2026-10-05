import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { ProductPicker, type ProductPickerOption } from '@/components/erp/product-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
import { Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { useErpCurrencies } from '@/hooks/use-erp-currencies';

type PurchaseOrderRow = {
  id: number;
  companyId: number;
  orderNumber: string;
  supplierId: number | null;
  status: string;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  currency: string | null;
  expectedDeliveryDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type PurchaseOrderItemRow = {
  id: number;
  purchaseOrderId: number;
  productId: number | null;
  variantId: number | null;
  productName?: string | null;
  variantName?: string | null;
  description: string | null;
  quantity: string;
  unitCost: string;
  receivedQty: string;
  lineTotal: string;
  sortOrder: number | null;
};

type GoodsReceiptRow = {
  id: number;
  purchaseOrderId: number;
  warehouseId: number | null;
  receiptNumber: string | null;
  receivedDate: string | null;
  items: unknown;
  notes: string | null;
  createdAt: string | null;
};

type SupplierMini = { id: number; name: string };
type VariantRow = { id: number; name: string };
type WarehouseRow = { id: number; name: string };

function poStatusBadgeClass(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-muted text-muted-foreground';
    case 'sent':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
    case 'confirmed':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'partially_received':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
    case 'received':
      return 'bg-green-600/15 text-green-800 dark:text-green-200';
    case 'cancelled':
      return 'bg-destructive/15 text-destructive';
    default:
      return 'bg-secondary';
  }
}

function canEditPOLines(status: string): boolean {
  return status === 'draft' || status === 'sent';
}

function formatPurchaseOrderTotalsByCurrency(rows: PurchaseOrderRow[]): string {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = (row.currency ?? 'USD').toUpperCase();
    const amount = Number(row.totalAmount ?? 0);
    if (!Number.isFinite(amount)) continue;
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  if (totals.size === 0) return '—';
  return Array.from(totals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
    .join(' | ');
}

export default function ERPPurchaseOrdersPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const canManage = hasPermission(PERMISSIONS.MANAGE_PURCHASE_ORDERS);
  const {
    currencies,
    availableCurrencyCodes,
    baseCurrencyCode,
    isLoading: currenciesLoading,
  } = useErpCurrencies();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const [formSupplierId, setFormSupplierId] = useState<string>('');
  const [formCurrency, setFormCurrency] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formExpected, setFormExpected] = useState('');
  const [formTax, setFormTax] = useState('0');

  const [lineProduct, setLineProduct] = useState<ProductPickerOption | null>(null);
  const [lineVariantId, setLineVariantId] = useState('');
  const [lineQty, setLineQty] = useState('1');
  const [lineCost, setLineCost] = useState('');
  const [lineDescription, setLineDescription] = useState('');
  const lineProductId = lineProduct ? String(lineProduct.id) : '';

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [recvWarehouseId, setRecvWarehouseId] = useState('');
  const [recvQty, setRecvQty] = useState<Record<string, string>>({});
  const [recvNotes, setRecvNotes] = useState('');

  useEffect(() => {
    if (currenciesLoading || formCurrency) return;
    setFormCurrency(baseCurrencyCode);
  }, [currenciesLoading, baseCurrencyCode, formCurrency]);

  const filtersKey = useMemo(
    () => ({ searchTerm, statusFilter, supplierFilter, dateFrom, dateTo, page, limit }),
    [searchTerm, statusFilter, supplierFilter, dateFrom, dateTo, page, limit]
  );

  const invalidateList = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/purchase-orders'] });
  };

  const invalidateDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/purchase-orders', companyId, detailId, 'detail'] });
  };

  const { data: suppliersList } = useQuery({
    queryKey: ['/api/erp/suppliers', companyId, 'po-picker'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('offset', '0');
      const res = await apiRequest('GET', `/api/erp/suppliers?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: SupplierMini[]; total: number };
    },
    enabled: !!companyId,
  });
  const suppliers = suppliersList?.data ?? [];

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['/api/erp/purchase-orders', companyId, filtersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (supplierFilter !== 'all') params.set('supplierId', supplierFilter);
      if (dateFrom) params.set('dateFrom', new Date(dateFrom).toISOString());
      if (dateTo) params.set('dateTo', new Date(dateTo).toISOString());
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));
      const res = await apiRequest('GET', `/api/erp/purchase-orders?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: PurchaseOrderRow[]; total: number };
    },
    enabled: !!companyId,
  });

  const orders = listResult?.data ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const tableTotalSummary = useMemo(() => formatPurchaseOrderTotalsByCurrency(orders), [orders]);

  const supplierNameById = useMemo(() => {
    const m = new Map<number, string>();
    suppliers.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [suppliers]);

  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/erp/inventory/warehouses', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/inventory/warehouses');
      const json = await res.json();
      return (json.data ?? []) as WarehouseRow[];
    },
    enabled: !!companyId && (receiveOpen || detailId != null),
  });

  const { data: variants = [] } = useQuery({
    queryKey: ['/api/erp/products', companyId, lineProductId, 'variants-po'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/products/${lineProductId}/variants`);
      const json = await res.json();
      return (json.data ?? []) as VariantRow[];
    },
    enabled: !!companyId && !!lineProductId,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['/api/erp/purchase-orders', companyId, detailId, 'detail'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/purchase-orders/${detailId}`);
      const json = await res.json();
      return json.data as {
        order: PurchaseOrderRow;
        supplier: SupplierMini | null;
        items: PurchaseOrderItemRow[];
        receipts: GoodsReceiptRow[];
      };
    },
    enabled: !!companyId && detailId != null,
  });

  useEffect(() => {
    if (detailId == null) return;
    setLineProduct(null);
    setLineVariantId('');
    setLineQty('1');
    setLineCost('');
    setLineDescription('');
  }, [detailId]);

  const openReceive = () => {
    if (!detailData) return;
    const next: Record<string, string> = {};
    for (const it of detailData.items) {
      if (it.productId == null) continue;
      const rem = Math.max(0, Number(it.quantity) - Number(it.receivedQty));
      next[String(it.id)] = rem > 0 ? String(rem) : '0';
    }
    setRecvQty(next);
    setRecvWarehouseId(warehouses[0] ? String(warehouses[0].id) : '');
    setRecvNotes('');
    setReceiveOpen(true);
  };

  const createPoMutation = useMutation({
    mutationFn: async () => {
      const currencyToSend = formCurrency || baseCurrencyCode || 'USD';
      const body: Record<string, unknown> = {
        currency: currencyToSend,
        notes: formNotes || undefined,
        supplierId: formSupplierId ? parseInt(formSupplierId, 10) : null,
        taxAmount: formTax || '0',
        expectedDeliveryDate: formExpected ? new Date(formExpected).toISOString() : undefined,
      };
      const res = await apiRequest('POST', '/api/erp/purchase-orders', body);
      const json = await res.json();
      return json.data as PurchaseOrderRow;
    },
    onSuccess: () => {
      toast({ title: t('erp.purchaseOrders.toast.created', 'Purchase order created') });
      setCreateOpen(false);
      setFormSupplierId('');
      setFormCurrency(baseCurrencyCode);
      setFormNotes('');
      setFormExpected('');
      setFormTax('0');
      invalidateList();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await apiRequest('POST', `/api/erp/purchase-orders/${id}/status`, { status });
    },
    onSuccess: () => {
      toast({ title: t('erp.purchaseOrders.toast.statusUpdated', 'Status updated') });
      invalidateList();
      invalidateDetail();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const updateHeaderMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (detailId == null) throw new Error('No PO');
      await apiRequest('PUT', `/api/erp/purchase-orders/${detailId}`, body);
    },
    onSuccess: () => {
      toast({ title: t('erp.purchaseOrders.toast.updated', 'Purchase order updated') });
      invalidateList();
      invalidateDetail();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const addLineMutation = useMutation({
    mutationFn: async () => {
      if (detailId == null) throw new Error('No PO');
      await apiRequest('POST', `/api/erp/purchase-orders/${detailId}/items`, {
        productId: lineProductId ? parseInt(lineProductId, 10) : null,
        variantId: lineVariantId ? parseInt(lineVariantId, 10) : null,
        description: lineDescription || null,
        quantity: lineQty,
        unitCost: lineCost,
      });
    },
    onSuccess: () => {
      toast({ title: t('erp.purchaseOrders.toast.lineAdded', 'Line added') });
      setLineProduct(null);
      setLineVariantId('');
      setLineQty('1');
      setLineCost('');
      setLineDescription('');
      invalidateDetail();
      invalidateList();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (itemId: number) => {
      if (detailId == null) throw new Error('No PO');
      await apiRequest('DELETE', `/api/erp/purchase-orders/${detailId}/items/${itemId}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.purchaseOrders.toast.lineRemoved', 'Line removed') });
      invalidateDetail();
      invalidateList();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (detailId == null || !detailData) throw new Error('No PO');
      const wid = parseInt(recvWarehouseId, 10);
      if (Number.isNaN(wid)) throw new Error(t('erp.purchaseOrders.receive.selectWarehouseError', 'Select a warehouse'));
      const items: { purchaseOrderItemId: number; quantity: string }[] = [];
      for (const it of detailData.items) {
        if (it.productId == null) continue;
        const q = Number(recvQty[String(it.id)] ?? 0);
        if (q > 0) {
          items.push({
            purchaseOrderItemId: it.id,
            quantity: String(q),
          });
        }
      }
      if (!items.length) throw new Error(t('erp.purchaseOrders.receive.quantityRequiredError', 'Enter quantity for at least one line'));
      await apiRequest('POST', `/api/erp/purchase-orders/${detailId}/receipts`, {
        warehouseId: wid,
        items,
        notes: recvNotes || undefined,
      });
    },
    onSuccess: () => {
      toast({ title: t('erp.purchaseOrders.toast.goodsReceived', 'Goods received') });
      setReceiveOpen(false);
      invalidateDetail();
      invalidateList();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const deletePoMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/erp/purchase-orders/${id}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.purchaseOrders.toast.deleted', 'Purchase order deleted') });
      setDetailId(null);
      invalidateList();
    },
    onError: (e: Error) => toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' }),
  });

  const order = detailData?.order;
  const detailSupplier = detailData?.supplier;

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 data-tour="pages-erp-purchase-orders.h1.erp.purchaseOrders.title" className="text-2xl">{t('erp.purchaseOrders.title', 'Purchase orders')}</h1>
                <p className="text-muted-foreground text-sm">{t('erp.purchaseOrders.subtitle', 'Procurement and goods receipts')}</p>
              </div>
              {canManage && (
                <Button data-tour="pages-erp-purchase-orders.button.erp.purchaseOrders.actions.createPo"
                  onClick={() => {
                    setFormSupplierId('');
                    setFormCurrency(baseCurrencyCode);
                    setFormNotes('');
                    setFormExpected('');
                    setFormTax('0');
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {t('erp.purchaseOrders.actions.createPo', 'Create PO')}
                </Button>
              )}
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input data-tour="pages-erp-purchase-orders.input.erp.purchaseOrders.searchPlaceholder"
                      placeholder={t('erp.purchaseOrders.searchPlaceholder', 'Search PO # or supplier…')}
                      className="pl-9"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="w-full sm:w-40">
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
                        <SelectItem value="all">{t('erp.common.all', 'All')}</SelectItem>
                        {[
                          'draft',
                          'sent',
                          'confirmed',
                          'partially_received',
                          'received',
                          'cancelled',
                        ].map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full sm:w-44">
                    <Label className="text-xs text-muted-foreground">{t('erp.purchaseOrders.filters.supplier', 'Supplier')}</Label>
                    <Select
                      value={supplierFilter}
                      onValueChange={(v) => {
                        setSupplierFilter(v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('erp.purchaseOrders.filters.allSuppliers', 'All suppliers')}</SelectItem>
                        {suppliers.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('erp.common.fromDate', 'From date')}</Label>
                    <Input data-tour="pages-erp-purchase-orders.input.erp.common.status"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => {
                        setDateFrom(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">{t('erp.common.toDate', 'To date')}</Label>
                    <Input data-tour="pages-erp-purchase-orders.input.erp.common.status"
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value);
                        setPage(1);
                      }}
                    />
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
                  <Table data-tour="pages-erp-purchase-orders.table.erp.purchaseOrders.table.poNumber">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.purchaseOrders.table.poNumber', 'PO #')}</TableHead>
                        <TableHead>{t('erp.purchaseOrders.filters.supplier', 'Supplier')}</TableHead>
                        <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                        <TableHead>{t('erp.common.total', 'Total')}</TableHead>
                        <TableHead>{t('erp.common.currency', 'Currency')}</TableHead>
                        <TableHead>{t('erp.purchaseOrders.table.expected', 'Expected')}</TableHead>
                        <TableHead>{t('erp.common.created', 'Created')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                            {t('erp.purchaseOrders.empty', 'No purchase orders')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        orders.map((o) => (
                          <TableRow
                            key={o.id}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => setDetailId(o.id)}
                          >
                            <TableCell className="font-mono text-sm">{o.orderNumber}</TableCell>
                            <TableCell>
                              {o.supplierId != null ? supplierNameById.get(o.supplierId) ?? '—' : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge className={poStatusBadgeClass(o.status)} variant="secondary">
                                {o.status.replace(/_/g, ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>{o.totalAmount}</TableCell>
                            <TableCell>{o.currency ?? baseCurrencyCode}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {o.expectedDeliveryDate
                                ? new Date(o.expectedDeliveryDate).toLocaleDateString()
                                : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {new Date(o.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button data-tour="pages-erp-purchase-orders.button.erp.common.open"
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDetailId(o.id);
                                }}
                              >
                                {t('erp.common.open', 'Open')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {orders.length > 0 && (
                        <TableRow className="bg-muted/30 font-medium">
                          <TableCell colSpan={3}>{t('erp.common.total', 'Total')}</TableCell>
                          <TableCell>{tableTotalSummary}</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>—</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {t('erp.purchaseOrders.pagination.summary', 'Page {{page}} of {{totalPages}} ({{count}} orders)', {
                  page: String(page),
                  totalPages: String(totalPages),
                  count: String(total),
                })}
              </span>
              <div className="flex gap-2">
                <Button data-tour="pages-erp-purchase-orders.button.erp.common.previous"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('erp.common.previous', 'Previous')}
                </Button>
                <Button data-tour="pages-erp-purchase-orders.button.erp.common.next"
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent data-tour="pages-erp-purchase-orders.dialogcontent.erp.purchaseOrders.dialog.newTitle">
          <DialogHeader>
            <DialogTitle>{t('erp.purchaseOrders.dialog.newTitle', 'New purchase order')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('erp.purchaseOrders.filters.supplier', 'Supplier')}</Label>
              <Select value={formSupplierId || 'none'} onValueChange={(v) => setFormSupplierId(v === 'none' ? '' : v)}>
                <SelectTrigger data-tour="pages-erp-purchase-orders.selecttrigger.erp.common.optional">
                  <SelectValue placeholder={t('erp.common.optional', 'Optional')} />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.common.currency', 'Currency')}</Label>
                <Select value={formCurrency} onValueChange={setFormCurrency}>
                  <SelectTrigger data-tour="pages-erp-purchase-orders.selecttrigger.erp.common.loading" disabled={currenciesLoading && currencies.length === 0}>
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
                <Label>{t('erp.purchaseOrders.form.taxAmount', 'Tax amount')}</Label>
                <Input data-tour="pages-erp-purchase-orders.input.erp.common.currency" value={formTax} onChange={(e) => setFormTax(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t('erp.purchaseOrders.form.expectedDelivery', 'Expected delivery')}</Label>
              <Input data-tour="pages-erp-purchase-orders.input.erp.purchaseOrders.filters.supplier" type="date" value={formExpected} onChange={(e) => setFormExpected(e.target.value)} />
            </div>
            <div>
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Textarea data-tour="pages-erp-purchase-orders.textarea.erp.purchaseOrders.filters.supplier" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-purchase-orders.button.ui.common.cancel" variant="outline" onClick={() => setCreateOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-purchase-orders.button.erp.common.create" onClick={() => createPoMutation.mutate()} disabled={createPoMutation.isPending}>
              {createPoMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t('erp.purchaseOrders.sheet.title', 'Purchase order')}</SheetTitle>
          </SheetHeader>
          {detailLoading || !order ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono font-semibold">{order.orderNumber}</span>
                <Badge className={poStatusBadgeClass(order.status)} variant="secondary">
                  {order.status.replace(/_/g, ' ')}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {t('erp.purchaseOrders.filters.supplier', 'Supplier')}:{' '}
                <span className="text-foreground font-medium">
                  {detailSupplier?.name ?? (order.supplierId ? `#${order.supplierId}` : '—')}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('erp.common.subtotal', 'Subtotal')}</span>
                  <div>{order.subtotal}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('erp.common.tax', 'Tax')}</span>
                  <div>{order.taxAmount}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('erp.common.total', 'Total')}</span>
                  <div className="font-medium">{order.totalAmount}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('erp.common.currency', 'Currency')}</span>
                  <div>{order.currency ?? baseCurrencyCode}</div>
                </div>
              </div>

              {canManage && (
                <div className="flex flex-wrap gap-2">
                  {order.status === 'draft' && (
                    <Button data-tour="pages-erp-purchase-orders.button.erp.purchaseOrders.actions.sendToSupplier" size="sm" onClick={() => statusMutation.mutate({ id: order.id, status: 'sent' })}>
                      {t('erp.purchaseOrders.actions.sendToSupplier', 'Send to supplier')}
                    </Button>
                  )}
                  {order.status === 'sent' && (
                    <Button data-tour="pages-erp-purchase-orders.button.erp.purchaseOrders.actions.confirm" size="sm" onClick={() => statusMutation.mutate({ id: order.id, status: 'confirmed' })}>
                      {t('erp.purchaseOrders.actions.confirm', 'Confirm')}
                    </Button>
                  )}
                  {(order.status === 'confirmed' || order.status === 'partially_received') && (
                    <Button data-tour="pages-erp-purchase-orders.button.erp.purchaseOrders.actions.receiveGoods"
                      size="sm"
                      variant="secondary"
                      onClick={openReceive}
                      disabled={warehouses.length === 0}
                    >
                      {t('erp.purchaseOrders.actions.receiveGoods', 'Receive goods')}
                    </Button>
                  )}
                  {['draft', 'sent', 'confirmed', 'partially_received'].includes(order.status) && (
                    <Button data-tour="pages-erp-purchase-orders.button.ui.common.cancel"
                      size="sm"
                      variant="outline"
                      onClick={() => statusMutation.mutate({ id: order.id, status: 'cancelled' })}
                    >
                      {t('ui.common.cancel', 'Cancel')}
                    </Button>
                  )}
                  {order.status === 'draft' && (
                    <Button data-tour="pages-erp-purchase-orders.button.erp.purchaseOrders.actions.deleteDraft" size="sm" variant="destructive" onClick={() => deletePoMutation.mutate(order.id)}>
                      {t('erp.purchaseOrders.actions.deleteDraft', 'Delete draft')}
                    </Button>
                  )}
                </div>
              )}
              {canManage &&
                (order.status === 'confirmed' || order.status === 'partially_received') &&
                warehouses.length === 0 && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {t('erp.purchaseOrders.receive.createWarehouseWarning', 'Create a warehouse before receiving goods for this purchase order.')}
                  </div>
                )}

              {canManage &&
                order.status !== 'cancelled' &&
                order.status !== 'received' && (
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="text-sm font-medium">{t('erp.purchaseOrders.header.title', 'Header')}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">{t('erp.purchaseOrders.form.taxAmount', 'Tax amount')}</Label>
                        <Input data-tour="pages-erp-purchase-orders.input.po-tax-input"
                          defaultValue={order.taxAmount}
                          key={`tax-${order.id}-${order.updatedAt}`}
                          id="po-tax-input"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">{t('erp.purchaseOrders.form.expectedDelivery', 'Expected delivery')}</Label>
                        <Input data-tour="pages-erp-purchase-orders.input.po-exp-input"
                          type="date"
                          defaultValue={
                            order.expectedDeliveryDate
                              ? order.expectedDeliveryDate.slice(0, 10)
                              : ''
                          }
                          key={`exp-${order.id}-${order.updatedAt}`}
                          id="po-exp-input"
                        />
                      </div>
                    </div>
                    <Button data-tour="pages-erp-purchase-orders.button.erp.purchaseOrders.actions.saveHeader"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const taxEl = document.getElementById('po-tax-input') as HTMLInputElement | null;
                        const expEl = document.getElementById('po-exp-input') as HTMLInputElement | null;
                        updateHeaderMutation.mutate({
                          taxAmount: taxEl?.value ?? order.taxAmount,
                          expectedDeliveryDate: expEl?.value
                            ? new Date(expEl.value).toISOString()
                            : null,
                          notes: order.notes,
                        });
                      }}
                    >
                      {t('erp.purchaseOrders.actions.saveHeader', 'Save header')}
                    </Button>
                  </div>
                )}

              <div>
                <div className="text-sm font-medium mb-2">{t('erp.purchaseOrders.lineItems.title', 'Line items')}</div>
                {canManage && canEditPOLines(order.status) && (
                  <div className="rounded-md border p-3 space-y-2 mb-3">
                    <ProductPicker
                      companyId={companyId}
                      value={lineProduct}
                      onChange={(product) => {
                        setLineProduct(product);
                        setLineVariantId('');
                      }}
                      placeholder={t('erp.common.product', 'Product')}
                      queryKeyScope="purchase-orders-line"
                    />
                    {lineProductId ? (
                      <Select value={lineVariantId || 'none'} onValueChange={(v) => setLineVariantId(v === 'none' ? '' : v)}>
                        <SelectTrigger data-tour="pages-erp-purchase-orders.selecttrigger.erp.purchaseOrders.lineItems.variantOptional">
                          <SelectValue placeholder={t('erp.purchaseOrders.lineItems.variantOptional', 'Variant (optional)')} />
                        </SelectTrigger>
                        <SelectContent searchable>
                          <SelectItem value="none">{t('erp.purchaseOrders.lineItems.baseProduct', 'Base product')}</SelectItem>
                          {variants.map((v) => (
                            <SelectItem key={v.id} value={String(v.id)}>
                              {v.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <div className="grid grid-cols-2 gap-2">
                      <Input data-tour="pages-erp-purchase-orders.input.erp.common.qty" placeholder={t('erp.common.qty', 'Qty')} value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
                      <Input data-tour="pages-erp-purchase-orders.input.erp.purchaseOrders.lineItems.unitCost" placeholder={t('erp.purchaseOrders.lineItems.unitCost', 'Unit cost')} value={lineCost} onChange={(e) => setLineCost(e.target.value)} />
                    </div>
                    <Input data-tour="pages-erp-purchase-orders.input.erp.common.description"
                      placeholder={t('erp.common.description', 'Description')}
                      value={lineDescription}
                      onChange={(e) => setLineDescription(e.target.value)}
                    />
                    <Button data-tour="pages-erp-purchase-orders.button.erp.purchaseOrders.lineItems.addLine"
                      size="sm"
                      disabled={!lineProductId || !lineCost.trim()}
                      onClick={() => addLineMutation.mutate()}
                    >
                      {t('erp.purchaseOrders.lineItems.addLine', 'Add line')}
                    </Button>
                  </div>
                )}
                <Table data-tour="pages-erp-purchase-orders.table.erp.common.product" erpSortable={false}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('erp.common.product', 'Product')}</TableHead>
                      <TableHead>{t('erp.common.qty', 'Qty')}</TableHead>
                      <TableHead>{t('erp.purchaseOrders.lineItems.cost', 'Cost')}</TableHead>
                      <TableHead>{t('erp.purchaseOrders.lineItems.received', 'Received')}</TableHead>
                      <TableHead>{t('erp.purchaseOrders.lineItems.line', 'Line')}</TableHead>
                      {canManage && canEditPOLines(order.status) && (
                        <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailData?.items ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground text-center">
                          {t('erp.purchaseOrders.lineItems.empty', 'No lines')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (detailData?.items ?? []).map((it) => (
                        <TableRow key={it.id}>
                          <TableCell>
                            <div className="text-sm">
                              {it.productId != null
                                ? (it.productName ?? `#${it.productId}`)
                                : '—'}
                              {it.variantId != null ? ` / ${it.variantName ?? `v${it.variantId}`}` : ''}
                            </div>
                            <div className="text-xs text-muted-foreground">{it.description ?? ''}</div>
                          </TableCell>
                          <TableCell>{it.quantity}</TableCell>
                          <TableCell>{it.unitCost}</TableCell>
                          <TableCell>{it.receivedQty}</TableCell>
                          <TableCell>{it.lineTotal}</TableCell>
                          {canManage && canEditPOLines(order.status) && (
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => deleteLineMutation.mutate(it.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div>
                <div className="text-sm font-medium mb-2">{t('erp.purchaseOrders.receipts.title', 'Goods receipts')}</div>
                <Table data-tour="pages-erp-purchase-orders.table.erp.purchaseOrders.receipts.receiptNumber">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('erp.purchaseOrders.receipts.receiptNumber', 'Receipt #')}</TableHead>
                      <TableHead>{t('erp.common.date', 'Date')}</TableHead>
                      <TableHead>{t('erp.purchaseOrders.receipts.items', 'Items')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailData?.receipts ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-muted-foreground text-center">
                          {t('erp.purchaseOrders.receipts.empty', 'No receipts yet')}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (detailData?.receipts ?? []).map((r) => {
                        const arr = Array.isArray(r.items) ? r.items : [];
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="font-mono text-sm">{r.receiptNumber ?? `#${r.id}`}</TableCell>
                            <TableCell className="text-sm">
                              {r.receivedDate ? new Date(r.receivedDate).toLocaleString() : '—'}
                            </TableCell>
                            <TableCell>{arr.length}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent data-tour="pages-erp-purchase-orders.dialogcontent.erp.purchaseOrders.receive.title" className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('erp.purchaseOrders.receive.title', 'Receive goods')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('erp.inventory.filters.warehouse', 'Warehouse')}</Label>
              <Select value={recvWarehouseId} onValueChange={setRecvWarehouseId}>
                <SelectTrigger data-tour="pages-erp-purchase-orders.selecttrigger.erp.purchaseOrders.receive.selectWarehouse">
                  <SelectValue placeholder={t('erp.purchaseOrders.receive.selectWarehouse', 'Select warehouse')} />
                </SelectTrigger>
                <SelectContent searchable>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={String(w.id)}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {detailData?.items.map((it) => {
              if (it.productId == null) return null;
              const lineKey = String(it.id);
              const rem = Math.max(0, Number(it.quantity) - Number(it.receivedQty));
              return (
                <div key={it.id} className="flex items-center gap-2">
                  <div className="flex-1 text-sm">
                    {t('erp.common.product', 'Product')} {it.productId}
                    {it.variantId != null ? ` · var ${it.variantId}` : ''}
                    <div className="text-xs text-muted-foreground">
                      {t('erp.purchaseOrders.lineItems.line', 'Line')} #{it.id} · {t('erp.purchaseOrders.receive.remaining', 'Remaining')}: {rem}
                    </div>
                  </div>
                  <Input
                    className="w-24"
                    value={recvQty[lineKey] ?? '0'}
                    onChange={(e) => setRecvQty((prev) => ({ ...prev, [lineKey]: e.target.value }))}
                  />
                </div>
              );
            })}
            <div>
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Textarea data-tour="pages-erp-purchase-orders.textarea.erp.inventory.filters.warehouse" value={recvNotes} onChange={(e) => setRecvNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-purchase-orders.button.ui.common.cancel" variant="outline" onClick={() => setReceiveOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-purchase-orders.button.erp.purchaseOrders.receive.submitReceipt" onClick={() => receiveMutation.mutate()} disabled={receiveMutation.isPending}>
              {receiveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.purchaseOrders.receive.submitReceipt', 'Submit receipt')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

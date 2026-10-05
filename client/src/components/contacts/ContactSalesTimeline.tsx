import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Plus, RefreshCw, Send, ShoppingCart } from 'lucide-react';
import { useLocation } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { SendQuotationOrder } from '@/components/erp/SendQuotationDialog';
import {
  buildContactSalesTimeline,
  type ContactInvoiceSummary,
  type ContactSalesTimelineItem,
} from '@shared/contact-sales-timeline';

type SalesOrderRow = SendQuotationOrder & { createdAt: string; updatedAt?: string | null };
type InvoiceRow = ContactInvoiceSummary & {
  id: number;
  invoiceNumber: string;
  contactId: number | null;
  salesOrderId: number | null;
  status: string;
  currency: string | null;
  totalAmount: string;
  createdAt: string;
};

type ContactSalesTimelineProps = {
  contactId: number;
  archived?: boolean;
  onCreateQuotation: () => void;
  onSendQuotation: (order: SendQuotationOrder) => void;
};

function badgeClass(status: string): string {
  if (['paid', 'delivered'].includes(status)) return 'bg-green-500/15 text-green-700 dark:text-green-300';
  if (['quotation', 'sent', 'confirmed'].includes(status)) return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
  if (['processing', 'partially_paid', 'overdue'].includes(status)) return 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
  if (['cancelled', 'void', 'returned'].includes(status)) return 'bg-destructive/15 text-destructive';
  return 'bg-muted text-muted-foreground';
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ContactSalesTimeline({
  contactId,
  archived = false,
  onCreateQuotation,
  onSendQuotation,
}: ContactSalesTimelineProps) {
  const { t } = useTranslation();
  const { hasAnyPermission, hasPermission, PERMISSIONS } = usePermissions();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const canReadSales = hasAnyPermission([
    PERMISSIONS.VIEW_SALES_ORDERS,
    PERMISSIONS.MANAGE_SALES_ORDERS,
    PERMISSIONS.CREATE_QUOTATIONS,
  ]);
  const canReadInvoices = hasAnyPermission([
    PERMISSIONS.VIEW_INVOICES,
    PERMISSIONS.MANAGE_INVOICES,
    PERMISSIONS.RECORD_PAYMENTS,
  ]);
  const canCreateQuotation = hasAnyPermission([
    PERMISSIONS.CREATE_QUOTATIONS,
    PERMISSIONS.MANAGE_SALES_ORDERS,
  ]);
  const canSendQuotation = canCreateQuotation;

  const salesQuery = useQuery({
    queryKey: ['/api/erp/sales-orders', 'contact-sales', contactId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/sales-orders?contactId=${contactId}&limit=100&offset=0`);
      const json = await res.json();
      return (json.data?.data ?? []) as SalesOrderRow[];
    },
    enabled: canReadSales,
    refetchOnWindowFocus: true,
  });

  const invoicesQuery = useQuery({
    queryKey: ['/api/erp/invoices', 'contact-sales', contactId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/invoices?contactId=${contactId}&limit=100&offset=0`);
      const json = await res.json();
      return (json.data?.data ?? []) as InvoiceRow[];
    },
    enabled: canReadInvoices,
    refetchOnWindowFocus: true,
  });

  const timeline = useMemo<ContactSalesTimelineItem[]>(
    () => buildContactSalesTimeline(salesQuery.data ?? [], invoicesQuery.data ?? []),
    [salesQuery.data, invoicesQuery.data],
  );

  const statusOptions = useMemo(() => Array.from(new Set(timeline.map((item) => item.status))).sort(), [timeline]);
  const filtered = timeline.filter((item) => (typeFilter === 'all' || item.kind === typeFilter) && (statusFilter === 'all' || item.status === statusFilter));
  const loading = salesQuery.isLoading || invoicesQuery.isLoading;
  const failed = salesQuery.isError || invoicesQuery.isError;

  const refresh = () => {
    if (canReadSales) void salesQuery.refetch();
    if (canReadInvoices) void invoicesQuery.refetch();
    void queryClient.invalidateQueries({ queryKey: ['/api/erp/sales-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/erp/invoices'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-base font-medium">{t('contacts.sales.title', 'Sales activity')}</h4>
          <p className="text-sm text-muted-foreground">{t('contacts.sales.description', 'Quotations, orders, and invoices linked to this contact.')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-tour="components-contacts-contactsalestimeline.button.contacts.sales.refresh" type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />{t('contacts.sales.refresh', 'Refresh')}</Button>
          {canCreateQuotation && <Button data-tour="components-contacts-contactsalestimeline.button.contacts.sales.createQuotation" type="button" size="sm" onClick={onCreateQuotation} disabled={archived}><Plus className="mr-1 h-4 w-4" />{t('contacts.sales.createQuotation', 'Create quotation')}</Button>}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Select value={typeFilter} onValueChange={setTypeFilter}><SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('contacts.sales.allTypes', 'All document types')}</SelectItem><SelectItem value="quotation">{t('contacts.sales.quotations', 'Quotations')}</SelectItem><SelectItem value="order">{t('contacts.sales.orders', 'Sales orders')}</SelectItem><SelectItem value="invoice">{t('contacts.sales.invoices', 'Invoices')}</SelectItem></SelectContent></Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('contacts.sales.allStatuses', 'All statuses')}</SelectItem>{statusOptions.map((status) => <SelectItem key={status} value={status}>{titleCase(status)}</SelectItem>)}</SelectContent></Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : failed ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center"><p className="text-sm text-destructive">{t('contacts.sales.loadError', 'Sales activity could not be loaded.')}</p><Button data-tour="components-contacts-contactsalestimeline.button.contacts.sales.tryAgain" className="mt-3" variant="outline" size="sm" onClick={refresh}>{t('contacts.sales.tryAgain', 'Try again')}</Button></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center"><ShoppingCart className="mx-auto mb-3 h-9 w-9 text-muted-foreground/60" /><p className="font-medium">{t('contacts.sales.empty', 'No sales activity yet')}</p><p className="mt-1 text-sm text-muted-foreground">{t('contacts.sales.emptyDescription', 'Create a quotation to start this customer’s sales history.')}</p>{canCreateQuotation && <Button data-tour="components-contacts-contactsalestimeline.button.contacts.sales.createQuotation" className="mt-4" size="sm" onClick={onCreateQuotation} disabled={archived}><Plus className="mr-1 h-4 w-4" />{t('contacts.sales.createQuotation', 'Create quotation')}</Button>}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div key={item.key} className="flex flex-col gap-3 rounded-lg border bg-muted/15 p-4 sm:flex-row sm:items-center">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{item.kind === 'invoice' ? <FileText className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />}</div>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{item.number}</span><Badge variant="secondary">{t(`contacts.sales.type.${item.kind}`, titleCase(item.kind))}</Badge><Badge className={badgeClass(item.status)}>{titleCase(item.status)}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{new Date(item.date).toLocaleString()}</p></div>
              <div className="text-left sm:text-right"><p className="font-semibold">{item.currency} {Number(item.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><div className="mt-2 flex flex-wrap gap-2 sm:justify-end">{item.kind === 'quotation' && item.order && canSendQuotation && <Button data-tour="components-contacts-contactsalestimeline.button.contacts.sales.send" size="sm" variant="outline" onClick={() => onSendQuotation(item.order as SalesOrderRow)}><Send className="mr-1 h-3.5 w-3.5" />{t('contacts.sales.send', 'Send')}</Button>}<Button data-tour="components-contacts-contactsalestimeline.button.contacts.sales.openInErp" size="sm" variant="ghost" onClick={() => setLocation(item.kind === 'invoice' ? `/erp/invoices?detail=${item.id}` : `/erp/sales-orders?detail=${item.id}`)}>{t('contacts.sales.openInErp', 'Open in ERP')}</Button></div></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

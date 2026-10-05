import { APP_ICONS } from '@/assets/icons';
import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { ProductPicker, type ProductPickerOption } from '@/components/erp/product-picker';
import { SendQuotationDialog } from '@/components/erp/SendQuotationDialog';
import { SalesOrderCreateDialog } from '@/components/erp/SalesOrderCreateDialog';
import { ContactCustomFieldsBadges } from '@/components/contacts/ContactCustomFieldsBadges';
import { useCompanyContactCustomFields } from '@/hooks/use-company-contact-custom-fields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  Search,
  Pencil,
  Table2,
  LayoutGrid,
  ChevronDown,
  Trash2,
  X,
  Send,
  ListOrdered as TabIconListOrdered,
  Truck as TabIconTruck,
} from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

type SalesOrderRow = {
  id: number;
  companyId: number;
  orderNumber: string;
  contactId: number | null;
  dealId: number | null;
  status: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  totalAmount: string;
  currency: string | null;
  notes: string | null;
  source: string | null;
  flowId: number | null;
  assignedToUserId: number | null;
  validUntil: string | null;
  shippingAddress: Record<string, unknown> | null;
  billingAddress: Record<string, unknown> | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
  restaurantContext?: RestaurantOrderContextRow | null;
};

type SalesOrderItemRow = {
  id: number;
  salesOrderId: number;
  productId: number | null;
  variantId: number | null;
  productName?: string | null;
  variantName?: string | null;
  description: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string | null;
  taxRate: string | null;
  lineTotal: string;
  sortOrder: number | null;
  modifierSelections?: unknown[] | null;
  specialInstructions?: string | null;
};

type RestaurantOrderContextRow = {
  serviceType: 'dine_in' | 'takeaway' | 'delivery';
  status: string;
  tableId: number | null;
  guestCount: number | null;
};

type RestaurantTableRow = {
  id: number;
  label: string;
  code: string;
};

type DeliveryNoteRow = {
  id: number;
  salesOrderId: number;
  companyId: number;
  deliveryNumber: string | null;
  status: string;
  trackingNumber: string | null;
  carrier: string | null;
  items: unknown;
  notes: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string | null;
};

type VariantRow = {
  id: number;
  name: string;
  unitPrice: string | null;
};

type ContactRow = { id: number; name: string };
type DealRow = { id: number; title: string };
type TeamMember = { id: number; fullName: string | null; username: string };
type CurrencyRow = {
  id: number;
  code: string;
  isBaseCurrency: boolean | null;
  isActive: boolean | null;
};

type ModifierOption = { id: string; name: string; priceDelta: number };
type ModifierGroup = { id: string; name: string; options: ModifierOption[]; multiple: boolean };
type ModifierSelectionRow = {
  modifierId: string;
  modifierName: string;
  optionId: string;
  optionName: string;
  priceDelta: number | null;
};

type StagedLineItem = {
  productId: number;
  variantId: number | null;
  description: string | null;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
  modifierSelections: ModifierSelectionRow[];
  specialInstructions: string | null;
  productName: string;
};

function computeStagedLineTotal(item: StagedLineItem): string {
  const qty = Number(item.quantity ?? 1);
  const price = Number(item.unitPrice ?? 0);
  const base = qty * price;
  const discPct = Number(item.discountPercent ?? 0);
  const lineDisc = base * (discPct / 100);
  const taxable = base - lineDisc;
  return taxable.toFixed(2);
}

function toApiLinePayload(item: StagedLineItem) {
  const { productName: _productName, ...apiItem } = item;
  return apiItem;
}

function normalizeModifierGroups(raw: unknown): ModifierGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((group, groupIndex) => {
      if (!group || typeof group !== 'object') return null;
      const g = group as Record<string, unknown>;
      const optionsRaw = Array.isArray(g.options) ? g.options : [];
      const options = optionsRaw
        .map((option, optionIndex) => {
          if (!option || typeof option !== 'object') return null;
          const o = option as Record<string, unknown>;
          const name = String(o.name ?? o.label ?? '').trim();
          if (!name) return null;
          const id = String(o.id ?? o.code ?? `${groupIndex}-${optionIndex}`);
          const priceDelta = Number(o.priceDelta ?? o.price ?? 0);
          return { id, name, priceDelta: Number.isFinite(priceDelta) ? priceDelta : 0 };
        })
        .filter((option): option is ModifierOption => option != null);
      if (options.length === 0) return null;
      return {
        id: String(g.id ?? g.code ?? groupIndex),
        name: String(g.name ?? g.label ?? `Modifier ${groupIndex + 1}`),
        options,
        multiple: g.multiple === true || g.maxSelections === 0 || Number(g.maxSelections ?? 1) > 1,
      };
    })
    .filter((group): group is ModifierGroup => group != null);
}

function normalizeModifierSelections(raw: unknown): ModifierSelectionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((selection) => {
      if (!selection || typeof selection !== 'object') return null;
      const row = selection as Record<string, unknown>;
      const modifierId = String(row.modifierId ?? '');
      const modifierName = String(row.modifierName ?? '');
      const optionId = String(row.optionId ?? '');
      const optionName = String(row.optionName ?? '');
      if (!modifierId || !optionId || !optionName) return null;
      const priceDeltaRaw = row.priceDelta;
      const priceDelta = priceDeltaRaw == null ? null : Number(priceDeltaRaw);
      return {
        modifierId,
        modifierName,
        optionId,
        optionName,
        priceDelta: Number.isFinite(priceDelta) ? priceDelta : null,
      };
    })
    .filter((selection): selection is ModifierSelectionRow => selection != null);
}

function formatCurrencyTotalsByCode(rows: SalesOrderRow[]): string {
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

const ASSISTANT_SOURCE_ICON_URL = APP_ICONS.salesAssistant;

function truncateWords(text: string, max = 15): { preview: string; isTruncated: boolean } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= max) {
    return { preview: words.join(' '), isTruncated: false };
  }
  return { preview: `${words.slice(0, max).join(' ')}…`, isTruncated: true };
}

function formatShippingAddress(addr: Record<string, unknown> | null | undefined): string {
  if (!addr) return '';
  const values = [
    addr.name,
    addr.line1,
    addr.line2,
    addr.city,
    addr.state,
    addr.postalCode ?? addr.zip,
    addr.country,
    addr.phone,
  ]
    .map((value) => (value == null ? '' : String(value).trim()))
    .filter(Boolean);
  return values.join(', ');
}

function OrderSourceIndicator({ source }: { source: string | null | undefined }) {
  const { t } = useTranslation();
  if (source !== 'flowbuilder') return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0 align-middle" tabIndex={0}>
            <img src={ASSISTANT_SOURCE_ICON_URL} alt="" className="h-4 w-4" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {t('erp.salesOrders.placedByAssistant', 'Placed by AI assistant')}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const KANBAN_STATUSES = [
  'draft',
  'quotation',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
  'returned',
] as const;

type KanbanStatus = (typeof KANBAN_STATUSES)[number];
type KanbanLabels = Partial<Record<KanbanStatus, string>>;
const EMPTY_KANBAN_LABELS: KanbanLabels = {};

function formatStatusLabel(status: string): string {
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['quotation', 'confirmed'],
  quotation: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

function isTransitionAllowed(from: string, to: string): boolean {
  return (STATUS_TRANSITIONS[from] ?? []).includes(to);
}

const LIFECYCLE_FLOW = [
  'draft',
  'quotation',
  'confirmed',
  'processing',
  'shipped',
  'delivered',
] as const;

function SalesOrderStatusTimeline({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === 'cancelled') {
    return (
      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('erp.salesOrders.lifecycle', 'Lifecycle')}</div>
        <div className="flex flex-wrap gap-1.5">
          {LIFECYCLE_FLOW.map((key) => (
            <Badge key={key} variant="outline" className="capitalize font-normal opacity-60">
              {key}
            </Badge>
          ))}
        </div>
        <Badge className={statusBadgeClass('cancelled')} variant="secondary">
          {t('erp.common.cancelled', 'Cancelled')}
        </Badge>
      </div>
    );
  }
  if (status === 'returned') {
    return (
      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('erp.salesOrders.lifecycle', 'Lifecycle')}</div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {LIFECYCLE_FLOW.map((key) => (
            <span key={key} className="flex items-center gap-1">
              <Badge className={`${statusBadgeClass('delivered')} capitalize font-normal`}>{key}</Badge>
            </span>
          ))}
        </div>
        <Badge className={statusBadgeClass('returned')} variant="secondary">
          {t('erp.common.returned', 'Returned')}
        </Badge>
      </div>
    );
  }

  const idx = LIFECYCLE_FLOW.indexOf(status as (typeof LIFECYCLE_FLOW)[number]);
  const cur = idx >= 0 ? idx : 0;

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('erp.salesOrders.lifecycle', 'Lifecycle')}</div>
      <ol className="flex flex-wrap gap-0.5 items-center list-none p-0 m-0">
        {LIFECYCLE_FLOW.map((key, i) => {
          const isPast = i < cur;
          const isCurrent = i === cur;
          return (
            <li key={key} className="flex items-center">
              {i > 0 && (
                <span
                  className={`mx-1 text-muted-foreground text-xs ${isPast || isCurrent ? 'opacity-100' : 'opacity-40'}`}
                  aria-hidden
                >
                  →
                </span>
              )}
              <Badge
                variant="secondary"
                className={`capitalize font-normal ${
                  isCurrent
                    ? statusBadgeClass(key)
                    : isPast
                      ? 'bg-muted text-muted-foreground line-through decoration-muted-foreground/50'
                      : 'opacity-45'
                }`}
              >
                {key}
              </Badge>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function canEditOrderStructure(status: string): boolean {
  return status === 'draft' || status === 'quotation';
}

async function transitionOrderApi(orderId: number, from: string, to: string): Promise<void> {
  if (from === to) return;
  if (to === 'quotation' && from === 'draft') {
    await apiRequest('PUT', `/api/erp/sales-orders/${orderId}`, { status: 'quotation' });
    return;
  }
  if (to === 'confirmed' && (from === 'draft' || from === 'quotation')) {
    await apiRequest('POST', `/api/erp/sales-orders/${orderId}/confirm`, {});
    return;
  }
  if (to === 'processing') {
    await apiRequest('POST', `/api/erp/sales-orders/${orderId}/process`, {});
    return;
  }
  if (to === 'shipped') {
    await apiRequest('POST', `/api/erp/sales-orders/${orderId}/ship`, {});
    return;
  }
  if (to === 'delivered') {
    await apiRequest('POST', `/api/erp/sales-orders/${orderId}/deliver`, {});
    return;
  }
  if (to === 'cancelled') {
    await apiRequest('POST', `/api/erp/sales-orders/${orderId}/cancel`, {});
    return;
  }
  if (to === 'returned') {
    await apiRequest('POST', `/api/erp/sales-orders/${orderId}/return`, {});
    return;
  }
  throw new Error(`Unsupported transition ${from} → ${to}`);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'draft':
      return 'bg-muted text-muted-foreground';
    case 'quotation':
      return 'bg-blue-500/15 text-blue-700 dark:text-blue-300';
    case 'confirmed':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'processing':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
    case 'shipped':
      return 'bg-violet-500/15 text-violet-700 dark:text-violet-300';
    case 'delivered':
      return 'bg-green-600/15 text-green-800 dark:text-green-200';
    case 'cancelled':
      return 'bg-destructive/15 text-destructive';
    case 'returned':
      return 'bg-orange-500/15 text-orange-800 dark:text-orange-200';
    default:
      return 'bg-secondary';
  }
}

export default function ERPSalesOrdersPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { data: contactCustomFields = [] } = useCompanyContactCustomFields({ enabled: !!companyId });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const [location] = useLocation();
  const { isRestaurant } = useErpBusinessType();
  const canManage = hasPermission(PERMISSIONS.MANAGE_SALES_ORDERS);
  const canDelete =
    hasPermission(PERMISSIONS.MANAGE_SALES_ORDERS) ||
    hasPermission(PERMISSIONS.DELETE_SALES_ORDERS);
  const canCreateQuote = hasPermission(PERMISSIONS.CREATE_QUOTATIONS);
  const canCreateOrManage = canManage || canCreateQuote;
  const canKanbanInteract = canManage || canCreateQuote;
  const canManageInvoices = hasPermission(PERMISSIONS.MANAGE_INVOICES);

  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'order' | 'quotation'>('order');
  const [detailId, setDetailId] = useState<number | null>(null);
  const [notePreview, setNotePreview] = useState<{ orderNumber: string; notes: string } | null>(null);
  const [addressPreview, setAddressPreview] = useState<{ orderNumber: string; address: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [sendTarget, setSendTarget] = useState<SalesOrderRow | null>(null);
  const [addressesOpen, setAddressesOpen] = useState(false);
  const [kanbanLabels, setKanbanLabels] = useState<KanbanLabels>({});
  const [editingKanbanStatus, setEditingKanbanStatus] = useState<KanbanStatus | null>(null);
  const [editingKanbanLabel, setEditingKanbanLabel] = useState('');

  const [formContactId, setFormContactId] = useState<string>('');
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [formDealId, setFormDealId] = useState<string>('');
  const [formCurrency, setFormCurrency] = useState('USD');
  const [formNotes, setFormNotes] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState<string>('');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formShipLine1, setFormShipLine1] = useState('');
  const [formShipCity, setFormShipCity] = useState('');
  const [formBillLine1, setFormBillLine1] = useState('');
  const [formBillCity, setFormBillCity] = useState('');

  const [lineProduct, setLineProduct] = useState<ProductPickerOption | null>(null);
  const [lineVariantId, setLineVariantId] = useState<string>('');
  const [lineQty, setLineQty] = useState('1');
  const [lineUnitPrice, setLineUnitPrice] = useState('');
  const [lineDisc, setLineDisc] = useState('0');
  const [lineTax, setLineTax] = useState('0');
  const [lineDescription, setLineDescription] = useState('');
  const [lineSpecialInstructions, setLineSpecialInstructions] = useState('');
  const [lineModifierSelections, setLineModifierSelections] = useState<ModifierSelectionRow[]>([]);
  const [restaurantServiceType, setRestaurantServiceType] = useState<'dine_in' | 'takeaway' | 'delivery'>('dine_in');
  const [restaurantTableId, setRestaurantTableId] = useState('');
  const [restaurantGuestCount, setRestaurantGuestCount] = useState('');
  const [restaurantAssignedServerId, setRestaurantAssignedServerId] = useState('');
  const lineProductId = lineProduct ? String(lineProduct.id) : '';
  const lineModifierGroups = useMemo(() => normalizeModifierGroups(lineProduct?.modifiers ?? []), [lineProduct]);
  const [stagedLineItems, setStagedLineItems] = useState<StagedLineItem[]>([]);

  const filtersKey = useMemo(
    () => ({ searchTerm, statusFilter, page, limit, view }),
    [searchTerm, statusFilter, page, limit, view]
  );

  const invalidateSalesOrders = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/sales-orders'] });
  };

  const invalidateDetail = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/sales-orders', companyId, detailId] });
  };

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['/api/erp/sales-orders', companyId, filtersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const listLimit = view === 'kanban' ? 500 : limit;
      const listOffset = view === 'kanban' ? 0 : (page - 1) * limit;
      params.set('limit', String(listLimit));
      params.set('offset', String(listOffset));
      const res = await apiRequest('GET', `/api/erp/sales-orders?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: SalesOrderRow[]; total: number };
    },
    enabled: !!companyId,
  });

  const orders = listResult?.data ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const tableTotalSummary = useMemo(() => formatCurrencyTotalsByCode(orders), [orders]);

  const { data: contactsRes } = useQuery({
    queryKey: ['/api/contacts', companyId, 'sales-orders-picker'],
    queryFn: async () => {
      const res = await fetch('/api/contacts?page=1&limit=500');
      if (!res.ok) throw new Error('Failed to load contacts');
      return res.json() as Promise<{ contacts: ContactRow[] }>;
    },
    enabled: !!companyId,
  });
  const contacts = contactsRes?.contacts ?? [];

  const { data: deals = [] } = useQuery({
    queryKey: ['/api/deals', companyId, 'sales-orders-picker'],
    queryFn: async () => {
      const res = await fetch('/api/deals');
      if (!res.ok) throw new Error('Failed to load deals');
      return res.json() as Promise<DealRow[]>;
    },
    enabled: !!companyId,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ['/api/team-members', companyId],
    queryFn: async () => {
      const res = await fetch('/api/team-members');
      if (!res.ok) throw new Error('Failed to load team');
      return res.json() as Promise<TeamMember[]>;
    },
    enabled: !!companyId,
  });

  const { data: restaurantTables = [] } = useQuery({
    queryKey: ['/api/erp/restaurant/layout/tables', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/layout/tables');
      const json = await res.json();
      return (json.data ?? []) as RestaurantTableRow[];
    },
    enabled: !!companyId && isRestaurant,
  });

  const { data: currencies = [] } = useQuery({
    queryKey: ['/api/erp/currencies', companyId, 'sales-orders'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/currencies');
      const json = await res.json();
      return (json.data ?? []) as CurrencyRow[];
    },
    enabled: !!companyId,
  });

  const availableCurrencyCodes = useMemo(() => {
    const activeCodes = currencies
      .filter((currency) => currency.isActive !== false)
      .map((currency) => currency.code?.trim().toUpperCase())
      .filter((code): code is string => Boolean(code));
    return activeCodes.length > 0 ? activeCodes : ['USD'];
  }, [currencies]);

  const erpBaseCurrency = useMemo(() => {
    const base = currencies.find((currency) => currency.isBaseCurrency);
    const code = base?.code?.trim().toUpperCase();
    return code || availableCurrencyCodes[0] || 'USD';
  }, [currencies, availableCurrencyCodes]);

  useEffect(() => {
    if (!availableCurrencyCodes.includes(formCurrency)) {
      setFormCurrency(erpBaseCurrency);
    }
  }, [availableCurrencyCodes, erpBaseCurrency, formCurrency]);

  const { data: variants = [] } = useQuery({
    queryKey: ['/api/erp/products', companyId, lineProductId, 'variants'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/products/${lineProductId}/variants`);
      const json = await res.json();
      return (json.data ?? []) as VariantRow[];
    },
    enabled: !!companyId && !!lineProductId,
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ['/api/erp/sales-orders', companyId, detailId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/sales-orders/${detailId}`);
      const json = await res.json();
      return json.data as {
        order: SalesOrderRow;
        items: SalesOrderItemRow[];
        deliveries: DeliveryNoteRow[];
        restaurantContext?: RestaurantOrderContextRow | null;
        linkedContact?: { id: number; name: string; customFields: Record<string, unknown> | null } | null;
      };
    },
    enabled: !!companyId && detailId != null,
  });

  useEffect(() => {
    const detailParam = new URLSearchParams(window.location.search).get('detail');
    if (!detailParam) return;
    const parsed = Number.parseInt(detailParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) setDetailId(parsed);
  }, [location]);

  const { data: savedKanbanLabels = EMPTY_KANBAN_LABELS } = useQuery({
    queryKey: ['/api/erp/sales-orders/kanban-labels', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/sales-orders/kanban-labels');
      const json = await res.json();
      return (json.data ?? {}) as KanbanLabels;
    },
    enabled: !!companyId,
  });

  useEffect(() => {
    setKanbanLabels(savedKanbanLabels);
  }, [savedKanbanLabels]);

  const saveKanbanLabelsMutation = useMutation({
    mutationFn: async (labels: KanbanLabels) => {
      const res = await apiRequest('PUT', '/api/erp/sales-orders/kanban-labels', { labels });
      const json = await res.json();
      return (json.data ?? {}) as KanbanLabels;
    },
    onSuccess: (labels) => {
      setKanbanLabels(labels);
      queryClient.setQueryData(['/api/erp/sales-orders/kanban-labels', companyId], labels);
      toast({ title: 'Kanban column name saved' });
    },
    onError: (e: Error) => {
      setKanbanLabels(savedKanbanLabels);
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (detailId == null) return;
    setLineProduct(null);
    setLineVariantId('');
    setLineQty('1');
    setLineUnitPrice('');
    setLineDisc('0');
    setLineTax('0');
    setLineDescription('');
    setLineSpecialInstructions('');
    setLineModifierSelections([]);
  }, [detailId]);

  const contactNameById = useMemo(() => {
    const m = new Map<number, string>();
    contacts.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [contacts]);

  const userNameById = useMemo(() => {
    const m = new Map<number, string>();
    teamMembers.forEach((u) => m.set(u.id, u.fullName || u.username));
    return m;
  }, [teamMembers]);

  const ordersByStatus = useMemo(() => {
    const m = new Map<string, SalesOrderRow[]>();
    for (const s of KANBAN_STATUSES) m.set(s, []);
    for (const o of orders) {
      const list = m.get(o.status);
      if (list) list.push(o);
    }
    return m;
  }, [orders]);

  const getKanbanLabel = (status: KanbanStatus) => kanbanLabels[status]?.trim() || formatStatusLabel(status);

  const startEditingKanbanLabel = (status: KanbanStatus) => {
    setEditingKanbanStatus(status);
    setEditingKanbanLabel(getKanbanLabel(status));
  };

  const cancelEditingKanbanLabel = () => {
    setEditingKanbanStatus(null);
    setEditingKanbanLabel('');
  };

  const saveKanbanLabel = (status: KanbanStatus) => {
    const nextLabel = editingKanbanLabel.trim();
    const nextLabels = { ...kanbanLabels };
    if (!nextLabel || nextLabel === formatStatusLabel(status)) {
      delete nextLabels[status];
    } else {
      nextLabels[status] = nextLabel;
    }
    setKanbanLabels(nextLabels);
    saveKanbanLabelsMutation.mutate(nextLabels);
    cancelEditingKanbanLabel();
  };

  const resetLineItemForm = () => {
    setLineProduct(null);
    setLineVariantId('');
    setLineQty('1');
    setLineUnitPrice('');
    setLineDisc('0');
    setLineTax('0');
    setLineDescription('');
    setLineSpecialInstructions('');
    setLineModifierSelections([]);
  };

  const buildLineItemFromForm = (): StagedLineItem | null => {
    if (!lineProductId || !lineUnitPrice.trim()) return null;
    return {
      productId: parseInt(lineProductId, 10),
      variantId: lineVariantId ? parseInt(lineVariantId, 10) : null,
      description: lineDescription || null,
      quantity: lineQty,
      unitPrice: lineUnitPrice,
      discountPercent: lineDisc,
      taxRate: lineTax,
      modifierSelections: lineModifierSelections,
      specialInstructions: lineSpecialInstructions || null,
      productName: lineProduct?.name ?? '',
    };
  };

  const addStagedItem = () => {
    const item = buildLineItemFromForm();
    if (!item) return;
    setStagedLineItems((prev) => [...prev, item]);
    resetLineItemForm();
  };

  const removeStagedItem = (index: number) => {
    setStagedLineItems((prev) => prev.filter((_, i) => i !== index));
  };

  const resetCreateForm = () => {
    setFormContactId('');
    setContactPickerOpen(false);
    setFormDealId('');
    setFormCurrency(erpBaseCurrency);
    setFormNotes('');
    setFormAssignedTo('');
    setFormValidUntil('');
    setFormShipLine1('');
    setFormShipCity('');
    setFormBillLine1('');
    setFormBillCity('');
    resetLineItemForm();
    setStagedLineItems([]);
    setRestaurantServiceType('dine_in');
    setRestaurantTableId('');
    setRestaurantGuestCount('');
    setRestaurantAssignedServerId('');
  };

  const openCreateOrder = () => {
    setCreateMode('order');
    resetCreateForm();
    setCreateOpen(true);
  };

  const openCreateQuotation = () => {
    setCreateMode('quotation');
    resetCreateForm();
    setCreateOpen(true);
  };

  const closeCreateDialog = () => {
    resetCreateForm();
    setCreateOpen(false);
  };

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      const shippingAddress =
        formShipLine1.trim() || formShipCity.trim()
          ? { line1: formShipLine1, city: formShipCity }
          : undefined;
      const billingAddress =
        formBillLine1.trim() || formBillCity.trim()
          ? { line1: formBillLine1, city: formBillCity }
          : undefined;
      const body: Record<string, unknown> = {
        currency: formCurrency,
        notes: formNotes || undefined,
        contactId: formContactId ? parseInt(formContactId, 10) : null,
        dealId: formDealId ? parseInt(formDealId, 10) : null,
        assignedToUserId: formAssignedTo ? parseInt(formAssignedTo, 10) : null,
        validUntil: formValidUntil ? new Date(formValidUntil).toISOString() : null,
        shippingAddress,
        billingAddress,
        ...(createMode === 'quotation' ? { status: 'quotation' } : {}),
      };
      if (isRestaurant) {
        body.restaurantContext = {
          serviceType: restaurantServiceType,
          tableId: restaurantTableId ? parseInt(restaurantTableId, 10) : null,
          guestCount: restaurantGuestCount ? parseInt(restaurantGuestCount, 10) : null,
          assignedToUserId: restaurantAssignedServerId ? parseInt(restaurantAssignedServerId, 10) : null,
        };
      }
      const pendingItem = buildLineItemFromForm();
      const allLineItems = pendingItem ? [...stagedLineItems, pendingItem] : stagedLineItems;
      if (allLineItems.length === 1) {
        body.initialLine = toApiLinePayload(allLineItems[0]!);
      } else if (allLineItems.length > 1) {
        body.lineItems = allLineItems.map(toApiLinePayload);
      }
      const res = await apiRequest('POST', '/api/erp/sales-orders', body);
      const json = await res.json();
      return json.data as SalesOrderRow;
    },
    onSuccess: () => {
      toast({ title: createMode === 'quotation' ? 'Quotation created' : 'Order created' });
      setCreateOpen(false);
      resetCreateForm();
      invalidateSalesOrders();
    },
    onError: (e: Error) => {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    },
  });

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination || !canKanbanInteract) return;
    const orderId = parseInt(result.draggableId.replace('so-', ''), 10);
    const destStatus = result.destination.droppableId;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (order.status === destStatus) return;
    if (!isTransitionAllowed(order.status, destStatus)) {
      toast({ title: 'Invalid move', description: `Cannot move from ${order.status} to ${destStatus}.`, variant: 'destructive' });
      return;
    }
    try {
      await transitionOrderApi(orderId, order.status, destStatus);
      toast({ title: 'Order updated' });
      invalidateSalesOrders();
    } catch (e) {
      toast({
        title: 'Error',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const addLineMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await apiRequest('POST', `/api/erp/sales-orders/${orderId}/items`, {
        productId: lineProductId ? parseInt(lineProductId, 10) : null,
        variantId: lineVariantId ? parseInt(lineVariantId, 10) : null,
        description: lineDescription || null,
        quantity: lineQty,
        unitPrice: lineUnitPrice,
        discountPercent: lineDisc,
        taxRate: lineTax,
        modifierSelections: lineModifierSelections,
        specialInstructions: lineSpecialInstructions || null,
      });
    },
    onSuccess: () => {
      toast({ title: 'Line item added' });
      resetLineItemForm();
      invalidateDetail();
      invalidateSalesOrders();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteLineMutation = useMutation({
    mutationFn: async ({ orderId, itemId }: { orderId: number; itemId: number }) => {
      await apiRequest('DELETE', `/api/erp/sales-orders/${orderId}/items/${itemId}`);
    },
    onSuccess: () => {
      toast({ title: 'Line removed' });
      invalidateDetail();
      invalidateSalesOrders();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const actionMutation = useMutation({
    mutationFn: async ({ orderId, action }: { orderId: number; action: string }) => {
      const paths: Record<string, string> = {
        confirm: 'confirm',
        process: 'process',
        ship: 'ship',
        deliver: 'deliver',
        cancel: 'cancel',
        return: 'return',
      };
      const p = paths[action];
      await apiRequest('POST', `/api/erp/sales-orders/${orderId}/${p}`, {});
    },
    onSuccess: () => {
      toast({ title: 'Updated' });
      invalidateDetail();
      invalidateSalesOrders();
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async (orderId: number) => {
      const res = await apiRequest('POST', '/api/erp/invoices/generate-from-order', { salesOrderId: orderId });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to generate invoice');
      return json.data as { id: number; invoiceNumber: string };
    },
    onSuccess: (invoice) => {
      toast({
        title: t('erp.salesOrders.invoiceGenerated', 'Invoice generated'),
        description: t('erp.salesOrders.invoiceCreated', 'Created {{invoiceNumber}}', { invoiceNumber: invoice.invoiceNumber }),
      });
      invalidateSalesOrders();
      // Navigate to the invoice
      window.location.href = `/erp/invoices?detail=${invoice.id}`;
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await apiRequest('DELETE', `/api/erp/sales-orders/${orderId}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.salesOrders.orderDeleted', 'Order deleted') });
      invalidateSalesOrders();
      setDeleteConfirmId(null);
    },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const onPickProduct = (product: ProductPickerOption | null) => {
    setLineProduct(product);
    setLineVariantId('');
    setLineModifierSelections([]);
    if (!product) {
      setLineUnitPrice('');
      return;
    }
    if (product.unitPrice) setLineUnitPrice(product.unitPrice);
    else setLineUnitPrice('');
  };

  const toggleModifierSelection = (group: ModifierGroup, option: ModifierOption, checked: boolean) => {
    setLineModifierSelections((prev) => {
      const base = prev.filter((selection) => {
        if (selection.modifierId !== group.id) return true;
        if (group.multiple) return selection.optionId !== option.id;
        return false;
      });
      if (!checked) return base;
      return [
        ...base,
        {
          modifierId: group.id,
          modifierName: group.name,
          optionId: option.id,
          optionName: option.name,
          priceDelta: option.priceDelta,
        },
      ];
    });
  };

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 data-tour="pages-erp-sales-orders.h1.erp.salesOrders.title" className="text-2xl">{t('erp.salesOrders.title', 'Sales Orders')}</h1>
                <p className="text-sm text-muted-foreground">{t('erp.salesOrders.subtitle', 'Quotations and orders with fulfillment workflow.')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border p-1 bg-muted/40">
                  <Button data-tour="pages-erp-sales-orders.button.erp.common.table"
                    type="button"
                    variant={view === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="gap-1"
                    onClick={() => setView('table')}
                  >
                    <Table2 className="h-4 w-4" />
                    {t('erp.common.table', 'Table')}
                  </Button>
                  <Button data-tour="pages-erp-sales-orders.button.erp.common.kanban"
                    type="button"
                    variant={view === 'kanban' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="gap-1"
                    onClick={() => setView('kanban')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    {t('erp.common.kanban', 'Kanban')}
                  </Button>
                </div>
                {canCreateOrManage && (
                  <div className="flex flex-wrap gap-2">
                    {canManage && (
                      <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.newOrder" type="button" size="sm" onClick={openCreateOrder}>
                        <Plus className="h-4 w-4 mr-1" />
                        {t('erp.salesOrders.newOrder', 'New sales order')}
                      </Button>
                    )}
                    {canCreateQuote && (
                      <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.newQuotation"
                        type="button"
                        size="sm"
                        variant={canManage ? 'outline' : 'default'}
                        onClick={openCreateQuotation}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        {t('erp.salesOrders.newQuotation', 'New quotation')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input data-tour="pages-erp-sales-orders.input.erp.salesOrders.searchPlaceholder"
                  className="pl-8"
                  placeholder={t('erp.salesOrders.searchPlaceholder', 'Search order # or contact…')}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v);
                  setPage(1);
                }}
              >
                <SelectTrigger data-tour="pages-erp-sales-orders.selecttrigger.erp.common.status" className="w-[200px]">
                  <SelectValue placeholder={t('erp.common.status', 'Status')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('erp.common.allStatuses', 'All statuses')}</SelectItem>
                  {KANBAN_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {getKanbanLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {view === 'table' && (
              <div className="rounded-md border bg-card">
                {isLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table data-tour="pages-erp-sales-orders.table.erp.salesOrders.table.orderNumber">
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.salesOrders.table.orderNumber', 'Order #')}</TableHead>
                        <TableHead>{t('erp.salesOrders.table.contact', 'Contact')}</TableHead>
                        <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.total', 'Total')}</TableHead>
                        <TableHead>{t('erp.salesOrders.table.notes', 'Notes')}</TableHead>
                        <TableHead>{t('erp.salesOrders.table.deliveryAddress', 'Delivery address')}</TableHead>
                        <TableHead>{t('erp.salesOrders.table.assigned', 'Assigned')}</TableHead>
                        <TableHead>{t('erp.common.created', 'Created')}</TableHead>
                        <TableHead className="w-[120px]">{t('erp.common.actions', 'Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                            {t('erp.salesOrders.empty', 'No orders found.')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        orders.map((o) => (
                          <TableRow key={o.id} className="cursor-pointer" onClick={() => setDetailId(o.id)}>
                            <TableCell className="font-medium">
                              <span className="inline-flex items-center gap-1.5">
                                <OrderSourceIndicator source={o.source} />
                                {o.orderNumber}
                              </span>
                            </TableCell>
                            <TableCell>
                              {o.contactId != null ? contactNameById.get(o.contactId) ?? `#${o.contactId}` : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge className={statusBadgeClass(o.status)} variant="secondary">
                                {o.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {o.currency ?? 'USD'} {Number(o.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell
                              className="max-w-[240px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(() => {
                                const raw = o.notes?.trim();
                                if (!raw) return '—';
                                const { preview, isTruncated } = truncateWords(raw, 15);
                                return (
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className="text-sm">{preview}</span>
                                    {isTruncated && (
                                      <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.readMore"
                                        type="button"
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setNotePreview({ orderNumber: o.orderNumber, notes: raw });
                                        }}
                                      >
                                        {t('erp.salesOrders.readMore', 'Read more')}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell
                              className="max-w-[240px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(() => {
                                const formatted = formatShippingAddress(o.shippingAddress).trim();
                                if (!formatted) return '—';
                                const { preview, isTruncated } = truncateWords(formatted, 15);
                                return (
                                  <div className="flex flex-col items-start gap-0.5">
                                    <span className="text-sm">{preview}</span>
                                    {isTruncated && (
                                      <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.readMore"
                                        type="button"
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAddressPreview({ orderNumber: o.orderNumber, address: formatted });
                                        }}
                                      >
                                        {t('erp.salesOrders.readMore', 'Read more')}
                                      </Button>
                                    )}
                                  </div>
                                );
                              })()}
                            </TableCell>
                            <TableCell>
                              {o.assignedToUserId != null
                                ? userNameById.get(o.assignedToUserId) ?? `#${o.assignedToUserId}`
                                : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-0">
                                <Button type="button" variant="ghost" size="icon" onClick={() => setDetailId(o.id)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {canManage && o.status === 'quotation' && (
                                  <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.sendQuotation.iconAria"
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={t('erp.salesOrders.sendQuotation.iconAria', 'Send quotation')}
                                    title={t('erp.salesOrders.sendQuotation.iconAria', 'Send quotation')}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSendTarget(o);
                                    }}
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                )}
                                {canDelete && (o.status === 'draft' || o.status === 'quotation') && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmId(o.id);
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {orders.length > 0 && (
                        <TableRow className="bg-muted/30 font-medium">
                          <TableCell colSpan={3}>{t('erp.common.total', 'Total')}</TableCell>
                          <TableCell className="text-right">{tableTotalSummary}</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>—</TableCell>
                          <TableCell>—</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
                {view === 'table' && totalPages > 1 && (
                  <div className="flex items-center justify-end gap-2 p-3 border-t">
                    <Button data-tour="pages-erp-sales-orders.button.erp.common.previous" type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      {t('erp.common.previous', 'Previous')}
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {t('erp.common.pageFraction', 'Page {{page}} / {{total}}', { page: String(page), total: String(totalPages) })}
                    </span>
                    <Button data-tour="pages-erp-sales-orders.button.erp.common.next"
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t('erp.common.next', 'Next')}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {view === 'kanban' && (
              <DragDropContext onDragEnd={onDragEnd}>
                <div className="flex gap-3 overflow-x-auto pb-4">
                  {KANBAN_STATUSES.map((status) => (
                    <div key={status} className="flex min-h-[360px] max-h-[calc(100vh-220px)] w-72 shrink-0 flex-col rounded-lg border bg-muted/30 md:min-h-[420px]">
                      <div className="p-3 border-b font-medium text-sm flex justify-between items-center gap-2">
                        {editingKanbanStatus === status ? (
                          <div className="flex min-w-0 flex-1 items-center gap-1">
                            <Input data-tour="pages-erp-sales-orders.input.editingKanbanLabel"
                              value={editingKanbanLabel}
                              onChange={(e) => setEditingKanbanLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveKanbanLabel(status);
                                if (e.key === 'Escape') cancelEditingKanbanLabel();
                              }}
                              className="h-7 min-w-0 text-sm"
                              autoFocus
                            />
                            <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.kanban.saveColumnName"
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={() => saveKanbanLabel(status)}
                              aria-label={t('erp.salesOrders.kanban.saveColumnName', 'Save Kanban column name')}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.kanban.cancelColumnNameEdit"
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0"
                              onClick={cancelEditingKanbanLabel}
                              aria-label={t('erp.salesOrders.kanban.cancelColumnNameEdit', 'Cancel Kanban column name edit')}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <button data-tour="pages-erp-sales-orders.button.erp.salesOrders.kanban.editColumnName"
                            type="button"
                            className="group flex min-w-0 flex-1 items-center gap-1 text-left"
                            onClick={() => startEditingKanbanLabel(status)}
                            title={t('erp.salesOrders.kanban.editColumnName', 'Edit Kanban column name')}
                          >
                            <span className="truncate">{getKanbanLabel(status)}</span>
                            <Pencil className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
                          </button>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {(ordersByStatus.get(status) ?? []).length}
                        </Badge>
                      </div>
                      <Droppable droppableId={status}>
                        {(provided) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className="company-sidebar-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
                          >
                            {(ordersByStatus.get(status) ?? []).map((o, idx) => (
                              <Draggable key={o.id} draggableId={`so-${o.id}`} index={idx} isDragDisabled={!canKanbanInteract}>
                                {(dragProvided) => (
                                  <div
                                    ref={dragProvided.innerRef}
                                    {...dragProvided.draggableProps}
                                    {...dragProvided.dragHandleProps}
                                    className="rounded-md border bg-card p-3 shadow-sm cursor-grab active:cursor-grabbing"
                                    onClick={() => setDetailId(o.id)}
                                  >
                                    <div className="font-medium text-sm flex items-center gap-1.5">
                                      <OrderSourceIndicator source={o.source} />
                                      <span>{o.orderNumber}</span>
                                    </div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {o.contactId != null ? contactNameById.get(o.contactId) ?? '' : t('erp.salesOrders.noContact', 'No contact')}
                                    </div>
                                    <div className="text-sm mt-1 font-semibold">
                                      {o.currency ?? 'USD'}{' '}
                                      {Number(o.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground mt-1">
                                      {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : ''}
                                    </div>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  ))}
                </div>
              </DragDropContext>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!notePreview} onOpenChange={(open) => !open && setNotePreview(null)}>
        <DialogContent data-tour="pages-erp-sales-orders.dialogcontent.erp.salesOrders.notesDialogTitle" aria-describedby={undefined} className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {notePreview
                ? t('erp.salesOrders.notesDialogTitle', 'Notes — {{order}}', { order: notePreview.orderNumber })
                : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto text-sm whitespace-pre-wrap">{notePreview?.notes ?? ''}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!addressPreview} onOpenChange={(open) => !open && setAddressPreview(null)}>
        <DialogContent data-tour="pages-erp-sales-orders.dialogcontent.erp.salesOrders.deliveryAddressDialogTitle" aria-describedby={undefined} className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {addressPreview
                ? t('erp.salesOrders.deliveryAddressDialogTitle', 'Delivery address — {{order}}', { order: addressPreview.orderNumber })
                : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto text-sm whitespace-pre-wrap">{addressPreview?.address ?? ''}</div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.salesOrders.deleteDialogTitle', 'Delete Sales Order')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'erp.salesOrders.deleteDialogDescription',
                'This action cannot be undone. Only draft and quotation orders can be deleted.',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('erp.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteOrderMutation.isPending}
              onClick={() => {
                if (deleteConfirmId != null) deleteOrderMutation.mutate(deleteConfirmId);
              }}
            >
              {deleteOrderMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={createOpen && (createMode === 'order' || isRestaurant)}
        onOpenChange={(open) => {
          if (open) {
            setCreateOpen(true);
          } else {
            closeCreateDialog();
          }
        }}
      >
        <DialogContent data-tour="pages-erp-sales-orders.dialogcontent.erp.salesOrders.newQuotation" className="w-[calc(100vw-2rem)] max-w-2xl md:max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{createMode === 'quotation' ? t('erp.salesOrders.newQuotation', 'New quotation') : t('erp.salesOrders.newOrder', 'New sales order')}</DialogTitle>
            <DialogDescription>{t('erp.salesOrders.createDescription', 'Select a customer, add items and review the totals before creating the order or quotation.')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t('erp.salesOrders.form.contact', 'Contact')}</Label>
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild>
                  <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.form.selectContact"
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={contactPickerOpen}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate text-left">
                      {formContactId
                        ? contactNameById.get(Number(formContactId)) ??
                          t('erp.salesOrders.form.selectContact', 'Select contact')
                        : t('erp.salesOrders.form.selectContact', 'Select contact')}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput
                      placeholder={t('erp.salesOrders.form.searchContact', 'Search contact...')}
                    />
                    <CommandList className="max-h-64">
                      <CommandEmpty>{t('erp.common.noResults', 'No results')}</CommandEmpty>
                      <CommandItem
                        value="__none__"
                        onSelect={() => {
                          setFormContactId('');
                          setContactPickerOpen(false);
                        }}
                      >
                        <Check
                          className={cn('mr-2 h-4 w-4', !formContactId ? 'opacity-100' : 'opacity-0')}
                        />
                        {t('erp.common.none', 'None')}
                      </CommandItem>
                      {contacts.map((c) => (
                        <CommandItem
                          key={c.id}
                          value={`${c.name} ${c.id}`}
                          onSelect={() => {
                            setFormContactId(String(c.id));
                            setContactPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              formContactId === String(c.id) ? 'opacity-100' : 'opacity-0',
                            )}
                          />
                          <span className="truncate">{c.name}</span>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>{t('erp.salesOrders.form.dealOptional', 'Deal (optional)')}</Label>
              <Select value={formDealId || '__none__'} onValueChange={(v) => setFormDealId(v === '__none__' ? '' : v)}>
                <SelectTrigger data-tour="pages-erp-sales-orders.selecttrigger.erp.salesOrders.form.selectDeal">
                  <SelectValue placeholder={t('erp.salesOrders.form.selectDeal', 'Select deal')} />
                </SelectTrigger>
                <SelectContent searchable className="max-h-64">
                  <SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>
                  {deals.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('erp.common.currency', 'Currency')}</Label>
                <Select value={formCurrency} onValueChange={setFormCurrency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    {availableCurrencyCodes.map((currencyCode) => (
                      <SelectItem key={currencyCode} value={currencyCode}>
                        {currencyCode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('erp.salesOrders.form.validUntil', 'Valid until')}</Label>
                <Input data-tour="pages-erp-sales-orders.input.erp.common.currency" type="date" value={formValidUntil} onChange={(e) => setFormValidUntil(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('erp.salesOrders.form.assignedTo', 'Assigned to')}</Label>
              <Select value={formAssignedTo || '__none__'} onValueChange={(v) => setFormAssignedTo(v === '__none__' ? '' : v)}>
                <SelectTrigger data-tour="pages-erp-sales-orders.selecttrigger.erp.common.optional">
                  <SelectValue placeholder={t('erp.common.optional', 'Optional')} />
                </SelectTrigger>
                <SelectContent searchable>
                  <SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.fullName || m.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Textarea data-tour="pages-erp-sales-orders.textarea.erp.salesOrders.form.contact" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} />
            </div>
            <Collapsible open={addressesOpen} onOpenChange={setAddressesOpen}>
              <CollapsibleTrigger asChild>
                <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.form.shippingBilling" type="button" variant="outline" className="w-full justify-between">
                  {t('erp.salesOrders.form.shippingBilling', 'Shipping / billing')}
                  <ChevronDown className={`h-4 w-4 transition-transform ${addressesOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 pt-3">
                <div className="text-sm font-medium">{t('erp.salesOrders.form.shipping', 'Shipping')}</div>
                <Input data-tour="pages-erp-sales-orders.input.erp.salesOrders.form.addressLine" placeholder={t('erp.salesOrders.form.addressLine', 'Address line')} value={formShipLine1} onChange={(e) => setFormShipLine1(e.target.value)} />
                <Input data-tour="pages-erp-sales-orders.input.erp.salesOrders.form.city" placeholder={t('erp.salesOrders.form.city', 'City')} value={formShipCity} onChange={(e) => setFormShipCity(e.target.value)} />
                <div className="text-sm font-medium">{t('erp.salesOrders.form.billing', 'Billing')}</div>
                <Input data-tour="pages-erp-sales-orders.input.erp.salesOrders.form.addressLine" placeholder={t('erp.salesOrders.form.addressLine', 'Address line')} value={formBillLine1} onChange={(e) => setFormBillLine1(e.target.value)} />
                <Input data-tour="pages-erp-sales-orders.input.erp.salesOrders.form.city" placeholder={t('erp.salesOrders.form.city', 'City')} value={formBillCity} onChange={(e) => setFormBillCity(e.target.value)} />
              </CollapsibleContent>
            </Collapsible>
            <div className="border-t pt-4 space-y-2">
              <Label>{t('erp.salesOrders.form.lineItemsOptional', 'Products / services (optional)')}</Label>
              <ProductPicker
                companyId={companyId}
                value={lineProduct}
                onChange={onPickProduct}
                placeholder={t('erp.common.product', 'Product')}
                queryKeyScope="sales-orders-create-line"
                menuItemsOnly={isRestaurant}
              />
              {lineProductId && variants.length > 0 && (
                <Select value={lineVariantId || '__none__'} onValueChange={(v) => {
                  const id = v === '__none__' ? '' : v;
                  setLineVariantId(id);
                  const vrow = variants.find((x) => String(x.id) === id);
                  if (vrow?.unitPrice) setLineUnitPrice(vrow.unitPrice);
                }}>
                  <SelectTrigger data-tour="pages-erp-sales-orders.selecttrigger.erp.common.variant">
                    <SelectValue placeholder={t('erp.common.variant', 'Variant')} />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="__none__">{t('erp.salesOrders.form.defaultOrNone', 'Default / none')}</SelectItem>
                    {variants.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Input data-tour="pages-erp-sales-orders.input.erp.common.qty" placeholder={t('erp.common.qty', 'Qty')} value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
                <Input data-tour="pages-erp-sales-orders.input.erp.common.unitPrice" placeholder={t('erp.common.unitPrice', 'Unit price')} value={lineUnitPrice} onChange={(e) => setLineUnitPrice(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input data-tour="pages-erp-sales-orders.input.erp.common.discountPercent" placeholder={t('erp.common.discountPercent', 'Discount %')} value={lineDisc} onChange={(e) => setLineDisc(e.target.value)} />
                <Input data-tour="pages-erp-sales-orders.input.erp.common.taxPercent" placeholder={t('erp.common.taxPercent', 'Tax %')} value={lineTax} onChange={(e) => setLineTax(e.target.value)} />
              </div>
              <Input data-tour="pages-erp-sales-orders.input.erp.common.description" placeholder={t('erp.common.description', 'Description')} value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} />
              {isRestaurant && (
                <Textarea data-tour="pages-erp-sales-orders.textarea.erp.salesOrders.specialInstructions" placeholder={t('erp.salesOrders.specialInstructions', 'Special instructions')} value={lineSpecialInstructions} onChange={(e) => setLineSpecialInstructions(e.target.value)} rows={2} />
              )}
              {isRestaurant && lineModifierGroups.length > 0 && (
                <div className="rounded-md border p-2 space-y-2">
                  <div className="text-sm font-medium">{t('erp.salesOrders.modifiers', 'Modifiers')}</div>
                  {lineModifierGroups.map((group) => (
                    <div key={group.id} className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        {group.name} {group.multiple ? '(multi)' : '(single)'}
                      </div>
                      {group.options.map((option) => {
                        const selected = lineModifierSelections.some(
                          (selection) => selection.modifierId === group.id && selection.optionId === option.id
                        );
                        return (
                          <label key={option.id} className="flex items-center gap-2 text-sm">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={(checked: boolean | 'indeterminate') =>
                                toggleModifierSelection(group, option, checked === true)
                              }
                            />
                            <span>{option.name}</span>
                            {option.priceDelta !== 0 && (
                              <span className="text-muted-foreground">
                                ({option.priceDelta > 0 ? '+' : ''}
                                {option.priceDelta.toFixed(2)})
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
              <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.form.addItem"
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={!lineProductId || !lineUnitPrice.trim()}
                onClick={addStagedItem}
              >
                <Plus className="h-4 w-4" />
                {t('erp.salesOrders.form.addItem', 'Add item')}
              </Button>
              {stagedLineItems.length > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium">{t('erp.salesOrders.form.stagedItemsTitle', 'Items to add')}</div>
                  <Table data-tour="pages-erp-sales-orders.table.erp.common.product" erpSortable={false}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.common.product', 'Product')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.qty', 'Qty')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.unitPrice', 'Unit price')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.discountPercent', 'Discount %')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.taxPercent', 'Tax %')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.total', 'Total')}</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stagedLineItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell className="text-sm">{item.productName}</TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">{item.unitPrice}</TableCell>
                          <TableCell className="text-right">{item.discountPercent}</TableCell>
                          <TableCell className="text-right">{item.taxRate}</TableCell>
                          <TableCell className="text-right">{computeStagedLineTotal(item)}</TableCell>
                          <TableCell>
                            <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.form.removeItem"
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              aria-label={t('erp.salesOrders.form.removeItem', 'Remove item')}
                              onClick={() => removeStagedItem(index)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            {isRestaurant && (
              <div className="border rounded-md p-3 space-y-2">
                <div className="text-sm font-medium">{t('erp.salesOrders.restaurantDetails', 'Restaurant details')}</div>
                <Select value={restaurantServiceType} onValueChange={(v) => setRestaurantServiceType(v as 'dine_in' | 'takeaway' | 'delivery')}>
                  <SelectTrigger><SelectValue placeholder="Service type" /></SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="dine_in">dine_in</SelectItem>
                    <SelectItem value="takeaway">takeaway</SelectItem>
                    <SelectItem value="delivery">delivery</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={restaurantTableId || '__none__'} onValueChange={(v) => setRestaurantTableId(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Table" /></SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="__none__">None</SelectItem>
                    {restaurantTables.map((table) => (
                      <SelectItem key={table.id} value={String(table.id)}>{table.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input data-tour="pages-erp-sales-orders.input.restaurantGuestCount" type="number" placeholder="Guest count" value={restaurantGuestCount} onChange={(e) => setRestaurantGuestCount(e.target.value)} />
                <Select value={restaurantAssignedServerId || '__none__'} onValueChange={(v) => setRestaurantAssignedServerId(v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Assigned server" /></SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="__none__">None</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={String(member.id)}>{member.fullName || member.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-sales-orders.button.ui.common.cancel" type="button" variant="outline" onClick={closeCreateDialog}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-sales-orders.button.erp.common.create" type="button" onClick={() => createOrderMutation.mutate()} disabled={createOrderMutation.isPending}>
              {createOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('erp.common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!isRestaurant && (
        <SalesOrderCreateDialog
          open={createOpen && createMode === 'quotation'}
          onOpenChange={(open) => {
            if (open) setCreateOpen(true);
            else closeCreateDialog();
          }}
          mode="quotation"
          onCreated={() => invalidateSalesOrders()}
        />
      )}

      <Sheet open={detailId != null} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {detailLoading || !detailData ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <OrderSourceIndicator source={detailData.order.source} />
                  {detailData.order.orderNumber}
                </SheetTitle>
                <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
                  <Badge className={statusBadgeClass(detailData.order.status)} variant="secondary">
                    {detailData.order.status}
                  </Badge>
                  {detailData.order.contactId != null && (
                    <span>{t('erp.salesOrders.contactLabel', 'Contact')}: {contactNameById.get(detailData.order.contactId) ?? detailData.order.contactId}</span>
                  )}
                  {detailData.order.dealId != null && (
                    <Link href="/pipeline" className="text-primary underline">
                      {t('erp.salesOrders.dealNumber', 'Deal #{{id}}', { id: String(detailData.order.dealId) })}
                    </Link>
                  )}
                </div>
                {detailData.linkedContact?.customFields && Object.keys(detailData.linkedContact.customFields).length > 0 ? (
                  <div className="rounded-md border bg-muted/20 p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      {t('erp.common.contactCustomFields', 'Contact custom fields')}
                    </div>
                    <ContactCustomFieldsBadges
                      customFields={detailData.linkedContact.customFields}
                      schema={contactCustomFields}
                      maxVisible={99}
                    />
                  </div>
                ) : null}
                <SalesOrderStatusTimeline status={detailData.order.status} />
                {isRestaurant && detailData.restaurantContext && (
                  <div className="rounded-md border p-3 text-sm">
                    <div className="font-medium mb-1">{t('erp.salesOrders.restaurant', 'Restaurant')}</div>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Badge variant="outline">{detailData.restaurantContext.serviceType}</Badge>
                      <span>{t('erp.salesOrders.tableLabel', 'Table')}: {detailData.restaurantContext.tableId ?? '—'}</span>
                      <span>{t('erp.salesOrders.guestCount', 'Guests')}: {detailData.restaurantContext.guestCount ?? '—'}</span>
                      <Badge variant="secondary">{detailData.restaurantContext.status}</Badge>
                    </div>
                  </div>
                )}
              </SheetHeader>

              <Tabs defaultValue="lines" className="mt-6">
                <TabsList>
                  <TabsTrigger icon={TabIconListOrdered} data-tour="pages-erp-sales-orders.tabstrigger.lines" value="lines">{t('erp.salesOrders.tabs.lineItems', 'Line items')}</TabsTrigger>
                  <TabsTrigger icon={TabIconTruck} data-tour="pages-erp-sales-orders.tabstrigger.deliveries" value="deliveries">{t('erp.salesOrders.tabs.deliveries', 'Deliveries')}</TabsTrigger>
                </TabsList>
                <TabsContent data-tour="pages-erp-sales-orders.tabscontent.lines" value="lines" className="space-y-4 mt-4">
                  {(canManage || canCreateQuote) && canEditOrderStructure(detailData.order.status) && (
                    <div className="rounded-md border p-3 space-y-2 bg-muted/20">
                      <div className="text-sm font-medium">{t('erp.salesOrders.addLine', 'Add line')}</div>
                      <ProductPicker
                        companyId={companyId}
                        value={lineProduct}
                        onChange={onPickProduct}
                        placeholder={t('erp.common.product', 'Product')}
                        queryKeyScope="sales-orders-detail-line"
                        menuItemsOnly={isRestaurant}
                      />
                      {lineProductId && variants.length > 0 && (
                        <Select
                          value={lineVariantId || '__none__'}
                          onValueChange={(v) => {
                            const id = v === '__none__' ? '' : v;
                            setLineVariantId(id);
                            const vrow = variants.find((x) => String(x.id) === id);
                            if (vrow?.unitPrice) setLineUnitPrice(vrow.unitPrice);
                          }}
                        >
                          <SelectTrigger data-tour="pages-erp-sales-orders.selecttrigger.erp.common.variant">
                            <SelectValue placeholder={t('erp.common.variant', 'Variant')} />
                          </SelectTrigger>
                          <SelectContent searchable>
                            <SelectItem value="__none__">{t('erp.common.none', 'None')}</SelectItem>
                            {variants.map((v) => (
                              <SelectItem key={v.id} value={String(v.id)}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <Input data-tour="pages-erp-sales-orders.input.erp.common.qty" placeholder={t('erp.common.qty', 'Qty')} value={lineQty} onChange={(e) => setLineQty(e.target.value)} />
                        <Input data-tour="pages-erp-sales-orders.input.erp.common.unitPrice" placeholder={t('erp.common.unitPrice', 'Unit price')} value={lineUnitPrice} onChange={(e) => setLineUnitPrice(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input data-tour="pages-erp-sales-orders.input.erp.common.discountPercent" placeholder={t('erp.common.discountPercent', 'Discount %')} value={lineDisc} onChange={(e) => setLineDisc(e.target.value)} />
                        <Input data-tour="pages-erp-sales-orders.input.erp.common.taxPercent" placeholder={t('erp.common.taxPercent', 'Tax %')} value={lineTax} onChange={(e) => setLineTax(e.target.value)} />
                      </div>
                      <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.addItem"
                        type="button"
                        size="sm"
                        disabled={!lineProductId || !lineUnitPrice.trim() || addLineMutation.isPending}
                        onClick={() => detailId && addLineMutation.mutate(detailId)}
                      >
                        {t('erp.salesOrders.addItem', 'Add item')}
                      </Button>
                      {isRestaurant && (
                        <Textarea data-tour="pages-erp-sales-orders.textarea.erp.salesOrders.specialInstructions" placeholder={t('erp.salesOrders.specialInstructions', 'Special instructions')} value={lineSpecialInstructions} onChange={(e) => setLineSpecialInstructions(e.target.value)} rows={2} />
                      )}
                      {isRestaurant && lineModifierGroups.length > 0 && (
                        <div className="rounded-md border p-2 space-y-2">
                          <div className="text-sm font-medium">{t('erp.salesOrders.modifiers', 'Modifiers')}</div>
                          {lineModifierGroups.map((group) => (
                            <div key={group.id} className="space-y-1">
                              <div className="text-xs text-muted-foreground">
                                {group.name} {group.multiple ? '(multi)' : '(single)'}
                              </div>
                              {group.options.map((option) => {
                                const selected = lineModifierSelections.some(
                                  (selection) => selection.modifierId === group.id && selection.optionId === option.id
                                );
                                return (
                                  <label key={option.id} className="flex items-center gap-2 text-sm">
                                    <Checkbox
                                      checked={selected}
                                      onCheckedChange={(checked: boolean | 'indeterminate') =>
                                        toggleModifierSelection(group, option, checked === true)
                                      }
                                    />
                                    <span>{option.name}</span>
                                    {option.priceDelta !== 0 && (
                                      <span className="text-muted-foreground">
                                        ({option.priceDelta > 0 ? '+' : ''}
                                        {option.priceDelta.toFixed(2)})
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Table data-tour="pages-erp-sales-orders.table.erp.common.product" erpSortable={false}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('erp.common.product', 'Product')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.qty', 'Qty')}</TableHead>
                        <TableHead className="text-right">{t('erp.common.total', 'Total')}</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailData.items.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground text-center py-6">
                            {t('erp.salesOrders.emptyLineItems', 'No line items')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        detailData.items.map((it) => (
                          <TableRow key={it.id}>
                            <TableCell className="text-sm">
                              <div>
                                {it.productId != null
                                  ? (it.productName ?? `#${it.productId}`)
                                  : '—'}
                                {it.variantId ? ` · ${it.variantName ?? `var ${it.variantId}`}` : ''}
                              </div>
                              {it.specialInstructions?.trim() ? (
                                <div className="text-xs text-muted-foreground mt-1">
                                  <span className="font-medium text-foreground/80">
                                    {t('erp.salesOrders.lineItemInstructions', 'Line instructions')}
                                    {': '}
                                  </span>
                                  {it.specialInstructions.trim()}
                                </div>
                              ) : null}
                              {normalizeModifierSelections(it.modifierSelections).length > 0 && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {normalizeModifierSelections(it.modifierSelections)
                                    .map((selection) => `${selection.modifierName}: ${selection.optionName}`)
                                    .join(' | ')}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{it.quantity}</TableCell>
                            <TableCell className="text-right">{it.lineTotal}</TableCell>
                            <TableCell>
                              {(canManage || canCreateQuote) &&
                                canEditOrderStructure(detailData.order.status) && (
                                <Button data-tour="pages-erp-sales-orders.button.erp.common.remove"
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    deleteLineMutation.mutate({ orderId: detailData.order.id, itemId: it.id })
                                  }
                                >
                                  {t('erp.common.remove', 'Remove')}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <div className="rounded-md border p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('erp.common.subtotal', 'Subtotal')}</span>
                      <span>{detailData.order.subtotal}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('erp.common.tax', 'Tax')}</span>
                      <span>{detailData.order.taxAmount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('erp.common.discount', 'Discount')}</span>
                      <span>{detailData.order.discountAmount}</span>
                    </div>
                    <div className="flex justify-between font-semibold pt-2 border-t">
                      <span>{t('erp.common.total', 'Total')}</span>
                      <span>
                        {detailData.order.currency ?? 'USD'} {detailData.order.totalAmount}
                      </span>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent data-tour="pages-erp-sales-orders.tabscontent.deliveries" value="deliveries" className="mt-4 space-y-3">
                  {detailData.deliveries.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t('erp.salesOrders.emptyDeliveries', 'No delivery notes yet.')}</p>
                  ) : (
                    detailData.deliveries.map((dn) => (
                      <div key={dn.id} className="rounded-md border p-3 text-sm space-y-1">
                        <div className="font-medium">{dn.deliveryNumber ?? `Note #${dn.id}`}</div>
                        <Badge variant="outline">{dn.status}</Badge>
                        {dn.carrier && <div>Carrier: {dn.carrier}</div>}
                        {dn.trackingNumber && <div>Tracking: {dn.trackingNumber}</div>}
                      </div>
                    ))
                  )}
                </TabsContent>
              </Tabs>

              {(canManage || canCreateQuote) && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {(detailData.order.status === 'draft' || detailData.order.status === 'quotation') && (
                    <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.actions.convertToSalesOrder"
                      type="button"
                      size="sm"
                      onClick={() => actionMutation.mutate({ orderId: detailData.order.id, action: 'confirm' })}
                    >
                      {canCreateQuote && !canManage
                        ? t('erp.salesOrders.actions.convertToSalesOrder', 'Convert to sales order')
                        : t('erp.salesOrders.actions.confirm', 'Confirm')}
                    </Button>
                  )}
                  {canManage && detailData.order.status === 'confirmed' && (
                    <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.actions.process" type="button" size="sm" onClick={() => actionMutation.mutate({ orderId: detailData.order.id, action: 'process' })}>
                      {t('erp.salesOrders.actions.process', 'Process')}
                    </Button>
                  )}
                  {canManage && detailData.order.status === 'processing' && (
                    <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.actions.ship" type="button" size="sm" onClick={() => actionMutation.mutate({ orderId: detailData.order.id, action: 'ship' })}>
                      {t('erp.salesOrders.actions.ship', 'Ship')}
                    </Button>
                  )}
                  {canManage && detailData.order.status === 'shipped' && (
                    <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.actions.deliver" type="button" size="sm" onClick={() => actionMutation.mutate({ orderId: detailData.order.id, action: 'deliver' })}>
                      {t('erp.salesOrders.actions.deliver', 'Deliver')}
                    </Button>
                  )}
                  {canManage && (detailData.order.status === 'shipped' || detailData.order.status === 'delivered') && (
                    <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.actions.returned" type="button" size="sm" variant="secondary" onClick={() => actionMutation.mutate({ orderId: detailData.order.id, action: 'return' })}>
                      {t('erp.salesOrders.actions.returned', 'Returned')}
                    </Button>
                  )}
                  {detailData.order.status !== 'delivered' &&
                    detailData.order.status !== 'cancelled' &&
                    detailData.order.status !== 'returned' && (
                    <Button data-tour="pages-erp-sales-orders.button.ui.common.cancel"
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => actionMutation.mutate({ orderId: detailData.order.id, action: 'cancel' })}
                    >
                      {t('ui.common.cancel', 'Cancel')}
                    </Button>
                  )}
                  {canManage && detailData.order.status !== 'cancelled' && (
                    <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.actions.sendQuotation"
                      type="button"
                      size="sm"
                      variant={
                        detailData.order.status === 'draft' ||
                        detailData.order.status === 'quotation'
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() => setSendTarget(detailData.order)}
                    >
                      <Send className="h-4 w-4 mr-1" />
                      {t('erp.salesOrders.actions.sendQuotation', 'Send quotation')}
                    </Button>
                  )}
                </div>
              )}
              {canManageInvoices && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button data-tour="pages-erp-sales-orders.button.erp.salesOrders.actions.generateInvoice"
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => generateInvoiceMutation.mutate(detailData.order.id)}
                    disabled={generateInvoiceMutation.isPending}
                  >
                    {generateInvoiceMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    {t('erp.salesOrders.actions.generateInvoice', 'Generate Invoice')}
                  </Button>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      <SendQuotationDialog
        open={sendTarget !== null}
        onOpenChange={(o) => {
          if (!o) setSendTarget(null);
        }}
        order={sendTarget}
      />
    </div>
  );
}

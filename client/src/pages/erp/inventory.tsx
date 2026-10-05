import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertTriangle,
  Boxes,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Columns3,
  Copy,
  Layers3,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Upload,
  Warehouse,
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { VariantPicker, type VariantOption } from '@/components/erp/variant-picker';
import InventoryImportDialog from '@/components/erp/InventoryImportDialog';
import { resolveMediaUrl } from '@/utils/mediaUrl';

type WarehouseRow = {
  id: number;
  companyId: number;
  name: string;
  address: Record<string, unknown> | null;
  isDefault: boolean | null;
  isActive: boolean | null;
  notes: string | null;
};

type StockLevelRow = {
  id: number;
  companyId: number;
  productId: number;
  variantId: number | null;
  warehouseId: number;
  quantity: string;
  reservedQty: string;
  reorderPoint: string | null;
  reorderQty: string | null;
  productName: string | null;
  productSku: string | null;
  productImages: unknown | null;
  productMinStock: string | null;
  productExpirationDate: string | null;
  productCustomFields: Record<string, unknown> | null;
  productTotalStock: string | null;
  productLowStock: boolean;
  belowReorderPoint: boolean;
  variantName: string | null;
  variantSku: string | null;
  warehouseName: string | null;
};

type CustomFieldDefinition = {
  id: number;
  name: string;
  fieldKey: string;
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox';
  options: string[] | null;
  isRequired: boolean;
  defaultValue: string | null;
  sortOrder: number;
  isActive: boolean;
};

type StockMovementRow = {
  id: number;
  companyId: number;
  productId: number;
  variantId: number | null;
  warehouseId: number;
  movementType: string;
  quantity: string;
  referenceType: string | null;
  referenceId: number | null;
  notes: string | null;
  userId: number | null;
  createdAt: string;
  productName: string | null;
  productSku: string | null;
  variantName: string | null;
  variantSku: string | null;
  warehouseName: string | null;
  userLabel: string | null;
};

type TransferRow = {
  id: number;
  companyId: number;
  transferNumber: string | null;
  fromWarehouseId: number;
  toWarehouseId: number;
  status: string;
  items: unknown;
  notes: string | null;
  createdAt: string;
  fromWarehouseName: string | null;
  toWarehouseName: string | null;
};

type ProductRow = {
  id: number;
  name: string;
  sku: string | null;
};

type VariantRow = {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  status: string | null;
  attributes?: Record<string, unknown> | null;
};

type InventorySummary = {
  totalProducts: number;
  totalStock: number;
  availableStock: number;
  lowStockProducts: number;
};

const MOVEMENT_TYPES = ['all', 'in', 'out', 'transfer', 'adjustment', 'count'] as const;

function formatQty(v: string | null | undefined, locale?: string): string {
  if (v == null || v === '') return '0';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function movementBadgeClass(t: string): string {
  switch (t) {
    case 'in':
      return 'bg-emerald-600 hover:bg-emerald-600 text-white border-transparent';
    case 'out':
      return 'bg-red-600 hover:bg-red-600 text-white border-transparent';
    case 'transfer':
      return 'bg-blue-600 hover:bg-blue-600 text-white border-transparent';
    case 'adjustment':
      return 'bg-amber-500 hover:bg-amber-500 text-white border-transparent';
    case 'count':
      return 'bg-violet-600 hover:bg-violet-600 text-white border-transparent';
    default:
      return '';
  }
}

function getMovementSign(movementType: string, quantity: number): string {
  switch (movementType) {
    case 'in':
      return '+';
    case 'out':
      return '-';
    case 'transfer':
    case 'adjustment':
    case 'count':
      return quantity < 0 ? '-' : quantity > 0 ? '+' : '';
    default:
      return quantity < 0 ? '-' : quantity > 0 ? '+' : '';
  }
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function formatDateOnly(value: string | null | undefined, locale?: string): string {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString(locale) : value || '—';
}

function normalizeProductImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0);
}

function isExpiredDate(value: string | null | undefined): boolean {
  const date = parseDateOnly(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

export default function ERPInventoryPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t, currentLanguage } = useTranslation();
  const locale = currentLanguage?.code?.replace('_', '-') || undefined;
  const canManage = hasPermission(PERMISSIONS.MANAGE_INVENTORY);

  const [mainTab, setMainTab] = useState('stock');

  const [slWarehouse, setSlWarehouse] = useState<string>('all');
  const [slSearch, setSlSearch] = useState('');
  const [slLowOnly, setSlLowOnly] = useState(false);
  const [visibleCustomFieldColumns, setVisibleCustomFieldColumns] = useState<string[]>([]);
  const [slPage, setSlPage] = useState(1);
  const [slLimit, setSlLimit] = useState(20);

  const [mvWarehouse, setMvWarehouse] = useState<string>('all');
  const [mvType, setMvType] = useState<string>('all');
  const [mvDateFrom, setMvDateFrom] = useState('');
  const [mvDateTo, setMvDateTo] = useState('');
  const [mvPage, setMvPage] = useState(1);
  const [mvLimit, setMvLimit] = useState(20);

  const [trPage, setTrPage] = useState(1);
  const [trLimit, setTrLimit] = useState(10);

  const [slEditOpen, setSlEditOpen] = useState(false);
  const [slEditing, setSlEditing] = useState<StockLevelRow | null>(null);
  const [slReorderPoint, setSlReorderPoint] = useState('');
  const [slReorderQty, setSlReorderQty] = useState('');

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState<string>('');
  const [adjVariantId, setAdjVariantId] = useState<string>('');
  const [adjWarehouseId, setAdjWarehouseId] = useState<string>('');
  const [adjQty, setAdjQty] = useState('');
  const [adjNotes, setAdjNotes] = useState('');

  const [whDialogOpen, setWhDialogOpen] = useState(false);
  const [whEditing, setWhEditing] = useState<WarehouseRow | null>(null);
  const [whName, setWhName] = useState('');
  const [whStreet, setWhStreet] = useState('');
  const [whCity, setWhCity] = useState('');
  const [whState, setWhState] = useState('');
  const [whCountry, setWhCountry] = useState('');
  const [whZip, setWhZip] = useState('');
  const [whIsDefault, setWhIsDefault] = useState(false);
  const [whIsActive, setWhIsActive] = useState(true);
  const [whNotes, setWhNotes] = useState('');
  const [whDeleteTarget, setWhDeleteTarget] = useState<WarehouseRow | null>(null);

  const [trDialogOpen, setTrDialogOpen] = useState(false);
  const [trFromId, setTrFromId] = useState<string>('');
  const [trToId, setTrToId] = useState<string>('');
  const [trNotes, setTrNotes] = useState('');
  const [trItems, setTrItems] = useState<Array<{ productId: string; variantId: string; quantity: string; notes: string }>>([
    { productId: '', variantId: '', quantity: '', notes: '' },
  ]);
  const [trVariantsByProduct, setTrVariantsByProduct] = useState<Record<string, VariantOption[]>>({});
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const slFiltersKey = useMemo(
    () => ({ slWarehouse, slSearch, slLowOnly, slPage, slLimit }),
    [slWarehouse, slSearch, slLowOnly, slPage, slLimit]
  );

  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/erp/inventory/warehouses', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/inventory/warehouses');
      const json = await res.json();
      return (json.data ?? []) as WarehouseRow[];
    },
    enabled: !!companyId,
  });

  const { data: inventorySummary, isLoading: summaryLoading } = useQuery<InventorySummary>({
    queryKey: ['/api/erp/inventory/summary', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/inventory/summary');
      const json = await res.json();
      return json.data as InventorySummary;
    },
    enabled: !!companyId,
  });

  const { data: customFieldDefinitions = [] } = useQuery({
    queryKey: ['/api/erp/product-custom-fields', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/product-custom-fields');
      const json = await res.json();
      return (json.data ?? []) as CustomFieldDefinition[];
    },
    enabled: !!companyId,
  });

  const activeDefinitions = useMemo(
    () =>
      customFieldDefinitions
        .filter((d) => d.isActive)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [customFieldDefinitions]
  );

  const definitionByKey = useMemo(() => {
    const m = new Map<string, CustomFieldDefinition>();
    activeDefinitions.forEach((d) => m.set(d.fieldKey, d));
    return m;
  }, [activeDefinitions]);

  const formatCustomFieldValue = (def: CustomFieldDefinition | undefined, value: unknown): string => {
    if (value == null || value === '') return '—';
    if (def?.fieldType === 'checkbox') {
      return value === true || value === 'true'
        ? t('erp.inventory.customFields.yes', 'Yes')
        : t('erp.inventory.customFields.no', 'No');
    }
    if (def?.fieldType === 'date') {
      return formatDateOnly(String(value), locale);
    }
    if (def?.fieldType === 'number') {
      const n = Number(value);
      return Number.isFinite(n) ? n.toLocaleString(locale) : String(value);
    }
    return String(value);
  };

  const { data: lowStockResult } = useQuery({
    queryKey: ['/api/erp/inventory/stock-levels', 'low-count', companyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('lowStockOnly', 'true');
      params.set('limit', '1');
      params.set('offset', '0');
      const res = await apiRequest('GET', `/api/erp/inventory/stock-levels?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: StockLevelRow[]; total: number };
    },
    enabled: !!companyId && mainTab === 'stock',
  });
  const lowStockTotal = lowStockResult?.total ?? 0;

  const { data: slListResult, isLoading: slLoading } = useQuery({
    queryKey: ['/api/erp/inventory/stock-levels', companyId, slFiltersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (slWarehouse !== 'all') params.set('warehouseId', slWarehouse);
      if (slSearch.trim()) params.set('search', slSearch.trim());
      if (slLowOnly) params.set('lowStockOnly', 'true');
      params.set('limit', String(slLimit));
      params.set('offset', String((slPage - 1) * slLimit));
      const res = await apiRequest('GET', `/api/erp/inventory/stock-levels?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: StockLevelRow[]; total: number };
    },
    enabled: !!companyId && mainTab === 'stock',
  });

  const stockLevels = slListResult?.data ?? [];
  const slTotal = slListResult?.total ?? 0;
  const slTotalPages = Math.max(1, Math.ceil(slTotal / slLimit));
  const slRangeStart = slTotal === 0 ? 0 : (slPage - 1) * slLimit + 1;
  const slRangeEnd = Math.min(slPage * slLimit, slTotal);

  const stockByWarehouse = useMemo(() => {
    const map = new Map<number, { name: string; rows: StockLevelRow[] }>();
    for (const row of stockLevels) {
      const wid = row.warehouseId;
      const name = row.warehouseName ?? t('erp.inventory.warehouses.fallbackName', 'Warehouse #{{id}}', { id: wid });
      let g = map.get(wid);
      if (!g) {
        g = { name, rows: [] };
        map.set(wid, g);
      }
      g.rows.push(row);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([, g]) => g);
  }, [stockLevels, t]);

  const mvFiltersKey = useMemo(
    () => ({ mvWarehouse, mvType, mvDateFrom, mvDateTo, mvPage, mvLimit }),
    [mvWarehouse, mvType, mvDateFrom, mvDateTo, mvPage, mvLimit]
  );

  const { data: mvListResult, isLoading: mvLoading } = useQuery({
    queryKey: ['/api/erp/inventory/stock-movements', companyId, mvFiltersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (mvWarehouse !== 'all') params.set('warehouseId', mvWarehouse);
      if (mvType !== 'all') params.set('movementType', mvType);
      if (mvDateFrom) params.set('dateFrom', new Date(mvDateFrom).toISOString());
      if (mvDateTo) params.set('dateTo', new Date(mvDateTo).toISOString());
      params.set('limit', String(mvLimit));
      params.set('offset', String((mvPage - 1) * mvLimit));
      const res = await apiRequest('GET', `/api/erp/inventory/stock-movements?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: StockMovementRow[]; total: number };
    },
    enabled: !!companyId && mainTab === 'movements',
  });

  const movements = mvListResult?.data ?? [];
  const mvTotal = mvListResult?.total ?? 0;
  const mvTotalPages = Math.max(1, Math.ceil(mvTotal / mvLimit));
  const mvRangeStart = mvTotal === 0 ? 0 : (mvPage - 1) * mvLimit + 1;
  const mvRangeEnd = Math.min(mvPage * mvLimit, mvTotal);

  const { data: trListResult, isLoading: trLoading } = useQuery({
    queryKey: ['/api/erp/inventory/transfers', companyId, trPage, trLimit, mainTab],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(trLimit));
      params.set('offset', String((trPage - 1) * trLimit));
      const res = await apiRequest('GET', `/api/erp/inventory/transfers?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: TransferRow[]; total: number };
    },
    enabled: !!companyId && mainTab === 'movements',
  });

  const transfers = trListResult?.data ?? [];
  const trTotal = trListResult?.total ?? 0;
  const trTotalPages = Math.max(1, Math.ceil(trTotal / trLimit));
  const trRangeStart = trTotal === 0 ? 0 : (trPage - 1) * trLimit + 1;
  const trRangeEnd = Math.min(trPage * trLimit, trTotal);

  const { data: productsList = [] } = useQuery({
    queryKey: ['/api/erp/products', 'inventory-picker', companyId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '500');
      params.set('offset', '0');
      const res = await apiRequest('GET', `/api/erp/products?${params.toString()}`);
      const json = await res.json();
      const pack = json.data as { data: ProductRow[] };
      return pack.data ?? [];
    },
    enabled: !!companyId && (adjOpen || trDialogOpen),
  });

  const adjProductIdNum = adjProductId ? parseInt(adjProductId, 10) : NaN;
  const { data: adjVariants = [] } = useQuery({
    queryKey: ['/api/erp/products', adjProductIdNum, 'variants'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/products/${adjProductIdNum}/variants`);
      const json = await res.json();
      return (json.data ?? []) as VariantRow[];
    },
    enabled: !!companyId && adjOpen && Number.isFinite(adjProductIdNum) && adjProductIdNum > 0,
  });

  const invalidateInventory = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/summary'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/warehouses'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/stock-levels'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/transfers'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/products'] });
    queryClient.invalidateQueries({ queryKey: ['/api/erp/product-custom-fields'] });
  };

  const openSlEdit = (row: StockLevelRow) => {
    setSlEditing(row);
    setSlReorderPoint(row.reorderPoint ?? '');
    setSlReorderQty(row.reorderQty ?? '');
    setSlEditOpen(true);
  };

  const updateSlMutation = useMutation({
    mutationFn: async () => {
      if (!slEditing) throw new Error(t('erp.inventory.errors.noStockRow', 'No stock row selected'));
      const body: Record<string, string | null> = {};
      if (slReorderPoint.trim()) body.reorderPoint = slReorderPoint.trim();
      else body.reorderPoint = null;
      if (slReorderQty.trim()) body.reorderQty = slReorderQty.trim();
      else body.reorderQty = null;
      const res = await apiRequest('PUT', `/api/erp/inventory/stock-levels/${slEditing.id}`, body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.stockUpdated', 'Stock level updated') });
      setSlEditOpen(false);
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const adjustmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/inventory/stock-adjustments', {
        productId: parseInt(adjProductId, 10),
        warehouseId: parseInt(adjWarehouseId, 10),
        quantity: adjQty.trim(),
        notes: adjNotes.trim() || undefined,
        ...(adjVariantId ? { variantId: parseInt(adjVariantId, 10) } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.adjustmentRecorded', 'Adjustment recorded') });
      setAdjOpen(false);
      setAdjProductId('');
      setAdjVariantId('');
      setAdjWarehouseId('');
      setAdjQty('');
      setAdjNotes('');
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const submitAdjustment = () => {
    if (!adjProductId || !adjWarehouseId || !adjQty.trim()) {
      toast({ title: t('erp.inventory.validation.adjustmentRequired', 'Fill product, warehouse, and quantity'), variant: 'destructive' });
      return;
    }
    if (adjVariants.length > 0 && !adjVariantId) {
      toast({ title: t('erp.inventory.validation.variantRequired', 'Select a variant for this product'), variant: 'destructive' });
      return;
    }
    adjustmentMutation.mutate();
  };

  const resetWhForm = () => {
    setWhName('');
    setWhStreet('');
    setWhCity('');
    setWhState('');
    setWhCountry('');
    setWhZip('');
    setWhIsDefault(false);
    setWhIsActive(true);
    setWhNotes('');
  };

  const openWhCreate = () => {
    setWhEditing(null);
    resetWhForm();
    setWhDialogOpen(true);
  };

  const openWhEdit = (w: WarehouseRow) => {
    setWhEditing(w);
    setWhName(w.name);
    const addr = (w.address ?? {}) as Record<string, string>;
    setWhStreet(addr.street ?? '');
    setWhCity(addr.city ?? '');
    setWhState(addr.state ?? '');
    setWhCountry(addr.country ?? '');
    setWhZip(addr.zip ?? '');
    setWhIsDefault(!!w.isDefault);
    setWhIsActive(w.isActive !== false);
    setWhNotes(w.notes ?? '');
    setWhDialogOpen(true);
  };

  const copyWarehouseId = async (id: number) => {
    try {
      await navigator.clipboard.writeText(String(id));
      toast({
        title: t('erp.inventory.warehouses.idCopied', 'Warehouse ID copied'),
        description: String(id),
      });
    } catch {
      toast({
        title: t('common.error', 'Error'),
        description: t('erp.inventory.warehouses.idCopyFailed', 'Failed to copy Warehouse ID'),
        variant: 'destructive',
      });
    }
  };

  const buildWhPayload = () => ({
    name: whName.trim(),
    address: {
      street: whStreet.trim() || undefined,
      city: whCity.trim() || undefined,
      state: whState.trim() || undefined,
      country: whCountry.trim() || undefined,
      zip: whZip.trim() || undefined,
    },
    isDefault: whIsDefault,
    isActive: whIsActive,
    notes: whNotes.trim() || undefined,
  });

  const createWhMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/inventory/warehouses', buildWhPayload());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.warehouseCreated', 'Warehouse created') });
      setWhDialogOpen(false);
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const updateWhMutation = useMutation({
    mutationFn: async () => {
      if (!whEditing) throw new Error(t('erp.inventory.errors.noWarehouse', 'No warehouse selected'));
      const res = await apiRequest('PUT', `/api/erp/inventory/warehouses/${whEditing.id}`, buildWhPayload());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.warehouseUpdated', 'Warehouse updated') });
      setWhDialogOpen(false);
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const deleteWhMutation = useMutation({
    mutationFn: async (w: WarehouseRow) => {
      await apiRequest('DELETE', `/api/erp/inventory/warehouses/${w.id}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.warehouseDeleted', 'Warehouse deleted') });
      setWhDeleteTarget(null);
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const submitWh = () => {
    if (!whName.trim()) {
      toast({ title: t('erp.inventory.validation.nameRequired', 'Name is required'), variant: 'destructive' });
      return;
    }
    if (whEditing) updateWhMutation.mutate();
    else createWhMutation.mutate();
  };

  const createTrMutation = useMutation({
    mutationFn: async () => {
      const items = trItems
        .filter((i) => i.productId && i.quantity.trim())
        .map((i) => {
          const base: { productId: number; quantity: string; variantId?: number; notes?: string } = {
            productId: parseInt(i.productId, 10),
            quantity: i.quantity.trim(),
          };
          if (i.variantId.trim()) {
            const vid = parseInt(i.variantId, 10);
            if (Number.isFinite(vid)) base.variantId = vid;
          }
          if (i.notes.trim()) base.notes = i.notes.trim();
          return base;
        });
      const res = await apiRequest('POST', '/api/erp/inventory/transfers', {
        fromWarehouseId: parseInt(trFromId, 10),
        toWarehouseId: parseInt(trToId, 10),
        items,
        notes: trNotes.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.transferCreated', 'Transfer created') });
      setTrDialogOpen(false);
      setTrFromId('');
      setTrToId('');
      setTrNotes('');
      setTrItems([{ productId: '', variantId: '', quantity: '', notes: '' }]);
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const markTransitMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('PUT', `/api/erp/inventory/transfers/${id}`, { status: 'in_transit' });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.markedInTransit', 'Marked in transit') });
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const completeTrMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/inventory/transfers/${id}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.transferCompleted', 'Transfer completed') });
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const cancelTrMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/erp/inventory/transfers/${id}/cancel`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.toast.transferCancelled', 'Transfer cancelled') });
      invalidateInventory();
    },
    onError: (e: Error) => {
      toast({ title: t('ui.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const submitTransfer = () => {
    if (!trFromId || !trToId) {
      toast({ title: t('erp.inventory.validation.selectWarehouses', 'Select warehouses'), variant: 'destructive' });
      return;
    }
    for (const item of trItems) {
      if (!item.productId) continue;
      const variants = trVariantsByProduct[item.productId] ?? [];
      if (variants.length > 0 && !item.variantId) {
        toast({ title: t('erp.inventory.validation.transferVariants', 'Select variants for all variant-based transfer lines'), variant: 'destructive' });
        return;
      }
    }
    createTrMutation.mutate();
  };

  const loadTransferProductVariants = async (productIdValue: string) => {
    if (!productIdValue || trVariantsByProduct[productIdValue]) return;
    const res = await apiRequest('GET', `/api/erp/products/${productIdValue}/variants`);
    const json = await res.json();
    setTrVariantsByProduct((prev) => ({ ...prev, [productIdValue]: (json.data ?? []) as VariantOption[] }));
  };

  const renderPagination = ({
    page,
    totalPages,
    total,
    rangeStart,
    rangeEnd,
    limit,
    setPage,
    setLimit,
  }: {
    page: number;
    totalPages: number;
    total: number;
    rangeStart: number;
    rangeEnd: number;
    limit: number;
    setPage: (page: number | ((current: number) => number)) => void;
    setLimit: (limit: number) => void;
  }) => (
    <div className="flex flex-col gap-3 rounded-lg border bg-card px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="text-xs text-muted-foreground">
        {t('erp.inventory.pagination.showing', 'Showing {{start}} to {{end}} of {{total}} results', {
          start: rangeStart,
          end: rangeEnd,
          total,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <div className="flex items-center gap-1">
          <Button data-tour="pages-erp-inventory.button.erp.inventory.pagination.firstPage" type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(1)} aria-label={t('erp.inventory.pagination.firstPage', 'First page')}>
            <ChevronFirst className="h-4 w-4" />
          </Button>
          <Button data-tour="pages-erp-inventory.button.erp.common.previous" type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} aria-label={t('erp.common.previous', 'Previous')}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" className="h-8 w-8 text-xs" aria-current="page">{page}</Button>
          <Button data-tour="pages-erp-inventory.button.erp.common.next" type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} aria-label={t('erp.common.next', 'Next')}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button data-tour="pages-erp-inventory.button.erp.inventory.pagination.lastPage" type="button" variant="ghost" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(totalPages)} aria-label={t('erp.inventory.pagination.lastPage', 'Last page')}>
            <ChevronLast className="h-4 w-4" />
          </Button>
        </div>
        <Select
          value={String(limit)}
          onValueChange={(value) => {
            setLimit(Number(value));
            setPage(1);
          }}
        >
          <SelectTrigger data-tour="pages-erp-inventory.selecttrigger.erp.inventory.pagination.rowsPerPage" className="h-8 w-[132px] text-xs" aria-label={t('erp.inventory.pagination.rowsPerPage', 'Rows per page')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {[10, 20, 50, 100].map((pageSize) => (
              <SelectItem key={pageSize} value={String(pageSize)}>
                {t('erp.inventory.pagination.perPage', '{{count}} per page', { count: pageSize })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 px-4 py-5 sm:px-6 sm:py-6">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <Package className="h-6 w-6" />
              </span>
              <div>
                <h1 data-tour="pages-erp-inventory.h1.erp.inventory.title" className="text-2xl">{t('erp.inventory.title', 'Inventory Management')}</h1>
                <p className="text-sm text-muted-foreground">{t('erp.inventory.subtitle', 'Warehouses, stock levels, movements, and transfers')}</p>
              </div>
            </div>

            <Tabs value={mainTab} onValueChange={setMainTab}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <TabsList>
                  <TabsTrigger data-tour="pages-erp-inventory.tabstrigger.stock" value="stock">
                    <CircleGauge className="h-3.5 w-3.5" />
                    {t('erp.inventory.tabs.stockLevels', 'Stock levels')}
                  </TabsTrigger>
                  <TabsTrigger data-tour="pages-erp-inventory.tabstrigger.movements" value="movements">
                    <Layers3 className="h-3.5 w-3.5" />
                    {t('erp.inventory.tabs.movements', 'Movements')}
                  </TabsTrigger>
                  <TabsTrigger data-tour="pages-erp-inventory.tabstrigger.warehouses" value="warehouses">
                    <Warehouse className="h-3.5 w-3.5" />
                    {t('erp.inventory.tabs.warehouses', 'Warehouses')}
                  </TabsTrigger>
                </TabsList>
                {canManage && mainTab === 'stock' && (
                  <Button data-tour="pages-erp-inventory.button.erp.inventory.importInventory" size="sm" className="h-9 shadow-sm" onClick={() => setImportDialogOpen(true)}>
                    <Upload className="me-1.5 h-4 w-4" />
                    {t('erp.inventory.importInventory', 'Import Inventory')}
                  </Button>
                )}
                {canManage && mainTab === 'movements' && (
                  <Button data-tour="pages-erp-inventory.button.erp.inventory.actions.recordAdjustment" size="sm" className="h-9 shadow-sm" onClick={() => setAdjOpen(true)}>
                    <Plus className="me-1.5 h-4 w-4" />
                    {t('erp.inventory.actions.recordAdjustment', 'Record adjustment')}
                  </Button>
                )}
                {canManage && mainTab === 'warehouses' && (
                  <Button data-tour="pages-erp-inventory.button.erp.inventory.warehouses.newWarehouse" size="sm" className="h-9 shadow-sm" onClick={openWhCreate}>
                    <Plus className="me-1.5 h-4 w-4" />
                    {t('erp.inventory.warehouses.newWarehouse', 'New warehouse')}
                  </Button>
                )}
              </div>

              <TabsContent data-tour="pages-erp-inventory.tabscontent.stock" value="stock" className="space-y-4 mt-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: t('erp.inventory.summary.totalProducts', 'Total products'), value: inventorySummary?.totalProducts ?? 0, hint: t('erp.inventory.summary.products', 'products'), icon: Boxes, tone: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
                    { label: t('erp.inventory.summary.totalStock', 'Total stock'), value: inventorySummary?.totalStock ?? 0, hint: t('erp.inventory.summary.units', 'units'), icon: Layers3, tone: 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300' },
                    { label: t('erp.inventory.summary.available', 'Available'), value: inventorySummary?.availableStock ?? 0, hint: t('erp.inventory.summary.units', 'units'), icon: CircleGauge, tone: 'border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-300' },
                    { label: t('erp.inventory.summary.lowStock', 'Low stock'), value: inventorySummary?.lowStockProducts ?? 0, hint: t('erp.inventory.summary.products', 'products'), icon: ShoppingCart, tone: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300' },
                  ].map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <Card key={metric.label} className="border bg-card shadow-sm">
                        <CardContent className="flex items-center gap-4 p-4">
                          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${metric.tone}`}>
                            <Icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs text-muted-foreground">{metric.label}</p>
                            <p className="text-xl font-semibold tabular-nums">{summaryLoading ? '—' : formatQty(String(metric.value), locale)}</p>
                            <p className="text-[11px] text-muted-foreground">{metric.hint}</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                {lowStockTotal > 0 && (
                  <Card className="border-amber-500/50 bg-amber-500/5">
                    <CardContent className="pt-4 flex flex-wrap items-center gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                      <p className="text-sm">
                        <span className="font-medium">{lowStockTotal}</span> {t('erp.inventory.lowStock.itemsBelowMinimumStock', 'stock lines are at or below product minimum stock.')}
                      </p>
                      <Button data-tour="pages-erp-inventory.button.erp.inventory.lowStock.showOnly"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSlLowOnly(true);
                          setSlPage(1);
                        }}
                      >
                        {t('erp.inventory.lowStock.showOnly', 'Show low stock only')}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                <Card className="shadow-sm">
                  <CardContent className="p-3 sm:p-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(280px,1fr)_220px_auto_auto] xl:items-end">
                      <div className="relative sm:col-span-2 xl:col-span-1">
                        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input data-tour="pages-erp-inventory.input.erp.inventory.searchPlaceholder"
                          placeholder={t('erp.inventory.searchPlaceholder', 'Search product name or SKU…')}
                          className="h-10 ps-9"
                          aria-label={t('erp.inventory.searchLabel', 'Search inventory')}
                          value={slSearch}
                          onChange={(e) => {
                            setSlSearch(e.target.value);
                            setSlPage(1);
                          }}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.inventory.filters.warehouse', 'Warehouse')}</Label>
                        <Select
                          value={slWarehouse}
                          onValueChange={(v) => {
                            setSlWarehouse(v);
                            setSlPage(1);
                          }}
                        >
                          <SelectTrigger data-tour="pages-erp-inventory.selecttrigger.erp.inventory.filters.warehouse" className="mt-1 h-10">
                            <SelectValue placeholder={t('erp.inventory.filters.warehouse', 'Warehouse')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('erp.inventory.filters.allWarehouses', 'All warehouses')}</SelectItem>
                            {warehouses.map((w) => (
                              <SelectItem key={w.id} value={String(w.id)}>
                                {w.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex h-10 items-center gap-2 rounded-md border px-3">
                        <Checkbox
                          id="sl-low"
                          checked={slLowOnly}
                          onCheckedChange={(c) => {
                            setSlLowOnly(c === true);
                            setSlPage(1);
                          }}
                        />
                        <Label htmlFor="sl-low" className="text-sm cursor-pointer">
                          {t('erp.inventory.lowStock.only', 'Low stock only')}
                        </Label>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button data-tour="pages-erp-inventory.button.erp.inventory.columns.showHide" variant="outline" className="h-10 w-full sm:w-auto">
                            <Columns3 className="me-2 h-4 w-4" />
                            {t('erp.inventory.columns.showHide', 'Show/hide columns')}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          {activeDefinitions.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              {t('erp.inventory.columns.noCustomFields', 'No custom fields')}
                            </div>
                          ) : (
                            activeDefinitions.map((def) => (
                              <DropdownMenuCheckboxItem
                                key={def.fieldKey}
                                checked={visibleCustomFieldColumns.includes(def.fieldKey)}
                                onCheckedChange={(checked) => {
                                  setVisibleCustomFieldColumns((prev) =>
                                    checked
                                      ? [...prev, def.fieldKey]
                                      : prev.filter((key) => key !== def.fieldKey)
                                  );
                                }}
                              >
                                {def.name}
                              </DropdownMenuCheckboxItem>
                            ))
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>

                <div className="space-y-6">
                  {slLoading ? (
                    <Card>
                      <CardContent className="flex justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </CardContent>
                    </Card>
                  ) : stockLevels.length === 0 ? (
                    <Card>
                      <CardContent className="py-12 text-center text-muted-foreground text-sm">
                        {t('erp.inventory.empty.stockLevels', 'No stock levels yet')}
                      </CardContent>
                    </Card>
                  ) : (
                    stockByWarehouse.map((group) => (
                      <Card key={group.name} className="overflow-hidden shadow-sm">
                        <CardHeader className="border-b bg-muted/20 px-4 py-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border bg-card text-muted-foreground">
                              <Warehouse className="h-3.5 w-3.5" />
                            </span>
                            {group.name}
                            <Badge variant="secondary" className="ml-1 font-normal">
                              {group.rows.length} {group.rows.length === 1 ? t('erp.inventory.table.line', 'line') : t('erp.inventory.table.lines', 'lines')}
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="overflow-x-auto p-0">
                          <Table data-tour="pages-erp-inventory.table.erp.inventory.table.product" className="min-w-[1180px]">
                            <TableHeader>
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableHead>{t('erp.inventory.table.product', 'Product')}</TableHead>
                                <TableHead>{t('erp.inventory.table.variant', 'Variant')}</TableHead>
                                <TableHead className="text-right">{t('erp.inventory.table.onHand', 'On hand')}</TableHead>
                                <TableHead className="text-right">{t('erp.inventory.table.reserved', 'Reserved')}</TableHead>
                                <TableHead className="text-right">{t('erp.inventory.table.available', 'Available')}</TableHead>
                                <TableHead className="text-right">{t('erp.inventory.table.totalStock', 'Total stock')}</TableHead>
                                <TableHead className="text-right">{t('erp.inventory.table.minimumStock', 'Minimum stock')}</TableHead>
                                <TableHead>{t('erp.inventory.table.expirationDate', 'Expiration date')}</TableHead>
                                <TableHead className="text-right">{t('erp.inventory.table.reorderPoint', 'Reorder pt.')}</TableHead>
                                <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                                {visibleCustomFieldColumns.map((fieldKey) => (
                                  <TableHead key={fieldKey}>
                                    {definitionByKey.get(fieldKey)?.name ?? fieldKey}
                                  </TableHead>
                                ))}
                                {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {group.rows.map((row) => {
                                const onHand = Number(row.quantity);
                                const resv = Number(row.reservedQty);
                                const avail =
                                  Number.isFinite(onHand) && Number.isFinite(resv) ? onHand - resv : NaN;
                                const expired = isExpiredDate(row.productExpirationDate);
                                return (
                                  <TableRow key={row.id} className="h-[58px]">
                                    <TableCell>
                                      <div className="flex items-center gap-3">
                                        {normalizeProductImages(row.productImages)[0] ? (
                                          <img
                                            src={resolveMediaUrl(normalizeProductImages(row.productImages)[0])}
                                            alt={t('erp.inventory.productImageAlt', 'Product image: {{name}}', { name: row.productName ?? '' })}
                                            className="h-9 w-9 shrink-0 rounded-md border object-cover"
                                          />
                                        ) : (
                                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                                            <Package className="h-4 w-4" />
                                          </span>
                                        )}
                                        <div className="min-w-0">
                                          <div className="truncate font-medium">{row.productName ?? '—'}</div>
                                          <div className="truncate font-mono text-[11px] text-muted-foreground">{row.productSku || '—'}</div>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell>{[row.variantName, row.variantSku].filter(Boolean).join(' · ') || '—'}</TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatQty(row.quantity, locale)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatQty(row.reservedQty, locale)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {Number.isFinite(avail) ? formatQty(String(avail), locale) : '—'}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {formatQty(row.productTotalStock, locale)}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {row.productMinStock != null ? formatQty(row.productMinStock, locale) : '—'}
                                    </TableCell>
                                    <TableCell>
                                      {expired ? (
                                        <Badge variant="destructive" className="rounded-md text-[11px]">{t('erp.inventory.status.expired', 'Expired')}</Badge>
                                      ) : row.productExpirationDate ? (
                                        formatDateOnly(row.productExpirationDate, locale)
                                      ) : (
                                        '—'
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right font-mono">
                                      {row.reorderPoint != null ? formatQty(row.reorderPoint, locale) : '—'}
                                    </TableCell>
                                    <TableCell>
                                      <div className="flex flex-wrap gap-1">
                                        {row.productLowStock && (
                                          <Badge variant="destructive" className="rounded-md text-[11px]">{t('erp.inventory.status.productLowStock', 'Product low stock')}</Badge>
                                        )}
                                        {row.belowReorderPoint && (
                                          <Badge variant="outline" className="rounded-md border-amber-500/20 bg-amber-500/10 text-[11px] text-amber-700 dark:text-amber-300">{t('erp.inventory.status.belowReorderPoint', 'Below reorder point')}</Badge>
                                        )}
                                        {!row.productLowStock && !row.belowReorderPoint && (
                                          <Badge className="rounded-md border border-emerald-500/20 bg-emerald-500/10 text-[11px] text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">{t('erp.inventory.status.inStock', 'In stock')}</Badge>
                                        )}
                                      </div>
                                    </TableCell>
                                    {visibleCustomFieldColumns.map((fieldKey) => (
                                      <TableCell key={fieldKey}>
                                        {formatCustomFieldValue(definitionByKey.get(fieldKey), row.productCustomFields?.[fieldKey])}
                                      </TableCell>
                                    ))}
                                    {canManage && (
                                      <TableCell className="text-right">
                                        <Button data-tour="pages-erp-inventory.button.erp.inventory.actions.editStock" variant="outline" size="icon" className="h-8 w-8" onClick={() => openSlEdit(row)} aria-label={t('erp.inventory.actions.editStock', 'Edit stock settings for {{name}}', { name: row.productName ?? '' })}>
                                          <Pencil className="h-3.5 w-3.5" />
                                        </Button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>

                {renderPagination({
                  page: slPage,
                  totalPages: slTotalPages,
                  total: slTotal,
                  rangeStart: slRangeStart,
                  rangeEnd: slRangeEnd,
                  limit: slLimit,
                  setPage: setSlPage,
                  setLimit: setSlLimit,
                })}
              </TabsContent>

              <TabsContent data-tour="pages-erp-inventory.tabscontent.movements" value="movements" className="space-y-4 mt-4">
                <Card className="shadow-sm">
                  <CardContent className="p-3 sm:p-4">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 xl:items-end">
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.inventory.filters.warehouse', 'Warehouse')}</Label>
                        <Select
                          value={mvWarehouse}
                          onValueChange={(v) => {
                            setMvWarehouse(v);
                            setMvPage(1);
                          }}
                        >
                          <SelectTrigger className="mt-1 h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('erp.common.all', 'All')}</SelectItem>
                            {warehouses.map((w) => (
                              <SelectItem key={w.id} value={String(w.id)}>
                                {w.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.inventory.filters.type', 'Type')}</Label>
                        <Select
                          value={mvType}
                          onValueChange={(v) => {
                            setMvType(v);
                            setMvPage(1);
                          }}
                        >
                          <SelectTrigger className="mt-1 h-10">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MOVEMENT_TYPES.map((movementType) => (
                              <SelectItem key={movementType} value={movementType}>
                                {movementType === 'all'
                                  ? t('erp.inventory.filters.allTypes', 'All types')
                                  : t(`erp.inventory.movementType.${movementType}`, movementType)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.fromDate', 'From date')}</Label>
                        <Input data-tour="pages-erp-inventory.input.erp.inventory.filters.warehouse" className="mt-1 h-10" type="date" value={mvDateFrom} onChange={(e) => { setMvDateFrom(e.target.value); setMvPage(1); }} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t('erp.common.toDate', 'To date')}</Label>
                        <Input data-tour="pages-erp-inventory.input.erp.inventory.filters.warehouse" className="mt-1 h-10" type="date" value={mvDateTo} onChange={(e) => { setMvDateTo(e.target.value); setMvPage(1); }} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardContent className="p-4 sm:p-5">
                    {mvLoading ? (
                      <div className="flex justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : movements.length === 0 ? (
                      <p className="text-center text-muted-foreground text-sm py-12">{t('erp.inventory.empty.movements', 'No movements yet')}</p>
                    ) : (
                      <ol className="relative ms-3 border-s border-border space-y-0 list-none pl-0">
                        {movements.map((m, idx) => {
                          const q = Number(m.quantity);
                          const sign = getMovementSign(m.movementType, q);
                          const displayQty = Number.isFinite(q)
                            ? formatQty(String(Math.abs(q)), locale)
                            : formatQty(m.quantity, locale);
                          const isLast = idx === movements.length - 1;
                          return (
                            <li key={m.id} className={`relative ms-6 ${isLast ? '' : 'pb-8'}`}>
                              <span
                                className={`absolute -start-[calc(1.5rem+5px)] top-1.5 flex h-2.5 w-2.5 rounded-full border border-background ${
                                  m.movementType === 'in'
                                    ? 'bg-emerald-500'
                                    : m.movementType === 'out'
                                      ? 'bg-red-500'
                                      : m.movementType === 'transfer'
                                        ? 'bg-blue-500'
                                        : m.movementType === 'count'
                                          ? 'bg-violet-500'
                                          : 'bg-amber-500'
                                }`}
                              />
                              <div className="space-y-2 rounded-lg border bg-muted/10 p-3 shadow-sm sm:p-4">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground tabular-nums">
                                      {m.createdAt ? new Date(m.createdAt).toLocaleString(locale) : '—'}
                                    </p>
                                    <p className="font-medium leading-snug">{m.productName ?? '—'}</p>
                                    <p className="text-xs text-muted-foreground font-mono">
                                      {[m.productSku, m.variantName, m.variantSku].filter(Boolean).join(' · ') || '—'}
                                    </p>
                                  </div>
                                  <div className="flex flex-col items-end gap-1 shrink-0">
                                    <Badge className={movementBadgeClass(m.movementType)} variant="outline">
                                      {t(`erp.inventory.movementType.${m.movementType}`, m.movementType)}
                                    </Badge>
                                    <span className="text-sm font-mono font-semibold tabular-nums">
                                      {sign}
                                      {displayQty}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  <span>
                                    <span className="text-foreground/80">{t('erp.inventory.movement.warehouse', 'Warehouse')}:</span> {m.warehouseName ?? '—'}
                                  </span>
                                  <span>
                                    <span className="text-foreground/80">{t('erp.inventory.movement.reference', 'Reference')}:</span>{' '}
                                    {m.referenceType ?? '—'}
                                    {m.referenceId != null ? ` #${m.referenceId}` : ''}
                                  </span>
                                  <span>
                                    <span className="text-foreground/80">{t('erp.inventory.movement.user', 'User')}:</span> {m.userLabel ?? '—'}
                                  </span>
                                </div>
                                {m.notes ? (
                                  <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">
                                    {m.notes}
                                  </p>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </CardContent>
                </Card>

                {renderPagination({
                  page: mvPage,
                  totalPages: mvTotalPages,
                  total: mvTotal,
                  rangeStart: mvRangeStart,
                  rangeEnd: mvRangeEnd,
                  limit: mvLimit,
                  setPage: setMvPage,
                  setLimit: setMvLimit,
                })}

                <Card className="overflow-hidden shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b bg-muted/20 px-4 py-3">
                    <CardTitle className="text-lg">{t('erp.inventory.transfers.title', 'Transfers')}</CardTitle>
                    {canManage && (
                      <Button data-tour="pages-erp-inventory.button.erp.inventory.transfers.newTransfer" size="sm" onClick={() => setTrDialogOpen(true)}>
                        <Plus className="me-2 h-4 w-4" />
                        {t('erp.inventory.transfers.newTransfer', 'New transfer')}
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0">
                    {trLoading ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <Table data-tour="pages-erp-inventory.table.erp.inventory.transfers.table.number" className="min-w-[760px]">
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead>{t('erp.inventory.transfers.table.number', 'Number')}</TableHead>
                            <TableHead>{t('erp.inventory.transfers.table.from', 'From')}</TableHead>
                            <TableHead>{t('erp.inventory.transfers.table.to', 'To')}</TableHead>
                            <TableHead>{t('erp.common.status', 'Status')}</TableHead>
                            {canManage && <TableHead className="text-right">{t('erp.common.actions', 'Actions')}</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transfers.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={canManage ? 5 : 4} className="text-center text-muted-foreground py-8">
                                {t('erp.inventory.transfers.empty', 'No transfers')}
                              </TableCell>
                            </TableRow>
                          ) : (
                            transfers.map((transfer) => (
                              <TableRow key={transfer.id} className="h-12">
                                <TableCell className="font-mono text-sm">{transfer.transferNumber ?? `#${transfer.id}`}</TableCell>
                                <TableCell>{transfer.fromWarehouseName ?? '—'}</TableCell>
                                <TableCell>{transfer.toWarehouseName ?? '—'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="rounded-md text-[11px]">
                                    {t(`erp.inventory.transferStatus.${transfer.status}`, transfer.status.replace(/_/g, ' '))}
                                  </Badge>
                                </TableCell>
                                {canManage && (
                                  <TableCell className="text-right space-x-1">
                                    {transfer.status === 'draft' && (
                                      <Button data-tour="pages-erp-inventory.button.erp.inventory.transfers.actions.inTransit" size="sm" variant="secondary" onClick={() => markTransitMutation.mutate(transfer.id)}>
                                        {t('erp.inventory.transfers.actions.inTransit', 'In transit')}
                                      </Button>
                                    )}
                                    {transfer.status === 'in_transit' && (
                                      <Button data-tour="pages-erp-inventory.button.erp.inventory.transfers.actions.complete" size="sm" onClick={() => completeTrMutation.mutate(transfer.id)}>
                                        {t('erp.inventory.transfers.actions.complete', 'Complete')}
                                      </Button>
                                    )}
                                    {(transfer.status === 'draft' || transfer.status === 'in_transit') && (
                                      <Button data-tour="pages-erp-inventory.button.ui.common.cancel" size="sm" variant="ghost" onClick={() => cancelTrMutation.mutate(transfer.id)}>
                                        {t('ui.common.cancel', 'Cancel')}
                                      </Button>
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
                {renderPagination({
                  page: trPage,
                  totalPages: trTotalPages,
                  total: trTotal,
                  rangeStart: trRangeStart,
                  rangeEnd: trRangeEnd,
                  limit: trLimit,
                  setPage: setTrPage,
                  setLimit: setTrLimit,
                })}
              </TabsContent>

              <TabsContent data-tour="pages-erp-inventory.tabscontent.warehouses" value="warehouses" className="space-y-4 mt-4">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {warehouses.map((w) => {
                    const addr = (w.address ?? {}) as Record<string, string>;
                    const addrLine = [addr.street, addr.city, addr.state, addr.zip, addr.country].filter(Boolean).join(', ');
                    return (
                      <Card key={w.id} className="shadow-sm">
                        <CardHeader className="pb-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="flex h-8 w-8 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                                <Warehouse className="h-4 w-4" />
                              </span>
                              <CardTitle className="text-base">{w.name}</CardTitle>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              {w.isDefault && <Badge>{t('erp.inventory.warehouses.default', 'Default')}</Badge>}
                              {w.isActive === false && <Badge variant="secondary">{t('erp.common.inactive', 'Inactive')}</Badge>}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span>{t('erp.inventory.warehouses.id', 'ID')}:</span>
                            <span className="font-mono">{w.id}</span>
                            <Button data-tour="pages-erp-inventory.button.erp.inventory.warehouses.copyId"
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => void copyWarehouseId(w.id)}
                              aria-label={t('erp.inventory.warehouses.copyId', 'Copy Warehouse ID')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-sm text-muted-foreground">{addrLine || t('erp.inventory.warehouses.noAddress', 'No address')}</p>
                          {w.notes && <p className="text-xs text-muted-foreground line-clamp-3">{w.notes}</p>}
                          {canManage && (
                            <div className="flex gap-2">
                              <Button data-tour="pages-erp-inventory.button.erp.common.edit" variant="outline" size="sm" onClick={() => openWhEdit(w)}>
                                <Pencil className="me-1 h-4 w-4" />
                                {t('erp.common.edit', 'Edit')}
                              </Button>
                              <Button data-tour="pages-erp-inventory.button.erp.inventory.warehouses.deleteLabel" variant="outline" size="icon" className="h-8 w-8 border-destructive/30" onClick={() => setWhDeleteTarget(w)} aria-label={t('erp.inventory.warehouses.deleteLabel', 'Delete warehouse {{name}}', { name: w.name })}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                  {warehouses.length === 0 && (
                    <p className="text-muted-foreground text-sm col-span-full">{t('erp.inventory.warehouses.empty', 'No warehouses yet.')}</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>

      <Dialog open={slEditOpen} onOpenChange={setSlEditOpen}>
        <DialogContent data-tour="pages-erp-inventory.dialogcontent.erp.inventory.reorder.title">
          <DialogHeader>
            <DialogTitle>{t('erp.inventory.reorder.title', 'Reorder settings')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>{t('erp.inventory.reorder.point', 'Reorder point')}</Label>
              <Input data-tour="pages-erp-inventory.input.erp.inventory.reorder.optional" value={slReorderPoint} onChange={(e) => setSlReorderPoint(e.target.value)} placeholder={t('erp.inventory.reorder.optional', 'Optional')} />
            </div>
            <div>
              <Label>{t('erp.inventory.reorder.quantity', 'Suggested reorder qty')}</Label>
              <Input data-tour="pages-erp-inventory.input.erp.inventory.reorder.optional" value={slReorderQty} onChange={(e) => setSlReorderQty(e.target.value)} placeholder={t('erp.inventory.reorder.optional', 'Optional')} />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-inventory.button.ui.common.cancel" variant="outline" onClick={() => setSlEditOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-inventory.button.ui.common.save" onClick={() => updateSlMutation.mutate()} disabled={updateSlMutation.isPending}>
              {updateSlMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('ui.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent data-tour="pages-erp-inventory.dialogcontent.erp.inventory.adjustment.title" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('erp.inventory.adjustment.title', 'Record stock adjustment')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t('erp.common.product', 'Product')}</Label>
              <Select value={adjProductId} onValueChange={(v) => { setAdjProductId(v); setAdjVariantId(''); }}>
                <SelectTrigger data-tour="pages-erp-inventory.selecttrigger.erp.inventory.adjustment.selectProduct">
                  <SelectValue placeholder={t('erp.inventory.adjustment.selectProduct', 'Select product')} />
                </SelectTrigger>
                <SelectContent searchable>
                  {productsList.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {adjProductId && (
              <div>
                <Label>{t('erp.inventory.adjustment.variant', 'Variant')}</Label>
                <VariantPicker
                  productId={adjProductId ? parseInt(adjProductId, 10) : null}
                  value={adjVariantId}
                  onChange={setAdjVariantId}
                  includeBaseOption={adjVariants.length === 0}
                  placeholder={t('erp.inventory.adjustment.selectVariant', 'Select variant')}
                />
              </div>
            )}
            <div>
              <Label>{t('erp.inventory.filters.warehouse', 'Warehouse')}</Label>
              <Select value={adjWarehouseId} onValueChange={setAdjWarehouseId}>
                <SelectTrigger data-tour="pages-erp-inventory.selecttrigger.erp.inventory.adjustment.selectWarehouse">
                  <SelectValue placeholder={t('erp.inventory.adjustment.selectWarehouse', 'Select warehouse')} />
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
            <div>
              <Label>{t('erp.inventory.adjustment.quantityChange', 'Quantity change (+ / -)')}</Label>
              <Input data-tour="pages-erp-inventory.input.erp.inventory.adjustment.quantityExample" value={adjQty} onChange={(e) => setAdjQty(e.target.value)} placeholder={t('erp.inventory.adjustment.quantityExample', 'e.g. 10 or -2')} />
            </div>
            <div>
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Textarea data-tour="pages-erp-inventory.textarea.erp.common.product" value={adjNotes} onChange={(e) => setAdjNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-inventory.button.ui.common.cancel" variant="outline" onClick={() => setAdjOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-inventory.button.erp.common.save" onClick={submitAdjustment} disabled={adjustmentMutation.isPending}>
              {adjustmentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={whDialogOpen} onOpenChange={setWhDialogOpen}>
        <DialogContent data-tour="pages-erp-inventory.dialogcontent.erp.inventory.warehouses.editWarehouse" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {whEditing
                ? t('erp.inventory.warehouses.editWarehouse', 'Edit warehouse')
                : t('erp.inventory.warehouses.newWarehouse', 'New warehouse')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            {whEditing && (
              <div className="flex items-center justify-between gap-2">
                <Label>{t('erp.inventory.warehouses.id', 'Warehouse ID')}</Label>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm">{whEditing.id}</span>
                  <Button data-tour="pages-erp-inventory.button.erp.inventory.warehouses.copyId"
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => void copyWarehouseId(whEditing.id)}
                    aria-label={t('erp.inventory.warehouses.copyId', 'Copy Warehouse ID')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div>
              <Label>{t('erp.common.name', 'Name')}</Label>
              <Input data-tour="pages-erp-inventory.input.erp.inventory.warehouses.id" value={whName} onChange={(e) => setWhName(e.target.value)} />
            </div>
            <div>
              <Label>{t('erp.common.street', 'Street')}</Label>
              <Input data-tour="pages-erp-inventory.input.erp.inventory.warehouses.id" value={whStreet} onChange={(e) => setWhStreet(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.common.city', 'City')}</Label>
                <Input data-tour="pages-erp-inventory.input.erp.common.city" value={whCity} onChange={(e) => setWhCity(e.target.value)} />
              </div>
              <div>
                <Label>{t('erp.common.state', 'State')}</Label>
                <Input data-tour="pages-erp-inventory.input.erp.common.city" value={whState} onChange={(e) => setWhState(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.common.zip', 'ZIP')}</Label>
                <Input data-tour="pages-erp-inventory.input.erp.common.zip" value={whZip} onChange={(e) => setWhZip(e.target.value)} />
              </div>
              <div>
                <Label>{t('erp.common.country', 'Country')}</Label>
                <Input data-tour="pages-erp-inventory.input.erp.common.zip" value={whCountry} onChange={(e) => setWhCountry(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="wh-def" checked={whIsDefault} onCheckedChange={(c) => setWhIsDefault(c === true)} />
              <Label htmlFor="wh-def">{t('erp.inventory.warehouses.defaultWarehouse', 'Default warehouse')}</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="wh-act" checked={whIsActive} onCheckedChange={(c) => setWhIsActive(c === true)} />
              <Label htmlFor="wh-act">{t('erp.common.active', 'Active')}</Label>
            </div>
            <div>
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Textarea data-tour="pages-erp-inventory.textarea.erp.inventory.warehouses.id" value={whNotes} onChange={(e) => setWhNotes(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-inventory.button.ui.common.cancel" variant="outline" onClick={() => setWhDialogOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-inventory.button.erp.common.save" onClick={submitWh} disabled={createWhMutation.isPending || updateWhMutation.isPending}>
              {(createWhMutation.isPending || updateWhMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={trDialogOpen} onOpenChange={setTrDialogOpen}>
        <DialogContent data-tour="pages-erp-inventory.dialogcontent.erp.inventory.transfers.newStockTransfer" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('erp.inventory.transfers.newStockTransfer', 'New stock transfer')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>{t('erp.inventory.transfers.table.from', 'From')}</Label>
                <Select value={trFromId} onValueChange={setTrFromId}>
                  <SelectTrigger data-tour="pages-erp-inventory.selecttrigger.erp.inventory.filters.warehouse">
                    <SelectValue placeholder={t('erp.inventory.filters.warehouse', 'Warehouse')} />
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
              <div>
                <Label>{t('erp.inventory.transfers.table.to', 'To')}</Label>
                <Select value={trToId} onValueChange={setTrToId}>
                  <SelectTrigger data-tour="pages-erp-inventory.selecttrigger.erp.inventory.filters.warehouse">
                    <SelectValue placeholder={t('erp.inventory.filters.warehouse', 'Warehouse')} />
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
            </div>
            <div>
              <Label>{t('erp.common.notes', 'Notes')}</Label>
              <Textarea data-tour="pages-erp-inventory.textarea.erp.inventory.transfers.table.from" value={trNotes} onChange={(e) => setTrNotes(e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>{t('erp.inventory.transfers.lineItems', 'Line items')}</Label>
              {trItems.map((line, idx) => (
                <div key={idx} className="flex flex-col gap-2 border rounded-md p-2">
                  <Select value={line.productId} onValueChange={(v) => {
                    const next = [...trItems];
                    next[idx] = { ...next[idx], productId: v, variantId: '' };
                    setTrItems(next);
                    loadTransferProductVariants(v).catch(() => {});
                  }}>
                    <SelectTrigger data-tour="pages-erp-inventory.selecttrigger.erp.common.product">
                      <SelectValue placeholder={t('erp.common.product', 'Product')} />
                    </SelectTrigger>
                    <SelectContent searchable>
                      {productsList.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <VariantPicker
                    productId={line.productId ? parseInt(line.productId, 10) : null}
                    value={line.variantId}
                    onChange={(variantId) => {
                      const next = [...trItems];
                      next[idx] = { ...next[idx], variantId };
                      setTrItems(next);
                    }}
                    includeBaseOption={(trVariantsByProduct[line.productId] ?? []).length === 0}
                    placeholder={t('erp.inventory.adjustment.selectVariant', 'Select variant')}
                  />
                  <Input data-tour="pages-erp-inventory.input.erp.common.quantity"
                    placeholder={t('erp.common.quantity', 'Quantity')}
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...trItems];
                      next[idx] = { ...next[idx], quantity: e.target.value };
                      setTrItems(next);
                    }}
                  />
                </div>
              ))}
              <Button data-tour="pages-erp-inventory.button.erp.inventory.transfers.addLine"
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTrItems([...trItems, { productId: '', variantId: '', quantity: '', notes: '' }])}
              >
                {t('erp.inventory.transfers.addLine', 'Add line')}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-inventory.button.ui.common.cancel" variant="outline" onClick={() => setTrDialogOpen(false)}>
              {t('ui.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-inventory.button.erp.common.create" onClick={submitTransfer} disabled={createTrMutation.isPending}>
              {createTrMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('erp.common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InventoryImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        warehouses={warehouses}
        onImportSuccess={invalidateInventory}
      />

      <AlertDialog open={!!whDeleteTarget} onOpenChange={(o) => !o && setWhDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.inventory.warehouses.deleteTitle', 'Delete warehouse?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('erp.inventory.warehouses.deleteDescription', 'This cannot be undone. Deletes are blocked if the warehouse still holds stock.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('ui.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => whDeleteTarget && deleteWhMutation.mutate(whDeleteTarget)}>
              {t('ui.common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

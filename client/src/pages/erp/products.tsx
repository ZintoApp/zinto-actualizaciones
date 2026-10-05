import { ErpCustomFieldsEditor } from '@/components/erp/ErpCustomFieldsEditor';
import { useQuickAction } from '@/hooks/use-quick-action';
import Header from '@/components/layout/Header';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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
import { ImageUploadDialog } from '@/components/ui/image-upload-dialog';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { Columns3, Download, Image as ImageIcon, Loader2, Plus, Search, Pencil, Trash2, Upload, X, Copy } from 'lucide-react';
import ProductImportDialog from '@/components/erp/ProductImportDialog';
import { useTranslation } from '@/hooks/use-translation';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useErpCurrencies } from '@/hooks/use-erp-currencies';
import { ExportFormatMenu } from '@/components/ui/export-format-menu';
import { downloadExportResponse, type DownloadExportFormat } from '@/lib/download-export';
import {
  normalizeComboItems,
  normalizeModifierGroups,
  normalizeRecipeIngredients,
  RestaurantStructuredFieldsEditor,
  serializeComboItems,
  serializeModifierGroups,
  serializeRecipeIngredients,
  type ComboItemModel,
  type ModifierGroupModel,
  type RecipeIngredientModel,
  validateRestaurantStructuredFields,
} from '@/components/erp/restaurant-product-structured-editors';
import { ColombiaProductFiscalFields } from '@/components/erp/ColombiaFiscalProfileFields';
import type { ColombiaProductFiscalProfile } from '@shared/factus';

/** Map stable server validation identifiers from ERP product routes to localized text. */
function formatErpProductSaveApiError(
  rawMessage: string,
  t: (key: string, fallback?: string) => string
): string {
  if (rawMessage.includes('erp.products.duration.validationWholeNumber')) {
    return t(
      'erp.products.duration.validationWholeNumber',
      'Estimated service duration must be a whole number of minutes.'
    );
  }
  if (rawMessage.includes('erp.products.duration.validationPositive')) {
    return t(
      'erp.products.duration.validationPositive',
      'Estimated service duration must be greater than 0.'
    );
  }
  return rawMessage;
}

type ProductRow = {
  id: number;
  companyId: number;
  categoryId: number | null;
  brandId: number | null;
  unitId: number | null;
  sku: string | null;
  name: string;
  description: string | null;
  type: string;
  unitPrice: string | null;
  costPrice: string | null;
  currency: string | null;
  estimatedDurationMinutes: number | null;
  unitOfMeasure: string | null;
  barcode: string | null;
  status: string;
  tags: string[] | null;
  images: string[] | null;
  isTaxable: boolean | null;
  isMenuItem: boolean | null;
  preparationTimeMinutes: number | null;
  kitchenStationId: number | null;
  modifiers: unknown[] | null;
  comboItems: unknown[] | null;
  recipeIngredients: unknown[] | null;
  minStock: string | null;
  expirationDate: string | null;
  customFields: Record<string, unknown> | null;
  colombiaFiscalProfile: ColombiaProductFiscalProfile | null;
  totalStock: string | null;
  lowStock: boolean;
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

function defaultCustomFieldValue(def: CustomFieldDefinition): unknown {
  if (def.fieldType === 'checkbox') return def.defaultValue === 'true';
  if (def.fieldType === 'number') return def.defaultValue ?? '';
  return def.defaultValue ?? '';
}

function buildDefaultCustomFields(defs: CustomFieldDefinition[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const def of defs) {
    result[def.fieldKey] = defaultCustomFieldValue(def);
  }
  return result;
}

type CategoryRow = {
  id: number;
  name: string;
  isMenuCategory: boolean | null;
  menuSortOrder: number | null;
};

type KitchenStationRow = {
  id: number;
  name: string;
  code: string;
};
type BrandRow = { id: number; name: string };
type UnitRow = { id: number; name: string; symbol: string | null };
type TagMasterRow = { id: number; name: string; color: string | null };

type ProductVariantRow = {
  id: number;
  productId: number;
  companyId: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  unitPrice: string | null;
  costPrice: string | null;
  status: string | null;
  sortOrder: number | null;
  attributes: Record<string, unknown> | null;
};

type StockLevelRow = {
  id: number;
  warehouseId: number;
  warehouseName: string | null;
  productId: number;
  variantId: number | null;
  quantity: string;
  reorderPoint: string | null;
  reorderQty: string | null;
};

type WarehouseRow = {
  id: number;
  name: string;
  isActive: boolean | null;
};

const STATUS_OPTIONS = ['all', 'active', 'inactive', 'draft', 'archived'] as const;
const TYPE_OPTIONS = ['all', 'physical', 'service', 'digital'] as const;

function getTypeTranslationKey(type: string): string {
  return `erp.common.${String(type).toLowerCase()}`;
}

function getStatusTranslationKey(status: string): string {
  return `erp.common.${String(status).toLowerCase()}`;
}

function parseServiceDurationMinutes(type: string, value: string): number | null {
  if (type !== 'service') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const duration = Number(trimmed);
  return Number.isInteger(duration) && duration > 0 ? duration : null;
}

function normalizeProductImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images.filter((image): image is string => typeof image === 'string' && image.trim().length > 0);
}

function getVariantAttributePairs(attributes: Record<string, unknown> | null | undefined): Array<{ key: string; value: string }> {
  const entries = Object.entries(attributes ?? {})
    .filter(([key]) => key.trim().length > 0)
    .map(([key, value]) => ({ key, value: typeof value === 'string' ? value : String(value ?? '') }));
  return entries.length > 0 ? entries : [{ key: '', value: '' }];
}

function toVariantAttributesObject(pairs: Array<{ key: string; value: string }>): Record<string, string> {
  return pairs.reduce<Record<string, string>>((acc, pair) => {
    const key = pair.key.trim();
    if (!key) return acc;
    acc[key] = pair.value.trim();
    return acc;
  }, {});
}

/** Derive a company-unique SKU code from a display name (uppercase, hyphen-separated). */
function generateSkuFromName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function isAutoGeneratedSku(name: string, sku: string | null | undefined): boolean {
  const normalizedSku = (sku ?? '').trim();
  if (!normalizedSku) return true;
  const generated = generateSkuFromName(name);
  if (normalizedSku === generated) return true;
  // Legacy: SKU was a direct copy of the name before formatting was applied.
  return normalizedSku === name.trim();
}

function getTagTextColor(background: string | null | undefined): string {
  if (!background) return '#111827';
  const normalized = background.trim();
  const hex = normalized.startsWith('#') ? normalized.slice(1) : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#111827';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#f9fafb';
}

export default function ERPProductsPage() {
  const { user } = useAuth();
  const companyId = user?.companyId;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, PERMISSIONS } = usePermissions();
  const { t } = useTranslation();
  const { isRestaurant } = useErpBusinessType();
  const {
    currencies,
    availableCurrencyCodes,
    baseCurrencyCode,
    isLoading: currenciesLoading,
  } = useErpCurrencies();
  const canManage = hasPermission(PERMISSIONS.MANAGE_PRODUCTS);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [menuItemsOnly, setMenuItemsOnly] = useState(false);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [visibleCustomFieldColumns, setVisibleCustomFieldColumns] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [identifiersExporting, setIdentifiersExporting] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);

  const [formName, setFormName] = useState('');
  const [formSku, setFormSku] = useState('');
  const [skuTouched, setSkuTouched] = useState(false);
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState('physical');
  const [formCategoryId, setFormCategoryId] = useState<string>('');
  const [formBrandId, setFormBrandId] = useState<string>('');
  const [formUnitId, setFormUnitId] = useState<string>('');
  const [formUnitPrice, setFormUnitPrice] = useState('');
  const [formCostPrice, setFormCostPrice] = useState('');
  const [formCurrency, setFormCurrency] = useState('');
  const [formEstimatedDurationMinutes, setFormEstimatedDurationMinutes] = useState('');
  const [formUnitOfMeasure, setFormUnitOfMeasure] = useState('unit');
  const [formBarcode, setFormBarcode] = useState('');
  const [formStatus, setFormStatus] = useState('draft');
  const [formTags, setFormTags] = useState('');
  const [selectedManagedTags, setSelectedManagedTags] = useState<string[]>([]);
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formIsTaxable, setFormIsTaxable] = useState(true);
  const [formMinStock, setFormMinStock] = useState('');
  const [formExpirationDate, setFormExpirationDate] = useState('');
  const [formCustomFields, setFormCustomFields] = useState<Record<string, unknown>>({});
  const [formColombiaFiscalProfile, setFormColombiaFiscalProfile] = useState<ColombiaProductFiscalProfile>({
    unitMeasureCode: '94',
    standardCode: '999',
    taxCode: '01',
    isExcluded: false,
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIsMenuCategory, setNewCategoryIsMenuCategory] = useState(false);
  const [newCategoryMenuSortOrder, setNewCategoryMenuSortOrder] = useState('0');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [formIsMenuItem, setFormIsMenuItem] = useState(false);
  const [formPreparationTimeMinutes, setFormPreparationTimeMinutes] = useState('');
  const [formKitchenStationId, setFormKitchenStationId] = useState('');
  const [formModifiers, setFormModifiers] = useState<ModifierGroupModel[]>([]);
  const [formComboItems, setFormComboItems] = useState<ComboItemModel[]>([]);
  const [formRecipeIngredients, setFormRecipeIngredients] = useState<RecipeIngredientModel[]>([]);
  const [variantsDraft, setVariantsDraft] = useState<ProductVariantRow[]>([]);
  const [variantAdjustmentQty, setVariantAdjustmentQty] = useState<Record<string, string>>({});
  const [variantInitWarehouseByVariantId, setVariantInitWarehouseByVariantId] = useState<Record<number, string>>({});

  const filtersKey = useMemo(
    () => ({
      searchTerm,
      statusFilter,
      categoryFilter,
      typeFilter,
      menuItemsOnly,
      lowStockOnly,
      page,
      limit,
    }),
    [searchTerm, statusFilter, categoryFilter, typeFilter, menuItemsOnly, lowStockOnly, page, limit]
  );

  useEffect(() => {
    if (currenciesLoading || formCurrency) return;
    setFormCurrency(baseCurrencyCode);
  }, [currenciesLoading, baseCurrencyCode, formCurrency]);

  const { data: categories = [] } = useQuery({
    queryKey: ['/api/erp/products/categories', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/products/categories');
      const json = await res.json();
      return (json.data ?? []) as CategoryRow[];
    },
    enabled: !!companyId,
  });

  const { data: listResult, isLoading } = useQuery({
    queryKey: ['/api/erp/products', companyId, filtersKey],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (categoryFilter !== 'all') params.set('categoryId', categoryFilter);
      if (isRestaurant && menuItemsOnly) params.set('isMenuItem', 'true');
      if (lowStockOnly) params.set('lowStock', 'true');
      params.set('limit', String(limit));
      params.set('offset', String((page - 1) * limit));
      const res = await apiRequest('GET', `/api/erp/products?${params.toString()}`);
      const json = await res.json();
      return json.data as { data: ProductRow[]; total: number };
    },
    enabled: !!companyId,
  });

  const { data: customFieldDefinitions = [], isLoading: customFieldsLoading, error: customFieldsError } = useQuery({
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

  const emptyTableColSpan =
    (canManage ? (isRestaurant ? 9 : 8) : isRestaurant ? 8 : 7) + visibleCustomFieldColumns.length;

  const { data: kitchenStations = [] } = useQuery({
    queryKey: ['/api/erp/restaurant/layout/kitchen-stations', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/layout/kitchen-stations');
      const json = await res.json();
      return (json.data ?? []) as KitchenStationRow[];
    },
    enabled: !!companyId && isRestaurant,
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['/api/erp/products/brands', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/products/brands');
      const json = await res.json();
      return (json.data ?? []) as BrandRow[];
    },
    enabled: !!companyId,
  });
  const { data: units = [] } = useQuery({
    queryKey: ['/api/erp/products/units', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/products/units');
      const json = await res.json();
      return (json.data ?? []) as UnitRow[];
    },
    enabled: !!companyId,
  });
  const { data: tagMasters = [] } = useQuery({
    queryKey: ['/api/erp/products/tags', companyId],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/products/tags');
      const json = await res.json();
      return (json.data ?? []) as TagMasterRow[];
    },
    enabled: !!companyId,
  });

  const { data: editingVariants = [] } = useQuery({
    queryKey: ['/api/erp/products', editing?.id, 'variants', 'dialog'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/products/${editing?.id}/variants`);
      const json = await res.json();
      return (json.data ?? []) as ProductVariantRow[];
    },
    enabled: !!editing?.id && dialogOpen,
  });

  const { data: variantStockLevels = [] } = useQuery({
    queryKey: ['/api/erp/inventory/stock-levels', editing?.id, 'product-dialog'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/erp/inventory/stock-levels?productId=${editing?.id}&limit=500&offset=0`);
      const json = await res.json();
      return (json.data?.data ?? []) as StockLevelRow[];
    },
    enabled: !!editing?.id && dialogOpen,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['/api/erp/inventory/warehouses', editing?.id, 'product-dialog'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/inventory/warehouses');
      const json = await res.json();
      return (json.data ?? []) as WarehouseRow[];
    },
    enabled: !!editing?.id && dialogOpen,
  });

  const products = listResult?.data ?? [];
  const total = listResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const categoryNameById = useMemo(() => {
    const m = new Map<number, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  const resetForm = () => {
    setFormName('');
    setFormSku('');
    setSkuTouched(false);
    setFormDescription('');
    setFormType('physical');
    setFormCategoryId('');
    setFormBrandId('');
    setFormUnitId('');
    setFormUnitPrice('');
    setFormCostPrice('');
    setFormCurrency(baseCurrencyCode);
    setFormEstimatedDurationMinutes('');
    setFormUnitOfMeasure('unit');
    setFormBarcode('');
    setFormStatus('draft');
    setFormTags('');
    setSelectedManagedTags([]);
    setFormImages([]);
    setFormIsTaxable(true);
    setFormMinStock('');
    setFormExpirationDate('');
    setFormCustomFields(buildDefaultCustomFields(activeDefinitions));
    setFormColombiaFiscalProfile({ unitMeasureCode: '94', standardCode: '999', taxCode: '01', isExcluded: false });
    setFormIsMenuItem(false);
    setFormPreparationTimeMinutes('');
    setFormKitchenStationId('');
    setFormModifiers([]);
    setFormComboItems([]);
    setFormRecipeIngredients([]);
  };

  const openCreate = () => {
    setEditing(null);
    resetForm();
    setVariantsDraft([]);
    setVariantAdjustmentQty({});
    setDialogOpen(true);
  };

  const copyProductId = async (id: number) => {
    try {
      await navigator.clipboard.writeText(String(id));
      toast({
        title: t('erp.products.idCopied', 'Product ID copied'),
        description: String(id),
      });
    } catch {
      toast({
        title: t('common.error', 'Error'),
        description: t('erp.products.idCopyFailed', 'Failed to copy Product ID'),
        variant: 'destructive',
      });
    }
  };

  const exportProductIdentifiers = async (format: DownloadExportFormat) => {
    setIdentifiersExporting(true);
    try {
      const response = await apiRequest('GET', `/api/erp/products/export/identifiers?format=${format}`);
      await downloadExportResponse(response, 'product-identifiers', format);
      toast({
        title: t('erp.products.identifiersExported', 'Product identifiers exported'),
      });
    } catch (err) {
      toast({
        title: t('common.error', 'Error'),
        description:
          err instanceof Error
            ? err.message
            : t('erp.products.identifiersExportFailed', 'Failed to export product identifiers'),
        variant: 'destructive',
      });
    } finally {
      setIdentifiersExporting(false);
    }
  };

  const openEdit = (p: ProductRow) => {
    setEditing(p);
    setFormName(p.name);
    setFormSku(p.sku ?? '');
    setSkuTouched(!isAutoGeneratedSku(p.name, p.sku));
    setFormDescription(p.description ?? '');
    setFormType(p.type);
    setFormCategoryId(p.categoryId != null ? String(p.categoryId) : '');
    setFormBrandId(p.brandId != null ? String(p.brandId) : '');
    setFormUnitId(p.unitId != null ? String(p.unitId) : '');
    setFormUnitPrice(p.unitPrice ?? '');
    setFormCostPrice(p.costPrice ?? '');
    setFormCurrency(p.currency?.trim().toUpperCase() || baseCurrencyCode);
    setFormEstimatedDurationMinutes(p.estimatedDurationMinutes != null ? String(p.estimatedDurationMinutes) : '');
    setFormUnitOfMeasure(p.unitOfMeasure ?? 'unit');
    setFormBarcode(p.barcode ?? '');
    setFormStatus(p.status);
    setFormTags((p.tags ?? []).join(', '));
    setSelectedManagedTags((p.tags ?? []).filter((tag) => tagMasters.some((master) => master.name === tag)));
    setFormImages(normalizeProductImages(p.images));
    setFormIsTaxable(p.isTaxable !== false);
    setFormMinStock(p.minStock ?? '');
    setFormExpirationDate(p.expirationDate ? p.expirationDate.slice(0, 10) : '');
    setFormColombiaFiscalProfile(p.colombiaFiscalProfile ?? {
      unitMeasureCode: '94',
      standardCode: '999',
      taxCode: '01',
      isExcluded: false,
    });
    {
      const defaults = buildDefaultCustomFields(activeDefinitions);
      const existing = p.customFields ?? {};
      const merged: Record<string, unknown> = {};
      for (const def of activeDefinitions) {
        merged[def.fieldKey] =
          existing[def.fieldKey] !== undefined ? existing[def.fieldKey] : defaults[def.fieldKey];
      }
      setFormCustomFields(merged);
    }
    setFormIsMenuItem(p.isMenuItem === true);
    setFormPreparationTimeMinutes(p.preparationTimeMinutes != null ? String(p.preparationTimeMinutes) : '');
    setFormKitchenStationId(p.kitchenStationId != null ? String(p.kitchenStationId) : '');
    setFormModifiers(normalizeModifierGroups(Array.isArray(p.modifiers) ? p.modifiers : []));
    setFormComboItems(normalizeComboItems(Array.isArray(p.comboItems) ? p.comboItems : []));
    setFormRecipeIngredients(normalizeRecipeIngredients(Array.isArray(p.recipeIngredients) ? p.recipeIngredients : []));
    setVariantsDraft([]);
    setVariantAdjustmentQty({});
    setDialogOpen(true);
  };

  const activeVariants = editing ? (variantsDraft.length ? variantsDraft : editingVariants) : [];
  const activeWarehouses = useMemo(
    () => warehouses.filter((warehouse) => warehouse.isActive !== false),
    [warehouses]
  );

  // Apply custom-field defaults once definitions load if create dialog opened early
  useEffect(() => {
    if (!dialogOpen || editing) return;
    if (activeDefinitions.length === 0) return;
    setFormCustomFields((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const def of activeDefinitions) {
        if (next[def.fieldKey] === undefined) {
          next[def.fieldKey] = defaultCustomFieldValue(def);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dialogOpen, editing, activeDefinitions]);

  const buildPayload = () => {
    const manualTags = formTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = [...new Set([...selectedManagedTags, ...manualTags])];
    const customFields: Record<string, unknown> = {};
    for (const def of activeDefinitions) {
      const raw = formCustomFields[def.fieldKey];
      if (def.fieldType === 'checkbox') {
        customFields[def.fieldKey] = Boolean(raw);
        continue;
      }
      if (def.fieldType === 'number') {
        const s = String(raw ?? '').trim();
        if (s === '') {
          customFields[def.fieldKey] = null;
          continue;
        }
        customFields[def.fieldKey] = Number(s);
        continue;
      }
      const s = String(raw ?? '').trim();
      if (s === '') {
        customFields[def.fieldKey] = null;
        continue;
      }
      customFields[def.fieldKey] = s;
    }
    const basePayload = {
      name: formName,
      sku: formSku.trim() || undefined,
      description: formDescription || undefined,
      type: formType,
      categoryId: formCategoryId ? parseInt(formCategoryId, 10) : null,
      brandId: formBrandId ? parseInt(formBrandId, 10) : null,
      unitId: formUnitId ? parseInt(formUnitId, 10) : null,
      unitPrice: formUnitPrice.trim() || null,
      costPrice: formCostPrice.trim() || null,
      currency: formCurrency || baseCurrencyCode || 'USD',
      estimatedDurationMinutes: parseServiceDurationMinutes(formType, formEstimatedDurationMinutes),
      unitOfMeasure: formUnitOfMeasure || units.find((u) => String(u.id) === formUnitId)?.name || 'unit',
      barcode: formBarcode.trim() || undefined,
      status: formStatus,
      tags: tags.length ? tags : undefined,
      images: formImages,
      isTaxable: formIsTaxable,
      minStock: formType === 'physical' ? formMinStock.trim() || null : null,
      expirationDate: formExpirationDate.trim() || null,
      customFields,
      colombiaFiscalProfile: formColombiaFiscalProfile,
    };
    if (!isRestaurant) return basePayload;
    return {
      ...basePayload,
      isMenuItem: formIsMenuItem,
      preparationTimeMinutes: formPreparationTimeMinutes.trim() ? parseInt(formPreparationTimeMinutes, 10) : null,
      kitchenStationId: formKitchenStationId ? parseInt(formKitchenStationId, 10) : null,
      modifiers: serializeModifierGroups(formModifiers),
      comboItems: serializeComboItems(formComboItems),
      recipeIngredients: serializeRecipeIngredients(formRecipeIngredients),
    };
  };

  const handleImageInsert = (imageUrl: string) => {
    setFormImages((images) => (images.includes(imageUrl) ? images : [...images, imageUrl]));
  };

  const removeFormImage = (imageUrl: string) => {
    setFormImages((images) => images.filter((image) => image !== imageUrl));
  };

  const invalidateProducts = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/erp/products'] });
    if (editing?.id) {
      queryClient.invalidateQueries({ queryKey: ['/api/erp/products', editing.id, 'variants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/stock-levels'] });
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/products', buildPayload());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.products.toast.created', 'Product created') });
      setDialogOpen(false);
      invalidateProducts();
    },
    onError: (e: Error) => {
      toast({
        title: t('erp.common.error', 'Error'),
        description: formatErpProductSaveApiError(e.message, t),
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error('No product');
      const res = await apiRequest('PUT', `/api/erp/products/${editing.id}`, buildPayload());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.products.toast.updated', 'Product updated') });
      setDialogOpen(false);
      invalidateProducts();
    },
    onError: (e: Error) => {
      toast({
        title: t('erp.common.error', 'Error'),
        description: formatErpProductSaveApiError(e.message, t),
        variant: 'destructive',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (p: ProductRow) => {
      await apiRequest('DELETE', `/api/erp/products/${p.id}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.products.toast.deleted', 'Product deleted') });
      setDeleteTarget(null);
      invalidateProducts();
    },
    onError: (e: Error) => {
      toast({ title: t('erp.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const saveVariantMutation = useMutation({
    mutationFn: async (variant: ProductVariantRow) => {
      if (!editing) throw new Error('No product');
      const payload = {
        name: variant.name,
        sku: variant.sku?.trim() ? variant.sku.trim() : null,
        barcode: variant.barcode?.trim() ? variant.barcode.trim() : null,
        unitPrice: variant.unitPrice?.trim() ? variant.unitPrice.trim() : null,
        costPrice: variant.costPrice?.trim() ? variant.costPrice.trim() : null,
        status: variant.status || 'active',
        sortOrder: variant.sortOrder ?? 0,
        attributes: variant.attributes ?? {},
      };
      if (variant.id > 0) {
        const res = await apiRequest('PUT', `/api/erp/products/${editing.id}/variants/${variant.id}`, payload);
        return res.json();
      }
      const res = await apiRequest('POST', `/api/erp/products/${editing.id}/variants`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.products.variant.saved', 'Variant saved') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/products', editing?.id, 'variants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/stock-levels'] });
      setVariantInitWarehouseByVariantId({});
      setVariantsDraft([]);
    },
    onError: (e: Error) => {
      toast({ title: t('erp.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const deleteVariantMutation = useMutation({
    mutationFn: async (variantId: number) => {
      if (!editing) throw new Error('No product');
      await apiRequest('DELETE', `/api/erp/products/${editing.id}/variants/${variantId}`);
    },
    onSuccess: () => {
      toast({ title: t('erp.products.variant.deleted', 'Variant deleted') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/products', editing?.id, 'variants'] });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/stock-levels'] });
      setVariantsDraft([]);
    },
    onError: (e: Error) => {
      toast({ title: t('erp.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const adjustVariantStockMutation = useMutation({
    mutationFn: async (params: { variantId: number; quantity: string; warehouseId: number }) => {
      if (!editing) throw new Error('No product');
      const res = await apiRequest('POST', '/api/erp/inventory/stock-adjustments', {
        productId: editing.id,
        variantId: params.variantId,
        warehouseId: params.warehouseId,
        quantity: params.quantity,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t('erp.inventory.adjustment.recorded', 'Stock adjusted') });
      queryClient.invalidateQueries({ queryKey: ['/api/erp/inventory/stock-levels'] });
    },
    onError: (e: Error) => {
      toast({ title: t('erp.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/erp/products/categories', {
        name: newCategoryName.trim(),
        isMenuCategory: isRestaurant ? newCategoryIsMenuCategory : undefined,
        menuSortOrder: isRestaurant ? Number(newCategoryMenuSortOrder || '0') : undefined,
      });
      const json = await res.json();
      return json.data as CategoryRow;
    },
    onSuccess: (category) => {
      toast({ title: t('erp.products.toast.categoryCreated', 'Category created') });
      setFormCategoryId(String(category.id));
      setNewCategoryName('');
      setNewCategoryIsMenuCategory(false);
      setNewCategoryMenuSortOrder('0');
      setEditingCategoryId(null);
      setCategoryDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/products/categories'] });
    },
    onError: (e: Error) => {
      toast({ title: t('erp.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const submitCategory = () => {
    if (!newCategoryName.trim()) {
      toast({ title: t('erp.products.category.nameRequired', 'Category name is required'), variant: 'destructive' });
      return;
    }
    if (editingCategoryId != null) {
      updateCategoryMutation.mutate();
      return;
    }
    createCategoryMutation.mutate();
  };

  const updateCategoryMutation = useMutation({
    mutationFn: async () => {
      if (editingCategoryId == null) throw new Error('No category selected');
      const res = await apiRequest('PUT', `/api/erp/products/categories/${editingCategoryId}`, {
        name: newCategoryName.trim(),
        isMenuCategory: isRestaurant ? newCategoryIsMenuCategory : undefined,
        menuSortOrder: isRestaurant ? Number(newCategoryMenuSortOrder || '0') : undefined,
      });
      const json = await res.json();
      return json.data as CategoryRow;
    },
    onSuccess: (category) => {
      toast({ title: t('erp.products.toast.categoryUpdated', 'Category updated') });
      setFormCategoryId(String(category.id));
      setNewCategoryName('');
      setNewCategoryIsMenuCategory(false);
      setNewCategoryMenuSortOrder('0');
      setEditingCategoryId(null);
      setCategoryDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/erp/products/categories'] });
    },
    onError: (e: Error) => {
      toast({ title: t('erp.common.error', 'Error'), description: e.message, variant: 'destructive' });
    },
  });

  const openEditCategory = (category: CategoryRow) => {
    setEditingCategoryId(category.id);
    setNewCategoryName(category.name);
    setNewCategoryIsMenuCategory(category.isMenuCategory === true);
    setNewCategoryMenuSortOrder(String(category.menuSortOrder ?? 0));
    setCategoryDialogOpen(true);
  };

  const submitForm = () => {
    if (!formName.trim()) {
      toast({ title: t('erp.products.toast.nameRequired', 'Name is required'), variant: 'destructive' });
      return;
    }
    if (formType === 'service' && formEstimatedDurationMinutes.trim()) {
      if (parseServiceDurationMinutes(formType, formEstimatedDurationMinutes) == null) {
        toast({
          title: t('erp.common.error', 'Error'),
          description: t('erp.products.duration.validation', 'Estimated service duration must be a positive whole number of minutes.'),
          variant: 'destructive',
        });
        return;
      }
    }
    for (const def of activeDefinitions) {
      if (!def.isRequired || def.fieldType === 'checkbox') continue;
      const raw = formCustomFields[def.fieldKey];
      if (String(raw ?? '').trim() === '') {
        toast({
          title: t('erp.products.customFields.requiredError', '{{name}} is required', { name: def.name }),
          variant: 'destructive',
        });
        return;
      }
    }
    if (isRestaurant) {
      const validated = validateRestaurantStructuredFields({
        modifiers: formModifiers,
        comboItems: formComboItems,
        recipeIngredients: formRecipeIngredients,
      });
      if (!validated.success) {
        const issue = validated.error.issues[0];
        const message = issue?.message || t('erp.products.structured.validationError', 'Please fix restaurant field values.');
        toast({ title: t('erp.common.error', 'Error'), description: message, variant: 'destructive' });
        return;
      }
    }
    if (editing) updateMutation.mutate();
    else createMutation.mutate();
  };

  const formatMoney = (v: string | null, currency: string | null) => {
    if (v == null || v === '') return '—';
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    return `${currency ?? 'USD'} ${n.toFixed(2)}`;
  };

  useQuickAction('create-product', { open: dialogOpen, onOpen: openCreate, ready: !currenciesLoading && !customFieldsLoading, unavailable: !!customFieldsError });

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 overflow-y-auto bg-background">
          <div className="flex w-full flex-col gap-4 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 data-tour="pages-erp-products.h1.erp.products.title" className="text-2xl">{t('erp.products.title', 'Products')}</h1>
                <p className="text-muted-foreground text-sm">{t('erp.products.subtitle', 'Manage your product catalog')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ExportFormatMenu
                  onExport={exportProductIdentifiers}
                  loading={identifiersExporting}
                  label={t('erp.products.exportIdentifiers', 'Export identifiers')}
                />
                {canManage && (
                  <>
                    <Button data-tour="pages-erp-products.button.erp.products.importProducts" variant="outline" onClick={() => setImportDialogOpen(true)}>
                      <Upload className="mr-2 h-4 w-4" />
                      {t('erp.products.importProducts', 'Import Products')}
                    </Button>
                    <Button data-tour="pages-erp-products.button.erp.products.newProduct" onClick={openCreate}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('erp.products.newProduct', 'New product')}
                    </Button>
                  </>
                )}
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
                  <div className="relative min-w-[200px] max-w-sm flex-1">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input data-tour="pages-erp-products.input.erp.products.searchPlaceholder"
                      placeholder={t('erp.products.searchPlaceholder', 'Search name, SKU or custom fields…')}
                      className="pl-9"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="w-full sm:w-40">
                    <Label className="text-xs text-muted-foreground">{t('erp.products.filterStatus', 'Status')}</Label>
                    <Select
                      value={statusFilter}
                      onValueChange={(v) => {
                        setStatusFilter(v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger data-tour="pages-erp-products.selecttrigger.erp.products.filterStatus">
                        <SelectValue placeholder={t('erp.products.filterStatus', 'Status')} />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s === 'all' ? t('erp.products.allStatuses', 'All statuses') : t(`erp.common.${s}`, s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full sm:w-40">
                    <Label className="text-xs text-muted-foreground">{t('erp.products.filterType', 'Type')}</Label>
                    <Select
                      value={typeFilter}
                      onValueChange={(v) => {
                        setTypeFilter(v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger data-tour="pages-erp-products.selecttrigger.erp.products.filterType">
                        <SelectValue placeholder={t('erp.products.filterType', 'Type')} />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPE_OPTIONS.map((typeOption) => (
                          <SelectItem key={typeOption} value={typeOption}>
                            {typeOption === 'all' ? t('erp.products.allTypes', 'All types') : t(`erp.common.${typeOption}`, typeOption)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-full sm:w-48">
                    <Label className="text-xs text-muted-foreground">{t('erp.products.filterCategory', 'Category')}</Label>
                    <Select
                      value={categoryFilter}
                      onValueChange={(v) => {
                        setCategoryFilter(v);
                        setPage(1);
                      }}
                    >
                      <SelectTrigger data-tour="pages-erp-products.selecttrigger.erp.products.filterCategory">
                        <SelectValue placeholder={t('erp.products.filterCategory', 'Category')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('erp.products.allCategories', 'All categories')}</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-0">
                    <Label className="pointer-events-none select-none text-xs text-muted-foreground opacity-0" aria-hidden="true">
                      {t('erp.products.filterStatus', 'Status')}
                    </Label>
                    <div className="flex h-10 items-center gap-2">
                      <Checkbox
                        id="low-stock-only"
                        checked={lowStockOnly}
                        onCheckedChange={(checked) => {
                          setLowStockOnly(checked === true);
                          setPage(1);
                        }}
                      />
                      <Label htmlFor="low-stock-only" className="cursor-pointer text-sm font-normal leading-none">
                        {t('erp.products.lowStockOnly', 'Low stock only')}
                      </Label>
                    </div>
                  </div>
                  {isRestaurant && (
                    <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-0">
                      <Label className="pointer-events-none select-none text-xs text-muted-foreground opacity-0" aria-hidden="true">
                        {t('erp.products.filterStatus', 'Status')}
                      </Label>
                      <div className="flex h-10 items-center gap-2">
                        <Checkbox
                          id="menu-items-only"
                          checked={menuItemsOnly}
                          onCheckedChange={(checked) => {
                            setMenuItemsOnly(checked === true);
                            setPage(1);
                          }}
                        />
                        <Label htmlFor="menu-items-only" className="cursor-pointer text-sm font-normal leading-none">
                          {t('erp.products.menuOnly', 'Menu items only')}
                        </Label>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                {activeDefinitions.length > 0 && (
                  <div className="flex justify-end border-b px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button data-tour="pages-erp-products.button.erp.products.columns" variant="outline" size="sm">
                          <Columns3 className="mr-2 h-4 w-4" />
                          {t('erp.products.columns', 'Columns')}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        {activeDefinitions.map((def) => (
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
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                {isLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <Table data-tour="pages-erp-products.table.erp.products.table.id" className="min-w-max">
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('erp.products.table.id', 'ID')}</TableHead>
                          <TableHead>{t('erp.products.table.sku', 'SKU')}</TableHead>
                          <TableHead>{t('erp.products.table.name', 'Name')}</TableHead>
                          <TableHead>{t('erp.products.table.type', 'Type')}</TableHead>
                          <TableHead>{t('erp.products.table.category', 'Category')}</TableHead>
                          <TableHead>{t('erp.products.table.price', 'Price')}</TableHead>
                          {isRestaurant && <TableHead>{t('erp.products.table.menuCategory', 'Menu category')}</TableHead>}
                          <TableHead>{t('erp.products.table.status', 'Status')}</TableHead>
                          {visibleCustomFieldColumns.map((fieldKey) => (
                            <TableHead key={fieldKey}>
                              {definitionByKey.get(fieldKey)?.name ?? fieldKey}
                            </TableHead>
                          ))}
                          {canManage && <TableHead className="text-right">{t('erp.products.table.actions', 'Actions')}</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={emptyTableColSpan} className="text-center text-muted-foreground py-12">
                              {t('erp.products.empty', 'No products yet')}
                            </TableCell>
                          </TableRow>
                        ) : (
                          products.map((p) => {
                            const primaryImage = normalizeProductImages(p.images)[0];

                            return (
                              <TableRow key={p.id}>
                                <TableCell>
                                  <div className="flex items-center gap-1">
                                    <span className="font-mono text-sm">{p.id}</span>
                                    <Button data-tour="pages-erp-products.button.erp.products.copyId"
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => void copyProductId(p.id)}
                                      aria-label={t('erp.products.copyId', 'Copy Product ID')}
                                    >
                                      <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell className="font-mono text-sm">{p.sku || '—'}</TableCell>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-3">
                                    {primaryImage && (
                                      <button data-tour="pages-erp-products.button.erp.products.image.previewAria"
                                        type="button"
                                        className="overflow-hidden rounded-md border transition-opacity hover:opacity-80"
                                        onClick={() => setPreviewImageUrl(primaryImage)}
                                        aria-label={t('erp.products.image.previewAria', 'Preview image for {{name}}', { name: p.name })}
                                      >
                                        <img
                                          src={resolveMediaUrl(primaryImage)}
                                          alt={t('erp.products.image.alt', 'Product image: {{name}}', { name: p.name })}
                                          className="h-10 w-10 object-cover"
                                        />
                                      </button>
                                    )}
                                    <span className="inline-flex items-center gap-2">
                                      <span>{p.name}</span>
                                      {p.lowStock === true && (
                                        <Badge variant="destructive">
                                          {t('erp.products.lowStockBadge', 'Low stock')}
                                        </Badge>
                                      )}
                                    </span>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary">{t(getTypeTranslationKey(p.type), p.type)}</Badge>
                                </TableCell>
                                <TableCell>
                                  {p.categoryId != null ? categoryNameById.get(p.categoryId) ?? '—' : '—'}
                                </TableCell>
                                <TableCell>{formatMoney(p.unitPrice, p.currency)}</TableCell>
                                {isRestaurant && (
                                  <TableCell>
                                    {p.categoryId != null && categories.find((c) => c.id === p.categoryId)?.isMenuCategory ? (
                                      <Badge variant="outline">
                                        {t('erp.products.menuCategory', 'Menu')}
                                        {' · '}
                                        {t('erp.products.sort', 'Sort')}
                                        {' '}
                                        {categories.find((c) => c.id === p.categoryId)?.menuSortOrder ?? 0}
                                      </Badge>
                                    ) : (
                                      '—'
                                    )}
                                  </TableCell>
                                )}
                                <TableCell>
                                  <Badge variant="outline">{t(getStatusTranslationKey(p.status), p.status)}</Badge>
                                </TableCell>
                                {visibleCustomFieldColumns.map((fieldKey) => {
                                  const def = definitionByKey.get(fieldKey);
                                  const value = p.customFields?.[fieldKey];
                                  let display: string = '—';
                                  if (value != null && value !== '') {
                                    if (def?.fieldType === 'checkbox') {
                                      display =
                                        value === true || value === 'true'
                                          ? t('erp.common.yes', 'Yes')
                                          : t('erp.common.no', 'No');
                                    } else {
                                      display = String(value);
                                    }
                                  }
                                  return <TableCell key={fieldKey}>{display}</TableCell>;
                                })}
                                {canManage && (
                                  <TableCell className="text-right space-x-2">
                                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(p)}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <Button data-tour="pages-erp-products.button.erp.common.previous"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t('erp.common.previous', 'Previous')}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t('erp.common.pageOf', 'Page {{page}} of {{total}}', { page: String(page), total: String(totalPages) })}
                </span>
                <Button data-tour="pages-erp-products.button.erp.common.next"
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t('erp.common.next', 'Next')}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent data-tour="pages-erp-products.dialogcontent.erp.products.dialog.editTitle" className="w-[96vw] max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>{editing ? t('erp.products.dialog.editTitle', 'Edit product') : t('erp.products.dialog.createTitle', 'New product')}</DialogTitle>
            <DialogDescription>{t('erp.products.dialog.description', 'Enter product details, pricing and inventory settings, then save your changes.')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {editing && (
              <div className="flex items-center justify-between gap-2">
                <Label>{t('erp.products.form.productId', 'Product ID')}</Label>
                <div className="flex items-center gap-1">
                  <span className="font-mono text-sm">{editing.id}</span>
                  <Button data-tour="pages-erp-products.button.erp.products.copyId"
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => void copyProductId(editing.id)}
                    aria-label={t('erp.products.copyId', 'Copy Product ID')}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="p-name">{t('erp.products.form.name', 'Name')}</Label>
              <Input data-tour="pages-erp-products.input.p-name"
                id="p-name"
                value={formName}
                onChange={(e) => {
                  const name = e.target.value;
                  setFormName(name);
                  if (!skuTouched) {
                    setFormSku(generateSkuFromName(name));
                  }
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-sku">{t('erp.products.form.sku', 'SKU')}</Label>
              <Input data-tour="pages-erp-products.input.p-sku"
                id="p-sku"
                value={formSku}
                onChange={(e) => {
                  setSkuTouched(true);
                  setFormSku(e.target.value);
                }}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-desc">{t('erp.products.form.description', 'Description')}</Label>
              <Textarea data-tour="pages-erp-products.textarea.p-desc" id="p-desc" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t('erp.products.form.type', 'Type')}</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="physical">{t('erp.common.physical', 'physical')}</SelectItem>
                    <SelectItem value="service">{t('erp.common.service', 'service')}</SelectItem>
                    <SelectItem value="digital">{t('erp.common.digital', 'digital')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>{t('erp.products.form.status', 'Status')}</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="draft">{t('erp.common.draft', 'draft')}</SelectItem>
                    <SelectItem value="active">{t('erp.common.active', 'active')}</SelectItem>
                    <SelectItem value="inactive">{t('erp.common.inactive', 'inactive')}</SelectItem>
                    <SelectItem value="archived">{t('erp.common.archived', 'archived')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t('erp.products.form.category', 'Category')}</Label>
              <div className="flex gap-2">
                  <Select value={formCategoryId || 'none'} onValueChange={(v) => setFormCategoryId(v === 'none' ? '' : v)}>
                  <SelectTrigger data-tour="pages-erp-products.selecttrigger.erp.products.form.categoryNone" className="flex-1">
                    <SelectValue placeholder={t('erp.products.form.categoryNone', 'None')} />
                  </SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="none">{t('erp.products.form.categoryNone', 'None')}</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                        {isRestaurant && c.isMenuCategory ? ` (Menu #${c.menuSortOrder ?? 0})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button data-tour="pages-erp-products.button.erp.products.category.newTitle"
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCategoryDialogOpen(true)}
                  aria-label={t('erp.products.category.newTitle', 'New category')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                {isRestaurant && formCategoryId && (
                  <Button data-tour="pages-erp-products.button.erp.products.category.editTitle"
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      const category = categories.find((c) => String(c.id) === formCategoryId);
                      if (category) openEditCategory(category);
                    }}
                    aria-label={t('erp.products.category.editTitle', 'Edit category')}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="p-unit">{t('erp.products.form.unitPrice', 'Unit price')}</Label>
                <Input data-tour="pages-erp-products.input.p-unit" id="p-unit" value={formUnitPrice} onChange={(e) => setFormUnitPrice(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-cost">{t('erp.products.form.costPrice', 'Cost price')}</Label>
                <Input data-tour="pages-erp-products.input.p-cost" id="p-cost" value={formCostPrice} onChange={(e) => setFormCostPrice(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {formType === 'physical' && (
                <div className="grid gap-2">
                  <Label htmlFor="p-min-stock">{t('erp.products.form.minStock', 'Min stock')}</Label>
                  <Input data-tour="pages-erp-products.input.p-min-stock"
                    id="p-min-stock"
                    type="number"
                    min="0"
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(e.target.value)}
                  />
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="p-expiration">{t('erp.products.form.expirationDate', 'Expiration date')}</Label>
                <Input data-tour="pages-erp-products.input.p-expiration"
                  id="p-expiration"
                  type="date"
                  value={formExpirationDate}
                  onChange={(e) => setFormExpirationDate(e.target.value)}
                />
              </div>
            </div>
            {formType === 'service' && (
              <div className="grid gap-2">
                <Label htmlFor="p-estimated-duration">
                  {t('erp.products.form.estimatedDuration', 'Estimated service duration (minutes)')}
                </Label>
                <Input data-tour="pages-erp-products.input.p-estimated-duration"
                  id="p-estimated-duration"
                  type="number"
                  min="1"
                  step="1"
                  value={formEstimatedDurationMinutes}
                  onChange={(e) => setFormEstimatedDurationMinutes(e.target.value)}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t('erp.products.metadata.brand', 'Brand')}</Label>
                <Select value={formBrandId || 'none'} onValueChange={(v) => setFormBrandId(v === 'none' ? '' : v)}>
                  <SelectTrigger data-tour="pages-erp-products.selecttrigger.erp.common.none"><SelectValue placeholder={t('erp.common.none', 'None')} /></SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
                    {brands.map((brand) => <SelectItem key={brand.id} value={String(brand.id)}>{brand.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="p-cur">{t('erp.products.form.currency', 'Currency')}</Label>
                <Select value={formCurrency || baseCurrencyCode} onValueChange={setFormCurrency}>
                  <SelectTrigger data-tour="pages-erp-products.selecttrigger.erp.common.loading" id="p-cur" disabled={currenciesLoading && currencies.length === 0}>
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
                        <SelectItem key="__legacy_currency__" value={formCurrency}>
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
              <div className="grid gap-2">
                <Label htmlFor="p-uom">{t('erp.products.form.unitOfMeasure', 'Unit of measure')}</Label>
                <Select
                  value={formUnitId || 'none'}
                  onValueChange={(v) => {
                    const next = v === 'none' ? '' : v;
                    setFormUnitId(next);
                    const selected = units.find((u) => String(u.id) === next);
                    if (selected) setFormUnitOfMeasure(selected.name);
                  }}
                >
                  <SelectTrigger data-tour="pages-erp-products.selecttrigger.erp.common.none" id="p-uom"><SelectValue placeholder={t('erp.common.none', 'None')} /></SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
                    {units.map((unit) => <SelectItem key={unit.id} value={String(unit.id)}>{unit.name}{unit.symbol ? ` (${unit.symbol})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-barcode">{t('erp.products.form.barcode', 'Barcode')}</Label>
              <Input data-tour="pages-erp-products.input.p-barcode" id="p-barcode" value={formBarcode} onChange={(e) => setFormBarcode(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="p-tags">{t('erp.products.form.tags', 'Tags (comma-separated)')}</Label>
              <div className="space-y-2 rounded-md border p-3">
                <div className="text-xs text-muted-foreground">{t('erp.products.form.selectManagedTags', 'Select managed tags')}</div>
                <div className="flex flex-wrap gap-2">
                  {tagMasters.map((tag) => {
                    const selected = selectedManagedTags.includes(tag.name);
                    return (
                      <Button
                        key={tag.id}
                        type="button"
                        variant={selected ? 'default' : 'outline'}
                        size="sm"
                        className={selected ? 'border-transparent' : ''}
                        style={selected && tag.color ? { backgroundColor: tag.color, color: getTagTextColor(tag.color) } : undefined}
                        onClick={() =>
                          setSelectedManagedTags((prev) =>
                            prev.includes(tag.name) ? prev.filter((item) => item !== tag.name) : [...prev, tag.name]
                          )
                        }
                      >
                        {tag.name}
                      </Button>
                    );
                  })}
                  {tagMasters.length === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      {t('erp.products.form.noManagedTags', 'No managed tags yet. Add tags in ERP Settings > Catalog.')}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p-tags-extra">{t('erp.products.form.additionalTags', 'Additional tags (comma-separated)')}</Label>
                  <Input data-tour="pages-erp-products.input.p-tags-extra" id="p-tags-extra" value={formTags} onChange={(e) => setFormTags(e.target.value)} placeholder="seasonal, imported" />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label>{t('erp.products.form.images', 'Images')}</Label>
                <Button data-tour="pages-erp-products.button.erp.products.form.addImage" type="button" variant="outline" size="sm" onClick={() => setImageDialogOpen(true)}>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  {t('erp.products.form.addImage', 'Add image')}
                </Button>
              </div>
              {formImages.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  {t('erp.products.form.imagesEmpty', 'Upload product images to show them in catalog views.')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {formImages.map((imageUrl) => (
                    <div key={imageUrl} className="group relative overflow-hidden rounded-md border bg-muted">
                      <img
                        src={resolveMediaUrl(imageUrl)}
                        alt={t('erp.products.image.dialogAlt', 'Product image')}
                        className="h-28 w-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute right-2 top-2 h-7 w-7 opacity-90"
                        onClick={() => removeFormImage(imageUrl)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="p-tax" checked={formIsTaxable} onCheckedChange={(c) => setFormIsTaxable(c === true)} />
              <Label htmlFor="p-tax">{t('erp.products.form.taxable', 'Taxable')}</Label>
            </div>
            {activeDefinitions.length > 0 && (
              <div className="rounded-md border p-3 space-y-3">
                <div className="font-medium">{t('erp.products.form.customFields', 'Custom fields')}</div>
                <div className="grid gap-4">
                  <ErpCustomFieldsEditor
                    definitions={activeDefinitions}
                    values={formCustomFields}
                    onChange={setFormCustomFields}
                    idPrefix="p-cf"
                  />
                </div>
              </div>
            )}
            {editing && (
              <div className="rounded-md border p-3 space-y-3 max-w-full overflow-hidden">
                <div>
                  <div className="font-medium">{t('erp.products.variants.title', 'Variants / SKUs')}</div>
                  <p className="text-xs text-muted-foreground">
                    Use variants when one product has multiple sellable SKUs, such as sizes, colors, or packages. Each variant can have its own SKU and stock.
                  </p>
                </div>
                <div className="w-full max-w-full overflow-x-auto rounded-md border">
                  <Table className="min-w-[1220px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[220px]">Name</TableHead>
                      <TableHead className="min-w-[150px]">SKU</TableHead>
                      <TableHead className="min-w-[150px]">Barcode</TableHead>
                      <TableHead className="min-w-[120px]">Price</TableHead>
                      <TableHead className="min-w-[120px]">Cost</TableHead>
                      <TableHead className="min-w-[130px]">Status</TableHead>
                      <TableHead className="min-w-[90px]">Sort</TableHead>
                      <TableHead className="min-w-[330px]">Attributes</TableHead>
                      <TableHead className="min-w-[150px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeVariants.map((variant, idx) => (
                      <TableRow key={variant.id || `new-${idx}`}>
                        <TableCell><Input data-tour="pages-erp-products.input.variant.name" className="min-w-[210px]" value={variant.name} onChange={(e) => {
                          const next = [...activeVariants]; next[idx] = { ...variant, name: e.target.value }; setVariantsDraft(next);
                        }} /></TableCell>
                        <TableCell><Input className="min-w-[140px]" value={variant.sku ?? ''} onChange={(e) => {
                          const next = [...activeVariants]; next[idx] = { ...variant, sku: e.target.value }; setVariantsDraft(next);
                        }} /></TableCell>
                        <TableCell><Input className="min-w-[140px]" value={variant.barcode ?? ''} onChange={(e) => {
                          const next = [...activeVariants]; next[idx] = { ...variant, barcode: e.target.value }; setVariantsDraft(next);
                        }} /></TableCell>
                        <TableCell><Input className="min-w-[110px]" value={variant.unitPrice ?? ''} onChange={(e) => {
                          const next = [...activeVariants]; next[idx] = { ...variant, unitPrice: e.target.value }; setVariantsDraft(next);
                        }} /></TableCell>
                        <TableCell><Input className="min-w-[110px]" value={variant.costPrice ?? ''} onChange={(e) => {
                          const next = [...activeVariants]; next[idx] = { ...variant, costPrice: e.target.value }; setVariantsDraft(next);
                        }} /></TableCell>
                        <TableCell>
                          <Select value={variant.status ?? 'active'} onValueChange={(v) => {
                            const next = [...activeVariants]; next[idx] = { ...variant, status: v }; setVariantsDraft(next);
                          }}>
                            <SelectTrigger className="min-w-[120px]"><SelectValue /></SelectTrigger>
                            <SelectContent searchable>
                              <SelectItem value="active">active</SelectItem>
                              <SelectItem value="inactive">inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input className="min-w-[80px]" value={String(variant.sortOrder ?? 0)} onChange={(e) => {
                          const next = [...activeVariants]; next[idx] = { ...variant, sortOrder: Number(e.target.value) || 0 }; setVariantsDraft(next);
                        }} /></TableCell>
                        <TableCell>
                          <div className="space-y-2 min-w-[280px]">
                            {getVariantAttributePairs(variant.attributes).map((pair, pairIdx, pairs) => (
                              <div key={`${variant.id || 'new'}-attr-${pairIdx}`} className="flex items-center gap-2">
                                  <Input data-tour="pages-erp-products.input.pair.key"
                                    className="min-w-[120px]"
                                  placeholder="e.g. Size"
                                  value={pair.key}
                                  onChange={(e) => {
                                    const nextPairs = pairs.map((entry, i) =>
                                      i === pairIdx ? { ...entry, key: e.target.value } : entry
                                    );
                                    const next = [...activeVariants];
                                    next[idx] = { ...variant, attributes: toVariantAttributesObject(nextPairs) };
                                    setVariantsDraft(next);
                                  }}
                                />
                                  <Input data-tour="pages-erp-products.input.pair.value"
                                    className="min-w-[120px]"
                                  placeholder="e.g. M"
                                  value={pair.value}
                                  onChange={(e) => {
                                    const nextPairs = pairs.map((entry, i) =>
                                      i === pairIdx ? { ...entry, value: e.target.value } : entry
                                    );
                                    const next = [...activeVariants];
                                    next[idx] = { ...variant, attributes: toVariantAttributesObject(nextPairs) };
                                    setVariantsDraft(next);
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    const nextPairs = pairs.filter((_, i) => i !== pairIdx);
                                    const next = [...activeVariants];
                                    next[idx] = { ...variant, attributes: toVariantAttributesObject(nextPairs) };
                                    setVariantsDraft(next);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const currentPairs = getVariantAttributePairs(variant.attributes).filter(
                                  (pair) => pair.key.trim().length > 0 || pair.value.trim().length > 0
                                );
                                const nextPairs = [
                                  ...currentPairs,
                                  { key: `attribute_${currentPairs.length + 1}`, value: '' },
                                ];
                                const next = [...activeVariants];
                                next[idx] = { ...variant, attributes: toVariantAttributesObject(nextPairs) };
                                setVariantsDraft(next);
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add attribute
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right space-x-2 whitespace-nowrap">
                          <Button type="button" size="sm" onClick={() => saveVariantMutation.mutate(variant)}>Save</Button>
                          {variant.id > 0 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => deleteVariantMutation.mutate(variant.id)}>Delete</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {activeVariants.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-muted-foreground text-sm">No variants yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                  </Table>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  setVariantsDraft([
                    ...activeVariants,
                    {
                      id: 0,
                      productId: editing.id,
                      companyId: editing.companyId,
                      name: '',
                      sku: null,
                      barcode: null,
                      unitPrice: null,
                      costPrice: null,
                      status: 'active',
                      sortOrder: activeVariants.length,
                      attributes: {},
                    },
                  ]);
                }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add variant row
                </Button>
                {activeVariants.length > 0 && (
                  <div className="space-y-2">
                    <div className="font-medium text-sm">Variant stock by warehouse</div>
                    <div className="w-full max-w-full overflow-x-auto rounded-md border">
                      <Table className="min-w-[1120px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[120px]">Variant</TableHead>
                          <TableHead className="min-w-[150px]">SKU</TableHead>
                          <TableHead className="min-w-[120px]">Warehouse</TableHead>
                          <TableHead className="min-w-[100px]">On hand</TableHead>
                          <TableHead className="min-w-[110px]">Reorder pt.</TableHead>
                          <TableHead className="min-w-[110px]">Reorder qty</TableHead>
                          <TableHead className="min-w-[170px]">Adjust</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {variantStockLevels
                          .filter((row) => row.variantId != null)
                          .map((row) => {
                            const variant = activeVariants.find((v) => v.id === row.variantId);
                            return (
                              <TableRow key={row.id}>
                                <TableCell>{variant?.name ?? row.variantId}</TableCell>
                                <TableCell>{variant?.sku ?? '—'}</TableCell>
                                <TableCell>{row.warehouseName ?? '—'}</TableCell>
                                <TableCell>{row.quantity}</TableCell>
                                <TableCell>{row.reorderPoint ?? '—'}</TableCell>
                                <TableCell>{row.reorderQty ?? '—'}</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                  <Input
                                    className="w-24 min-w-[96px]"
                                    value={variantAdjustmentQty[String(row.id)] ?? ''}
                                    onChange={(e) => setVariantAdjustmentQty((prev) => ({ ...prev, [String(row.id)]: e.target.value }))}
                                    placeholder="+/- qty"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                      if (!row.variantId) return;
                                      const qty = (variantAdjustmentQty[String(row.id)] ?? '').trim();
                                      if (!qty) return;
                                      adjustVariantStockMutation.mutate({
                                        variantId: row.variantId,
                                        warehouseId: row.warehouseId,
                                        quantity: qty,
                                      });
                                    }}
                                  >
                                    Adjust
                                  </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        {activeVariants
                          .filter((variant) => variant.id > 0)
                          .flatMap((variant) =>
                            activeWarehouses
                              .filter(
                                (warehouse) =>
                                  !variantStockLevels.some(
                                    (row) => row.variantId === variant.id && row.warehouseId === warehouse.id
                                  )
                              )
                              .map((warehouse) => ({ variant, warehouse }))
                          )
                          .map(({ variant, warehouse }) => {
                            const key = `new-${variant.id}-${warehouse.id}`;
                            return (
                              <TableRow key={key}>
                                <TableCell>{variant.name || variant.id}</TableCell>
                                <TableCell>{variant.sku?.trim() || '—'}</TableCell>
                                <TableCell>{warehouse.name}</TableCell>
                                <TableCell>0</TableCell>
                                <TableCell>—</TableCell>
                                <TableCell>—</TableCell>
                                <TableCell className="whitespace-nowrap">
                                  <div className="flex items-center gap-2">
                                  <Input
                                    className="w-24 min-w-[96px]"
                                    value={variantAdjustmentQty[key] ?? ''}
                                    onChange={(e) => setVariantAdjustmentQty((prev) => ({ ...prev, [key]: e.target.value }))}
                                    placeholder="+/- qty"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => {
                                      const qty = (variantAdjustmentQty[key] ?? '').trim();
                                      if (!qty) return;
                                      adjustVariantStockMutation.mutate({
                                        variantId: variant.id,
                                        warehouseId: warehouse.id,
                                        quantity: qty,
                                      });
                                    }}
                                  >
                                    Initialize
                                  </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                      </Table>
                    </div>
                    {activeVariants
                      .filter((variant) => variant.id > 0)
                      .some(
                        (variant) =>
                          !variantStockLevels.some((row) => row.variantId === variant.id) && activeWarehouses.length > 0
                      ) && (
                      <div className="space-y-2 rounded-md border border-dashed p-3">
                        <div className="text-sm font-medium">Initialize first warehouse stock row</div>
                        <div className="grid gap-2">
                          {activeVariants
                            .filter((variant) => variant.id > 0)
                            .filter((variant) => !variantStockLevels.some((row) => row.variantId === variant.id))
                            .map((variant) => {
                              const key = `init-${variant.id}`;
                              const selectedWarehouseId = variantInitWarehouseByVariantId[variant.id] ?? '';
                              return (
                                <div key={key} className="grid gap-2 md:grid-cols-4">
                                  <div className="md:col-span-1 text-sm self-center">
                                    {variant.name || `Variant #${variant.id}`}
                                  </div>
                                  <div className="md:col-span-1">
                                    <Select
                                      value={selectedWarehouseId || 'none'}
                                      onValueChange={(next) =>
                                        setVariantInitWarehouseByVariantId((prev) => ({
                                          ...prev,
                                          [variant.id]: next === 'none' ? '' : next,
                                        }))
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select warehouse" />
                                      </SelectTrigger>
                                      <SelectContent searchable>
                                        <SelectItem value="none">Select warehouse</SelectItem>
                                        {activeWarehouses.map((warehouse) => (
                                          <SelectItem key={warehouse.id} value={String(warehouse.id)}>
                                            {warehouse.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="md:col-span-1">
                                    <Input
                                      value={variantAdjustmentQty[key] ?? ''}
                                      onChange={(e) => setVariantAdjustmentQty((prev) => ({ ...prev, [key]: e.target.value }))}
                                      placeholder="Opening qty"
                                    />
                                  </div>
                                  <div className="md:col-span-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="w-full"
                                      onClick={() => {
                                        const warehouseId = parseInt(selectedWarehouseId, 10);
                                        if (!Number.isFinite(warehouseId) || warehouseId <= 0) return;
                                        const qty = (variantAdjustmentQty[key] ?? '').trim();
                                        if (!qty) return;
                                        adjustVariantStockMutation.mutate({
                                          variantId: variant.id,
                                          warehouseId,
                                          quantity: qty,
                                        });
                                      }}
                                    >
                                      Create stock row
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <ColombiaProductFiscalFields
              value={formColombiaFiscalProfile}
              onChange={(value) => setFormColombiaFiscalProfile((current) => ({ ...current, ...value }))}
              disabled={!canManage}
            />
            {isRestaurant && (
              <div className="rounded-md border p-3 space-y-3">
                <div className="font-medium">{t('erp.products.restaurantSettings', 'Restaurant / Menu Settings')}</div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="p-menu-item" checked={formIsMenuItem} onCheckedChange={(c) => setFormIsMenuItem(c === true)} />
                  <Label htmlFor="p-menu-item">{t('erp.products.menuItem', 'Menu item')}</Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="p-prep-time">{t('erp.products.prepTime', 'Prep time (minutes)')}</Label>
                    <Input data-tour="pages-erp-products.input.p-prep-time" id="p-prep-time" type="number" value={formPreparationTimeMinutes} onChange={(e) => setFormPreparationTimeMinutes(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label>{t('erp.products.kitchenStation', 'Kitchen station')}</Label>
                    <Select value={formKitchenStationId || 'none'} onValueChange={(v) => setFormKitchenStationId(v === 'none' ? '' : v)}>
                      <SelectTrigger data-tour="pages-erp-products.selecttrigger.erp.common.none"><SelectValue placeholder={t('erp.common.none', 'None')} /></SelectTrigger>
                      <SelectContent searchable>
                        <SelectItem value="none">{t('erp.common.none', 'None')}</SelectItem>
                        {kitchenStations.map((station) => (
                          <SelectItem key={station.id} value={String(station.id)}>{station.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <RestaurantStructuredFieldsEditor
                  companyId={companyId ?? undefined}
                  t={t}
                  modifiers={formModifiers}
                  onModifiersChange={setFormModifiers}
                  comboItems={formComboItems}
                  onComboItemsChange={setFormComboItems}
                  recipeIngredients={formRecipeIngredients}
                  onRecipeIngredientsChange={setFormRecipeIngredients}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-products.button.erp.common.cancel" variant="outline" onClick={() => setDialogOpen(false)}>
              {t('erp.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-products.button.erp.common.save" onClick={submitForm} disabled={createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('erp.common.save', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImageUploadDialog
        isOpen={imageDialogOpen}
        onClose={() => setImageDialogOpen(false)}
        onImageInsert={handleImageInsert}
        uploadUrl="/api/erp/products/images/upload"
        allowUrlInput={false}
      />

      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent data-tour="pages-erp-products.dialogcontent.erp.products.category.editTitle" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {editingCategoryId != null
                ? t('erp.products.category.editTitle', 'Edit category')
                : t('erp.products.category.newTitle', 'New category')}
            </DialogTitle>
            <DialogDescription>{t('erp.products.category.description', 'Name the category and configure its display settings.')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="new-category-name">{t('erp.common.name', 'Name')}</Label>
            <Input data-tour="pages-erp-products.input.erp.products.category.namePlaceholder"
              id="new-category-name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitCategory();
                }
              }}
              placeholder={t('erp.products.category.namePlaceholder', 'Category name')}
            />
            {isRestaurant && (
              <>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="new-category-is-menu"
                    checked={newCategoryIsMenuCategory}
                    onCheckedChange={(checked) => setNewCategoryIsMenuCategory(checked === true)}
                  />
                  <Label htmlFor="new-category-is-menu">
                    {t('erp.products.category.isMenuCategory', 'Menu category')}
                  </Label>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-category-sort-order">
                    {t('erp.products.category.menuSortOrder', 'Menu sort order')}
                  </Label>
                  <Input data-tour="pages-erp-products.input.new-category-sort-order"
                    id="new-category-sort-order"
                    type="number"
                    value={newCategoryMenuSortOrder}
                    onChange={(e) => setNewCategoryMenuSortOrder(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button data-tour="pages-erp-products.button.erp.common.cancel"
              variant="outline"
              onClick={() => {
                setCategoryDialogOpen(false);
                setNewCategoryName('');
                setNewCategoryIsMenuCategory(false);
                setNewCategoryMenuSortOrder('0');
                setEditingCategoryId(null);
              }}
            >
              {t('erp.common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="pages-erp-products.button.erp.common.update" onClick={submitCategory} disabled={createCategoryMutation.isPending || updateCategoryMutation.isPending}>
              {(createCategoryMutation.isPending || updateCategoryMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingCategoryId != null ? t('erp.common.update', 'Update') : t('erp.common.create', 'Create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImageUrl} onOpenChange={(open) => !open && setPreviewImageUrl(null)}>
        <DialogContent className="max-w-3xl" aria-describedby={undefined}>
          <DialogHeader className="sr-only"><DialogTitle>{t('erp.products.image.previewAlt', 'Product preview')}</DialogTitle></DialogHeader>
     
          {previewImageUrl && (
            <div className="flex justify-center">
              <img
                src={resolveMediaUrl(previewImageUrl)}
                alt={t('erp.products.image.previewAlt', 'Product preview')}
                className="max-h-[70vh] max-w-full rounded-md object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProductImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('erp.products.delete.title', 'Delete product?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('erp.products.delete.description', 'This will remove {{name}} and related variants and price tiers.', {
                name: deleteTarget?.name ?? 'this product',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('erp.common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
            >
              {t('erp.common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

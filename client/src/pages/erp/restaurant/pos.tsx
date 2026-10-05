import Header from '@/components/layout/Header';
import { ProductPicker, type ProductPickerOption } from '@/components/erp/product-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import CreateContactModal from '@/components/contacts/CreateContactModal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

type ServiceType = 'dine_in' | 'takeaway' | 'delivery';

type CartLine = {
  id: string;
  salesOrderItemId: number | null;
  product: ProductPickerOption;
  quantity: number;
  baseUnitPrice: number;
  selectedQuickModifiers: PosQuickModifierOption[];
  modifierPriceDelta: number;
  adjustedUnitPrice: number;
  specialInstructions: string;
  canUseQuickModifiers: boolean;
};

type KitchenStation = {
  id: number;
  name: string;
  isActive: boolean | null;
  sortOrder: number | null;
};

type OrderContextRow = {
  id: number;
  salesOrderId: number;
  tableId: number | null;
  serviceType: ServiceType;
  status: string;
};
type TableAvailabilityRow = {
  table: {
    id: number;
    label: string;
    code: string;
    capacity: number;
    isActive: boolean | null;
  };
  section: {
    id: number;
    name: string;
  } | null;
  isAvailable: boolean;
  activeContext: {
    id: number;
    salesOrderId: number;
    status: string;
    serviceType: string;
    createdAt: string | null;
  } | null;
};

type SalesOrderItemProductPayload = {
  id: number;
  name: string;
  unitPrice: string | null;
  modifiers: unknown;
};

type SalesOrderItemRow = {
  id: number;
  productId: number | null;
  variantId: number | null;
  productName?: string | null;
  description?: string | null;
  quantity: string;
  unitPrice?: string;
  lineTotal?: string;
  discountPercent?: string;
  taxRate?: string;
  specialInstructions?: string | null;
  sortOrder: number | null;
  product?: SalesOrderItemProductPayload | null;
};
type SalesOrderDetail = {
  order: { id: number; status?: string };
  items: SalesOrderItemRow[];
  restaurantContext: OrderContextRow | null;
  hasInvoice?: boolean;
  invoiceId?: number | null;
  checkoutCompleted?: boolean;
  observationsEditable?: boolean;
};
type ContactOption = { id: number; name: string; phone?: string | null; email?: string | null };

const TAX_RATE = 0;

type QuickModifierSelectionBehavior = 'single' | 'multi';

type PosQuickModifierOption = {
  key: string;
  groupId: string;
  groupName: string;
  optionId: string;
  label: string;
  priceDelta: number;
  selectionBehavior: QuickModifierSelectionBehavior;
};

const FALLBACK_QUICK_MODIFIER_DEFS: Array<{
  key: string;
  labelKey: string;
  fallback: string;
  priceDelta: number;
}> = [
  { key: 'no-onions', labelKey: 'erp.restaurant.pos.quickModifier.noOnions', fallback: 'No onions', priceDelta: 0 },
  { key: 'with-onions', labelKey: 'erp.restaurant.pos.quickModifier.withOnions', fallback: 'With onions', priceDelta: 0 },
  { key: 'extra-cheese', labelKey: 'erp.restaurant.pos.quickModifier.extraCheese', fallback: 'Extra cheese', priceDelta: 1.5 },
  { key: 'spicy', labelKey: 'erp.restaurant.pos.quickModifier.spicy', fallback: 'Spicy', priceDelta: 0 },
  { key: 'no-sauce', labelKey: 'erp.restaurant.pos.quickModifier.noSauce', fallback: 'No sauce', priceDelta: 0 },
];

const FALLBACK_QUICK_MODIFIER_GROUP_ID = 'pos-fallback-quick';

function toFiniteNumber(value: unknown, fallback: number) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeLabelSlug(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}

function derivePosGroupId(productId: number, groupIndex: number, explicitId?: string) {
  return explicitId ?? `pos-grp-${productId}-${groupIndex}`;
}

function derivePosOptionId(
  productId: number,
  groupIndex: number,
  optionIndex: number,
  label: string,
  explicitId?: string,
) {
  return explicitId ?? `pos-opt-${productId}-${groupIndex}-${optionIndex}-${normalizeLabelSlug(label)}`;
}

/** Stable POS quick-modifier identity; does not use normalizeModifierGroups() random IDs. */
function modifiersToPosQuickOptions(
  productId: number,
  rawModifiers: unknown[] | null | undefined,
): PosQuickModifierOption[] {
  if (!Array.isArray(rawModifiers)) return [];

  const result: PosQuickModifierOption[] = [];

  for (let groupIndex = 0; groupIndex < rawModifiers.length; groupIndex += 1) {
    const entry = rawModifiers[groupIndex];
    const source = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const groupName = typeof source.name === 'string' ? source.name.trim() : '';
    const optionsRaw = Array.isArray(source.options) ? source.options : [];
    const explicitGroupId = typeof source.id === 'string' ? source.id : undefined;

    const parsedOptions: Array<{
      label: string;
      priceDelta: number;
      optionIndex: number;
      explicitId?: string;
    }> = [];

    for (let optionIndex = 0; optionIndex < optionsRaw.length; optionIndex += 1) {
      const option = optionsRaw[optionIndex];
      const opt = option && typeof option === 'object' ? (option as Record<string, unknown>) : {};
      const label = typeof opt.label === 'string' ? opt.label.trim() : '';
      if (!label) continue;
      parsedOptions.push({
        label,
        priceDelta: toFiniteNumber(opt.priceDelta, 0),
        optionIndex,
        explicitId: typeof opt.id === 'string' ? opt.id : undefined,
      });
    }

    if (!groupName && parsedOptions.length === 0) continue;

    const groupId = derivePosGroupId(productId, groupIndex, explicitGroupId);
    const maxSelections = Math.max(
      1,
      Math.floor(toFiniteNumber(source.maxSelections, Math.max(parsedOptions.length, 1))),
    );
    const selectionBehavior: QuickModifierSelectionBehavior = maxSelections === 1 ? 'single' : 'multi';

    for (const option of parsedOptions) {
      const optionId = derivePosOptionId(
        productId,
        groupIndex,
        option.optionIndex,
        option.label,
        option.explicitId,
      );
      result.push({
        key: `${groupId}:${optionId}`,
        groupId,
        groupName: groupName || groupId,
        optionId,
        label: option.label,
        priceDelta: option.priceDelta,
        selectionBehavior,
      });
    }
  }

  return result;
}

function splitManualInstructionEntries(manual: string): string[] {
  return manual.split(',').map((part) => part.trim()).filter(Boolean);
}

function buildFinalInstructions(quickLabels: string[], manual: string): string {
  const normalizedQuickLabels = quickLabels.map((label) => label.trim()).filter(Boolean);
  const quickLabelKeys = new Set(normalizedQuickLabels.map((label) => label.toLowerCase()));
  const manualEntries = splitManualInstructionEntries(manual).filter(
    (entry) => !quickLabelKeys.has(entry.toLowerCase()),
  );
  return [...normalizedQuickLabels, ...manualEntries].join(', ');
}

/** Manual-only text for sidebar display; avoids repeating quick-modifier chip labels. */
function inferSelectedQuickModifiers(
  specialInstructions: string,
  available: PosQuickModifierOption[],
): PosQuickModifierOption[] {
  if (!specialInstructions.trim() || available.length === 0) return [];
  const parts = specialInstructions.split(',').map((part) => part.trim()).filter(Boolean);
  const labelToOption = new Map(available.map((option) => [option.label.toLowerCase(), option]));
  const selected: PosQuickModifierOption[] = [];
  const usedKeys = new Set<string>();
  for (const part of parts) {
    const option = labelToOption.get(part.toLowerCase());
    if (!option || usedKeys.has(option.key)) continue;
    selected.push(option);
    usedKeys.add(option.key);
  }
  return selected;
}

function deriveManualInstructionText(
  specialInstructions: string,
  quickModifiers: PosQuickModifierOption[],
): string {
  const trimmed = specialInstructions.trim();
  if (!trimmed) return '';
  if (quickModifiers.length === 0) return trimmed;

  const quickLabelKeys = new Set(
    quickModifiers.map((modifier) => modifier.label.trim().toLowerCase()).filter(Boolean),
  );
  const manualEntries = splitManualInstructionEntries(trimmed).filter(
    (entry) => !quickLabelKeys.has(entry.toLowerCase()),
  );
  return manualEntries.join(', ');
}

function formatPriceDeltaSuffix(priceDelta: number) {
  if (priceDelta === 0) return '';
  const sign = priceDelta > 0 ? '+' : '';
  return ` (${sign}${priceDelta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
}

function money(value: number) {
  return `USD ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sumQuickModifierPriceDelta(modifiers: PosQuickModifierOption[]) {
  return modifiers.reduce((sum, modifier) => sum + (Number.isFinite(modifier.priceDelta) ? modifier.priceDelta : 0), 0);
}

function resolveAdjustedUnitPrice(baseUnitPrice: number, modifierPriceDelta: number) {
  return Math.max(0, baseUnitPrice + modifierPriceDelta);
}

function formatSignedPriceDelta(priceDelta: number) {
  if (priceDelta === 0) return money(0);
  const sign = priceDelta > 0 ? '+' : '-';
  return `${sign}${money(Math.abs(priceDelta))}`;
}

function quickModifierSignature(modifiers: PosQuickModifierOption[]) {
  return [...modifiers]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((modifier) => modifier.key)
    .join('|');
}

function cartLineTotal(line: CartLine) {
  return line.quantity * line.adjustedUnitPrice;
}

function toLinePayload(line: CartLine, sortOrder: number) {
  const lineTotal = cartLineTotal(line);
  return {
    productId: line.product.id,
    variantId: null,
    description: line.product.name,
    quantity: String(line.quantity),
    unitPrice: line.adjustedUnitPrice.toFixed(2),
    discountPercent: '0',
    taxRate: String(TAX_RATE),
    lineTotal: lineTotal.toFixed(2),
    modifierSelections: [],
    specialInstructions: line.specialInstructions || null,
    sortOrder,
  };
}

export default function RestaurantPOSPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const initialTableId = searchParams.get('tableId') ? Number(searchParams.get('tableId')) : null;
  const initialSalesOrderId = searchParams.get('salesOrderId') ? Number(searchParams.get('salesOrderId')) : null;
  const initialOrderContextId = searchParams.get('orderContextId') ? Number(searchParams.get('orderContextId')) : null;
  const initialServiceType = (searchParams.get('serviceType') as ServiceType | null) ?? 'dine_in';
  const { user, company } = useAuth();
  const { hasAnyPermission, hasPermission, PERMISSIONS } = usePermissions();
  const queryClient = useQueryClient();
  const companyId = company?.id ?? user?.companyId ?? null;
  const { isRestaurant, isLoading: businessTypeLoading } = useErpBusinessType();
  const { toast } = useToast();
  const [selectedProduct, setSelectedProduct] = useState<ProductPickerOption | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [instructions, setInstructions] = useState('');
  const [selectedQuickModifiers, setSelectedQuickModifiers] = useState<PosQuickModifierOption[]>([]);
  const [serviceType, setServiceType] = useState<ServiceType>(initialServiceType);
  const [tableId, setTableId] = useState<number | null>(Number.isFinite(initialTableId) ? initialTableId : null);
  const [serviceCharge, setServiceCharge] = useState('0');
  const [tip, setTip] = useState('0');
  const [linkedSalesOrderId, setLinkedSalesOrderId] = useState<number | null>(null);
  const [linkedOrderContextId, setLinkedOrderContextId] = useState<number | null>(null);
  const [isContinuationLoading, setIsContinuationLoading] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>('walk-in');
  const [contactSearch, setContactSearch] = useState('');
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [createContactOpen, setCreateContactOpen] = useState(false);
  const [pendingContactName, setPendingContactName] = useState('');
  const [cartLines, setCartLines] = useState<CartLine[]>([]);
  const [restaurantContextStatus, setRestaurantContextStatus] = useState<string | null>(null);
  const [observationsEditable, setObservationsEditable] = useState(false);
  const [hasInvoice, setHasInvoice] = useState(false);
  const [linkedInvoiceId, setLinkedInvoiceId] = useState<number | null>(null);
  const [checkoutFinalized, setCheckoutFinalized] = useState(false);
  const [observationEditLineId, setObservationEditLineId] = useState<string | null>(null);
  const [observationDraftModifiers, setObservationDraftModifiers] = useState<PosQuickModifierOption[]>([]);
  const [observationDraftManual, setObservationDraftManual] = useState('');
  const [observationSavePending, setObservationSavePending] = useState(false);
  const isCartLocked = linkedSalesOrderId != null;
  const isOrderClosed =
    hasInvoice ||
    checkoutFinalized ||
    restaurantContextStatus === 'completed' ||
    restaurantContextStatus === 'cancelled';
  const canViewContacts = hasAnyPermission([
    PERMISSIONS.VIEW_CONTACTS,
    PERMISSIONS.VIEW_OWN_CONTACTS,
    PERMISSIONS.VIEW_ASSIGNED_CONTACTS,
    PERMISSIONS.VIEW_COMPANY_CONTACTS,
    PERMISSIONS.MANAGE_CONTACTS,
  ]);
  const canCreateContact = hasAnyPermission([
    PERMISSIONS.CREATE_CONTACTS,
    PERMISSIONS.MANAGE_CONTACTS,
  ]);

  useEffect(() => {
    if (!businessTypeLoading && !isRestaurant) {
      setLocation('/erp/dashboard');
    }
  }, [businessTypeLoading, isRestaurant, setLocation]);

  const stationsQuery = useQuery<KitchenStation[]>({
    queryKey: ['/api/erp/restaurant/layout/kitchen-stations'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/layout/kitchen-stations');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: isRestaurant,
  });
  const tableAvailabilityQuery = useQuery<TableAvailabilityRow[]>({
    queryKey: ['/api/erp/restaurant/layout/tables/availability'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/restaurant/layout/tables/availability');
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: isRestaurant,
  });
  const contactsQuery = useQuery<ContactOption[]>({
    queryKey: ['/api/contacts', 'restaurant-pos', contactSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ page: '1', limit: '20' });
      if (contactSearch.trim()) params.set('search', contactSearch.trim());
      const res = await apiRequest('GET', `/api/contacts?${params.toString()}`);
      const json = await res.json();
      const rows = (json.contacts ?? json.data?.contacts ?? json.data ?? []) as Array<Record<string, unknown>>;
      return rows.map((item) => ({
        id: Number(item.id),
        name: String(item.name ?? ''),
        phone: item.phone ? String(item.phone) : null,
        email: item.email ? String(item.email) : null,
      }));
    },
    enabled: canViewContacts,
  });

  const subtotal = useMemo(
    () => cartLines.reduce((sum, line) => sum + cartLineTotal(line), 0),
    [cartLines],
  );
  const availableDineInTables = useMemo(
    () => (tableAvailabilityQuery.data ?? []).filter((row) => row.isAvailable),
    [tableAvailabilityQuery.data],
  );
  const selectedTableRow = useMemo(
    () => (tableAvailabilityQuery.data ?? []).find((row) => row.table.id === tableId) ?? null,
    [tableAvailabilityQuery.data, tableId],
  );
  const canManageErpSettings = hasPermission(PERMISSIONS.MANAGE_ERP_SETTINGS);
  const isTablePickerDisabled = serviceType !== 'dine_in' || isCartLocked || availableDineInTables.length === 0;

  const fallbackQuickModifiers = useMemo<PosQuickModifierOption[]>(
    () =>
      FALLBACK_QUICK_MODIFIER_DEFS.map((def) => ({
        key: def.key,
        groupId: FALLBACK_QUICK_MODIFIER_GROUP_ID,
        groupName: t('erp.restaurant.pos.quickModifiers', 'Quick modifiers'),
        optionId: def.key,
        label: t(def.labelKey, def.fallback),
        priceDelta: def.priceDelta,
        selectionBehavior: 'multi' as const,
      })),
    [t],
  );

  const availableQuickModifiers = useMemo(() => {
    if (!selectedProduct) return [];
    const productOptions = modifiersToPosQuickOptions(
      selectedProduct.id,
      Array.isArray(selectedProduct.modifiers) ? selectedProduct.modifiers : undefined,
    );
    if (productOptions.length > 0) return productOptions;
    return fallbackQuickModifiers;
  }, [selectedProduct, fallbackQuickModifiers]);

  useEffect(() => {
    setSelectedQuickModifiers([]);
  }, [selectedProduct?.id]);

  const selectedBaseUnitPrice = useMemo(() => {
    const price = Number(selectedProduct?.unitPrice ?? 0);
    return Number.isFinite(price) ? price : 0;
  }, [selectedProduct?.unitPrice]);

  const selectedModifierPriceDelta = useMemo(
    () => sumQuickModifierPriceDelta(selectedQuickModifiers),
    [selectedQuickModifiers],
  );

  const selectedAdjustedUnitPrice = useMemo(
    () => resolveAdjustedUnitPrice(selectedBaseUnitPrice, selectedModifierPriceDelta),
    [selectedBaseUnitPrice, selectedModifierPriceDelta],
  );

  const toggleQuickModifier = (option: PosQuickModifierOption) => {
    setSelectedQuickModifiers((prev) => {
      const isSelected = prev.some((item) => item.key === option.key);
      if (option.selectionBehavior === 'single') {
        if (isSelected) return prev.filter((item) => item.groupId !== option.groupId);
        return [...prev.filter((item) => item.groupId !== option.groupId), option];
      }
      if (isSelected) return prev.filter((item) => item.key !== option.key);
      return [...prev, option];
    });
  };

  const removeQuickModifier = (key: string) => {
    setSelectedQuickModifiers((prev) => prev.filter((item) => item.key !== key));
  };

  const getLineAvailableQuickModifiers = (line: CartLine) => {
    if (!line.canUseQuickModifiers) return [];
    const productOptions = modifiersToPosQuickOptions(
      line.product.id,
      Array.isArray(line.product.modifiers) ? line.product.modifiers : undefined,
    );
    if (productOptions.length > 0) return productOptions;
    return fallbackQuickModifiers;
  };

  const cancelObservationEdit = () => {
    setObservationEditLineId(null);
    setObservationDraftModifiers([]);
    setObservationDraftManual('');
  };

  const startObservationEdit = (line: CartLine) => {
    setObservationEditLineId(line.id);
    setObservationDraftModifiers([...line.selectedQuickModifiers]);
    setObservationDraftManual(
      deriveManualInstructionText(line.specialInstructions, line.selectedQuickModifiers),
    );
  };

  const toggleObservationDraftModifier = (option: PosQuickModifierOption) => {
    setObservationDraftModifiers((prev) => {
      const isSelected = prev.some((item) => item.key === option.key);
      if (option.selectionBehavior === 'single') {
        if (isSelected) return prev.filter((item) => item.groupId !== option.groupId);
        return [...prev.filter((item) => item.groupId !== option.groupId), option];
      }
      if (isSelected) return prev.filter((item) => item.key !== option.key);
      return [...prev, option];
    });
  };

  const removeObservationDraftModifier = (key: string) => {
    setObservationDraftModifiers((prev) => prev.filter((item) => item.key !== key));
  };

  async function hydrateProductOption(productId: number): Promise<ProductPickerOption | null> {
    try {
      const res = await apiRequest('GET', `/api/erp/products/${productId}`);
      const json = await res.json();
      const product = json.data as Record<string, unknown> | null;
      if (!product) return null;
      return {
        id: Number(product.id),
        name: String(product.name ?? ''),
        unitPrice: String(product.unitPrice ?? '0'),
        modifiers: Array.isArray(product.modifiers) ? product.modifiers : undefined,
      } as ProductPickerOption;
    } catch {
      return null;
    }
  }

  function productPayloadToPickerOption(
    payload: SalesOrderItemProductPayload,
    fallbackUnitPrice: string,
  ): ProductPickerOption {
    return {
      id: payload.id,
      name: payload.name,
      unitPrice: payload.unitPrice ?? fallbackUnitPrice,
      modifiers: Array.isArray(payload.modifiers) ? payload.modifiers : undefined,
    } as ProductPickerOption;
  }

  async function mapPersistedItemToCartLine(item: SalesOrderItemRow): Promise<CartLine> {
    const persistedUnitPrice = Number(item.unitPrice ?? '0') || 0;
    let product: ProductPickerOption = {
      id: item.productId ?? item.id,
      name: item.productName ?? item.description ?? t('erp.restaurant.pos.unknownItem', 'Item'),
      unitPrice: item.unitPrice ?? '0',
    } as ProductPickerOption;
    let canUseQuickModifiers = false;
    let baseUnitPrice = persistedUnitPrice;
    if (item.product != null) {
      product = productPayloadToPickerOption(item.product, item.unitPrice ?? '0');
      canUseQuickModifiers = true;
    } else if (item.productId != null) {
      const hydrated = await hydrateProductOption(item.productId);
      if (hydrated) {
        product = hydrated;
        canUseQuickModifiers = true;
      }
    }
    const availableModifiers = canUseQuickModifiers
      ? modifiersToPosQuickOptions(
          product.id,
          Array.isArray(product.modifiers) ? product.modifiers : undefined,
        )
      : [];
    const quickModifierPool =
      availableModifiers.length > 0 ? availableModifiers : canUseQuickModifiers ? fallbackQuickModifiers : [];
    const selectedQuickModifiers = inferSelectedQuickModifiers(
      item.specialInstructions ?? '',
      quickModifierPool,
    );
    const modifierPriceDelta = sumQuickModifierPriceDelta(selectedQuickModifiers);
    const adjustedUnitPrice = persistedUnitPrice;
    if (canUseQuickModifiers) {
      const catalogUnitPrice = Number(product.unitPrice ?? item.unitPrice ?? '0');
      if (Number.isFinite(catalogUnitPrice) && catalogUnitPrice > 0) {
        baseUnitPrice = catalogUnitPrice;
      } else {
        baseUnitPrice = Math.max(0, persistedUnitPrice - modifierPriceDelta);
      }
    }
    return {
      id: `so-item-${item.id}`,
      salesOrderItemId: item.id,
      product,
      quantity: Number(item.quantity ?? '0') || 1,
      baseUnitPrice,
      adjustedUnitPrice,
      modifierPriceDelta: canUseQuickModifiers ? modifierPriceDelta : 0,
      selectedQuickModifiers,
      specialInstructions: item.specialInstructions ?? '',
      canUseQuickModifiers,
    };
  }

  const saveObservationEdit = async (line: CartLine) => {
    const finalInstructions = buildFinalInstructions(
      observationDraftModifiers.map((modifier) => modifier.label),
      observationDraftManual,
    );
    const modifierPriceDelta = sumQuickModifierPriceDelta(observationDraftModifiers);
    const adjustedUnitPrice = resolveAdjustedUnitPrice(line.baseUnitPrice, modifierPriceDelta);
    const nextLine: CartLine = {
      ...line,
      selectedQuickModifiers: [...observationDraftModifiers],
      modifierPriceDelta,
      adjustedUnitPrice,
      specialInstructions: finalInstructions,
    };

    if (!linkedSalesOrderId || line.salesOrderItemId == null) {
      setCartLines((lines) => lines.map((entry) => (entry.id === line.id ? nextLine : entry)));
      cancelObservationEdit();
      return;
    }

    setObservationSavePending(true);
    try {
      const res = await apiRequest(
        'PATCH',
        `/api/erp/sales-orders/${linkedSalesOrderId}/items/${line.salesOrderItemId}/pos-observations`,
        { specialInstructions: finalInstructions || null },
      );
      const json = await res.json();
      const updated = json.data as SalesOrderItemRow | undefined;
      const syncedAdjustedUnitPrice =
        Number(updated?.unitPrice ?? adjustedUnitPrice) || adjustedUnitPrice;
      const syncedLine: CartLine = {
        ...nextLine,
        salesOrderItemId: updated?.id ?? line.salesOrderItemId,
        adjustedUnitPrice: syncedAdjustedUnitPrice,
        baseUnitPrice: Math.max(0, syncedAdjustedUnitPrice - modifierPriceDelta),
        modifierPriceDelta,
      };
      setCartLines((lines) =>
        lines.map((entry) => (entry.id === line.id ? syncedLine : entry)),
      );
      cancelObservationEdit();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast({ title: t('ui.common.error', 'Error'), description: message, variant: 'destructive' });
    } finally {
      setObservationSavePending(false);
    }
  };

  useEffect(() => {
    if (serviceType !== 'dine_in' && tableId != null) {
      setTableId(null);
    }
  }, [serviceType, tableId]);

  useEffect(() => {
    if (!Number.isFinite(initialTableId) || initialTableId == null) return;
    if (initialSalesOrderId != null || initialOrderContextId != null) return;
    const match = availableDineInTables.find((row) => row.table.id === initialTableId);
    setTableId(match ? match.table.id : null);
  }, [initialTableId, initialSalesOrderId, initialOrderContextId, availableDineInTables]);

  useEffect(() => {
    const loadContinuation = async () => {
      if (
        (!Number.isFinite(initialSalesOrderId) || initialSalesOrderId == null) &&
        (!Number.isFinite(initialOrderContextId) || initialOrderContextId == null)
      ) {
        return;
      }
      setIsContinuationLoading(true);
      try {
        let context: OrderContextRow | null = null;
        let salesOrderId = initialSalesOrderId;
        if (Number.isFinite(initialOrderContextId) && initialOrderContextId != null) {
          const contextRes = await apiRequest('GET', `/api/erp/restaurant/orders/${initialOrderContextId}`);
          const contextJson = await contextRes.json();
          context = (contextJson.data ?? null) as OrderContextRow | null;
          salesOrderId = context?.salesOrderId ?? salesOrderId;
        }
        if (!Number.isFinite(salesOrderId) || salesOrderId == null) {
          throw new Error(t('erp.restaurant.pos.invalidContinuation', 'Invalid continuation request.'));
        }
        const orderRes = await apiRequest('GET', `/api/erp/sales-orders/${salesOrderId}`);
        const orderJson = await orderRes.json();
        const detail = (orderJson.data ?? null) as SalesOrderDetail | null;
        if (!detail) throw new Error(t('erp.restaurant.pos.continuationNotFound', 'Sales order not found.'));
        const resolvedContext = detail.restaurantContext ?? context;
        setLinkedSalesOrderId(detail.order.id);
        setLinkedOrderContextId(resolvedContext?.id ?? null);
        setRestaurantContextStatus(resolvedContext?.status ?? null);
        setHasInvoice(detail.hasInvoice ?? false);
        setLinkedInvoiceId(detail.invoiceId ?? null);
        setObservationsEditable(
          detail.observationsEditable ??
            (resolvedContext != null &&
              resolvedContext.status !== 'completed' &&
              resolvedContext.status !== 'cancelled' &&
              !(detail.hasInvoice ?? false)),
        );
        if (detail.checkoutCompleted) setCheckoutFinalized(true);
        if (resolvedContext?.serviceType) setServiceType(resolvedContext.serviceType);
        if (resolvedContext?.tableId != null) setTableId(resolvedContext.tableId);
        const items = detail.items ?? [];
        const mappedLines = await Promise.all(items.map((item) => mapPersistedItemToCartLine(item)));
        setCartLines(mappedLines);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        toast({ title: t('ui.common.error', 'Error'), description: message, variant: 'destructive' });
      } finally {
        setIsContinuationLoading(false);
      }
    };
    void loadContinuation();
  }, [initialSalesOrderId, initialOrderContextId, t, toast]);
  const serviceChargeAmount = Number(serviceCharge) || 0;
  const tipAmount = Number(tip) || 0;
  const taxAmount = subtotal * (TAX_RATE / 100);
  const total = subtotal + serviceChargeAmount + tipAmount + taxAmount;
  const addLine = () => {
    if (!selectedProduct) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: t('erp.restaurant.pos.invalidQuantity', 'Invalid quantity'), variant: 'destructive' });
      return;
    }
    const modifierSnapshot = [...selectedQuickModifiers];
    const baseUnitPrice = selectedBaseUnitPrice;
    const modifierPriceDelta = sumQuickModifierPriceDelta(modifierSnapshot);
    const adjustedUnitPrice = resolveAdjustedUnitPrice(baseUnitPrice, modifierPriceDelta);
    const modifierSignature = quickModifierSignature(modifierSnapshot);
    const finalInstructions = buildFinalInstructions(
      modifierSnapshot.map((item) => item.label),
      instructions,
    );
    const normalizedInstructions = finalInstructions.trim().toLowerCase();
    setCartLines((lines) => {
      const matchingIndex = lines.findIndex(
        (line) =>
          line.product.id === selectedProduct.id &&
          line.specialInstructions.trim().toLowerCase() === normalizedInstructions &&
          quickModifierSignature(line.selectedQuickModifiers) === modifierSignature &&
          line.adjustedUnitPrice === adjustedUnitPrice,
      );
      if (matchingIndex === -1) {
        return [
          ...lines,
          {
            id: `${selectedProduct.id}-${Date.now()}`,
            salesOrderItemId: null,
            product: selectedProduct,
            quantity: qty,
            baseUnitPrice,
            selectedQuickModifiers: modifierSnapshot,
            modifierPriceDelta,
            adjustedUnitPrice,
            specialInstructions: finalInstructions,
            canUseQuickModifiers: true,
          },
        ];
      }
      return lines.map((line, index) =>
        index === matchingIndex
          ? {
              ...line,
              quantity: line.quantity + qty,
            }
          : line,
      );
    });
    setSelectedProduct(null);
    setQuantity('1');
    setInstructions('');
    setSelectedQuickModifiers([]);
  };
  const updateLineQuantity = (lineId: string, nextQuantity: number) => {
    const normalized = Math.max(1, Math.floor(Number.isFinite(nextQuantity) ? nextQuantity : 1));
    setCartLines((lines) =>
      lines.map((line) => (line.id === lineId ? { ...line, quantity: normalized } : line))
    );
  };

  async function createSalesOrder() {
    if (linkedSalesOrderId != null) return linkedSalesOrderId;
    if (cartLines.length === 0) throw new Error(t('erp.restaurant.pos.addMenuItemFirst', 'Add at least one menu item first.'));
    const orderBody = {
      status: 'confirmed',
      subtotal: subtotal.toFixed(2),
      taxAmount: taxAmount.toFixed(2),
      discountAmount: '0',
      totalAmount: total.toFixed(2),
      currency: 'USD',
      notes: `Restaurant POS order${serviceChargeAmount ? ` | Service charge ${serviceChargeAmount.toFixed(2)}` : ''}${tipAmount ? ` | Tip ${tipAmount.toFixed(2)}` : ''}`,
      lineItems: cartLines.map((line, index) => toLinePayload(line, index)),
      restaurantContext: {
        serviceType,
        tableId: serviceType === 'dine_in' ? tableId : null,
        guestCount: null,
      },
      contactId: selectedContactId !== 'walk-in' ? Number(selectedContactId) : null,
    };
    const orderRes = await apiRequest('POST', '/api/erp/sales-orders', orderBody);
    const orderJson = await orderRes.json();
    if (!orderJson.success) {
      throw new Error(orderJson.error ?? t('erp.restaurant.pos.orderCreateFailed', 'Failed to create order.'));
    }
    const order = orderJson.data as { id: number };
    const context = (orderJson.restaurantContext ?? null) as OrderContextRow | null;
    const persistedItems = ((orderJson.items ?? null) as SalesOrderItemRow[] | null) ?? await loadSalesOrderItems(order.id);
    const sortedItems = [...persistedItems].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id,
    );
    if (sortedItems.length !== cartLines.length) {
      throw new Error(
        t(
          'erp.restaurant.pos.partialOrderCreate',
          'Order was created with incomplete line items. Please refresh and verify the order.',
        ),
      );
    }
    setCartLines((lines) =>
      lines.map((line, index) => ({
        ...line,
        salesOrderItemId: sortedItems[index]?.id ?? null,
      })),
    );
    setLinkedSalesOrderId(order.id);
    setLinkedOrderContextId(context?.id ?? null);
    setRestaurantContextStatus(context?.status ?? 'open');
    setObservationsEditable(true);
    setHasInvoice(false);
    setLinkedInvoiceId(null);
    return order.id;
  }

  async function loadOrderContext(salesOrderId: number) {
    const res = await apiRequest('GET', `/api/erp/restaurant/orders?salesOrderId=${salesOrderId}`);
    const json = await res.json();
    return (json.data?.data?.[0] ?? null) as OrderContextRow | null;
  }

  async function loadSalesOrderItems(salesOrderId: number) {
    const res = await apiRequest('GET', `/api/erp/sales-orders/${salesOrderId}/items`);
    const json = await res.json();
    return (json.data ?? []) as SalesOrderItemRow[];
  }

  const sendToKitchenMutation = useMutation({
    mutationFn: async () => {
      if (isOrderClosed) {
        throw new Error(t('erp.restaurant.pos.orderAlreadyCheckedOut', 'This order is already checked out.'));
      }
      const salesOrderId = linkedSalesOrderId ?? (await createSalesOrder());
      const context = await loadOrderContext(salesOrderId);
      if (!context && linkedOrderContextId == null) throw new Error(t('erp.restaurant.pos.contextNotCreated', 'Restaurant order context was not created.'));
      const contextId = context?.id ?? linkedOrderContextId;
      if (contextId == null) throw new Error(t('erp.restaurant.pos.contextNotCreated', 'Restaurant order context was not created.'));
      const station = (stationsQuery.data ?? [])
        .filter((item) => item.isActive !== false)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
      if (!station) throw new Error(t('erp.restaurant.pos.createKitchenStationFirst', 'Create a kitchen station before sending orders to the kitchen.'));
      const items = await loadSalesOrderItems(salesOrderId);
      await apiRequest('POST', '/api/erp/restaurant/kitchen/tickets', {
        ticket: {
          orderContextId: contextId,
          stationId: station.id,
          ticketNumber: `KOT-${Date.now()}`,
          status: 'queued',
          priority: 'normal',
          firedAt: new Date().toISOString(),
          notes: null,
        },
        items: items.map((item, index) => ({
          salesOrderItemId: item.id,
          productId: item.productId,
          variantId: item.variantId,
          quantity: item.quantity,
          status: 'queued',
          notes: null,
          sortOrder: item.sortOrder ?? index,
        })),
      });
      await apiRequest('PUT', `/api/erp/restaurant/orders/sales-order/${salesOrderId}`, { status: 'submitted' });
      return salesOrderId;
    },
    onSuccess: () => toast({ title: t('erp.restaurant.pos.sentToKitchen', 'Sent to kitchen') }),
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (isOrderClosed) {
        throw new Error(t('erp.restaurant.pos.orderAlreadyCheckedOut', 'This order is already checked out.'));
      }
      const salesOrderId = linkedSalesOrderId ?? await createSalesOrder();
      const res = await apiRequest('POST', '/api/erp/invoices/generate-from-order', { salesOrderId });
      const json = await res.json();
      return json.data as { id: number; invoiceNumber: string };
    },
    onSuccess: (invoice) => {
      setCheckoutFinalized(true);
      setHasInvoice(true);
      setLinkedInvoiceId(invoice.id);
      setObservationsEditable(false);
      setRestaurantContextStatus('completed');
      cancelObservationEdit();
      toast({ title: t('erp.restaurant.pos.orderReadyForCheckout', 'Order ready for checkout') });
      setLocation(`/erp/invoices?detail=${invoice.id}`);
    },
    onError: (error: Error) => toast({ title: t('ui.common.error', 'Error'), description: error.message, variant: 'destructive' }),
  });

  const canEditLineObservations = (line: CartLine) =>
    !isContinuationLoading &&
    !checkoutMutation.isPending &&
    !checkoutFinalized &&
    !hasInvoice &&
    !observationSavePending &&
    linkedOrderContextId != null &&
    observationsEditable &&
    restaurantContextStatus !== 'completed' &&
    restaurantContextStatus !== 'cancelled' &&
    linkedSalesOrderId != null &&
    line.salesOrderItemId != null;

  const hasActiveObservationEdit = observationEditLineId != null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden font-sans text-foreground">
      <Header />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 data-tour="pages-erp-restaurant-pos.h1.erp.restaurant.pos.title" className="text-2xl">{t('erp.restaurant.pos.title', 'POS / Cashier')}</h1>
            <p className="text-sm text-muted-foreground">
              {t('erp.restaurant.pos.subtitle', 'Build restaurant orders, send tickets to the kitchen, and continue to checkout.')}
            </p>
          </div>
          {linkedSalesOrderId ? (
            <Badge variant="secondary">
              {t('erp.restaurant.pos.orderWithId', 'Order #{{id}}', { id: String(linkedSalesOrderId) })}
            </Badge>
          ) : null}
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label>{t('erp.restaurant.pos.serviceType', 'Service type')}</Label>
                <Select value={serviceType} onValueChange={(value) => setServiceType(value as ServiceType)} disabled={isCartLocked}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent searchable>
                    <SelectItem value="dine_in">{t('erp.restaurant.pos.serviceTypeDineIn', 'Dine in')}</SelectItem>
                    <SelectItem value="takeaway">{t('erp.restaurant.pos.serviceTypeTakeaway', 'Takeaway')}</SelectItem>
                    <SelectItem value="delivery">{t('erp.restaurant.pos.serviceTypeDelivery', 'Delivery')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('erp.restaurant.pos.tableId', 'Table')}</Label>
                <Select
                  value={tableId != null ? String(tableId) : ''}
                  onValueChange={(value) => setTableId(value ? Number(value) : null)}
                  disabled={isTablePickerDisabled}
                >
                  <SelectTrigger data-tour="pages-erp-restaurant-pos.selecttrigger.erp.restaurant.pos.tableSelectPlaceholder">
                    <SelectValue placeholder={t('erp.restaurant.pos.tableSelectPlaceholder', 'Select available table')} />
                  </SelectTrigger>
                  <SelectContent searchable>
                    {availableDineInTables.map((row) => (
                      <SelectItem key={row.table.id} value={String(row.table.id)}>
                        {t('erp.restaurant.pos.tableOption', '{{label}} ({{code}}) • {{section}} • {{capacity}} seats', {
                          label: row.table.label,
                          code: row.table.code,
                          section: row.section?.name ?? t('erp.restaurant.tableFloors.unassignedFloor', 'Unassigned'),
                          capacity: String(row.table.capacity ?? 1),
                        })}
                      </SelectItem>
                    ))}
                    {tableId != null && selectedTableRow && !selectedTableRow.isAvailable ? (
                      <SelectItem key={`occupied-${selectedTableRow.table.id}`} value={String(selectedTableRow.table.id)}>
                        {t('erp.restaurant.pos.tableOccupiedOption', '{{label}} ({{code}}) • Occupied', {
                          label: selectedTableRow.table.label,
                          code: selectedTableRow.table.code,
                        })}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
                {serviceType === 'dine_in' && availableDineInTables.length === 0 ? (
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t('erp.restaurant.pos.noAvailableTables', 'No available dine-in tables.')}
                    {canManageErpSettings ? (
                      <Button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.manageTables"
                        type="button"
                        variant="link"
                        className="h-auto px-1 py-0 text-xs"
                        onClick={() => setLocation('/erp/restaurant/table-floors')}
                      >
                        {t('erp.restaurant.pos.manageTables', 'Manage tables/floors')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div>
                <Label>{t('erp.common.quantity', 'Quantity')}</Label>
                <Input data-tour="pages-erp-restaurant-pos.input.erp.restaurant.pos.serviceType" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={isCartLocked} />
              </div>
            </div>
            {canViewContacts ? (
              <div className="grid gap-2">
                <Label>{t('erp.restaurant.pos.customer.label', 'Customer')}</Label>
                <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.customer.walkIn"
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={contactPickerOpen}
                      className="w-full justify-between"
                      disabled={isCartLocked}
                    >
                      <span className="truncate text-left">
                        {selectedContactId === 'walk-in'
                          ? t('erp.restaurant.pos.customer.walkIn', 'Walk-in / No customer')
                          : ((contactsQuery.data ?? []).find((item) => String(item.id) === selectedContactId)?.name ??
                            t('erp.restaurant.pos.customer.searchPlaceholder', 'Search customer'))}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder={t('erp.restaurant.pos.customer.searchPlaceholder', 'Search customer')}
                        value={contactSearch}
                        onValueChange={setContactSearch}
                      />
                      <CommandList className="max-h-72">
                        <CommandItem
                          value="walk-in"
                          onSelect={() => {
                            setSelectedContactId('walk-in');
                            setContactPickerOpen(false);
                          }}
                        >
                          <Check className={cn('h-4 w-4', selectedContactId === 'walk-in' ? 'opacity-100' : 'opacity-0')} />
                          {t('erp.restaurant.pos.customer.walkIn', 'Walk-in / No customer')}
                        </CommandItem>
                        <CommandEmpty>{t('erp.restaurant.pos.customer.noResults', 'No customers found')}</CommandEmpty>
                        {(contactsQuery.data ?? []).map((contact) => (
                          <CommandItem
                            key={contact.id}
                            value={`${contact.name} ${contact.phone ?? ''} ${contact.email ?? ''}`}
                            onSelect={() => {
                              setSelectedContactId(String(contact.id));
                              setContactSearch(contact.name);
                              setContactPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn('h-4 w-4', selectedContactId === String(contact.id) ? 'opacity-100' : 'opacity-0')}
                            />
                            {contact.name}{contact.phone ? ` | ${contact.phone}` : contact.email ? ` | ${contact.email}` : ''}
                          </CommandItem>
                        ))}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {!isCartLocked && canCreateContact && contactSearch.trim() && (contactsQuery.data ?? []).length === 0 ? (
                  <Button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.customer.createNotFound"
                    type="button"
                    variant="outline"
                    className="justify-start"
                    onClick={() => {
                      setPendingContactName(contactSearch.trim());
                      setCreateContactOpen(true);
                    }}
                  >
                    {t('erp.restaurant.pos.customer.createNotFound', 'Create customer "{{name}}"', { name: contactSearch.trim() })}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
              <div>
                <Label>{t('erp.restaurant.pos.menuItem', 'Menu item')}</Label>
                <ProductPicker
                  companyId={companyId}
                  value={selectedProduct}
                  onChange={setSelectedProduct}
                  queryKeyScope="restaurant-pos"
                  menuItemsOnly
                  placeholder={t('erp.restaurant.pos.searchMenuItems', 'Search menu items')}
                  disabled={isCartLocked}
                />
              </div>
              <div>
                <Label>{t('erp.common.unitPrice', 'Unit price')}</Label>
                <Input data-tour="pages-erp-restaurant-pos.input.erp.restaurant.pos.menuItem" value={money(selectedBaseUnitPrice)} readOnly />
                {selectedModifierPriceDelta !== 0 ? (
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    <div>
                      {t('erp.restaurant.pos.modifierDelta', 'Modifier')}: {formatSignedPriceDelta(selectedModifierPriceDelta)}
                    </div>
                    <div className="font-medium text-foreground">
                      {t('erp.restaurant.pos.adjustedUnitPrice', 'Adjusted')}: {money(selectedAdjustedUnitPrice)}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t('erp.restaurant.pos.specialInstructions', 'Special instructions')}</Label>
              {selectedQuickModifiers.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedQuickModifiers.map((option) => (
                    <Badge key={option.key} variant="secondary" className="gap-1 pr-1">
                      <span>
                        {option.label}
                        {formatPriceDeltaSuffix(option.priceDelta)}
                      </span>
                      <button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.removeQuickModifier"
                        type="button"
                        className="rounded-sm p-0.5 hover:bg-muted"
                        disabled={isCartLocked}
                        onClick={() => removeQuickModifier(option.key)}
                        aria-label={t('erp.restaurant.pos.removeQuickModifier', 'Remove {{label}}', {
                          label: option.label,
                        })}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              ) : null}
              <Input data-tour="pages-erp-restaurant-pos.input.erp.restaurant.pos.specialInstructionsPlaceholder"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder={t('erp.restaurant.pos.specialInstructionsPlaceholder', 'No onions, sauce on side...')}
                disabled={isCartLocked}
              />
              {availableQuickModifiers.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t('erp.restaurant.pos.quickModifiers', 'Quick modifiers')}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {availableQuickModifiers.map((option) => {
                      const isSelected = selectedQuickModifiers.some((item) => item.key === option.key);
                      return (
                        <Button
                          key={option.key}
                          type="button"
                          size="sm"
                          variant={isSelected ? 'default' : 'outline'}
                          disabled={isCartLocked}
                          onClick={() => toggleQuickModifier(option)}
                        >
                          {option.label}
                          {formatPriceDeltaSuffix(option.priceDelta)}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <Button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.addToOrder" onClick={addLine} disabled={!selectedProduct || isCartLocked}>
              <Plus className="mr-2 h-4 w-4" />
              {t('erp.restaurant.pos.addToOrder', 'Add to order')}
            </Button>
            {isCartLocked ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  'erp.restaurant.pos.cartLockedHint',
                  'Structural cart edits are locked after order creation. You can still edit line observations in the order summary before checkout.',
                )}
              </p>
            ) : null}
          </section>

          <aside className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 data-tour="pages-erp-restaurant-pos.h2.erp.restaurant.pos.currentOrder" className="text-lg font-semibold">{t('erp.restaurant.pos.currentOrder', 'Current Order')}</h2>
              <Badge variant="outline">{t('erp.restaurant.pos.linesCount', '{{count}} lines', { count: String(cartLines.length) })}</Badge>
            </div>
            <div className="space-y-3">
              {cartLines.map((line) => {
                const instructionText = deriveManualInstructionText(
                  line.specialInstructions,
                  line.selectedQuickModifiers,
                );
                const isEditingObservations = observationEditLineId === line.id;
                const lineQuickModifiers = getLineAvailableQuickModifiers(line);
                const draftModifierPriceDelta = sumQuickModifierPriceDelta(observationDraftModifiers);
                const draftAdjustedUnitPrice = resolveAdjustedUnitPrice(
                  line.baseUnitPrice,
                  draftModifierPriceDelta,
                );
                const showObservationEdit = canEditLineObservations(line);
                return (
                <div key={line.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{line.product.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {line.quantity} x {money(isEditingObservations ? draftAdjustedUnitPrice : line.adjustedUnitPrice)}
                      </div>
                      {(isEditingObservations ? draftModifierPriceDelta : line.modifierPriceDelta) !== 0 ? (
                        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          <div>
                            {t('erp.common.unitPrice', 'Unit price')}: {money(line.baseUnitPrice)}
                          </div>
                          <div>
                            {t('erp.restaurant.pos.modifierDelta', 'Modifier')}:{' '}
                            {formatSignedPriceDelta(
                              isEditingObservations ? draftModifierPriceDelta : line.modifierPriceDelta,
                            )}
                          </div>
                          <div>
                            {t('erp.restaurant.pos.adjustedUnitPrice', 'Adjusted')}:{' '}
                            {money(isEditingObservations ? draftAdjustedUnitPrice : line.adjustedUnitPrice)}
                          </div>
                        </div>
                      ) : null}
                      <div className="mt-2 flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={isCartLocked || line.quantity <= 1}
                          onClick={() => updateLineQuantity(line.id, line.quantity - 1)}
                        >
                          -
                        </Button>
                        <Input
                          type="number"
                          min={1}
                          className="h-7 w-16 text-center"
                          value={String(line.quantity)}
                          disabled={isCartLocked}
                          onChange={(event) => {
                            const next = Number(event.target.value);
                            if (!Number.isFinite(next)) return;
                            updateLineQuantity(line.id, next);
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={isCartLocked}
                          onClick={() => updateLineQuantity(line.id, line.quantity + 1)}
                        >
                          +
                        </Button>
                      </div>
                      {isEditingObservations ? (
                        <div className="mt-3 space-y-2">
                          {observationDraftModifiers.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {observationDraftModifiers.map((modifier) => (
                                <Badge key={modifier.key} variant="secondary" className="gap-1 pr-1 text-xs">
                                  <span>
                                    {modifier.label}
                                    {formatPriceDeltaSuffix(modifier.priceDelta)}
                                  </span>
                                  <button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.removeQuickModifier"
                                    type="button"
                                    className="rounded-sm p-0.5 hover:bg-muted"
                                    onClick={() => removeObservationDraftModifier(modifier.key)}
                                    aria-label={t('erp.restaurant.pos.removeQuickModifier', 'Remove {{label}}', {
                                      label: modifier.label,
                                    })}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          <Input data-tour="pages-erp-restaurant-pos.input.erp.restaurant.pos.specialInstructionsPlaceholder"
                            value={observationDraftManual}
                            onChange={(event) => setObservationDraftManual(event.target.value)}
                            placeholder={t(
                              'erp.restaurant.pos.specialInstructionsPlaceholder',
                              'No onions, sauce on side...',
                            )}
                          />
                          {lineQuickModifiers.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {lineQuickModifiers.map((option) => {
                                const isSelected = observationDraftModifiers.some(
                                  (item) => item.key === option.key,
                                );
                                return (
                                  <Button
                                    key={option.key}
                                    type="button"
                                    size="sm"
                                    variant={isSelected ? 'default' : 'outline'}
                                    onClick={() => toggleObservationDraftModifier(option)}
                                  >
                                    {option.label}
                                    {formatPriceDeltaSuffix(option.priceDelta)}
                                  </Button>
                                );
                              })}
                            </div>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            <Button data-tour="pages-erp-restaurant-pos.button.ui.common.save"
                              type="button"
                              size="sm"
                              disabled={observationSavePending}
                              onClick={() => void saveObservationEdit(line)}
                            >
                              {observationSavePending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              {t('ui.common.save', 'Save')}
                            </Button>
                            <Button data-tour="pages-erp-restaurant-pos.button.ui.common.cancel"
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={observationSavePending}
                              onClick={cancelObservationEdit}
                            >
                              {t('ui.common.cancel', 'Cancel')}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {line.selectedQuickModifiers.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {line.selectedQuickModifiers.map((modifier) => (
                                <Badge key={modifier.key} variant="secondary" className="text-xs">
                                  {modifier.label}
                                  {modifier.priceDelta !== 0 ? formatPriceDeltaSuffix(modifier.priceDelta) : null}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                          {instructionText ? (
                            <div className="mt-1 text-xs text-muted-foreground">{instructionText}</div>
                          ) : null}
                          {showObservationEdit ? (
                            <Button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.editObservations"
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-2 h-7 px-2"
                              disabled={hasActiveObservationEdit && observationEditLineId !== line.id}
                              onClick={() => startObservationEdit(line)}
                            >
                              <Pencil className="mr-1 h-3 w-3" />
                              {t('erp.restaurant.pos.editObservations', 'Edit observations')}
                            </Button>
                          ) : null}
                        </>
                      )}
                      <div className="mt-2 text-sm font-medium">
                        {money(
                          line.quantity *
                            (isEditingObservations ? draftAdjustedUnitPrice : line.adjustedUnitPrice),
                        )}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={isCartLocked}
                      onClick={() => setCartLines((lines) => lines.filter((item) => item.id !== line.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
              })}
              {cartLines.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                  {t('erp.restaurant.pos.addMenuItemsHint', 'Add menu items to start an order.')}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 border-t pt-4">
              <div className="flex justify-between text-sm"><span>{t('erp.common.subtotal', 'Subtotal')}</span><span>{money(subtotal)}</span></div>
              <div>
                <Label>{t('erp.restaurant.pos.serviceCharge', 'Service charge')}</Label>
                <Input data-tour="pages-erp-restaurant-pos.input.erp.restaurant.pos.serviceCharge" value={serviceCharge} onChange={(event) => setServiceCharge(event.target.value)} />
              </div>
              <div>
                <Label>{t('erp.invoices.payment.tipAmount', 'Tip')}</Label>
                <Input data-tour="pages-erp-restaurant-pos.input.erp.restaurant.pos.serviceCharge" value={tip} onChange={(event) => setTip(event.target.value)} />
              </div>
              <div className="flex justify-between text-sm"><span>{t('erp.common.tax', 'Tax')}</span><span>{money(taxAmount)}</span></div>
              <div className="flex justify-between text-lg font-semibold"><span>{t('erp.common.total', 'Total')}</span><span>{money(total)}</span></div>
            </div>

            {isOrderClosed ? (
              <div className="space-y-2 rounded-lg border border-dashed bg-muted/40 p-4 text-sm">
                <p className="font-medium text-foreground">
                  {t('erp.restaurant.pos.orderCheckedOutTitle', 'This order is checked out')}
                </p>
                <p className="text-muted-foreground">
                  {t(
                    'erp.restaurant.pos.orderCheckedOutDescription',
                    'Kitchen and checkout actions are closed for this order. View the invoice to collect payment or print a receipt.',
                  )}
                </p>
                {linkedInvoiceId != null ? (
                  <Button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.viewInvoice"
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setLocation(`/erp/invoices?detail=${linkedInvoiceId}`)}
                  >
                    {t('erp.restaurant.pos.viewInvoice', 'View invoice')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2">
                <Button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.sendToKitchen"
                  onClick={() => sendToKitchenMutation.mutate()}
                  disabled={
                    isContinuationLoading ||
                    sendToKitchenMutation.isPending ||
                    cartLines.length === 0 ||
                    isOrderClosed
                  }
                >
                  {sendToKitchenMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {t('erp.restaurant.pos.sendToKitchen', 'Send to Kitchen')}
                </Button>
                <Button data-tour="pages-erp-restaurant-pos.button.erp.restaurant.pos.checkoutPay"
                  variant="outline"
                  onClick={() => checkoutMutation.mutate()}
                  disabled={
                    isContinuationLoading ||
                    checkoutMutation.isPending ||
                    cartLines.length === 0 ||
                    hasActiveObservationEdit ||
                    observationSavePending ||
                    isOrderClosed
                  }
                >
                  {checkoutMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('erp.restaurant.pos.checkoutPay', 'Checkout / Pay')}
                </Button>
              </div>
            )}
          </aside>
        </div>
      </main>
      <CreateContactModal
        isOpen={createContactOpen}
        onClose={() => setCreateContactOpen(false)}
        compact
        initialName={pendingContactName}
        onCreated={(contact) => {
          queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
          setSelectedContactId(String(contact.id));
          setContactSearch(contact.name || pendingContactName);
        }}
      />
    </div>
  );
}

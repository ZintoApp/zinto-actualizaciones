import { useState, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import {
  Trash2,
  Copy,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Globe,
  KeyRound,
} from 'lucide-react';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import { MASTER_SHOP_FLOW_NODE_ICON_SRC } from '@/pages/flow-builder-node-catalog';
import {
  type MasterShopActionNodeData,
  type MasterShopOperationId,
  type MasterShopPaymentMethod,
  MASTER_SHOP_API_BASE_URL,
  MASTER_SHOP_AUTH_HEADER,
  MASTER_SHOP_OPERATIONS,
  MASTER_SHOP_OPERATION_IDS,
  MASTER_SHOP_RESPONSE_VARIABLES,
  MASTER_SHOP_ORDER_STATUSES,
  MASTER_SHOP_ORDER_STATUS_GROUPS,
  MASTER_SHOP_WALLET_MOVEMENT_STATUSES,
  MASTER_SHOP_WALLET_MOVEMENT_DIRECTIONS,
  MASTER_SHOP_WALLET_BALANCE_MOVEMENT_TYPE_LABELS,
  MASTER_SHOP_PAYMENT_METHODS,
} from '@shared/types/mastershop';
import { createMasterShopDisplayLabels } from './mastershop-display-labels';

interface MasterShopNodeProps {
  id: string;
  data: MasterShopActionNodeData;
  isConnectable: boolean;
}

const ADDRESS_FIELDS = [
  'country',
  'state',
  'city',
  'address1',
  'address2',
  'company',
  'zip',
  'full_name',
  'first_name',
  'last_name',
  'phone',
] as const;

interface OrderItemRow {
  id_variant: string;
  id_product: string;
  quantity: string;
  sku: string;
  name: string;
  weight: string;
  price: string;
}

interface AdditionalChargeRow {
  type_charge: string;
  value: string;
}

const EMPTY_ORDER_ITEM = (): OrderItemRow => ({
  id_variant: '',
  id_product: '',
  quantity: '1',
  sku: '',
  name: '',
  weight: '',
  price: '',
});

const EMPTY_CHARGE = (): AdditionalChargeRow => ({
  type_charge: '',
  value: '',
});

function filterStr(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (value === undefined || value === null) return '';
  return String(value);
}

function nestedStr(obj: Record<string, unknown>, section: string, field: string): string {
  const sectionVal = obj[section];
  if (!sectionVal || typeof sectionVal !== 'object') return '';
  const value = (sectionVal as Record<string, unknown>)[field];
  if (value === undefined || value === null) return '';
  return String(value);
}

function nestedOrderStr(obj: Record<string, unknown>, field: string): string {
  const documented = nestedStr(obj, 'order_transaction', field);
  if (documented) return documented;
  return nestedStr(obj, 'transaction', field);
}

function parseOrderItems(orderBody: Record<string, unknown>): OrderItemRow[] {
  const raw = orderBody.order_items ?? orderBody.orderItems;
  if (!Array.isArray(raw) || raw.length === 0) return [EMPTY_ORDER_ITEM()];
  return raw.map((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      id_variant: row.id_variant != null ? String(row.id_variant) : '',
      id_product: row.id_product != null ? String(row.id_product) : '',
      quantity: row.quantity != null ? String(row.quantity) : '1',
      sku: row.sku != null ? String(row.sku) : '',
      name: row.name != null ? String(row.name) : '',
      weight: row.weight != null ? String(row.weight) : '',
      price: row.price != null ? String(row.price) : '',
    };
  });
}

function parseAdditionalCharges(orderBody: Record<string, unknown>): AdditionalChargeRow[] {
  const raw = orderBody.additional_charge ?? orderBody.additionalCharges;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    return {
      type_charge: row.type_charge != null ? String(row.type_charge) : '',
      value: row.value != null ? String(row.value) : '',
    };
  });
}

function isValidJson(str: string): boolean {
  if (!str.trim()) return true;
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function resolveEndpointPath(
  path: string,
  params: { id?: string; idOrder?: string }
): string {
  let resolved = path;
  if (params.id?.trim()) {
    resolved = resolved.replace('{id}', params.id.trim());
  }
  if (params.idOrder?.trim()) {
    resolved = resolved.replace('{idOrder}', params.idOrder.trim());
  }
  return resolved;
}

function buildQueryString(fields: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      params.append(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function getMethodColor(method: string): string {
  switch (method) {
    case 'GET':
      return 'text-blue-600 dark:text-blue-400';
    case 'POST':
      return 'text-green-600 dark:text-green-400';
    default:
      return 'text-muted-foreground';
  }
}

export function MasterShopNode({ id, data, isConnectable }: MasterShopNodeProps) {
  const { t } = useTranslation();
  const labels = useMemo(() => createMasterShopDisplayLabels(t), [t]);
  const { toast } = useToast();
  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, flowId, customVariables } = useFlowContext();

  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showVariablePreview, setShowVariablePreview] = useState(false);

  const [apiKey, setApiKey] = useState(data.apiKey || '');
  const [operation, setOperation] = useState<MasterShopOperationId>(
    data.operation || 'products_list_search'
  );
  const [page, setPage] = useState(data.page ?? 1);
  const [limit, setLimit] = useState(data.limit ?? 20);
  const [category, setCategory] = useState(data.category || '');
  const [search, setSearch] = useState(data.search || '');
  const [orderId, setOrderId] = useState(data.id || data.orderId || '');
  const [idOrder, setIdOrder] = useState(data.idOrder || '');
  const [phone, setPhone] = useState(data.phone || '');
  const [orderBody, setOrderBody] = useState<Record<string, unknown>>(data.orderBody || {});
  const [filterBody, setFilterBody] = useState<Record<string, unknown>>(
    data.filterBody || data.walletFilterBody || {}
  );
  const [rawJsonOverride, setRawJsonOverride] = useState(data.rawJsonOverride ?? false);
  const [rawJsonBody, setRawJsonBody] = useState(data.rawJsonBody || '');
  const [outputVariables] = useState<readonly string[]>(
    data.outputVariables?.length ? data.outputVariables : [...MASTER_SHOP_RESPONSE_VARIABLES]
  );
  const [filterBodyJsonText, setFilterBodyJsonText] = useState(() =>
    JSON.stringify(data.filterBody || data.walletFilterBody || {}, null, 2)
  );

  const opDef = MASTER_SHOP_OPERATIONS[operation];

  useEffect(() => {
    setFilterBodyJsonText(JSON.stringify(filterBody, null, 2));
  }, [filterBody]);

  const updateNodeData = useCallback(
    (updates: Partial<MasterShopActionNodeData>) => {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, ...updates } } : node
        )
      );
    },
    [id, setNodes]
  );

  useEffect(() => {
    updateNodeData({
      apiKey,
      operation,
      page,
      limit,
      category,
      search,
      id: orderId,
      idOrder,
      phone,
      orderBody,
      filterBody,
      rawJsonOverride,
      rawJsonBody,
      outputVariables,
    });
  }, [
    updateNodeData,
    apiKey,
    operation,
    page,
    limit,
    category,
    search,
    orderId,
    idOrder,
    phone,
    orderBody,
    filterBody,
    rawJsonOverride,
    rawJsonBody,
    outputVariables,
  ]);

  const copyVariableToClipboard = useCallback(
    async (variable: string) => {
      try {
        await navigator.clipboard.writeText(`{{${variable}}}`);
        toast({
          title: t('flow_builder.mastershop.copied', 'Copied'),
          description: t(
            'flow_builder.mastershop.copied_description',
            'Variable copied to clipboard'
          ),
        });
      } catch {
        toast({
          title: t('flow_builder.mastershop.copy_failed', 'Copy failed'),
          description: t(
            'flow_builder.mastershop.copy_failed_description',
            'Could not copy to clipboard'
          ),
          variant: 'destructive',
        });
      }
    },
    [toast, t]
  );

  const updateOrderSection = useCallback(
    (section: string, field: string, value: string) => {
      setOrderBody((prev) => {
        const existing =
          prev[section] && typeof prev[section] === 'object'
            ? (prev[section] as Record<string, unknown>)
            : section === 'order_transaction' &&
                prev.transaction &&
                typeof prev.transaction === 'object'
              ? (prev.transaction as Record<string, unknown>)
              : {};
        const nextSection = { ...existing };
        if (value.trim() === '') {
          delete nextSection[field];
        } else {
          nextSection[field] = value;
        }
        const next = { ...prev, [section]: nextSection };
        if (section === 'order_transaction') {
          const { transaction: _legacy, ...rest } = next;
          return rest;
        }
        return next;
      });
    },
    []
  );

  const updateOrderScalar = useCallback((field: string, value: string) => {
    setOrderBody((prev) => {
      const next = { ...prev };
      if (value.trim() === '') {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  }, []);

  const mirrorShippingToBilling = useCallback(() => {
    setOrderBody((prev) => {
      const shipping =
        prev.shipping_address && typeof prev.shipping_address === 'object'
          ? (prev.shipping_address as Record<string, unknown>)
          : {};
      return { ...prev, billing_address: { ...shipping } };
    });
  }, []);

  const orderItems = useMemo(() => parseOrderItems(orderBody), [orderBody]);
  const additionalCharges = useMemo(() => parseAdditionalCharges(orderBody), [orderBody]);

  const setOrderItems = useCallback((items: OrderItemRow[]) => {
    setOrderBody((prev) => {
      const { orderItems: _legacyItems, ...rest } = prev;
      return {
        ...rest,
        order_items: items.map((item) => ({
        ...(item.id_variant ? { id_variant: item.id_variant } : {}),
        ...(item.id_product ? { id_product: item.id_product } : {}),
        quantity: item.quantity ? Number(item.quantity) || item.quantity : 1,
        ...(item.sku ? { sku: item.sku } : {}),
        ...(item.name ? { name: item.name } : {}),
        ...(item.weight ? { weight: item.weight } : {}),
        ...(item.price ? { price: item.price } : {}),
      })),
      };
    });
  }, []);

  const setAdditionalCharges = useCallback((charges: AdditionalChargeRow[]) => {
    setOrderBody((prev) => {
      const { additionalCharges: _legacyCharges, ...rest } = prev;
      return {
        ...rest,
        additional_charge: charges.map((charge) => ({
          ...(charge.type_charge ? { type_charge: charge.type_charge } : {}),
          ...(charge.value ? { value: charge.value } : {}),
        })),
      };
    });
  }, []);

  const updateFilterField = useCallback((key: string, value: string | number | undefined) => {
    setFilterBody((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '' || value === null) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }, []);

  const syncRawJsonFromGuided = useCallback(() => {
    let payload: Record<string, unknown> = {};
    if (operation === 'create_order') {
      payload = orderBody;
    } else if (operation === 'list_orders' || operation === 'wallet_movements_list') {
      payload = filterBody;
    } else if (operation === 'validate_customer_phone') {
      payload = { phone };
    }
    setRawJsonBody(JSON.stringify(payload, null, 2));
  }, [operation, orderBody, filterBody, phone]);

  const MASTER_SHOP_TEMPLATES = useMemo(
    () => [
      {
        id: 'product_search',
        name: labels.templateLabel('product_search', 'Product search'),
        apply: () => {
          setOperation('products_list_search');
          setPage(1);
          setLimit(20);
          setSearch('{{message.content}}');
          setCategory('');
        },
      },
      {
        id: 'create_cod_order',
        name: labels.templateLabel('create_cod_order', 'Create COD order'),
        apply: () => {
          const body: Record<string, unknown> = {
            customer: {
              full_name: '{{contact.name}}',
              first_name: '{{contact.first_name}}',
              last_name: '{{contact.last_name}}',
              email: '{{contact.email}}',
              phone: '{{contact.phone}}',
            },
            shipping_address: {
              full_name: '{{contact.name}}',
              first_name: '{{contact.first_name}}',
              last_name: '{{contact.last_name}}',
              phone: '{{contact.phone}}',
              address1: '{{contact.address}}',
              city: '{{contact.city}}',
              state: '{{contact.state}}',
              country: '{{contact.country}}',
              zip: '{{contact.zip}}',
            },
            billing_address: {
              full_name: '{{contact.name}}',
              first_name: '{{contact.first_name}}',
              last_name: '{{contact.last_name}}',
              phone: '{{contact.phone}}',
              address1: '{{contact.address}}',
              city: '{{contact.city}}',
              state: '{{contact.state}}',
              country: '{{contact.country}}',
              zip: '{{contact.zip}}',
            },
            order_transaction: {
              total: '{{order.total}}',
              currency: 'COP',
              payment_method: MASTER_SHOP_PAYMENT_METHODS.COD,
            },
            order_items: [
              {
                id_variant: '{{product.variant_id}}',
                id_product: '{{product.id}}',
                quantity: 1,
                sku: '{{product.sku}}',
                name: '{{product.name}}',
                price: '{{product.price}}',
              },
            ],
          };
          setOperation('create_order');
          setOrderBody(body);
          setRawJsonBody(JSON.stringify(body, null, 2));
        },
      },
      {
        id: 'list_delivered_orders',
        name: labels.templateLabel('list_delivered_orders', 'List delivered orders'),
        apply: () => {
          const filters = {
            orderStatusParent: 'Finalizadas',
            orderStatus: 'Entregada',
          };
          setOperation('list_orders');
          setPage(1);
          setLimit(50);
          setFilterBody(filters);
          setRawJsonBody(JSON.stringify(filters, null, 2));
        },
      },
      {
        id: 'wallet_movement_lookup',
        name: labels.templateLabel('wallet_movement_lookup', 'Wallet movement lookup'),
        apply: () => {
          const filters = {
            idOrder: '{{mastershop.order.id}}',
            type: 'deposit',
            movementStatus: 'SUCCESS',
          };
          setOperation('wallet_movements_list');
          setPage(1);
          setLimit(50);
          setFilterBody(filters);
          setRawJsonBody(JSON.stringify(filters, null, 2));
        },
      },
      {
        id: 'validate_phone',
        name: labels.templateLabel('validate_phone', 'Validate phone'),
        apply: () => {
          setOperation('validate_customer_phone');
          setPhone('{{contact.phone}}');
          setRawJsonBody(JSON.stringify({ phone: '{{contact.phone}}' }, null, 2));
        },
      },
    ],
    [labels]
  );

  const applyTemplate = (templateId: string) => {
    const template = MASTER_SHOP_TEMPLATES.find((item) => item.id === templateId);
    template?.apply();
  };

  const resolvedPath = resolveEndpointPath(opDef.path, { id: orderId, idOrder });
  const queryPreview =
    operation === 'products_list_search'
      ? buildQueryString({ page, limit, category, search })
      : operation === 'list_orders' || operation === 'wallet_movements_list'
        ? buildQueryString({ page, limit })
        : '';
  const endpointPreview = `${MASTER_SHOP_API_BASE_URL}${resolvedPath}${queryPreview}`;

  const guidedBodyPreview = useMemo(() => {
    if (operation === 'create_order') {
      return JSON.stringify(orderBody, null, 2);
    }
    if (operation === 'list_orders' || operation === 'wallet_movements_list') {
      return JSON.stringify(filterBody, null, 2);
    }
    if (operation === 'validate_customer_phone') {
      return JSON.stringify({ phone }, null, 2);
    }
    return '{}';
  }, [operation, orderBody, filterBody, phone]);

  const bodyModeLabel = rawJsonOverride
    ? t('flow_builder.mastershop.body_mode_raw', 'Raw JSON override')
    : t('flow_builder.mastershop.body_mode_guided', 'Guided fields');

  const renderAddressSection = (
    sectionKey: 'shipping_address' | 'billing_address',
    title: string,
    mirrorButton?: boolean
  ) => (
    <div className="space-y-2 pt-2 border-t border-border">
      <div className="flex items-center justify-between">
        <Label className="font-medium text-foreground">{title}</Label>
        {mirrorButton && (
          <Button data-tour="components-flow-builder-mastershopnode.button.flow_builder.mastershop.mirror_shipping"
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={mirrorShippingToBilling}
          >
            {t('flow_builder.mastershop.mirror_shipping', 'Mirror shipping')}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ADDRESS_FIELDS.map((field) => (
          <div key={`${sectionKey}-${field}`} className={field === 'address1' ? 'col-span-2' : ''}>
            <Label className="text-[10px] text-muted-foreground mb-0.5 block">
              {labels.addressFieldLabel(field)}
            </Label>
            <EnhancedVariablePicker
              customVariables={customVariables}
              flowId={flowId ?? undefined}
              value={nestedStr(orderBody, sectionKey, field)}
              onChange={(value) => updateOrderSection(sectionKey, field, value)}
              placeholder={field}
              className="flex-1 min-w-0"
              pickerButtonClassName="h-7 w-7 p-0 shrink-0"
            />
          </div>
        ))}
      </div>
    </div>
  );

  const renderOperationFields = () => {
    switch (operation) {
      case 'products_list_search':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs mb-1 block">
                  {t('flow_builder.mastershop.page', 'Page')}
                </Label>
                <Input data-tour="components-flow-builder-mastershopnode.input.flow_builder.mastershop.page"
                  type="number"
                  min={1}
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value) || 1)}
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">
                  {t('flow_builder.mastershop.limit', 'Limit')}
                </Label>
                <Input data-tour="components-flow-builder-mastershopnode.input.flow_builder.mastershop.page"
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 1)}
                  className="text-xs h-7"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {t('flow_builder.mastershop.limit_hint', 'Mastershop maximum is 50')}
                </p>
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.category', 'Category')}
              </Label>
              <EnhancedVariablePicker
                customVariables={customVariables}
                flowId={flowId ?? undefined}
                value={category}
                onChange={setCategory}
                className="flex-1 min-w-0"
                pickerButtonClassName="h-7 w-7 p-0 shrink-0"
              />
            </div>
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.search', 'Search')}
              </Label>
              <EnhancedVariablePicker
                customVariables={customVariables}
                flowId={flowId ?? undefined}
                value={search}
                onChange={setSearch}
                className="flex-1 min-w-0"
                pickerButtonClassName="h-7 w-7 p-0 shrink-0"
              />
            </div>
          </div>
        );

      case 'get_order_by_id':
        return (
          <div className="space-y-2">
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.order_id', 'Order ID')}
              </Label>
              <EnhancedVariablePicker
                customVariables={customVariables}
                flowId={flowId ?? undefined}
                value={orderId}
                onChange={setOrderId}
                placeholder="12345"
                className="flex-1 min-w-0"
                pickerButtonClassName="h-7 w-7 p-0 shrink-0"
              />
            </div>
            <p className="text-[10px] text-muted-foreground font-mono break-all">
              {endpointPreview}
            </p>
          </div>
        );

      case 'get_order_return_tracking':
        return (
          <div className="space-y-2">
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.id_order', 'Order ID (return tracking)')}
              </Label>
              <EnhancedVariablePicker
                customVariables={customVariables}
                flowId={flowId ?? undefined}
                value={idOrder}
                onChange={setIdOrder}
                placeholder="12345"
                className="flex-1 min-w-0"
                pickerButtonClassName="h-7 w-7 p-0 shrink-0"
              />
            </div>
            <p className="text-[10px] text-muted-foreground font-mono break-all">
              {endpointPreview}
            </p>
          </div>
        );

      case 'validate_customer_phone':
        return (
          <div className="space-y-2">
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.phone', 'Phone')}
              </Label>
              <EnhancedVariablePicker
                customVariables={customVariables}
                flowId={flowId ?? undefined}
                value={phone}
                onChange={setPhone}
                placeholder="{{contact.phone}}"
                className="flex-1 min-w-0"
                pickerButtonClassName="h-7 w-7 p-0 shrink-0"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {t(
                  'flow_builder.mastershop.phone_hint',
                  'Mastershop expects the request body field "phone".'
                )}
              </p>
            </div>
          </div>
        );

      case 'create_order':
        return (
          <div className="space-y-2">
            <div className="space-y-2">
              <Label className="font-medium text-foreground">
                {t('flow_builder.mastershop.order_identity', 'Order identity')}
              </Label>
              {(['id_order', 'notes', 'tags'] as const).map((field) => (
                <div key={field}>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                    {labels.orderIdentityFieldLabel(field)}
                  </Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    flowId={flowId ?? undefined}
                    value={
                      orderBody[field] != null ? String(orderBody[field]) : ''
                    }
                    onChange={(value) => updateOrderScalar(field, value)}
                    className="flex-1 min-w-0"
                    pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                  />
                </div>
              ))}
            </div>

            {renderAddressSection(
              'shipping_address',
              t('flow_builder.mastershop.shipping_address', 'Shipping address')
            )}
            {renderAddressSection(
              'billing_address',
              t('flow_builder.mastershop.billing_address', 'Billing address'),
              true
            )}

            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="font-medium text-foreground">
                {t('flow_builder.mastershop.transaction', 'Transaction')}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                    {t('flow_builder.mastershop.total', 'Total')}
                  </Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    flowId={flowId ?? undefined}
                    value={nestedOrderStr(orderBody, 'total')}
                    onChange={(value) => updateOrderSection('order_transaction', 'total', value)}
                    className="flex-1 min-w-0"
                    pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                    {t('flow_builder.mastershop.currency', 'Currency')}
                  </Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    flowId={flowId ?? undefined}
                    value={nestedOrderStr(orderBody, 'currency')}
                    onChange={(value) => updateOrderSection('order_transaction', 'currency', value)}
                    className="flex-1 min-w-0"
                    pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                  />
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                    {t('flow_builder.mastershop.payment_method', 'Payment method')}
                  </Label>
                  <Select
                    value={nestedOrderStr(orderBody, 'payment_method') || undefined}
                    onValueChange={(value) =>
                      updateOrderSection('order_transaction', 'payment_method', value)
                    }
                  >
                    <SelectTrigger data-tour="components-flow-builder-mastershopnode.selecttrigger.flow_builder.mastershop.select_payment_method" className="text-xs h-7">
                      <SelectValue
                        placeholder={t(
                          'flow_builder.mastershop.select_payment_method',
                          'Select payment method'
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.values(MASTER_SHOP_PAYMENT_METHODS).map((method) => (
                        <SelectItem key={method} value={method}>
                          {labels.paymentMethodLabel(method as MasterShopPaymentMethod)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                    {t('flow_builder.mastershop.payment_gateway', 'Payment gateway (optional)')}
                  </Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    flowId={flowId ?? undefined}
                    value={nestedOrderStr(orderBody, 'payment_gateway')}
                    onChange={(value) =>
                      updateOrderSection('order_transaction', 'payment_gateway', value)
                    }
                    className="flex-1 min-w-0"
                    pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <Label className="font-medium text-foreground">
                {t('flow_builder.mastershop.customer', 'Customer')}
              </Label>
              {(
                [
                  'full_name',
                  'first_name',
                  'last_name',
                  'email',
                  'phone',
                  'tags',
                  'documentType',
                  'documentNumber',
                ] as const
              ).map((field) => (
                <div key={field}>
                  <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                    {labels.customerFieldLabel(field)}
                  </Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    flowId={flowId ?? undefined}
                    value={nestedStr(orderBody, 'customer', field)}
                    onChange={(value) => updateOrderSection('customer', field, value)}
                    className="flex-1 min-w-0"
                    pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-foreground">
                  {t('flow_builder.mastershop.order_items', 'Order items')}
                </Label>
                <Button data-tour="components-flow-builder-mastershopnode.button.common.add"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setOrderItems([...orderItems, EMPTY_ORDER_ITEM()])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('common.add', 'Add')}
                </Button>
              </div>
              {orderItems.map((item, index) => (
                <div key={index} className="p-2 border border-border rounded space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {t('flow_builder.mastershop.item_n', 'Item {{n}}', { n: index + 1 })}
                    </span>
                    {orderItems.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0 text-destructive"
                        onClick={() =>
                          setOrderItems(orderItems.filter((_, i) => i !== index))
                        }
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['id_variant', 'text'],
                        ['id_product', 'text'],
                        ['quantity', 'number'],
                        ['sku', 'text'],
                        ['name', 'text'],
                        ['weight', 'text'],
                        ['price', 'text'],
                      ] as const
                    ).map(([field, type]) => (
                      <div key={field}>
                        <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                          {labels.orderItemFieldLabel(field)}
                        </Label>
                        {type === 'number' ? (
                          <Input
                            type="number"
                            min={1}
                            value={item[field]}
                            onChange={(e) => {
                              const next = [...orderItems];
                              next[index] = { ...next[index], [field]: e.target.value };
                              setOrderItems(next);
                            }}
                            className="text-xs h-7"
                          />
                        ) : (
                          <EnhancedVariablePicker
                            customVariables={customVariables}
                            flowId={flowId ?? undefined}
                            value={item[field]}
                            onChange={(value) => {
                              const next = [...orderItems];
                              next[index] = { ...next[index], [field]: value };
                              setOrderItems(next);
                            }}
                            className="flex-1 min-w-0"
                            pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <Label className="font-medium text-foreground">
                  {t('flow_builder.mastershop.additional_charges', 'Additional charges')}
                </Label>
                <Button data-tour="components-flow-builder-mastershopnode.button.common.add"
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={() => setAdditionalCharges([...additionalCharges, EMPTY_CHARGE()])}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('common.add', 'Add')}
                </Button>
              </div>
              {additionalCharges.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {t('flow_builder.mastershop.no_charges', 'No additional charges configured.')}
                </p>
              )}
              {additionalCharges.map((charge, index) => (
                <div key={index} className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                      {t('flow_builder.mastershop.type_charge', 'Type')}
                    </Label>
                    <EnhancedVariablePicker
                      customVariables={customVariables}
                      flowId={flowId ?? undefined}
                      value={charge.type_charge}
                      onChange={(value) => {
                        const next = [...additionalCharges];
                        next[index] = { ...next[index], type_charge: value };
                        setAdditionalCharges(next);
                      }}
                      className="flex-1 min-w-0"
                      pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                      {t('flow_builder.mastershop.charge_value', 'Value')}
                    </Label>
                    <EnhancedVariablePicker
                      customVariables={customVariables}
                      flowId={flowId ?? undefined}
                      value={charge.value}
                      onChange={(value) => {
                        const next = [...additionalCharges];
                        next[index] = { ...next[index], value: value };
                        setAdditionalCharges(next);
                      }}
                      className="flex-1 min-w-0"
                      pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive shrink-0"
                    onClick={() =>
                      setAdditionalCharges(additionalCharges.filter((_, i) => i !== index))
                    }
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        );

      case 'list_orders':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs mb-1 block">
                  {t('flow_builder.mastershop.page', 'Page')}
                </Label>
                <Input data-tour="components-flow-builder-mastershopnode.input.flow_builder.mastershop.page"
                  type="number"
                  min={1}
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value) || 1)}
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">
                  {t('flow_builder.mastershop.limit', 'Limit')}
                </Label>
                <Input data-tour="components-flow-builder-mastershopnode.input.flow_builder.mastershop.page"
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 1)}
                  className="text-xs h-7"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.order_status_parent', 'Order status group')}
              </Label>
              <Select
                value={filterStr(filterBody, 'orderStatusParent') || undefined}
                onValueChange={(value) => updateFilterField('orderStatusParent', value)}
              >
                <SelectTrigger data-tour="components-flow-builder-mastershopnode.selecttrigger.flow_builder.mastershop.any_group" className="text-xs h-7">
                  <SelectValue placeholder={t('flow_builder.mastershop.any_group', 'Any group')} />
                </SelectTrigger>
                <SelectContent>
                  {MASTER_SHOP_ORDER_STATUS_GROUPS.map((group) => (
                    <SelectItem key={group.id} value={group.label}>
                      {labels.orderStatusGroupLabel(group.id, group.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.order_status', 'Order status')}
              </Label>
              <Select
                value={filterStr(filterBody, 'orderStatus') || undefined}
                onValueChange={(value) => updateFilterField('orderStatus', value)}
              >
                <SelectTrigger data-tour="components-flow-builder-mastershopnode.selecttrigger.flow_builder.mastershop.any_status" className="text-xs h-7">
                  <SelectValue placeholder={t('flow_builder.mastershop.any_status', 'Any status')} />
                </SelectTrigger>
                <SelectContent>
                  {MASTER_SHOP_ORDER_STATUSES.map((status) => (
                    <SelectItem key={status.id_status} value={status.label}>
                      {labels.orderStatusLabel(status.id_status, status.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.payment_method', 'Payment method')}
              </Label>
              <Select
                value={filterStr(filterBody, 'paymentMethod') || undefined}
                onValueChange={(value) => updateFilterField('paymentMethod', value)}
              >
                <SelectTrigger data-tour="components-flow-builder-mastershopnode.selecttrigger.flow_builder.mastershop.any_payment" className="text-xs h-7">
                  <SelectValue
                    placeholder={t('flow_builder.mastershop.any_payment', 'Any payment method')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(MASTER_SHOP_PAYMENT_METHODS).map((method) => (
                    <SelectItem key={method} value={method}>
                      {labels.paymentMethodLabel(method as MasterShopPaymentMethod)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(
              [
                'idOrder',
                'externalOrderId',
                'carrierTrackingCode',
                'customerText',
                'customerPhone',
                'clientText',
                'clientPhone',
                'startDate',
                'finalDate',
              ] as const
            ).map((field) => (
              <div key={field}>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                  {labels.listOrderFilterFieldLabel(field)}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  flowId={flowId ?? undefined}
                  value={filterStr(filterBody, field)}
                  onChange={(value) => updateFilterField(field, value)}
                  className="flex-1 min-w-0"
                  pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                />
              </div>
            ))}
          </div>
        );

      case 'wallet_movements_list':
        return (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs mb-1 block">
                  {t('flow_builder.mastershop.page', 'Page')}
                </Label>
                <Input data-tour="components-flow-builder-mastershopnode.input.flow_builder.mastershop.page"
                  type="number"
                  min={1}
                  value={page}
                  onChange={(e) => setPage(Number(e.target.value) || 1)}
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">
                  {t('flow_builder.mastershop.limit', 'Limit')}
                </Label>
                <Input data-tour="components-flow-builder-mastershopnode.input.flow_builder.mastershop.page"
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value) || 1)}
                  className="text-xs h-7"
                />
              </div>
            </div>
            {(
              [
                'startDate',
                'finalDate',
                'idOrder',
                'carrierTrackingCode',
              ] as const
            ).map((field) => (
              <div key={field}>
                <Label className="text-[10px] text-muted-foreground mb-0.5 block">
                  {labels.walletFilterFieldLabel(field)}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  flowId={flowId ?? undefined}
                  value={filterStr(filterBody, field)}
                  onChange={(value) => updateFilterField(field, value)}
                  className="flex-1 min-w-0"
                  pickerButtonClassName="h-7 w-7 p-0 shrink-0"
                />
              </div>
            ))}
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.balance_movement_type', 'Balance movement type')}
              </Label>
              <Select
                value={filterStr(filterBody, 'balanceMovementType') || undefined}
                onValueChange={(value) => updateFilterField('balanceMovementType', value)}
              >
                <SelectTrigger data-tour="components-flow-builder-mastershopnode.selecttrigger.flow_builder.mastershop.any_type" className="text-xs h-7">
                  <SelectValue placeholder={t('flow_builder.mastershop.any_type', 'Any type')} />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(MASTER_SHOP_WALLET_BALANCE_MOVEMENT_TYPE_LABELS).map((label) => (
                    <SelectItem key={label} value={label}>
                      {labels.walletBalanceMovementTypeLabel(label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.movement_direction', 'Movement direction')}
              </Label>
              <Select
                value={filterStr(filterBody, 'type') || undefined}
                onValueChange={(value) => updateFilterField('type', value)}
              >
                <SelectTrigger data-tour="components-flow-builder-mastershopnode.selecttrigger.flow_builder.mastershop.any_direction" className="text-xs h-7">
                  <SelectValue
                    placeholder={t('flow_builder.mastershop.any_direction', 'Any direction')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {MASTER_SHOP_WALLET_MOVEMENT_DIRECTIONS.map((direction) => (
                    <SelectItem key={direction} value={direction}>
                      {labels.walletMovementDirectionLabel(direction)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">
                {t('flow_builder.mastershop.movement_status', 'Movement status')}
              </Label>
              <Select
                value={filterStr(filterBody, 'movementStatus') || undefined}
                onValueChange={(value) => updateFilterField('movementStatus', value)}
              >
                <SelectTrigger data-tour="components-flow-builder-mastershopnode.selecttrigger.flow_builder.mastershop.any_status" className="text-xs h-7">
                  <SelectValue
                    placeholder={t('flow_builder.mastershop.any_status', 'Any status')}
                  />
                </SelectTrigger>
                <SelectContent>
                  {MASTER_SHOP_WALLET_MOVEMENT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {labels.walletMovementStatusLabel(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderRawJsonOverride = () => {
    if (!opDef.supportsBody) return null;

    return (
      <div className="space-y-2 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">
            {t('flow_builder.mastershop.raw_json_override', 'Advanced raw JSON override')}
          </Label>
          <Switch checked={rawJsonOverride} onCheckedChange={setRawJsonOverride} />
        </div>
        {rawJsonOverride ? (
          <>
            <EnhancedVariablePicker
              customVariables={customVariables}
              multiline
              flowId={flowId ?? undefined}
              value={rawJsonBody}
              onChange={setRawJsonBody}
              placeholder='{"phone": "{{contact.phone}}"}'
              className="flex-1 min-w-0"
              pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
            />
            <div className="flex items-center gap-2 text-[10px]">
              {isValidJson(rawJsonBody) ? (
                <span className="text-green-600 dark:text-green-400">
                  {t('flow_builder.mastershop.valid_json', 'Valid JSON')}
                </span>
              ) : (
                <span className="text-red-600 dark:text-red-400">
                  {t('flow_builder.mastershop.invalid_json', 'Invalid JSON')}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t(
                'flow_builder.mastershop.raw_json_hint',
                'Raw JSON replaces the guided body at runtime when enabled.'
              )}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <Label className="text-[10px] text-muted-foreground">
                {t('flow_builder.mastershop.effective_body_preview', 'Effective body preview')}
              </Label>
              <Button data-tour="components-flow-builder-mastershopnode.button.flow_builder.mastershop.sync_json_preview"
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-[10px] px-2"
                onClick={() => syncRawJsonFromGuided()}
              >
                {t('flow_builder.mastershop.sync_json_preview', 'Sync to raw JSON')}
              </Button>
            </div>
            <pre className="text-[10px] bg-muted p-2 rounded border border-border font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">
              {guidedBodyPreview}
            </pre>
          </>
        )}
      </div>
    );
  };

  const renderAdvancedFilterBodyEditor = () => {
    if (operation !== 'list_orders' && operation !== 'wallet_movements_list') return null;

    return (
      <div className="space-y-2 pt-2 border-t border-border">
        <Label className="text-xs font-medium">
          {t('flow_builder.mastershop.advanced_filter_body', 'Advanced filter body (JSON)')}
        </Label>
        <EnhancedVariablePicker
          customVariables={customVariables}
          multiline
          flowId={flowId ?? undefined}
          value={filterBodyJsonText}
          onChange={(value) => {
            setFilterBodyJsonText(value);
            try {
              setFilterBody(JSON.parse(value) as Record<string, unknown>);
            } catch {
              /* allow invalid JSON while typing */
            }
          }}
          className="flex-1 min-w-0"
          pickerButtonClassName="h-8 w-8 p-0 self-start shrink-0"
        />
        <div className="flex items-center gap-2 text-[10px]">
          {isValidJson(filterBodyJsonText) ? (
            <span className="text-green-600 dark:text-green-400">
              {t('flow_builder.mastershop.valid_json', 'Valid JSON')}
            </span>
          ) : (
            <span className="text-red-600 dark:text-red-400">
              {t('flow_builder.mastershop.invalid_json', 'Invalid JSON')}
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {t(
            'flow_builder.mastershop.advanced_filter_hint',
            'Edit the full filterBody object to include undocumented filters.'
          )}
        </p>
      </div>
    );
  };

  return (
    <div className="node-mastershop p-3 rounded-lg bg-card border border-emerald-500/50 shadow-sm min-w-[380px] max-w-[480px] group">
      <div className="absolute -top-8 -right-2 bg-background border border-border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onDuplicateNode(id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {t('flow_builder.mastershop.duplicate_node', 'Duplicate node')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDeleteNode(id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">
                {t('flow_builder.mastershop.delete_node', 'Delete node')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="font-medium flex items-center gap-2 mb-2 text-foreground">
        <img
          src={MASTER_SHOP_FLOW_NODE_ICON_SRC}
          alt={t('flow_builder.mastershop.icon_alt', 'Master Shop logo')}
          className="h-4 w-4"
        />
        <span>
          {t('flow_builder.node_types.mastershop', data.label || 'Master Shop')}
        </span>
        <button data-tour="components-flow-builder-mastershopnode.button.common.hide"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? (
            <>
              <EyeOff className="h-3 w-3" />
              {t('common.hide', 'Hide')}
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              {t('common.edit', 'Edit')}
            </>
          )}
        </button>
      </div>

      <div className="text-sm p-2 rounded border border-border bg-muted/30">
        <div className="flex items-center gap-1 mb-1">
          <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className={cn('font-medium text-xs', getMethodColor(opDef.method))}>
            {opDef.method}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground truncate">
            {labels.operationLabel(operation)}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground font-mono truncate" title={endpointPreview}>
          {endpointPreview}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          <span
            className={cn(
              'text-[10px] px-1 py-0.5 rounded',
              apiKey.trim()
                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
            )}
          >
            {apiKey.trim()
              ? t('flow_builder.mastershop.api_key_set', 'API key configured')
              : t('flow_builder.mastershop.api_key_missing', 'API key missing')}
          </span>
          {opDef.supportsBody && (
            <span className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 px-1 py-0.5 rounded">
              {bodyModeLabel}
            </span>
          )}
          <span className="text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded">
            {t('flow_builder.mastershop.output_count', '{{count}} outputs', {
              count: outputVariables.length,
            })}
          </span>
          <span className="text-[10px] bg-muted text-muted-foreground px-1 py-0.5 rounded">
            {MASTER_SHOP_AUTH_HEADER}
          </span>
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border border-border rounded-md p-3 bg-muted/20">
          <div>
            <Label className="block mb-1 font-medium text-foreground">
              {t('flow_builder.mastershop.quick_templates', 'Quick Templates')}
            </Label>
            <Select value="" onValueChange={applyTemplate}>
              <SelectTrigger data-tour="components-flow-builder-mastershopnode.selecttrigger.flow_builder.mastershop.template_placeholder" className="text-xs h-7">
                <SelectValue
                  placeholder={t(
                    'flow_builder.mastershop.template_placeholder',
                    'Choose a template...'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {MASTER_SHOP_TEMPLATES.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 font-medium text-foreground flex items-center gap-1">
              <KeyRound className="h-3.5 w-3.5" />
              {t('flow_builder.mastershop.api_key', 'API Key')} ({MASTER_SHOP_AUTH_HEADER})
            </Label>
            <div className="flex gap-1">
              <Input data-tour="components-flow-builder-mastershopnode.input.flow_builder.mastershop.api_key_placeholder"
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t('flow_builder.mastershop.api_key_placeholder', 'ms-api-key value')}
                className="text-xs h-7 flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          <div>
            <Label className="block mb-1 font-medium text-foreground">
              {t('flow_builder.mastershop.operation', 'Operation')}
            </Label>
            <Select
              value={operation}
              onValueChange={(value) => setOperation(value as MasterShopOperationId)}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MASTER_SHOP_OPERATION_IDS.map((opId) => (
                  <SelectItem key={opId} value={opId}>
                    <span className={getMethodColor(MASTER_SHOP_OPERATIONS[opId].method)}>
                      {MASTER_SHOP_OPERATIONS[opId].method}
                    </span>
                    {' — '}
                    {labels.operationLabel(opId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono break-all">
              {endpointPreview}
            </p>
          </div>

          {renderOperationFields()}
          {renderRawJsonOverride()}
          {renderAdvancedFilterBodyEditor()}

          <Collapsible open={showVariablePreview} onOpenChange={setShowVariablePreview}>
            <CollapsibleTrigger className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 w-full">
              {t(
                'flow_builder.mastershop.output_variables',
                'Available Output Variables'
              )}
              {showVariablePreview ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 text-[10px] text-muted-foreground p-2 rounded space-y-1 border border-border bg-muted/30">
                {MASTER_SHOP_RESPONSE_VARIABLES.map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => copyVariableToClipboard(variable)}
                    className="block w-full text-left rounded px-1.5 py-1 hover:bg-background/50 cursor-pointer transition-colors"
                  >
                    <code>{`{{${variable}}}`}</code>
                    {' — '}
                    {labels.responseVariableDescription(variable)}
                  </button>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={standardHandleStyle}
        isConnectable={isConnectable}
      />
    </div>
  );
}

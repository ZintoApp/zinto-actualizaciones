import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow } from 'reactflow';
import { Copy, Trash2, Eye, EyeOff, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { standardHandleStyle } from './StyledHandle';
import { useFlowContext } from '../../pages/flow-builder';
import { useCollapseOnAutoArrange } from '@/hooks/useCollapseOnAutoArrange';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';
import {
  ERP_EXECUTABLE_RESOURCES_BY_BUSINESS_TYPE,
  ERP_OPERATIONS,
  getErpRequiredBusinessType,
  ERP_SET_STATUS_TARGET_STATUSES,
  ERP_INVOICE_PAYMENT_METHODS,
  type ErpResource,
} from '@shared/types/node-types';
import { ProductPicker, type ProductPickerOption } from '@/components/erp/product-picker';
import { VariantPicker } from '@/components/erp/variant-picker';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { ERP_FLOW_NODE_ICON_SRC } from '@/pages/flow-builder-node-catalog';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';

function erpOperationDisplayFallback(operation: string): string {
  return operation.replace(/_/g, ' ');
}

function erpResourceDisplayFallback(resource: string): string {
  return resource.replace(/_/g, ' ');
}

export type ErpInvoiceLineDraft = {
  id: string;
  productId: number | null;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
};

interface ErpNodeProps {
  id: string;
  data: {
    label?: string;
    resource?: ErpResource;
    operation?: string;
    salesOrderId?: string;
    invoiceId?: string;
    targetStatus?: string;
    contactId?: string;
    dealId?: string;
    currency?: string;
    notes?: string;
    assignedToUserId?: string;
    validUntil?: string;
    initialProductId?: number | null;
    initialVariantId?: string;
    initialQuantity?: string;
    initialUnitPrice?: string;
    initialDiscountPercent?: string;
    initialTaxRate?: string;
    lineQuantity?: string;
    lineUnitPrice?: string;
    lineDiscountPercent?: string;
    lineTaxRate?: string;
    lineProductId?: number | null;
    lineVariantId?: string;
    invoiceType?: string;
    invoiceContactId?: string;
    invoiceSalesOrderId?: string;
    invoiceIssueDate?: string;
    invoiceDueDate?: string;
    invoiceSubtotal?: string;
    invoiceTaxAmount?: string;
    invoiceDiscountAmount?: string;
    invoiceTipAmount?: string;
    invoiceServiceChargeRate?: string;
    invoiceServiceChargeAmount?: string;
    invoiceNotes?: string;
    invoiceLines?: ErpInvoiceLineDraft[];
    paymentAmount?: string;
    paymentMethod?: string;
    paymentReferenceNumber?: string;
    paymentNotes?: string;
    messageTemplate?: string;
    includePdfLink?: boolean;
    errorMessage?: string;
    orderStatus?: string;
    /** Optional BotHive user ID (or template); overrides default actor for ERP accounting posts. */
    erpActorUserId?: string;
    requiredBusinessType?: 'restaurant' | 'dental';
    query?: string;
    productType?: string;
    productId?: string;
    reservationId?: string;
    reservationAt?: string;
    expectedDurationMinutes?: number | string;
    guestCount?: number | string;
    guestName?: string;
    guestPhone?: string;
    guestEmail?: string;
    tableId?: string;
    reservationStatus?: string;
    waitlistEntryId?: string;
    waitlistStatus?: string;
    quotedWaitMinutes?: number | string;
    deliveryDispatchId?: string;
    serviceType?: string;
    appointmentId?: string;
    providerUserId?: string;
    catalogItemId?: string;
    scheduledAt?: string;
    treatmentPlanId?: string;
    approvalDecision?: string;
    approvalNotes?: string;
  };
  isConnectable: boolean;
}

const SET_STATUS_OPTIONS = ERP_SET_STATUS_TARGET_STATUSES;

function newInvoiceLineRow(): ErpInvoiceLineDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    productId: null,
    description: '',
    quantity: '1',
    unitPrice: '',
    discountPercent: '0',
    taxRate: '0',
  };
}

export function ErpNode({ id, data, isConnectable }: ErpNodeProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const companyId = user?.companyId ?? null;
  const { businessType, isLoading: isBusinessTypeLoading, error: businessTypeError } = useErpBusinessType();

  const [isEditing, setIsEditing] = useState(false);
  useCollapseOnAutoArrange(setIsEditing);

  const [resource, setResource] = useState<ErpResource>(data.resource ?? 'sales_order');
  const [operation, setOperation] = useState(data.operation ?? 'create');

  const [salesOrderId, setSalesOrderId] = useState(data.salesOrderId ?? '');
  const [invoiceId, setInvoiceId] = useState(data.invoiceId ?? '');
  const [targetStatus, setTargetStatus] = useState(data.targetStatus ?? 'processing');

  const [contactId, setContactId] = useState(data.contactId ?? '{{contact.id}}');
  const [dealId, setDealId] = useState(data.dealId ?? '');
  const [currency, setCurrency] = useState(data.currency ?? 'USD');
  const [notes, setNotes] = useState(data.notes ?? '');
  const [assignedToUserId, setAssignedToUserId] = useState(data.assignedToUserId ?? '');
  const [validUntil, setValidUntil] = useState(data.validUntil ?? '');
  const [orderStatus, setOrderStatus] = useState(data.orderStatus ?? 'draft');

  const [initialProduct, setInitialProduct] = useState<ProductPickerOption | null>(
    data.initialProductId != null
      ? { id: data.initialProductId, name: `#${data.initialProductId}`, sku: null }
      : null
  );
  const [initialVariantId, setInitialVariantId] = useState(data.initialVariantId ?? '');
  const [initialQuantity, setInitialQuantity] = useState(data.initialQuantity ?? '1');
  const [initialUnitPrice, setInitialUnitPrice] = useState(data.initialUnitPrice ?? '');
  const [initialDiscountPercent, setInitialDiscountPercent] = useState(data.initialDiscountPercent ?? '0');
  const [initialTaxRate, setInitialTaxRate] = useState(data.initialTaxRate ?? '0');

  const [lineProduct, setLineProduct] = useState<ProductPickerOption | null>(
    data.lineProductId != null
      ? { id: data.lineProductId, name: `#${data.lineProductId}`, sku: null }
      : null
  );
  const [lineVariantId, setLineVariantId] = useState(data.lineVariantId ?? '');
  const [lineQuantity, setLineQuantity] = useState(data.lineQuantity ?? '1');
  const [lineUnitPrice, setLineUnitPrice] = useState(data.lineUnitPrice ?? '');
  const [lineDiscountPercent, setLineDiscountPercent] = useState(data.lineDiscountPercent ?? '0');
  const [lineTaxRate, setLineTaxRate] = useState(data.lineTaxRate ?? '0');

  const [invoiceType, setInvoiceType] = useState(data.invoiceType ?? 'sales_invoice');
  const [invoiceContactId, setInvoiceContactId] = useState(data.invoiceContactId ?? '{{contact.id}}');
  const [invoiceSalesOrderId, setInvoiceSalesOrderId] = useState(data.invoiceSalesOrderId ?? '');
  const [invoiceIssueDate, setInvoiceIssueDate] = useState(data.invoiceIssueDate ?? '');
  const [invoiceDueDate, setInvoiceDueDate] = useState(data.invoiceDueDate ?? '');
  const [invoiceSubtotal, setInvoiceSubtotal] = useState(data.invoiceSubtotal ?? '0');
  const [invoiceTaxAmount, setInvoiceTaxAmount] = useState(data.invoiceTaxAmount ?? '0');
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState(data.invoiceDiscountAmount ?? '0');
  const [invoiceTipAmount, setInvoiceTipAmount] = useState(data.invoiceTipAmount ?? '0');
  const [invoiceServiceChargeRate, setInvoiceServiceChargeRate] = useState(data.invoiceServiceChargeRate ?? '');
  const [invoiceServiceChargeAmount, setInvoiceServiceChargeAmount] = useState(data.invoiceServiceChargeAmount ?? '');
  const [invoiceNotes, setInvoiceNotes] = useState(data.invoiceNotes ?? '');
  const [invoiceLines, setInvoiceLines] = useState<ErpInvoiceLineDraft[]>(() =>
    Array.isArray(data.invoiceLines) ? data.invoiceLines : []
  );

  const [paymentAmount, setPaymentAmount] = useState(data.paymentAmount ?? '');
  const [paymentMethod, setPaymentMethod] = useState(data.paymentMethod ?? 'cash');
  const [paymentReferenceNumber, setPaymentReferenceNumber] = useState(data.paymentReferenceNumber ?? '');
  const [paymentNotes, setPaymentNotes] = useState(data.paymentNotes ?? '');

  const [messageTemplate, setMessageTemplate] = useState(
    () =>
      data.messageTemplate ??
      t(
        'flow_builder.erp.default_order_message_template',
        'Thank you! Order {{erp.salesOrder.orderNumber}} total {{erp.salesOrder.totalAmount}} {{erp.salesOrder.currency}}.'
      )
  );
  const [includePdfLink, setIncludePdfLink] = useState(data.includePdfLink ?? false);
  const [errorMessage, setErrorMessage] = useState(data.errorMessage ?? '');
  const [modeFields, setModeFields] = useState<Record<string, string | number>>({
    query: data.query ?? '',
    productType: data.productType ?? '',
    productId: data.productId ?? '',
    reservationId: data.reservationId ?? '',
    reservationAt: data.reservationAt ?? '',
    expectedDurationMinutes: data.expectedDurationMinutes ?? 90,
    guestCount: data.guestCount ?? 1,
    guestName: data.guestName ?? '{{contact.name}}',
    guestPhone: data.guestPhone ?? '{{contact.phone}}',
    guestEmail: data.guestEmail ?? '{{contact.email}}',
    tableId: data.tableId ?? '',
    reservationStatus: data.reservationStatus ?? 'booked',
    waitlistEntryId: data.waitlistEntryId ?? '',
    waitlistStatus: data.waitlistStatus ?? 'waiting',
    quotedWaitMinutes: data.quotedWaitMinutes ?? '',
    deliveryDispatchId: data.deliveryDispatchId ?? '',
    serviceType: data.serviceType ?? 'takeaway',
    appointmentId: data.appointmentId ?? '',
    providerUserId: data.providerUserId ?? '',
    catalogItemId: data.catalogItemId ?? '',
    scheduledAt: data.scheduledAt ?? '',
    treatmentPlanId: data.treatmentPlanId ?? '',
    approvalDecision: data.approvalDecision ?? 'approved',
    approvalNotes: data.approvalNotes ?? '',
  });

  const { setNodes } = useReactFlow();
  const { onDeleteNode, onDuplicateNode, customVariables } = useFlowContext();

  const updateNodeData = useCallback(
    (updates: Record<string, unknown>) => {
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
      resource,
      operation,
      salesOrderId,
      invoiceId,
      targetStatus,
      contactId,
      dealId,
      currency,
      notes,
      assignedToUserId,
      validUntil,
      orderStatus,
      initialProductId: initialProduct?.id ?? null,
      initialVariantId,
      initialQuantity,
      initialUnitPrice,
      initialDiscountPercent,
      initialTaxRate,
      lineProductId: lineProduct?.id ?? null,
      lineVariantId,
      lineQuantity,
      lineUnitPrice,
      lineDiscountPercent,
      lineTaxRate,
      invoiceType,
      invoiceContactId,
      invoiceSalesOrderId,
      invoiceIssueDate,
      invoiceDueDate,
      invoiceSubtotal,
      invoiceTaxAmount,
      invoiceDiscountAmount,
      invoiceTipAmount,
      invoiceServiceChargeRate,
      invoiceServiceChargeAmount,
      invoiceNotes,
      invoiceLines,
      paymentAmount,
      paymentMethod,
      paymentReferenceNumber,
      paymentNotes,
      messageTemplate,
      includePdfLink,
      errorMessage,
      ...modeFields,
      requiredBusinessType: getErpRequiredBusinessType(resource),
    });
  }, [
    updateNodeData,
    resource,
    operation,
    salesOrderId,
    invoiceId,
    targetStatus,
    contactId,
    dealId,
    currency,
    notes,
    assignedToUserId,
    validUntil,
    orderStatus,
    initialProduct,
    initialVariantId,
    initialQuantity,
    initialUnitPrice,
    initialDiscountPercent,
    initialTaxRate,
    lineProduct,
    lineVariantId,
    lineQuantity,
    lineUnitPrice,
    lineDiscountPercent,
    lineTaxRate,
    invoiceType,
    invoiceContactId,
    invoiceSalesOrderId,
    invoiceIssueDate,
    invoiceDueDate,
    invoiceSubtotal,
    invoiceTaxAmount,
    invoiceDiscountAmount,
    invoiceTipAmount,
    invoiceServiceChargeRate,
    invoiceServiceChargeAmount,
    invoiceNotes,
    invoiceLines,
    paymentAmount,
    paymentMethod,
    paymentReferenceNumber,
    paymentNotes,
    messageTemplate,
    includePdfLink,
    errorMessage,
    modeFields,
  ]);

  const opsForResource = ERP_OPERATIONS[resource] ?? [];
  const availableResources = ERP_EXECUTABLE_RESOURCES_BY_BUSINESS_TYPE[businessType];
  const requiredBusinessType = getErpRequiredBusinessType(resource);
  const isIncompatible = Boolean(requiredBusinessType && requiredBusinessType !== businessType);
  const patchModeField = (key: string, value: string | number) =>
    setModeFields((current) => ({ ...current, [key]: value }));
  const getOperationColor = (op: string) => {
    if (op === 'create' || op === 'get' || op === 'generate_from_sales_order') return 'text-green-600';
    if (op === 'update' || op === 'add_line_item' || op === 'record_payment') return 'text-orange-600';
    if (op === 'cancel' || op === 'void') return 'text-red-600';
    return 'text-muted-foreground';
  };

  const addInvoiceLine = () => setInvoiceLines((rows) => [...rows, newInvoiceLineRow()]);
  const removeInvoiceLine = (rowId: string) =>
    setInvoiceLines((rows) => rows.filter((r) => r.id !== rowId));
  const patchInvoiceLine = (rowId: string, patch: Partial<ErpInvoiceLineDraft>) =>
    setInvoiceLines((rows) => rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));

  return (
    <div className="node-erp p-3 rounded-lg bg-card border border-border shadow-sm min-w-[380px] max-w-[520px] group">
      <div className="absolute -top-8 -right-2 bg-background border rounded-md shadow-sm flex z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicateNode(id)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="text-xs">{t('flow_builder.duplicate_node', 'Duplicate node')}</p>
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
              <p className="text-xs">{t('flow_builder.delete_node', 'Delete node')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="font-medium flex items-center gap-2 mb-2">
        <img
          src={ERP_FLOW_NODE_ICON_SRC}
          alt={t('flow_builder.node_types.erp', 'ERP')}
          className="h-4 w-4 object-contain shrink-0"
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
        />
        <span>{t('flow_builder.node_types.erp', 'ERP')}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase text-muted-foreground">
          {isBusinessTypeLoading ? '…' : t(`flow_builder.erp.mode_${businessType}`, businessType)}
        </span>
        <button data-tour="components-flow-builder-erpnode.button.flow_builder.hide"
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? (
            <>
              <EyeOff className="h-3 w-3" />
              {t('flow_builder.hide', 'Hide')}
            </>
          ) : (
            <>
              <Eye className="h-3 w-3" />
              {t('flow_builder.edit', 'Edit')}
            </>
          )}
        </button>
      </div>

      <div className="text-sm p-2 rounded border border-border">
        <div className="flex items-center gap-1 mb-1 flex-wrap">
          <span className={cn('font-medium', getOperationColor(operation))}>
            {t(`flow_builder.erp.operation.${operation}`, erpOperationDisplayFallback(operation))}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-xs text-muted-foreground">
            {t(`flow_builder.erp.resource.${resource}`, resource.replace('_', ' '))}
          </span>
        </div>
      </div>

      {isEditing && (
        <div className="mt-3 text-xs space-y-3 border rounded p-2 max-h-[70vh] overflow-y-auto">
          {businessTypeError ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
              {t('flow_builder.erp.business_type_load_error', 'ERP mode could not be loaded. Mode-specific configuration is unavailable.')}
            </div>
          ) : null}
          {isIncompatible ? (
            <div className="rounded border border-red-300 bg-red-50 p-2 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200">
              {t(
                'flow_builder.erp.business_type_mismatch',
                'This saved operation requires {{required}} ERP mode, but {{active}} mode is active. Choose a compatible resource before activating the flow.',
                { required: requiredBusinessType, active: businessType },
              )}
            </div>
          ) : null}
          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.erp.field_resource', 'Resource')}</Label>
            <Select
              value={resource}
              onValueChange={(v) => {
                const next = v as ErpResource;
                setResource(next);
                const nextOps = ERP_OPERATIONS[next];
                if (nextOps?.length) setOperation(nextOps[0]!);
              }}
            >
              <SelectTrigger className="text-xs h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {isIncompatible ? (
                  <SelectItem value={resource} disabled>
                    {t(`flow_builder.erp.resource.${resource}`, erpResourceDisplayFallback(resource))}
                  </SelectItem>
                ) : null}
                {availableResources.map((availableResource) => (
                  <SelectItem key={availableResource} value={availableResource}>
                    {t(`flow_builder.erp.resource.${availableResource}`, erpResourceDisplayFallback(availableResource))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="block mb-1 font-medium">{t('flow_builder.erp.field_operation', 'Operation')}</Label>
            <Select value={operation} onValueChange={setOperation}>
              <SelectTrigger className="text-xs h-7">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {opsForResource.map((op) => (
                  <SelectItem key={op} value={op}>
                    <span className={getOperationColor(op)}>
                      {t(`flow_builder.erp.operation.${op}`, erpOperationDisplayFallback(op))}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {resource === 'catalog' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.catalog', 'Product catalog')}</Label>
              {operation === 'get_product' ? (
                <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_product_id" className="text-xs h-7" value={modeFields.productId} onChange={(e) => patchModeField('productId', e.target.value)} placeholder={t('flow_builder.erp.field_product_id', 'Product ID')} />
              ) : (
                <>
                  <EnhancedVariablePicker customVariables={customVariables} value={String(modeFields.query)} onChange={(value) => patchModeField('query', value)} placeholder={t('flow_builder.erp.field_search_query', 'Search name or SKU (optional)')} className="text-xs h-7" />
                  <Select value={String(modeFields.productType || 'all')} onValueChange={(value) => patchModeField('productType', value === 'all' ? '' : value)}>
                    <SelectTrigger className="text-xs h-7"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('flow_builder.erp.product_type_all', 'All product types')}</SelectItem>
                      <SelectItem value="physical">{t('erp.common.physical', 'Physical')}</SelectItem>
                      <SelectItem value="service">{t('erp.common.service', 'Service')}</SelectItem>
                      <SelectItem value="digital">{t('erp.common.digital', 'Digital')}</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
          )}

          {businessType === 'restaurant' && resource === 'sales_order' && ['create', 'update'].includes(operation) && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.restaurant_order', 'Restaurant order')}</Label>
              <Select value={String(modeFields.serviceType)} onValueChange={(value) => patchModeField('serviceType', value)}>
                <SelectTrigger className="text-xs h-7"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dine_in">{t('flow_builder.erp.service_type.dine_in', 'Dine-in')}</SelectItem>
                  <SelectItem value="takeaway">{t('flow_builder.erp.service_type.takeaway', 'Takeaway')}</SelectItem>
                  <SelectItem value="delivery">{t('flow_builder.erp.service_type.delivery', 'Delivery')}</SelectItem>
                </SelectContent>
              </Select>
              {modeFields.serviceType === 'dine_in' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_table_id" className="text-xs h-7" value={modeFields.tableId} onChange={(e) => patchModeField('tableId', e.target.value)} placeholder={t('flow_builder.erp.field_table_id', 'Table ID (optional)')} />
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_guest_count" type="number" min={1} className="text-xs h-7" value={modeFields.guestCount} onChange={(e) => patchModeField('guestCount', e.target.value)} placeholder={t('flow_builder.erp.field_guest_count', 'Guests')} />
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_reservation_link" className="col-span-2 text-xs h-7" value={modeFields.reservationId} onChange={(e) => patchModeField('reservationId', e.target.value)} placeholder={t('flow_builder.erp.field_reservation_link', 'Reservation ID (optional)')} />
                </div>
              ) : null}
            </div>
          )}

          {resource === 'restaurant_table' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.table_availability', 'Table availability')}</Label>
              <EnhancedVariablePicker customVariables={customVariables} value={String(modeFields.reservationAt)} onChange={(value) => patchModeField('reservationAt', value)} placeholder={t('flow_builder.erp.field_reservation_at', 'Reservation date/time (ISO)')} className="text-xs h-7" />
              <div className="grid grid-cols-2 gap-2">
                <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.section.table_availability" type="number" min={1} className="text-xs h-7" value={modeFields.expectedDurationMinutes} onChange={(e) => patchModeField('expectedDurationMinutes', e.target.value)} placeholder="90" />
                <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.section.table_availability" type="number" min={1} className="text-xs h-7" value={modeFields.guestCount} onChange={(e) => patchModeField('guestCount', e.target.value)} placeholder="1" />
              </div>
            </div>
          )}

          {resource === 'restaurant_reservation' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.reservation', 'Restaurant reservation')}</Label>
              {operation !== 'create' && operation !== 'list' ? <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_reservation_id" className="text-xs h-7" value={modeFields.reservationId} onChange={(e) => patchModeField('reservationId', e.target.value)} placeholder={t('flow_builder.erp.field_reservation_id', 'Reservation ID')} /> : null}
              {['create', 'update'].includes(operation) ? (
                <>
                  <EnhancedVariablePicker customVariables={customVariables} value={String(modeFields.reservationAt)} onChange={(value) => patchModeField('reservationAt', value)} placeholder={t('flow_builder.erp.field_reservation_at', 'Reservation date/time (ISO)')} className="text-xs h-7" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input data-tour="components-flow-builder-erpnode.input.modeFields.expectedDurationMinutes" type="number" min={1} value={modeFields.expectedDurationMinutes} onChange={(e) => patchModeField('expectedDurationMinutes', e.target.value)} placeholder="90" className="text-xs h-7" />
                    <Input data-tour="components-flow-builder-erpnode.input.modeFields.guestCount" type="number" min={1} value={modeFields.guestCount} onChange={(e) => patchModeField('guestCount', e.target.value)} placeholder="1" className="text-xs h-7" />
                  </div>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_table_id_auto" value={modeFields.tableId} onChange={(e) => patchModeField('tableId', e.target.value)} placeholder={t('flow_builder.erp.field_table_id_auto', 'Table ID (blank = auto-select)')} className="text-xs h-7" />
                  <Input data-tour="components-flow-builder-erpnode.input.modeFields.guestName" value={modeFields.guestName} onChange={(e) => patchModeField('guestName', e.target.value)} placeholder="{{contact.name}}" className="text-xs h-7" />
                  <Input data-tour="components-flow-builder-erpnode.input.modeFields.guestPhone" value={modeFields.guestPhone} onChange={(e) => patchModeField('guestPhone', e.target.value)} placeholder="{{contact.phone}}" className="text-xs h-7" />
                  <Input data-tour="components-flow-builder-erpnode.input.modeFields.guestEmail" value={modeFields.guestEmail} onChange={(e) => patchModeField('guestEmail', e.target.value)} placeholder="{{contact.email}}" className="text-xs h-7" />
                </>
              ) : null}
            </div>
          )}

          {resource === 'restaurant_waitlist' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.waitlist', 'Restaurant waitlist')}</Label>
              {!['join', 'get_current'].includes(operation) ? <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_waitlist_id" value={modeFields.waitlistEntryId} onChange={(e) => patchModeField('waitlistEntryId', e.target.value)} placeholder={t('flow_builder.erp.field_waitlist_id', 'Waitlist entry ID')} className="text-xs h-7" /> : null}
              {['join', 'update'].includes(operation) ? (
                <div className="grid grid-cols-2 gap-2">
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_guest_count" type="number" min={1} value={modeFields.guestCount} onChange={(e) => patchModeField('guestCount', e.target.value)} placeholder={t('flow_builder.erp.field_guest_count', 'Guests')} className="text-xs h-7" />
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_wait_minutes" type="number" min={0} value={modeFields.quotedWaitMinutes} onChange={(e) => patchModeField('quotedWaitMinutes', e.target.value)} placeholder={t('flow_builder.erp.field_wait_minutes', 'Wait minutes')} className="text-xs h-7" />
                </div>
              ) : null}
            </div>
          )}

          {resource === 'restaurant_delivery' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.delivery', 'Delivery status')}</Label>
              <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_delivery_id" value={modeFields.deliveryDispatchId} onChange={(e) => patchModeField('deliveryDispatchId', e.target.value)} placeholder={t('flow_builder.erp.field_delivery_id', 'Delivery dispatch ID')} className="text-xs h-7" />
            </div>
          )}

          {resource === 'dental_booking' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.dental_booking', 'Dental booking')}</Label>
              {['list_appointments', 'book'].includes(operation) ? null : operation !== 'list_services' && operation !== 'list_providers' && operation !== 'check_availability' ? <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_appointment_id" value={modeFields.appointmentId} onChange={(e) => patchModeField('appointmentId', e.target.value)} placeholder={t('flow_builder.erp.field_appointment_id', 'Appointment ID')} className="text-xs h-7" /> : null}
              {['check_availability', 'book', 'reschedule'].includes(operation) ? (
                <>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_service_id" value={modeFields.catalogItemId} onChange={(e) => patchModeField('catalogItemId', e.target.value)} placeholder={t('flow_builder.erp.field_service_id', 'Service catalog ID')} className="text-xs h-7" />
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_provider_id" value={modeFields.providerUserId} onChange={(e) => patchModeField('providerUserId', e.target.value)} placeholder={t('flow_builder.erp.field_provider_id', 'Provider user ID')} className="text-xs h-7" />
                  <EnhancedVariablePicker customVariables={customVariables} value={String(modeFields.scheduledAt)} onChange={(value) => patchModeField('scheduledAt', value)} placeholder={t('flow_builder.erp.field_scheduled_at', 'Date/time (ISO)')} className="text-xs h-7" />
                </>
              ) : null}
            </div>
          )}

          {resource === 'dental_treatment_plan' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.treatment_plan', 'Dental treatment plan')}</Label>
              {operation !== 'list' ? <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_treatment_plan_id" value={modeFields.treatmentPlanId} onChange={(e) => patchModeField('treatmentPlanId', e.target.value)} placeholder={t('flow_builder.erp.field_treatment_plan_id', 'Treatment plan ID')} className="text-xs h-7" /> : null}
              {operation === 'request_approval' ? (
                <>
                  <Select value={String(modeFields.approvalDecision)} onValueChange={(value) => patchModeField('approvalDecision', value)}>
                    <SelectTrigger className="text-xs h-7"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="approved">{t('flow_builder.erp.approval.approve', 'Request approval')}</SelectItem><SelectItem value="rejected">{t('flow_builder.erp.approval.reject', 'Request rejection review')}</SelectItem></SelectContent>
                  </Select>
                  <Textarea data-tour="components-flow-builder-erpnode.textarea.flow_builder.erp.field_approval_notes" value={modeFields.approvalNotes} onChange={(e) => patchModeField('approvalNotes', e.target.value)} placeholder={t('flow_builder.erp.field_approval_notes', 'Notes for staff (optional)')} className="text-xs" />
                </>
              ) : null}
            </div>
          )}

          {resource === 'sales_order' && operation === 'create' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">
                {t('flow_builder.erp.section.sales_order_create', 'Sales order (create)')}
              </Label>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_contact_id', 'Contact ID')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={contactId}
                  onChange={setContactId}
                  placeholder="{{contact.id}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_deal_id_optional', 'Deal ID (optional)')}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={dealId}
                  onChange={setDealId}
                  placeholder={t('flow_builder.erp.placeholder_deal_id', 'Deal ID')}
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_status', 'Status')}</Label>
                <Select value={orderStatus} onValueChange={setOrderStatus}>
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">
                      {t('flow_builder.erp.order_status.draft', 'draft')}
                    </SelectItem>
                    <SelectItem value="quotation">
                      {t('flow_builder.erp.order_status.quotation', 'quotation')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_currency', 'Currency')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_currency" className="text-xs h-7" value={currency} onChange={(e) => setCurrency(e.target.value)} />
                </div>
                <div>
                  <Label className="block mb-1 text-xs">
                    {t('flow_builder.erp.field_valid_until_optional', 'Valid until (optional)')}
                  </Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    value={validUntil}
                    onChange={setValidUntil}
                    placeholder={t('flow_builder.erp.placeholder_iso_date', 'ISO date')}
                    className="text-xs h-7"
                  />
                </div>
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_assigned_user_optional', 'Assigned user ID (optional)')}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={assignedToUserId}
                  onChange={setAssignedToUserId}
                  placeholder={t('flow_builder.erp.placeholder_user_id', 'User ID')}
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_notes_optional', 'Notes (optional)')}
                </Label>
                <Textarea data-tour="components-flow-builder-erpnode.textarea.flow_builder.erp.section.sales_order_create" className="text-xs min-h-[48px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <Label className="block text-xs font-medium">
                {t('flow_builder.erp.initial_line_optional', 'Initial line (optional)')}
              </Label>
              <ProductPicker
                companyId={companyId}
                value={initialProduct}
                onChange={setInitialProduct}
                queryKeyScope={`flow-erp-${id}-initial`}
                placeholder={t('flow_builder.erp.placeholder_product', 'Product')}
              />
              <VariantPicker
                productId={initialProduct?.id}
                value={initialVariantId}
                onChange={setInitialVariantId}
                includeBaseOption
                placeholder={t('flow_builder.erp.placeholder_variant', 'Variant')}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_qty_short', 'Qty')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_qty_short" className="text-xs h-7" value={initialQuantity} onChange={(e) => setInitialQuantity(e.target.value)} />
                </div>
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_unit_price', 'Unit price')}</Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    value={initialUnitPrice}
                    onChange={setInitialUnitPrice}
                    placeholder={t('flow_builder.erp.placeholder_amount_short', '0.00')}
                    className="text-xs h-7"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_discount_pct', 'Discount %')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_discount_pct"
                    className="text-xs h-7"
                    value={initialDiscountPercent}
                    onChange={(e) => setInitialDiscountPercent(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_tax_rate_pct', 'Tax rate %')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_discount_pct" className="text-xs h-7" value={initialTaxRate} onChange={(e) => setInitialTaxRate(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {resource === 'sales_order' && operation === 'add_line_item' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.add_line_item', 'Add line item')}</Label>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_sales_order_id', 'Sales order ID')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={salesOrderId}
                  onChange={setSalesOrderId}
                  placeholder="{{erp.salesOrderId}}"
                  className="text-xs h-7"
                />
              </div>
              <ProductPicker
                companyId={companyId}
                value={lineProduct}
                onChange={setLineProduct}
                queryKeyScope={`flow-erp-${id}-line`}
                placeholder={t('flow_builder.erp.placeholder_product', 'Product')}
              />
              <VariantPicker
                productId={lineProduct?.id}
                value={lineVariantId}
                onChange={setLineVariantId}
                includeBaseOption
                placeholder={t('flow_builder.erp.placeholder_variant', 'Variant')}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_qty_short', 'Qty')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_qty_short" className="text-xs h-7" value={lineQuantity} onChange={(e) => setLineQuantity(e.target.value)} />
                </div>
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_unit_price', 'Unit price')}</Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    value={lineUnitPrice}
                    onChange={setLineUnitPrice}
                    className="text-xs h-7"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_discount_pct', 'Discount %')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_discount_pct"
                    className="text-xs h-7"
                    value={lineDiscountPercent}
                    onChange={(e) => setLineDiscountPercent(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_tax_rate_pct', 'Tax rate %')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_discount_pct" className="text-xs h-7" value={lineTaxRate} onChange={(e) => setLineTaxRate(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {resource === 'sales_order' && operation === 'update' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.update_sales_order', 'Update sales order')}</Label>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_sales_order_id', 'Sales order ID')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={salesOrderId}
                  onChange={setSalesOrderId}
                  placeholder="{{erp.salesOrderId}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_notes_optional', 'Notes (optional)')}
                </Label>
                <Textarea data-tour="components-flow-builder-erpnode.textarea.flow_builder.erp.section.update_sales_order" className="text-xs min-h-[48px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_assigned_user_optional', 'Assigned user ID (optional)')}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={assignedToUserId}
                  onChange={setAssignedToUserId}
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_valid_until_optional', 'Valid until (optional)')}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={validUntil}
                  onChange={setValidUntil}
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_currency_optional', 'Currency (optional)')}
                </Label>
                <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.section.update_sales_order" className="text-xs h-7" value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
            </div>
          )}

          {resource === 'sales_order' &&
            ['confirm', 'cancel', 'get'].includes(operation) && (
              <div className="space-y-2 pt-2 border-t">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_sales_order_id', 'Sales order ID')}</Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    value={salesOrderId}
                    onChange={setSalesOrderId}
                    placeholder="{{erp.salesOrderId}}"
                    className="text-xs h-7"
                  />
                </div>
              </div>
            )}

          {resource === 'sales_order' && operation === 'set_status' && (
            <div className="space-y-2 pt-2 border-t">
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_sales_order_id', 'Sales order ID')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={salesOrderId}
                  onChange={setSalesOrderId}
                  placeholder="{{erp.salesOrderId}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_target_status', 'Target status')}</Label>
                <Select value={targetStatus} onValueChange={setTargetStatus}>
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SET_STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`flow_builder.erp.so_target_status.${s}`, s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {resource === 'invoice' && operation === 'generate_from_sales_order' && (
            <div className="space-y-2 pt-2 border-t">
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_sales_order_id', 'Sales order ID')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={salesOrderId}
                  onChange={setSalesOrderId}
                  placeholder="{{erp.salesOrderId}}"
                  className="text-xs h-7"
                />
              </div>
            </div>
          )}

          {resource === 'invoice' && operation === 'create' && (
            <div className="space-y-2 pt-2 border-t">
              <Label className="font-medium">{t('flow_builder.erp.section.create_invoice', 'Create invoice')}</Label>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_type', 'Type')}</Label>
                <Select value={invoiceType} onValueChange={setInvoiceType}>
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales_invoice">
                      {t('flow_builder.erp.invoice_type.sales_invoice', 'sales_invoice')}
                    </SelectItem>
                    <SelectItem value="purchase_invoice">
                      {t('flow_builder.erp.invoice_type.purchase_invoice', 'purchase_invoice')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_contact_id_optional', 'Contact ID (optional)')}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={invoiceContactId}
                  onChange={setInvoiceContactId}
                  placeholder="{{contact.id}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_sales_order_id_optional', 'Sales order ID (optional)')}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={invoiceSalesOrderId}
                  onChange={setInvoiceSalesOrderId}
                  className="text-xs h-7"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_currency', 'Currency')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_currency" className="text-xs h-7" value={currency} onChange={(e) => setCurrency(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_subtotal', 'Subtotal')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_subtotal" className="text-xs h-7" value={invoiceSubtotal} onChange={(e) => setInvoiceSubtotal(e.target.value)} />
                </div>
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_tax', 'Tax')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_subtotal" className="text-xs h-7" value={invoiceTaxAmount} onChange={(e) => setInvoiceTaxAmount(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_discount', 'Discount')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_discount"
                    className="text-xs h-7"
                    value={invoiceDiscountAmount}
                    onChange={(e) => setInvoiceDiscountAmount(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_tip', 'Tip')}</Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_discount" className="text-xs h-7" value={invoiceTipAmount} onChange={(e) => setInvoiceTipAmount(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="block mb-1 text-xs">
                    {t('flow_builder.erp.field_service_charge_rate_pct', 'Service charge rate %')}
                  </Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_service_charge_rate_pct"
                    className="text-xs h-7"
                    value={invoiceServiceChargeRate}
                    onChange={(e) => setInvoiceServiceChargeRate(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="block mb-1 text-xs">
                    {t('flow_builder.erp.field_service_charge_amount', 'Service charge amount')}
                  </Label>
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_service_charge_rate_pct"
                    className="text-xs h-7"
                    value={invoiceServiceChargeAmount}
                    onChange={(e) => setInvoiceServiceChargeAmount(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_notes', 'Notes')}</Label>
                <Textarea data-tour="components-flow-builder-erpnode.textarea.flow_builder.erp.section.create_invoice" className="text-xs min-h-[40px]" value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium">{t('flow_builder.erp.field_line_items', 'Line items')}</Label>
                <Button data-tour="components-flow-builder-erpnode.button.flow_builder.erp.action_add_line" type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addInvoiceLine}>
                  <Plus className="h-3 w-3 mr-1" />
                  {t('flow_builder.erp.action_add_line', 'Line')}
                </Button>
              </div>
              {invoiceLines.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1">
                  {t(
                    'flow_builder.erp.line_items_empty_hint',
                    'No line items — totals use header amounts above. Click Line to add rows.'
                  )}
                </p>
              ) : null}
              {invoiceLines.map((row) => (
                <div key={row.id} className="border rounded p-2 space-y-2 relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1 h-6 w-6 p-0"
                    onClick={() => removeInvoiceLine(row.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                  <ProductPicker
                    companyId={companyId}
                    value={
                      row.productId != null
                        ? { id: row.productId, name: `#${row.productId}`, sku: null }
                        : null
                    }
                    onChange={(p) =>
                      patchInvoiceLine(row.id, {
                        productId: p?.id ?? null,
                        description: p?.name ? `${p.name}` : row.description,
                      })
                    }
                    queryKeyScope={`flow-erp-${id}-inv-${row.id}`}
                    placeholder={t('flow_builder.erp.placeholder_product_optional', 'Product (optional)')}
                  />
                  <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.placeholder_description"
                    className="text-xs h-7"
                    placeholder={t('flow_builder.erp.placeholder_description', 'Description')}
                    value={row.description}
                    onChange={(e) => patchInvoiceLine(row.id, { description: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.placeholder_qty_short"
                      className="text-xs h-7"
                      placeholder={t('flow_builder.erp.placeholder_qty_short', 'Qty')}
                      value={row.quantity}
                      onChange={(e) => patchInvoiceLine(row.id, { quantity: e.target.value })}
                    />
                    <EnhancedVariablePicker
                      customVariables={customVariables}
                      value={row.unitPrice}
                      onChange={(v) => patchInvoiceLine(row.id, { unitPrice: v })}
                      placeholder={t('flow_builder.erp.placeholder_unit_price', 'Unit price')}
                      className="text-xs h-7"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.placeholder_discount_pct"
                      className="text-xs h-7"
                      placeholder={t('flow_builder.erp.placeholder_discount_pct', 'Discount %')}
                      value={row.discountPercent}
                      onChange={(e) => patchInvoiceLine(row.id, { discountPercent: e.target.value })}
                    />
                    <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.placeholder_tax_pct"
                      className="text-xs h-7"
                      placeholder={t('flow_builder.erp.placeholder_tax_pct', 'Tax %')}
                      value={row.taxRate}
                      onChange={(e) => patchInvoiceLine(row.id, { taxRate: e.target.value })}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {resource === 'invoice' && ['send', 'void', 'cancel', 'get'].includes(operation) && (
            <div className="space-y-2 pt-2 border-t">
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_invoice_id', 'Invoice ID')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={invoiceId}
                  onChange={setInvoiceId}
                  placeholder="{{erp.invoiceId}}"
                  className="text-xs h-7"
                />
              </div>
            </div>
          )}

          {resource === 'invoice' && operation === 'record_payment' && (
            <div className="space-y-2 pt-2 border-t">
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_invoice_id', 'Invoice ID')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={invoiceId}
                  onChange={setInvoiceId}
                  placeholder="{{erp.invoiceId}}"
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_amount', 'Amount')}</Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={paymentAmount}
                  onChange={setPaymentAmount}
                  placeholder={t('flow_builder.erp.placeholder_amount_short', '0.00')}
                  className="text-xs h-7"
                />
              </div>
              <div>
                <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_payment_method', 'Payment method')}</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="text-xs h-7">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ERP_INVOICE_PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`flow_builder.erp.payment_method.${m}`, m)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_reference_optional', 'Reference (optional)')}
                </Label>
                <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_invoice_id" className="text-xs h-7" value={paymentReferenceNumber} onChange={(e) => setPaymentReferenceNumber(e.target.value)} />
              </div>
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_payment_notes_optional', 'Notes (optional)')}
                </Label>
                <Input data-tour="components-flow-builder-erpnode.input.flow_builder.erp.field_invoice_id" className="text-xs h-7" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} />
              </div>
            </div>
          )}

          {resource === 'customer_notification' && (
            <div className="space-y-2 pt-2 border-t">
              {(operation === 'send_order_confirmation' || operation === 'send_quotation') && (
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_sales_order_id', 'Sales order ID')}</Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    value={salesOrderId}
                    onChange={setSalesOrderId}
                    placeholder="{{erp.salesOrderId}}"
                    className="text-xs h-7"
                  />
                </div>
              )}
              {operation === 'send_invoice' && (
                <div>
                  <Label className="block mb-1 text-xs">{t('flow_builder.erp.field_invoice_id', 'Invoice ID')}</Label>
                  <EnhancedVariablePicker
                    customVariables={customVariables}
                    value={invoiceId}
                    onChange={setInvoiceId}
                    placeholder="{{erp.invoiceId}}"
                    className="text-xs h-7"
                  />
                </div>
              )}
              <div>
                <Label className="block mb-1 text-xs">
                  {t('flow_builder.erp.field_message_template', 'Message template')}
                </Label>
                <EnhancedVariablePicker
                  customVariables={customVariables}
                  value={messageTemplate}
                  onChange={setMessageTemplate}
                  placeholder={t(
                    'flow_builder.erp.placeholder_message_variables',
                    'Your message with {{variables}}'
                  )}
                  multiline
                  className="text-xs min-h-[80px]"
                />
              </div>
              {(operation === 'send_invoice' || operation === 'send_quotation') && (
                <div className="flex items-center gap-2">
                  <Switch id="erp-pdf" checked={includePdfLink} onCheckedChange={setIncludePdfLink} />
                  <Label htmlFor="erp-pdf" className="text-xs">
                    {t(
                      'flow_builder.erp.include_pdf_link_label',
                      'Include PDF link when available (invoice.pdfUrl)'
                    )}
                  </Label>
                </div>
              )}
            </div>
          )}

          <div>
            <Label className="block mb-1 text-xs">
              {t('flow_builder.erp.field_error_message_template_optional', 'Error message template (optional)')}
            </Label>
            <EnhancedVariablePicker
              customVariables={customVariables}
              value={errorMessage}
              onChange={setErrorMessage}
              placeholder={t('flow_builder.erp.placeholder_error_message', 'Sent to contact when the node fails')}
              className="text-xs h-7"
            />
          </div>

          <p className="text-[10px] text-muted-foreground">
            {t(
              'flow_builder.erp.outputs_hint',
              'Outputs: {{erp.lastResponse}}, {{erp.salesOrderId}}, {{erp.invoiceId}}, {{erp.error}}, etc.'
            )}
          </p>
        </div>
      )}

      <Handle type="target" position={Position.Left} style={standardHandleStyle} isConnectable={isConnectable} />
      <Handle type="source" position={Position.Right} style={standardHandleStyle} isConnectable={isConnectable} />
    </div>
  );
}

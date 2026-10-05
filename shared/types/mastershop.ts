/**
 * Mastershop integration — shared capability contract for flow-builder editor and runtime.
 */

import {
  ContactMappingStrategy,
  ResponseMode,
  type ContactMappingConfig,
  type FilterCondition,
  type ResponseConfig,
} from './webhook-trigger';

// ---------------------------------------------------------------------------
// API constants
// ---------------------------------------------------------------------------

export const MASTER_SHOP_API_BASE_URL = 'https://prod.api.mastershop.com/api';
export const MASTER_SHOP_AUTH_HEADER = 'ms-api-key';
export const MASTER_SHOP_CONTENT_TYPE = 'application/json';

/** Normalized (lowercase) header names per Mastershop API documentation. */
export const MASTER_SHOP_RATE_LIMIT_HEADERS = {
  LIMIT: 'ratelimit-limit',
  REMAINING: 'ratelimit-remaining',
  RESET: 'ratelimit-reset',
  POLICY: 'ratelimit-policy',
} as const;

/** Legacy x-prefixed variants some proxies or older integrations may return. */
export const MASTER_SHOP_RATE_LIMIT_HEADERS_LEGACY = {
  LIMIT: 'x-ratelimit-limit',
  REMAINING: 'x-ratelimit-remaining',
  RESET: 'x-ratelimit-reset',
} as const;

// ---------------------------------------------------------------------------
// Operation constants / types
// ---------------------------------------------------------------------------

export type MasterShopHttpMethod = 'GET' | 'POST';

export type MasterShopOperationId =
  | 'products_list_search'
  | 'create_order'
  | 'get_order_by_id'
  | 'list_orders'
  | 'get_order_return_tracking'
  | 'wallet_movements_list'
  | 'validate_customer_phone';

export interface MasterShopOperationDefinition {
  id: MasterShopOperationId;
  method: MasterShopHttpMethod;
  /** Relative to {@link MASTER_SHOP_API_BASE_URL}. */
  path: string;
  primaryFields: readonly string[];
  supportsQuery?: boolean;
  supportsBody?: boolean;
  supportsRawJsonOverride?: boolean;
  outputVariable: string;
}

export const MASTER_SHOP_OPERATIONS: Record<MasterShopOperationId, MasterShopOperationDefinition> = {
  products_list_search: {
    id: 'products_list_search',
    method: 'GET',
    path: '/products',
    primaryFields: ['page', 'limit', 'category', 'search'],
    supportsQuery: true,
    outputVariable: 'mastershop.products',
  },
  create_order: {
    id: 'create_order',
    method: 'POST',
    path: '/orders',
    primaryFields: ['orderBody'],
    supportsBody: true,
    supportsRawJsonOverride: true,
    outputVariable: 'mastershop.order',
  },
  get_order_by_id: {
    id: 'get_order_by_id',
    method: 'GET',
    path: '/orders/{id}',
    primaryFields: ['id'],
    outputVariable: 'mastershop.order',
  },
  list_orders: {
    id: 'list_orders',
    method: 'POST',
    path: '/orders/list',
    primaryFields: ['page', 'limit', 'filterBody'],
    supportsQuery: true,
    supportsBody: true,
    outputVariable: 'mastershop.orders',
  },
  get_order_return_tracking: {
    id: 'get_order_return_tracking',
    method: 'GET',
    path: '/orders/return/{idOrder}',
    primaryFields: ['idOrder'],
    outputVariable: 'mastershop.returnTracking',
  },
  wallet_movements_list: {
    id: 'wallet_movements_list',
    method: 'POST',
    path: '/wallets/movements/list',
    primaryFields: ['page', 'limit', 'filterBody'],
    supportsQuery: true,
    supportsBody: true,
    outputVariable: 'mastershop.walletMovements',
  },
  validate_customer_phone: {
    id: 'validate_customer_phone',
    method: 'POST',
    path: '/customers/validatePhone',
    primaryFields: ['phone'],
    supportsBody: true,
    outputVariable: 'mastershop.phoneValidation',
  },
};

export const MASTER_SHOP_OPERATION_IDS = Object.keys(
  MASTER_SHOP_OPERATIONS
) as MasterShopOperationId[];

export const MASTER_SHOP_DEFAULT_OPERATION: MasterShopOperationId = 'products_list_search';

// ---------------------------------------------------------------------------
// Order status constants
// ---------------------------------------------------------------------------

export interface MasterShopOrderStatus {
  id_status: number;
  label: string;
}

export const MASTER_SHOP_ORDER_STATUSES: readonly MasterShopOrderStatus[] = [
  { id_status: 1, label: 'Por Confirmar' },
  { id_status: 2, label: 'Pendiente' },
  { id_status: 3, label: 'Por Alistar' },
  { id_status: 4, label: 'Por Recolectar' },
  { id_status: 5, label: 'Recolectada' },
  { id_status: 6, label: 'En Tránsito' },
  { id_status: 8, label: 'Entregada' },
  { id_status: 9, label: 'Cancelada' },
  { id_status: 10, label: 'Devuelta' },
  { id_status: 11, label: 'Reclamaciones' },
];

export const MASTER_SHOP_ORDER_STATUS_BY_ID: Record<number, string> = Object.fromEntries(
  MASTER_SHOP_ORDER_STATUSES.map((status) => [status.id_status, status.label])
);

export interface MasterShopOrderStatusGroup {
  id: string;
  label: string;
  statusIds: readonly number[];
}

export const MASTER_SHOP_ORDER_STATUS_GROUPS: readonly MasterShopOrderStatusGroup[] = [
  {
    id: 'por_preparar',
    label: 'Por preparar',
    statusIds: [1, 2],
  },
  {
    id: 'en_preparacion',
    label: 'En preparación',
    statusIds: [3, 4],
  },
  {
    id: 'en_transito',
    label: 'En tránsito',
    statusIds: [6, 5],
  },
  {
    id: 'finalizadas',
    label: 'Finalizadas',
    statusIds: [8, 9, 10, 11],
  },
];

// ---------------------------------------------------------------------------
// Wallet constants
// ---------------------------------------------------------------------------

export const MASTER_SHOP_WALLET_MOVEMENT_STATUSES = [
  'AVAILABLE',
  'ERROR',
  'PAID',
  'PENDING',
  'SUCCESS',
] as const;

export type MasterShopWalletMovementStatus = (typeof MASTER_SHOP_WALLET_MOVEMENT_STATUSES)[number];

export const MASTER_SHOP_WALLET_MOVEMENT_DIRECTIONS = ['deposit', 'withdrawal'] as const;

export type MasterShopWalletMovementDirection = (typeof MASTER_SHOP_WALLET_MOVEMENT_DIRECTIONS)[number];

/** Balance movement type labels 1–23 from Mastershop API documentation. */
export const MASTER_SHOP_WALLET_BALANCE_MOVEMENT_TYPE_LABELS: Record<number, string> = {
  1: 'Recarga de billetera',
  2: 'Ingreso por venta como Dropshipper',
  3: 'Cobro por Envío',
  4: 'Retiro de billetera',
  5: 'Transferencia de billetera',
  6: 'Ingreso por venta como Afiliado',
  7: 'Ingreso por venta como Productor/Proveedor',
  8: 'Ingreso por venta como CoProductor/Comisión',
  9: 'Ingreso por venta como Líder de Comunidad',
  10: 'Comisión de plataforma',
  11: 'Cobro por envío mensaje de WhatsApp',
  12: 'Pago a proveedor valor de productos',
  13: 'Cobro por Devolución',
  14: 'Devolución retiro de billetera fallido',
  15: 'Ajuste Mastershop',
  16: 'Pago a líder de comunidad',
  17: 'Promoción vende y gana',
  18: 'Indemnización Transpotadora',
  19: 'Cuota de Manejo Shopcard',
  20: 'Autorecarga de Bolsillo Mastershop',
  21: 'Cruce de cuentas con transportadora',
  22: 'Devolución de saldo desde la Shopcard',
  23: 'Pago de comisión por acuerdo comercial',
};

// ---------------------------------------------------------------------------
// Payment constants
// ---------------------------------------------------------------------------

export const MASTER_SHOP_PAYMENT_METHODS = {
  COD: 'cod',
  TRANSFER: 'transfer',
} as const;

export type MasterShopPaymentMethod =
  (typeof MASTER_SHOP_PAYMENT_METHODS)[keyof typeof MASTER_SHOP_PAYMENT_METHODS];

export const MASTER_SHOP_PAYMENT_METHOD_LABELS: Record<MasterShopPaymentMethod, string> = {
  cod: 'Contra Entrega',
  transfer: 'Pago Anticipado',
};

/**
 * Distinct Mastershop webhook payload value when it differs from
 * {@link MASTER_SHOP_PAYMENT_METHODS.TRANSFER}. Not used for paymentMode hints.
 */
export const MASTER_SHOP_PREPAID_PAYMENT_MODE = 'prepaid';

// ---------------------------------------------------------------------------
// Response variables
// ---------------------------------------------------------------------------

export const MASTER_SHOP_RESPONSE_VARIABLES = [
  'mastershop.lastResponse',
  'mastershop.success',
  'mastershop.lastStatus',
  'mastershop.lastOperation',
  'mastershop.products',
  'mastershop.order',
  'mastershop.orders',
  'mastershop.returnTracking',
  'mastershop.walletMovements',
  'mastershop.phoneValidation',
  'mastershop.error',
] as const;

export type MasterShopResponseVariable = (typeof MASTER_SHOP_RESPONSE_VARIABLES)[number];

// ---------------------------------------------------------------------------
// Webhook event presets
// ---------------------------------------------------------------------------

export type MasterShopWebhookEventCategory =
  | 'order_status'
  | 'carrier_status'
  | 'payment_specific_order_status';

export interface MasterShopWebhookFilterHints {
  id_status?: number | 'any';
  carrier_status_info?: boolean;
  /** Exact `carrier_status_info.carrier_status` when the preset is carrier-specific. */
  carrier_status?: string;
  /** Exact `carrier_status_info.carrier_status_code` when the preset is carrier-specific. */
  carrier_status_code?: string;
  carrier_novelty?: boolean;
  paymentMode?: MasterShopPaymentMethod;
  /** Raw payload payment mode when Mastershop sends `prepaid` instead of `transfer`. */
  payloadPaymentMode?: typeof MASTER_SHOP_PREPAID_PAYMENT_MODE;
  order_logistics?: boolean;
}

export interface MasterShopWebhookEventPreset {
  eventId: number;
  presetId: string;
  label: string;
  description: string;
  category: MasterShopWebhookEventCategory;
  filterHints: MasterShopWebhookFilterHints;
  selectable: boolean;
}

export const MASTER_SHOP_WEBHOOK_EVENT_PRESETS: readonly MasterShopWebhookEventPreset[] = [
  {
    eventId: 15,
    presetId: 'order_created',
    label: 'Pedido Creado',
    description: 'Fired when a new order is created.',
    category: 'order_status',
    filterHints: { id_status: 1 },
    selectable: true,
  },
  {
    eventId: 16,
    presetId: 'order_status_changed',
    label: 'Cambio de Estado del Pedido',
    description: 'Fired on any order status transition.',
    category: 'order_status',
    filterHints: { id_status: 'any' },
    selectable: true,
  },
  {
    eventId: 17,
    presetId: 'carrier_status_changed',
    label: 'Cambio de Estado de la Transportadora',
    description: 'Fired when carrier status information is present.',
    category: 'carrier_status',
    filterHints: { carrier_status_info: true },
    selectable: true,
  },
  {
    eventId: 18,
    presetId: 'order_delivered',
    label: 'Pedido Entregado',
    description: 'Fired when an order is delivered.',
    category: 'order_status',
    filterHints: { id_status: 8 },
    selectable: true,
  },
  {
    eventId: 19,
    presetId: 'order_ready_to_pack',
    label: 'Pedido Por Alistar',
    description: 'Fired when an order is ready to pack.',
    category: 'order_status',
    filterHints: { id_status: 3, order_logistics: true },
    selectable: true,
  },
  {
    eventId: 20,
    presetId: 'order_pending',
    label: 'Pedido Pendiente',
    description: 'Fired when an order is pending.',
    category: 'order_status',
    filterHints: { id_status: 2 },
    selectable: true,
  },
  {
    eventId: 21,
    presetId: 'order_ready_to_collect',
    label: 'Pedido Por Recolectar',
    description: 'Fired when an order is ready for carrier collection.',
    category: 'order_status',
    filterHints: { id_status: 4 },
    selectable: true,
  },
  {
    eventId: 22,
    presetId: 'order_collected',
    label: 'Pedido Recolectado',
    description: 'Fired when an order has been collected by the carrier.',
    category: 'order_status',
    filterHints: { id_status: 5 },
    selectable: true,
  },
  {
    eventId: 23,
    presetId: 'order_in_transit',
    label: 'Pedido En Tránsito',
    description: 'Fired when an order is in transit.',
    category: 'order_status',
    filterHints: { id_status: 6 },
    selectable: true,
  },
  {
    eventId: 24,
    presetId: 'reserved_undocumented',
    label: 'Reserved / Undocumented',
    description: 'Non-selectable placeholder; event ID 24 is not documented in the Mastershop catalog.',
    category: 'order_status',
    filterHints: {},
    selectable: false,
  },
  {
    eventId: 25,
    presetId: 'order_out_for_delivery',
    label: 'Pedido En Reparto',
    description: 'Fired when an order is out for delivery.',
    category: 'carrier_status',
    filterHints: {
      id_status: 6,
      carrier_status_info: true,
      carrier_status: 'En reparto',
      carrier_status_code: 'OUT_FOR_DELIVERY',
    },
    selectable: true,
  },
  {
    eventId: 26,
    presetId: 'order_at_office',
    label: 'Pedido En Oficina',
    description: 'Fired when an order is at a carrier office.',
    category: 'carrier_status',
    filterHints: {
      id_status: 6,
      carrier_status_info: true,
      carrier_status: 'En oficina',
      carrier_status_code: 'AT_OFFICE',
    },
    selectable: true,
  },
  {
    eventId: 27,
    presetId: 'order_with_novelty',
    label: 'Pedido con Novedad',
    description: 'Fired when a carrier novelty is reported.',
    category: 'carrier_status',
    filterHints: { id_status: 6, carrier_novelty: true },
    selectable: true,
  },
  {
    eventId: 28,
    presetId: 'order_ready_to_pack_cod',
    label: 'Pedido Por Alistar (Contra Entrega)',
    description: 'Fired when a COD order is ready to pack.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 3, paymentMode: MASTER_SHOP_PAYMENT_METHODS.COD },
    selectable: true,
  },
  {
    eventId: 29,
    presetId: 'order_ready_to_pack_prepaid',
    label: 'Pedido Por Alistar (Pago Anticipado)',
    description: 'Fired when a prepaid order is ready to pack.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 3, paymentMode: MASTER_SHOP_PAYMENT_METHODS.TRANSFER },
    selectable: true,
  },
  {
    eventId: 30,
    presetId: 'order_ready_to_collect_cod',
    label: 'Pedido Por Recolectar (Contra Entrega)',
    description: 'Fired when a COD order is ready for collection.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 4, paymentMode: MASTER_SHOP_PAYMENT_METHODS.COD },
    selectable: true,
  },
  {
    eventId: 31,
    presetId: 'order_ready_to_collect_prepaid',
    label: 'Pedido Por Recolectar (Pago Anticipado)',
    description: 'Fired when a prepaid order is ready for collection.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 4, paymentMode: MASTER_SHOP_PAYMENT_METHODS.TRANSFER },
    selectable: true,
  },
  {
    eventId: 32,
    presetId: 'order_collected_cod',
    label: 'Pedido Recolectado (Contra Entrega)',
    description: 'Fired when a COD order has been collected.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 5, paymentMode: MASTER_SHOP_PAYMENT_METHODS.COD },
    selectable: true,
  },
  {
    eventId: 33,
    presetId: 'order_collected_prepaid',
    label: 'Pedido Recolectado (Pago Anticipado)',
    description: 'Fired when a prepaid order has been collected.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 5, paymentMode: MASTER_SHOP_PAYMENT_METHODS.TRANSFER },
    selectable: true,
  },
  {
    eventId: 34,
    presetId: 'order_in_transit_cod',
    label: 'Pedido En Tránsito (Contra Entrega)',
    description: 'Fired when a COD order is in transit.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 6, paymentMode: MASTER_SHOP_PAYMENT_METHODS.COD },
    selectable: true,
  },
  {
    eventId: 35,
    presetId: 'order_in_transit_prepaid',
    label: 'Pedido En Tránsito (Pago Anticipado)',
    description: 'Fired when a prepaid order is in transit.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 6, paymentMode: MASTER_SHOP_PAYMENT_METHODS.TRANSFER },
    selectable: true,
  },
  {
    eventId: 36,
    presetId: 'order_delivered_cod',
    label: 'Pedido Entregado (Contra Entrega)',
    description: 'Fired when a COD order is delivered.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 8, paymentMode: MASTER_SHOP_PAYMENT_METHODS.COD },
    selectable: true,
  },
  {
    eventId: 37,
    presetId: 'order_delivered_prepaid',
    label: 'Pedido Entregado (Pago Anticipado)',
    description: 'Fired when a prepaid order is delivered.',
    category: 'payment_specific_order_status',
    filterHints: { id_status: 8, paymentMode: MASTER_SHOP_PAYMENT_METHODS.TRANSFER },
    selectable: true,
  },
];

export const MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS = MASTER_SHOP_WEBHOOK_EVENT_PRESETS.filter(
  (preset) => preset.selectable
);

export const MASTER_SHOP_DEFAULT_WEBHOOK_EVENT_IDS = MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.map(
  (preset) => preset.eventId
);

export const MASTER_SHOP_DEFAULT_WEBHOOK_PRESET_IDS = MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.map(
  (preset) => preset.presetId
);

export const MASTER_SHOP_INTEGRATION_PLATFORM = 'mastershop';

// ---------------------------------------------------------------------------
// Webhook preset filters, variables, and matching
// ---------------------------------------------------------------------------

export type MasterShopWebhookPresetFilterField =
  | 'id_status'
  | 'order_transaction.payment_method'
  | 'carrier_status_info'
  | 'carrier_status_info.carrier_status'
  | 'carrier_status_info.carrier_status_code'
  | 'carrier_novelty'
  | 'order_logistics';

export interface MasterShopWebhookPresetFilterRule {
  field: MasterShopWebhookPresetFilterField;
  description: string;
}

/** Human-readable filter chips derived from preset filterHints. */
export function getMasterShopPresetFilterRules(
  preset: MasterShopWebhookEventPreset
): MasterShopWebhookPresetFilterRule[] {
  const rules: MasterShopWebhookPresetFilterRule[] = [];
  const hints = preset.filterHints;

  if (hints.id_status !== undefined && hints.id_status !== 'any') {
    const label = MASTER_SHOP_ORDER_STATUS_BY_ID[hints.id_status] ?? String(hints.id_status);
    rules.push({
      field: 'id_status',
      description: `id_status = ${hints.id_status} (${label})`,
    });
  } else if (hints.id_status === 'any') {
    rules.push({ field: 'id_status', description: 'id_status = any' });
  }

  if (hints.carrier_status_info) {
    if (hints.carrier_status || hints.carrier_status_code) {
      if (hints.carrier_status) {
        rules.push({
          field: 'carrier_status_info.carrier_status',
          description: `carrier_status_info.carrier_status = ${hints.carrier_status}`,
        });
      }
      if (hints.carrier_status_code) {
        rules.push({
          field: 'carrier_status_info.carrier_status_code',
          description: `carrier_status_info.carrier_status_code = ${hints.carrier_status_code}`,
        });
      }
    } else {
      rules.push({
        field: 'carrier_status_info',
        description: 'carrier_status_info present',
      });
    }
  }

  if (hints.carrier_novelty) {
    rules.push({
      field: 'carrier_novelty',
      description: 'carrier_novelty present',
    });
  }

  if (hints.order_logistics) {
    rules.push({
      field: 'order_logistics',
      description: 'order_logistics present',
    });
  }

  if (hints.paymentMode) {
    const paymentLabel = MASTER_SHOP_PAYMENT_METHOD_LABELS[hints.paymentMode];
    const prepaidNote =
      hints.paymentMode === MASTER_SHOP_PAYMENT_METHODS.TRANSFER
        ? ` or ${MASTER_SHOP_PREPAID_PAYMENT_MODE}`
        : '';
    rules.push({
      field: 'order_transaction.payment_method',
      description: `order_transaction.payment_method = ${hints.paymentMode} (${paymentLabel})${prepaidNote}`,
    });
  }

  return rules;
}

export const MASTER_SHOP_WEBHOOK_DEFAULT_VARIABLE_MAPPINGS: Record<string, string> = {
  'mastershop.webhook.idOrder': 'id_order',
  'mastershop.webhook.idStatus': 'id_status',
  'mastershop.webhook.statusName': 'confirmation_status_name',
  'mastershop.webhook.paymentMethod': 'order_transaction.payment_method',
  'mastershop.webhook.customerName': 'customer.full_name',
  'mastershop.webhook.customerEmail': 'customer.email',
  'mastershop.webhook.customerPhone': 'customer.phone',
  'mastershop.webhook.carrierName': 'order_logistics.carrier_name',
  'mastershop.webhook.trackingUrl': 'order_logistics.url_tracking',
  'mastershop.webhook.carrierTrackingCode': 'order_logistics.carrier_tracking_code',
  'mastershop.webhook.carrierStatus': 'carrier_status_info.carrier_status',
  'mastershop.webhook.carrierStatusCode': 'carrier_status_info.carrier_status_code',
  'mastershop.webhook.noveltyDescription': 'carrier_novelty.description',
};

export function mergeMasterShopWebhookVariableMappings(
  ...sources: Array<Record<string, string> | null | undefined>
): Record<string, string> {
  let merged = { ...MASTER_SHOP_WEBHOOK_DEFAULT_VARIABLE_MAPPINGS };
  for (const source of sources) {
    if (source && typeof source === 'object') {
      merged = { ...merged, ...source };
    }
  }
  return merged;
}

/** Resolve preset/event selection for matching; defaults apply only when both options are absent. */
export function resolveMasterShopWebhookSelection(options: {
  presetIds?: string[];
  eventIds?: number[];
}): { selectedPresetIds: string[]; selectedEventIds: number[] } {
  const bothAbsent = options.presetIds === undefined && options.eventIds === undefined;
  if (bothAbsent) {
    return {
      selectedPresetIds: [...MASTER_SHOP_DEFAULT_WEBHOOK_PRESET_IDS],
      selectedEventIds: [...MASTER_SHOP_DEFAULT_WEBHOOK_EVENT_IDS],
    };
  }
  return {
    selectedPresetIds: options.presetIds ?? [],
    selectedEventIds: options.eventIds ?? [],
  };
}

export interface MasterShopPresetMatchResult {
  passed: boolean;
  matchedPresetIds: string[];
  matchedEventIds: number[];
  selectedPresetIds: string[];
  selectedEventIds: number[];
  evaluatedPresets: Array<{
    presetId: string;
    eventId: number;
    label: string;
    matched: boolean;
    reason?: string;
  }>;
  failedReason?: string;
}

function getMasterShopPayloadValue(payload: unknown, path: string): unknown {
  if (payload === null || payload === undefined) return undefined;
  const parts = path.split('.');
  let value: unknown = payload;
  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== 'object') return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function paymentMethodMatchesPreset(
  payloadPaymentMethod: unknown,
  preset: MasterShopWebhookEventPreset
): boolean {
  const expected = preset.filterHints.paymentMode;
  if (!expected) return true;
  const raw = payloadPaymentMethod != null ? String(payloadPaymentMethod).toLowerCase() : '';
  if (raw === expected) return true;
  if (
    expected === MASTER_SHOP_PAYMENT_METHODS.TRANSFER &&
    (raw === MASTER_SHOP_PREPAID_PAYMENT_MODE ||
      raw === MASTER_SHOP_PAYMENT_METHODS.TRANSFER)
  ) {
    return true;
  }
  return false;
}

function matchesMasterShopWebhookPreset(
  payload: Record<string, unknown>,
  preset: MasterShopWebhookEventPreset
): { matched: boolean; reason?: string } {
  const hints = preset.filterHints;

  if (hints.id_status !== undefined && hints.id_status !== 'any') {
    if (payload.id_status !== hints.id_status) {
      return {
        matched: false,
        reason: `id_status is ${String(payload.id_status ?? 'missing')}, expected ${hints.id_status}`,
      };
    }
  }

  if (hints.carrier_status_info) {
    const csi = payload.carrier_status_info;
    if (!csi || typeof csi !== 'object') {
      return { matched: false, reason: 'carrier_status_info missing' };
    }
    const csiRecord = csi as Record<string, unknown>;
    if (hints.carrier_status !== undefined) {
      const actual = csiRecord.carrier_status;
      if (String(actual ?? '').toLowerCase() !== hints.carrier_status.toLowerCase()) {
        return {
          matched: false,
          reason: `carrier_status_info.carrier_status is ${String(actual ?? 'missing')}, expected ${hints.carrier_status}`,
        };
      }
    }
    if (hints.carrier_status_code !== undefined) {
      const actual = csiRecord.carrier_status_code;
      if (String(actual ?? '').toUpperCase() !== hints.carrier_status_code.toUpperCase()) {
        return {
          matched: false,
          reason: `carrier_status_info.carrier_status_code is ${String(actual ?? 'missing')}, expected ${hints.carrier_status_code}`,
        };
      }
    }
  }

  if (hints.carrier_novelty) {
    const cn = payload.carrier_novelty;
    if (!cn || typeof cn !== 'object') {
      return { matched: false, reason: 'carrier_novelty missing' };
    }
  }

  if (hints.order_logistics) {
    const ol = payload.order_logistics;
    if (!ol || typeof ol !== 'object') {
      return { matched: false, reason: 'order_logistics missing' };
    }
  }

  if (hints.paymentMode) {
    const pm = getMasterShopPayloadValue(payload, 'order_transaction.payment_method');
    if (!paymentMethodMatchesPreset(pm, preset)) {
      return {
        matched: false,
        reason: `order_transaction.payment_method is ${String(pm ?? 'missing')}, expected ${hints.paymentMode} or prepaid`,
      };
    }
  }

  return { matched: true };
}

/**
 * Evaluate Mastershop event presets with OR semantics across selected presets.
 */
export function matchMasterShopWebhookPresets(
  payload: unknown,
  options: {
    presetIds?: string[];
    eventIds?: number[];
  }
): MasterShopPresetMatchResult {
  const data =
    payload !== null && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  const { selectedPresetIds, selectedEventIds } = resolveMasterShopWebhookSelection(options);

  if (selectedPresetIds.length === 0 && selectedEventIds.length === 0) {
    return {
      passed: false,
      matchedPresetIds: [],
      matchedEventIds: [],
      selectedPresetIds,
      selectedEventIds,
      evaluatedPresets: [],
      failedReason: 'No Mastershop event presets selected',
    };
  }

  const presetsToEvaluate = MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.filter(
    (p) => selectedPresetIds.includes(p.presetId) || selectedEventIds.includes(p.eventId)
  );

  const evaluatedPresets: MasterShopPresetMatchResult['evaluatedPresets'] = [];
  const matchedPresetIds: string[] = [];
  const matchedEventIds: number[] = [];

  for (const preset of presetsToEvaluate) {
    const { matched, reason } = matchesMasterShopWebhookPreset(data, preset);
    evaluatedPresets.push({
      presetId: preset.presetId,
      eventId: preset.eventId,
      label: preset.label,
      matched,
      reason,
    });
    if (matched) {
      matchedPresetIds.push(preset.presetId);
      matchedEventIds.push(preset.eventId);
    }
  }

  const passed = matchedPresetIds.length > 0;
  return {
    passed,
    matchedPresetIds,
    matchedEventIds,
    selectedPresetIds,
    selectedEventIds,
    evaluatedPresets,
    failedReason: passed
      ? undefined
      : 'No selected Mastershop event preset matched the payload',
  };
}

export const MASTER_SHOP_WEBHOOK_EVENT_CATEGORY_LABELS: Record<
  MasterShopWebhookEventCategory,
  string
> = {
  order_status: 'Order status',
  carrier_status: 'Carrier status',
  payment_specific_order_status: 'Payment-specific order status',
};

export function buildMasterShopWebhookTriggerMetadata(
  data: MasterShopWebhookTriggerNodeData
): Record<string, unknown> {
  const presetIds = data.selectedPresetIds ?? data.metadata?.mastershopPresetIds ?? [];
  const eventIds = data.selectedEventIds ?? data.metadata?.mastershopEventIds ?? [];
  const presets = MASTER_SHOP_SELECTABLE_WEBHOOK_EVENT_PRESETS.filter(
    (p) => presetIds.includes(p.presetId) || eventIds.includes(p.eventId)
  );

  return {
    integration: MASTER_SHOP_INTEGRATION_PLATFORM,
    nodeType: 'mastershopWebhookTrigger',
    mastershopEventIds: eventIds,
    mastershopPresetIds: presetIds,
    mastershopPresetLabels: presets.map((p) => p.label),
    mastershopEventNames: presets.map((p) => `${p.eventId}: ${p.label}`),
    customVariableMappings: mergeMasterShopWebhookVariableMappings(
      data.metadata?.customVariableMappings,
      data.customVariableMappings as Record<string, string> | undefined
    ),
  };
}

// ---------------------------------------------------------------------------
// Default node data helpers (no UI/runtime behavior)
// ---------------------------------------------------------------------------

export interface MasterShopProductQueryDefaults {
  page: number;
  limit: number;
  category: string;
  search: string;
}

export interface MasterShopActionNodeData {
  label: string;
  apiKey: string;
  operation: MasterShopOperationId;
  page: number;
  limit: number;
  category: string;
  search: string;
  /** GET /orders/{id} path parameter — canonical field per operation metadata. */
  id: string;
  /** @deprecated Legacy alias for {@link id}; prefer `id` for get_order_by_id. */
  orderId?: string;
  idOrder: string;
  phone: string;
  orderBody: Record<string, unknown>;
  filterBody: Record<string, unknown>;
  /** @deprecated Legacy alias for {@link filterBody}; prefer `filterBody` for wallet_movements_list. */
  walletFilterBody?: Record<string, unknown>;
  rawJsonOverride: boolean;
  rawJsonBody: string;
  outputVariables: readonly string[];
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;
  [key: string]: unknown;
}

export interface MasterShopWebhookTriggerNodeData {
  label: string;
  platform: string;
  webhookToken?: string;
  customPath?: string;
  useCustomPath?: boolean;
  customVariableMappings?: Record<string, string>;
  selectedPreset: 'all' | 'custom';
  selectedEventIds: number[];
  selectedPresetIds: string[];
  filterConditions: FilterCondition[];
  contactMapping: ContactMappingConfig;
  responseConfig: ResponseConfig;
  metadata: {
    mastershopPresetIds: string[];
    mastershopEventIds: number[];
    integration: string;
    nodeType?: string;
    mastershopPresetLabels?: string[];
    mastershopEventNames?: string[];
    customVariableMappings?: Record<string, string>;
  };
  onDeleteNode?: (id: string) => void;
  onDuplicateNode?: (id: string) => void;
  [key: string]: unknown;
}

/**
 * Maps legacy guided Create Order keys to the documented Mastershop API payload shape.
 */
export function normalizeMasterShopCreateOrderBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...body };

  if (normalized.order_transaction === undefined && normalized.transaction !== undefined) {
    normalized.order_transaction = normalized.transaction;
  }
  if (normalized.order_items === undefined && normalized.orderItems !== undefined) {
    normalized.order_items = normalized.orderItems;
  }
  if (normalized.additional_charge === undefined && normalized.additionalCharges !== undefined) {
    normalized.additional_charge = normalized.additionalCharges;
  }

  delete normalized.transaction;
  delete normalized.orderItems;
  delete normalized.additionalCharges;

  return normalized;
}

export function createDefaultMasterShopActionNodeData(): Omit<
  MasterShopActionNodeData,
  'onDeleteNode' | 'onDuplicateNode'
> {
  return {
    label: 'Master Shop',
    apiKey: '',
    operation: MASTER_SHOP_DEFAULT_OPERATION,
    page: 1,
    limit: 20,
    category: '',
    search: '',
    id: '',
    idOrder: '',
    phone: '',
    orderBody: {},
    filterBody: {},
    rawJsonOverride: false,
    rawJsonBody: '',
    outputVariables: [...MASTER_SHOP_RESPONSE_VARIABLES],
  };
}

export function createDefaultMasterShopWebhookTriggerNodeData(): Omit<
  MasterShopWebhookTriggerNodeData,
  'onDeleteNode' | 'onDuplicateNode'
> {
  return {
    label: 'Master Shop Webhook Trigger',
    platform: MASTER_SHOP_INTEGRATION_PLATFORM,
    selectedPreset: 'all',
    selectedEventIds: [...MASTER_SHOP_DEFAULT_WEBHOOK_EVENT_IDS],
    selectedPresetIds: [...MASTER_SHOP_DEFAULT_WEBHOOK_PRESET_IDS],
    filterConditions: [],
    contactMapping: {
      strategy: ContactMappingStrategy.CREATE,
      createFields: {
        nameField: 'customer.full_name',
        emailField: 'customer.email',
        phoneField: 'customer.phone',
      },
    },
    responseConfig: {
      statusCode: 200,
      bodyTemplate: '{"success": true, "received": true}',
      mode: ResponseMode.ASYNC,
    },
    customVariableMappings: { ...MASTER_SHOP_WEBHOOK_DEFAULT_VARIABLE_MAPPINGS },
    metadata: {
      mastershopPresetIds: [...MASTER_SHOP_DEFAULT_WEBHOOK_PRESET_IDS],
      mastershopEventIds: [...MASTER_SHOP_DEFAULT_WEBHOOK_EVENT_IDS],
      integration: MASTER_SHOP_INTEGRATION_PLATFORM,
      nodeType: 'mastershopWebhookTrigger',
      customVariableMappings: { ...MASTER_SHOP_WEBHOOK_DEFAULT_VARIABLE_MAPPINGS },
    },
  };
}

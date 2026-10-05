import type { MasterShopOperationId, MasterShopPaymentMethod } from '@shared/types/mastershop';
import {
  MASTER_SHOP_ORDER_STATUSES,
  MASTER_SHOP_ORDER_STATUS_GROUPS,
  MASTER_SHOP_WALLET_BALANCE_MOVEMENT_TYPE_LABELS,
} from '@shared/types/mastershop';

export type MasterShopTranslateFn = (
  key: string,
  fallback: string,
  variables?: Record<string, string | number>
) => string;

const OPERATION_FALLBACKS: Record<MasterShopOperationId, string> = {
  products_list_search: 'Products List / Search',
  create_order: 'Create Order',
  get_order_by_id: 'Get Order by ID',
  list_orders: 'List Orders',
  get_order_return_tracking: 'Get Order Return Tracking',
  wallet_movements_list: 'Wallet Movements List',
  validate_customer_phone: 'Validate Customer Phone',
};

const RESPONSE_VARIABLE_FALLBACKS: Record<string, string> = {
  'mastershop.lastResponse': 'Full API response object from the last call',
  'mastershop.success': 'Whether the last operation succeeded',
  'mastershop.lastStatus': 'HTTP status code of the last response',
  'mastershop.lastOperation': 'Operation ID that was executed',
  'mastershop.products': 'Product array from the last list/search response (`results`)',
  'mastershop.order': 'Single order payload',
  'mastershop.orders': 'Order list results',
  'mastershop.returnTracking': 'Order return tracking data',
  'mastershop.walletMovements': 'Wallet movement list results',
  'mastershop.phoneValidation': 'Phone validation response',
  'mastershop.error': 'Error details when a call fails',
};

const ADDRESS_FIELD_FALLBACKS: Record<string, string> = {
  country: 'Country',
  state: 'State',
  city: 'City',
  address1: 'Address 1',
  address2: 'Address 2',
  company: 'Company',
  zip: 'ZIP',
  full_name: 'Full name',
  first_name: 'First name',
  last_name: 'Last name',
  phone: 'Phone',
};

const CUSTOMER_FIELD_FALLBACKS: Record<string, string> = {
  full_name: 'Full name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  tags: 'Tags',
  documentType: 'Document type',
  documentNumber: 'Document number',
};

const ORDER_IDENTITY_FIELD_FALLBACKS: Record<string, string> = {
  id_order: 'Order ID',
  notes: 'Notes',
  tags: 'Tags',
};

const ORDER_ITEM_FIELD_FALLBACKS: Record<string, string> = {
  id_variant: 'Variant ID',
  id_product: 'Product ID',
  quantity: 'Quantity',
  sku: 'SKU',
  name: 'Name',
  weight: 'Weight',
  price: 'Price',
};

const LIST_ORDER_FILTER_FIELD_FALLBACKS: Record<string, string> = {
  idOrder: 'Order ID',
  externalOrderId: 'External order ID',
  carrierTrackingCode: 'Carrier tracking code',
  customerText: 'Customer text',
  customerPhone: 'Customer phone',
  clientText: 'Client text',
  clientPhone: 'Client phone',
  startDate: 'Start date',
  finalDate: 'End date',
};

const WALLET_FILTER_FIELD_FALLBACKS: Record<string, string> = {
  startDate: 'Start date',
  finalDate: 'End date',
  idOrder: 'Order ID',
  carrierTrackingCode: 'Carrier tracking code',
};

const PAYMENT_METHOD_FALLBACKS: Record<MasterShopPaymentMethod, string> = {
  cod: 'Cash on delivery',
  transfer: 'Prepaid',
};

const WALLET_STATUS_FALLBACKS: Record<string, string> = {
  AVAILABLE: 'Available',
  ERROR: 'Error',
  PAID: 'Paid',
  PENDING: 'Pending',
  SUCCESS: 'Success',
};

const WALLET_DIRECTION_FALLBACKS: Record<string, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
};

const ORDER_STATUS_ID_FALLBACKS: Record<number, string> = Object.fromEntries(
  MASTER_SHOP_ORDER_STATUSES.map((s) => [s.id_status, s.label])
) as Record<number, string>;

const ORDER_STATUS_GROUP_FALLBACKS: Record<string, string> = Object.fromEntries(
  MASTER_SHOP_ORDER_STATUS_GROUPS.map((g) => [g.id, g.label])
) as Record<string, string>;

const WALLET_BALANCE_TYPE_FALLBACKS: Record<number, string> = {
  ...MASTER_SHOP_WALLET_BALANCE_MOVEMENT_TYPE_LABELS,
};

/** Lookup balance movement type number from canonical API label. */
export const WALLET_BALANCE_LABEL_TO_TYPE: Record<string, number> = Object.fromEntries(
  Object.entries(MASTER_SHOP_WALLET_BALANCE_MOVEMENT_TYPE_LABELS).map(([k, v]) => [v, Number(k)])
);

export function createMasterShopDisplayLabels(t: MasterShopTranslateFn) {
  return {
    operationLabel(opId: MasterShopOperationId): string {
      return t(`flow_builder.mastershop.operations.${opId}`, OPERATION_FALLBACKS[opId]);
    },

    responseVariableDescription(variable: string): string {
      const key = `flow_builder.mastershop.variables.${variable.replace(/\./g, '_')}`;
      return t(key, RESPONSE_VARIABLE_FALLBACKS[variable] ?? variable);
    },

    addressFieldLabel(field: string): string {
      return t(
        `flow_builder.mastershop.fields.address.${field}`,
        ADDRESS_FIELD_FALLBACKS[field] ?? field.replace(/_/g, ' ')
      );
    },

    customerFieldLabel(field: string): string {
      return t(
        `flow_builder.mastershop.fields.customer.${field}`,
        CUSTOMER_FIELD_FALLBACKS[field] ?? field
      );
    },

    orderIdentityFieldLabel(field: string): string {
      return t(
        `flow_builder.mastershop.fields.order_identity.${field}`,
        ORDER_IDENTITY_FIELD_FALLBACKS[field] ?? field.replace(/_/g, ' ')
      );
    },

    orderItemFieldLabel(field: string): string {
      return t(
        `flow_builder.mastershop.fields.order_item.${field}`,
        ORDER_ITEM_FIELD_FALLBACKS[field] ?? field.replace(/_/g, ' ')
      );
    },

    listOrderFilterFieldLabel(field: string): string {
      return t(
        `flow_builder.mastershop.fields.list_order.${field}`,
        LIST_ORDER_FILTER_FIELD_FALLBACKS[field] ?? field
      );
    },

    walletFilterFieldLabel(field: string): string {
      return t(
        `flow_builder.mastershop.fields.wallet.${field}`,
        WALLET_FILTER_FIELD_FALLBACKS[field] ?? field
      );
    },

    orderStatusLabel(idStatus: number, canonicalLabel: string): string {
      return t(
        `flow_builder.mastershop.statuses.id_${idStatus}`,
        ORDER_STATUS_ID_FALLBACKS[idStatus] ?? canonicalLabel
      );
    },

    orderStatusGroupLabel(groupId: string, canonicalLabel: string): string {
      return t(
        `flow_builder.mastershop.statuses.groups.${groupId}`,
        ORDER_STATUS_GROUP_FALLBACKS[groupId] ?? canonicalLabel
      );
    },

    paymentMethodLabel(method: MasterShopPaymentMethod): string {
      return t(
        `flow_builder.mastershop.payments.${method}`,
        PAYMENT_METHOD_FALLBACKS[method] ?? method
      );
    },

    walletMovementStatusLabel(status: string): string {
      return t(
        `flow_builder.mastershop.wallet.statuses.${status}`,
        WALLET_STATUS_FALLBACKS[status] ?? status
      );
    },

    walletMovementDirectionLabel(direction: string): string {
      return t(
        `flow_builder.mastershop.wallet.directions.${direction}`,
        WALLET_DIRECTION_FALLBACKS[direction] ?? direction
      );
    },

    walletBalanceMovementTypeLabel(canonicalLabel: string): string {
      const typeNum = WALLET_BALANCE_LABEL_TO_TYPE[canonicalLabel];
      if (typeNum != null) {
        return t(
          `flow_builder.mastershop.wallet.balance_types.${typeNum}`,
          WALLET_BALANCE_TYPE_FALLBACKS[typeNum] ?? canonicalLabel
        );
      }
      return canonicalLabel;
    },

    templateLabel(templateId: string, fallback: string): string {
      return t(`flow_builder.mastershop.templates.${templateId}`, fallback);
    },

    webhookCategoryLabel(category: string, fallback: string): string {
      return t(`flow_builder.mastershop.webhook.categories.${category}`, fallback);
    },

    webhookPresetLabel(presetId: string, fallback: string): string {
      return t(`flow_builder.mastershop.webhook.presets.${presetId}.label`, fallback);
    },

    webhookPresetDescription(presetId: string, fallback: string): string {
      return t(`flow_builder.mastershop.webhook.presets.${presetId}.description`, fallback);
    },

    webhookSampleName(sampleId: string, fallback: string): string {
      return t(`flow_builder.mastershop.webhook.samples.${sampleId}.name`, fallback);
    },

    webhookSampleDescription(sampleId: string, fallback: string): string {
      return t(`flow_builder.mastershop.webhook.samples.${sampleId}.description`, fallback);
    },

    webhookResponseTemplateName(templateId: string, fallback: string): string {
      return t(`flow_builder.mastershop.webhook.response_templates.${templateId}.name`, fallback);
    },

    webhookResponseTemplateDescription(templateId: string, fallback: string): string {
      return t(
        `flow_builder.mastershop.webhook.response_templates.${templateId}.description`,
        fallback
      );
    },

    filterOperatorLabel(operator: string, fallback: string): string {
      return t(`flow_builder.mastershop.webhook.operators.${operator}`, fallback);
    },
  };
}

export type MasterShopDisplayLabels = ReturnType<typeof createMasterShopDisplayLabels>;

/** ERP tenant-scoped payment gateway configuration. */

export const ERP_PAYMENT_SECRET_MASK = '••••••••';

export const ERP_ONLINE_GATEWAYS = [
  'stripe',
  'paypal',
  'paystack',
  'mercadopago',
  'moyasar',
  'mpesa',
  'bank_transfer',
] as const;

export type ErpOnlineGateway = (typeof ERP_ONLINE_GATEWAYS)[number];

export const ERP_MANUAL_PAYMENT_METHODS = [
  'cash',
  'check',
  'credit_card',
  'debit_card',
  'other',
] as const;

export type ErpManualPaymentMethod = (typeof ERP_MANUAL_PAYMENT_METHODS)[number];

export type ErpPaymentMethodId =
  | ErpOnlineGateway
  | ErpManualPaymentMethod
  | 'bank_transfer';

export const ERP_GATEWAY_SETTING_KEYS: Record<ErpOnlineGateway, string> = {
  stripe: 'erp_payment_stripe',
  paypal: 'erp_payment_paypal',
  paystack: 'erp_payment_paystack',
  mercadopago: 'erp_payment_mercadopago',
  moyasar: 'erp_payment_moyasar',
  mpesa: 'erp_payment_mpesa',
  bank_transfer: 'erp_payment_bank_transfer',
};

export const ERP_MANUAL_METHODS_SETTING_KEY = 'erp_payment_manual_methods';

export type ErpGatewayBaseSettings = {
  enabled: boolean;
  testMode?: boolean;
  webhookUrl?: string;
};

export type ErpStripeSettings = ErpGatewayBaseSettings & {
  publishableKey: string;
  secretKey: string;
  webhookSecret?: string;
};

export type ErpPayPalSettings = ErpGatewayBaseSettings & {
  clientId: string;
  clientSecret: string;
};

export type ErpPaystackSettings = ErpGatewayBaseSettings & {
  publicKey: string;
  secretKey: string;
  subaccount?: string;
  webhookSecret?: string;
  merchantCurrency?: string;
};

export type ErpMercadoPagoSettings = ErpGatewayBaseSettings & {
  clientId: string;
  clientSecret: string;
  accessToken: string;
};

export type ErpMoyasarSettings = ErpGatewayBaseSettings & {
  publishableKey: string;
  secretKey: string;
};

export type ErpMpesaSettings = ErpGatewayBaseSettings & {
  consumerKey: string;
  consumerSecret: string;
  businessShortcode: string;
  passkey: string;
  shortcodeType?: 'paybill' | 'buygoods';
  callbackUrl?: string;
};

export type ErpBankTransferSettings = ErpGatewayBaseSettings & {
  accountName: string;
  accountNumber: string;
  bankName: string;
  routingNumber?: string;
  swiftCode?: string;
  instructions?: string;
};

export type ErpManualMethodsSettings = Record<
  ErpManualPaymentMethod,
  { enabled: boolean }
>;

export const DEFAULT_ERP_MANUAL_METHODS: ErpManualMethodsSettings = {
  cash: { enabled: true },
  check: { enabled: true },
  credit_card: { enabled: true },
  debit_card: { enabled: true },
  other: { enabled: true },
};

/** Maps ERP online gateway id to payment_method enum value used on invoice_payments. */
export const ERP_GATEWAY_TO_PAYMENT_METHOD: Record<ErpOnlineGateway, string> = {
  stripe: 'stripe',
  paypal: 'paypal',
  paystack: 'paystack',
  mercadopago: 'mercadopago',
  moyasar: 'moyasar',
  mpesa: 'mpesa',
  bank_transfer: 'bank_transfer',
};

/** URL slug for checkout routes (bank-transfer vs bank_transfer). */
export const ERP_GATEWAY_ROUTE_SLUG: Record<ErpOnlineGateway, string> = {
  stripe: 'stripe',
  paypal: 'paypal',
  paystack: 'paystack',
  mercadopago: 'mercadopago',
  moyasar: 'moyasar',
  mpesa: 'mpesa',
  bank_transfer: 'bank-transfer',
};

export function erpGatewayFromRouteSlug(slug: string): ErpOnlineGateway | undefined {
  const normalized = slug.trim().toLowerCase();
  for (const gateway of ERP_ONLINE_GATEWAYS) {
    if (ERP_GATEWAY_ROUTE_SLUG[gateway] === normalized) return gateway;
  }
  return undefined;
}

export function buildErpWebhookUrl(baseUrl: string, gateway: ErpOnlineGateway, companyId: number): string {
  const slug = ERP_GATEWAY_ROUTE_SLUG[gateway];
  return `${baseUrl.replace(/\/$/, '')}/api/webhooks/erp/${slug}/${companyId}`;
}

export type ErpEnabledPaymentMethod = {
  id: string;
  name: string;
  description?: string;
  type: 'online' | 'manual' | 'bank_transfer';
  testMode?: boolean;
};

export const PAYABLE_INVOICE_STATUSES = ['sent', 'partially_paid', 'overdue'] as const;

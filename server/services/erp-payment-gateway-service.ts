import {
  DEFAULT_ERP_MANUAL_METHODS,
  ERP_GATEWAY_SETTING_KEYS,
  ERP_MANUAL_METHODS_SETTING_KEY,
  ERP_ONLINE_GATEWAYS,
  type ErpBankTransferSettings,
  type ErpEnabledPaymentMethod,
  type ErpManualMethodsSettings,
  type ErpManualPaymentMethod,
  type ErpOnlineGateway,
  ERP_PAYMENT_SECRET_MASK,
  buildErpWebhookUrl,
} from '@shared/erp-payment-gateway';
import { storage } from '../storage';
import { maskSecret, resolveSecretField } from './payment-gateway-core';

const GATEWAY_SECRET_FIELDS: Record<ErpOnlineGateway, string[]> = {
  stripe: ['secretKey', 'webhookSecret'],
  paypal: ['clientSecret'],
  paystack: ['secretKey', 'webhookSecret'],
  mercadopago: ['clientSecret', 'accessToken'],
  moyasar: ['secretKey'],
  mpesa: ['consumerSecret', 'passkey'],
  bank_transfer: [],
};

const GATEWAY_DISPLAY_NAMES: Record<ErpOnlineGateway, string> = {
  stripe: 'Stripe',
  paypal: 'PayPal',
  paystack: 'Paystack',
  mercadopago: 'Mercado Pago',
  moyasar: 'Moyasar',
  mpesa: 'M-PESA',
  bank_transfer: 'Bank Transfer',
};

const MANUAL_DISPLAY_NAMES: Record<ErpManualPaymentMethod, string> = {
  cash: 'Cash',
  check: 'Check',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  other: 'Other',
};

function maskGatewaySettings(gateway: ErpOnlineGateway, value: Record<string, unknown>): Record<string, unknown> {
  const masked = { ...value };
  for (const field of GATEWAY_SECRET_FIELDS[gateway]) {
    if (masked[field]) masked[field] = maskSecret(String(masked[field]));
  }
  return masked;
}

export async function getErpGatewaySettings(
  companyId: number,
  gateway: ErpOnlineGateway,
  baseUrl?: string
): Promise<Record<string, unknown>> {
  const key = ERP_GATEWAY_SETTING_KEYS[gateway];
  const setting = await storage.getCompanySetting(companyId, key);
  const value = (setting?.value as Record<string, unknown>) || {};
  if (baseUrl && gateway !== 'bank_transfer') {
    value.webhookUrl = buildErpWebhookUrl(baseUrl, gateway, companyId);
  }
  return maskGatewaySettings(gateway, value);
}

export async function getAllErpGatewaySettings(
  companyId: number,
  baseUrl?: string
): Promise<Record<string, Record<string, unknown>>> {
  const result: Record<string, Record<string, unknown>> = {};
  for (const gateway of ERP_ONLINE_GATEWAYS) {
    result[gateway] = await getErpGatewaySettings(companyId, gateway, baseUrl);
  }
  const manualSetting = await storage.getCompanySetting(companyId, ERP_MANUAL_METHODS_SETTING_KEY);
  result.manualMethods = (manualSetting?.value as ErpManualMethodsSettings) || DEFAULT_ERP_MANUAL_METHODS;
  return result;
}

export async function getErpManualMethodsSettings(companyId: number): Promise<ErpManualMethodsSettings> {
  const setting = await storage.getCompanySetting(companyId, ERP_MANUAL_METHODS_SETTING_KEY);
  return { ...DEFAULT_ERP_MANUAL_METHODS, ...((setting?.value as ErpManualMethodsSettings) || {}) };
}

export async function saveErpManualMethodsSettings(
  companyId: number,
  methods: ErpManualMethodsSettings
): Promise<ErpManualMethodsSettings> {
  const merged = { ...DEFAULT_ERP_MANUAL_METHODS, ...methods };
  await storage.saveCompanySetting(companyId, ERP_MANUAL_METHODS_SETTING_KEY, merged);
  return merged;
}

export async function getErpGatewaySettingsRaw(
  companyId: number,
  gateway: ErpOnlineGateway
): Promise<Record<string, unknown> | undefined> {
  const key = ERP_GATEWAY_SETTING_KEYS[gateway];
  const setting = await storage.getCompanySetting(companyId, key);
  if (!setting?.value) return undefined;
  return setting.value as Record<string, unknown>;
}

export async function saveErpGatewaySettings(
  companyId: number,
  gateway: ErpOnlineGateway,
  incoming: Record<string, unknown>,
  baseUrl: string
): Promise<Record<string, unknown>> {
  const key = ERP_GATEWAY_SETTING_KEYS[gateway];
  const existing = (await getErpGatewaySettingsRaw(companyId, gateway)) || {};
  const merged: Record<string, unknown> = { ...existing, ...incoming, enabled: incoming.enabled !== false };

  for (const field of GATEWAY_SECRET_FIELDS[gateway]) {
    merged[field] = resolveSecretField(incoming[field] as string, existing[field] as string);
  }

  if (gateway !== 'bank_transfer') {
    merged.webhookUrl = buildErpWebhookUrl(baseUrl, gateway, companyId);
  }

  if (gateway === 'bank_transfer') {
    const bt = merged as ErpBankTransferSettings;
    if (!bt.accountName || !bt.accountNumber || !bt.bankName) {
      throw new Error('Account name, account number, and bank name are required');
    }
  }

  if (gateway === 'stripe') {
    if (!merged.publishableKey || !merged.secretKey) {
      throw new Error('Publishable key and secret key are required');
    }
  }

  await storage.saveCompanySetting(companyId, key, merged);
  return maskGatewaySettings(gateway, merged);
}

export function isGatewayEnabled(settings: Record<string, unknown> | undefined): boolean {
  return !!settings?.enabled;
}

export async function getEnabledErpPaymentMethods(companyId: number): Promise<ErpEnabledPaymentMethod[]> {
  const methods: ErpEnabledPaymentMethod[] = [];

  for (const gateway of ERP_ONLINE_GATEWAYS) {
    const raw = await getErpGatewaySettingsRaw(companyId, gateway);
    if (!isGatewayEnabled(raw)) continue;
    methods.push({
      id: gateway,
      name: GATEWAY_DISPLAY_NAMES[gateway],
      description:
        gateway === 'bank_transfer'
          ? 'Pay via bank transfer'
          : `Pay with ${GATEWAY_DISPLAY_NAMES[gateway]}`,
      type: gateway === 'bank_transfer' ? 'bank_transfer' : 'online',
      testMode: !!(raw?.testMode),
    });
  }

  const manual = await getErpManualMethodsSettings(companyId);
  for (const [id, cfg] of Object.entries(manual) as [ErpManualPaymentMethod, { enabled: boolean }][]) {
    if (!cfg.enabled) continue;
    methods.push({
      id,
      name: MANUAL_DISPLAY_NAMES[id],
      type: 'manual',
    });
  }

  return methods;
}

export async function isErpPaymentMethodEnabled(
  companyId: number,
  methodId: string
): Promise<boolean> {
  const methods = await getEnabledErpPaymentMethods(companyId);
  return methods.some((m) => m.id === methodId);
}

export { ERP_PAYMENT_SECRET_MASK };

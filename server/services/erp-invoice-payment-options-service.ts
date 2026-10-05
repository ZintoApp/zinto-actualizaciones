import {
  PAYABLE_INVOICE_STATUSES,
  type ErpOnlineGateway,
} from '@shared/erp-payment-gateway';
import type { Invoice } from '@shared/schema';
import {
  getEnabledErpPaymentMethods,
  getErpGatewaySettingsRaw,
} from './erp-payment-gateway-service';
import { buildPublicCheckoutUrl } from './erp-invoice-checkout-service';
import type { ErpBankTransferSettings } from '@shared/erp-payment-gateway';

export type InvoicePaymentOptionLine = {
  label: string;
  detail?: string;
  url?: string;
};

export async function buildInvoicePaymentOptionLines(
  invoice: Invoice,
  baseUrl: string
): Promise<InvoicePaymentOptionLine[]> {
  if (invoice.type !== 'sales_invoice') return [];
  if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status as (typeof PAYABLE_INVOICE_STATUSES)[number])) {
    return [];
  }
  if (Number(invoice.amountDue ?? 0) <= 0) return [];

  const methods = await getEnabledErpPaymentMethods(invoice.companyId);
  const lines: InvoicePaymentOptionLine[] = [];

  for (const method of methods) {
    if (method.type === 'manual') {
      lines.push({ label: method.name });
      continue;
    }
    if (method.type === 'bank_transfer') {
      const settings = (await getErpGatewaySettingsRaw(invoice.companyId, 'bank_transfer')) as
        | ErpBankTransferSettings
        | undefined;
      if (!settings) continue;
      lines.push({
        label: 'Bank Transfer',
        detail: [
          settings.bankName,
          settings.accountName,
          settings.accountNumber,
          settings.routingNumber ? `Routing: ${settings.routingNumber}` : '',
          settings.swiftCode ? `SWIFT: ${settings.swiftCode}` : '',
          settings.instructions,
        ]
          .filter(Boolean)
          .join(' · '),
      });
      continue;
    }
    if (method.type === 'online' && invoice.paymentToken) {
      lines.push({
        label: `Pay with ${method.name}`,
        url: buildPublicCheckoutUrl(baseUrl, invoice.paymentToken, method.id as ErpOnlineGateway),
      });
    }
  }

  return lines;
}

export async function getEnabledErpPaymentMethodIds(companyId: number): Promise<string[]> {
  const methods = await getEnabledErpPaymentMethods(companyId);
  return methods.map((m) => m.id);
}

export async function assertErpPaymentMethodAllowed(
  companyId: number,
  paymentMethod: string | null | undefined
): Promise<void> {
  if (!paymentMethod) return;
  const enabled = await getEnabledErpPaymentMethodIds(companyId);
  if (!enabled.includes(paymentMethod)) {
    throw new Error(`Payment method "${paymentMethod}" is not enabled in ERP settings`);
  }
}

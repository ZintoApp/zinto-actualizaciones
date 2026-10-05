import {gatewayAmount,assertErpGatewayEvidence,type ErpGatewayEvidence} from './erp-gateway-money';
import {erpCurrencyDigits} from '@shared/erp-currency-precision';
import {erpMinorUnits,erpMinorUnitsToAmount} from '@shared/erp-carrying-amount';
import {
  ERP_GATEWAY_TO_PAYMENT_METHOD,
  PAYABLE_INVOICE_STATUSES,
  type ErpOnlineGateway,
  buildErpWebhookUrl,
} from '@shared/erp-payment-gateway';
import type { Invoice } from '@shared/schema';
import { storage } from '../storage';
import {
  createGatewayCheckoutSession,
  validateOriginUrl,
  type CheckoutSessionResult,
} from './payment-gateway-core';
import {
  getErpGatewaySettingsRaw,
  isGatewayEnabled,
} from './erp-payment-gateway-service';
import { notifyInvoicePaymentStatusChange } from './erp-invoice-notification-service';

export type InvoiceCheckoutContext = {
  baseUrl: string;
  customerEmail?: string;
  phoneNumber?: string;
  originUrl?: string;
};

function resolveBaseUrl(baseUrl: string, originUrl?: string): string {
  if (originUrl) {
    const validated = validateOriginUrl(originUrl);
    if (validated) return validated;
  }
  return baseUrl.replace(/\/$/, '');
}

export function assertInvoicePayable(invoice: Invoice): void {
  if (invoice.type !== 'sales_invoice') {
    throw new Error('Online payment is only available for sales invoices');
  }
  if (!PAYABLE_INVOICE_STATUSES.includes(invoice.status as (typeof PAYABLE_INVOICE_STATUSES)[number])) {
    throw new Error('Invoice is not open for payment');
  }
  const digits=erpCurrencyDigits(invoice.currencyDecimalPlaces),amountDue=erpMinorUnits(String(invoice.amountDue??'0'),digits);
  if (amountDue <= 0n) {
    throw new Error('Invoice has no remaining balance');
  }
}

export async function createInvoiceCheckout(
  invoice: Invoice,
  gateway: ErpOnlineGateway,
  ctx: InvoiceCheckoutContext
): Promise<CheckoutSessionResult & { checkoutSessionId: number; checkoutUrl?: string }> {
  assertInvoicePayable(invoice);

  const settings = await getErpGatewaySettingsRaw(invoice.companyId, gateway);
  if (!isGatewayEnabled(settings)) {
    throw new Error(`${gateway} is not enabled for this company`);
  }

  const digits=erpCurrencyDigits(invoice.currencyDecimalPlaces),amountDue=erpMinorUnits(String(invoice.amountDue??'0'),digits);
  const currency = (invoice.currency || 'USD').toUpperCase();
  if(gateway==='paystack'&&String(settings?.merchantCurrency??currency).toUpperCase()!==currency)throw new Error('ERP checkout requires the configured gateway currency to match the invoice currency');
  if(gateway==='mpesa'&&currency!=='KES')throw new Error('ERP MPESA checkout requires a KES invoice');
  if(gateway==='moyasar'&&currency!=='SAR')throw new Error('Moyasar only supports SAR currency');
  if(gateway!=='bank_transfer')gatewayAmount(erpMinorUnitsToAmount(amountDue,digits),currency,gateway);
  const base = resolveBaseUrl(ctx.baseUrl, ctx.originUrl);

  const checkoutSession = await storage.createErpInvoiceCheckoutSession({
    invoiceId: invoice.id,
    companyId: invoice.companyId,
    gateway,
    amount: erpMinorUnitsToAmount(amountDue,digits),
    currency,
    status: 'pending',
    externalSessionId: null,
    metadata: { invoiceNumber: invoice.invoiceNumber,transactionDecimalPlaces:digits },
  });

  const successUrl = `${base}/payment/success?source=erp_invoice&checkout_session_id=${checkoutSession.id}&gateway=${gateway}`;
  const cancelUrl = `${base}/payment/cancel?source=erp_invoice&checkout_session_id=${checkoutSession.id}`;
  const notificationUrl = buildErpWebhookUrl(base, gateway, invoice.companyId);

  const metadata: Record<string, string> = {
    source: 'erp_invoice',
    invoiceId: String(invoice.id),
    companyId: String(invoice.companyId),
    checkoutSessionId: String(checkoutSession.id),
    invoiceNumber: invoice.invoiceNumber,
  };

  const result = await createGatewayCheckoutSession({
    gateway,
    settings: settings!,
    lineItem: {
      name: `Invoice ${invoice.invoiceNumber}`,
      description: `Payment for invoice ${invoice.invoiceNumber}`,
      amount: Number(erpMinorUnitsToAmount(amountDue,digits)),
      amountText:erpMinorUnitsToAmount(amountDue,digits),
      currency,
    },
    metadata,
    successUrl,
    cancelUrl,
    customerEmail: ctx.customerEmail,
    phoneNumber: ctx.phoneNumber,
    notificationUrl,
  });

  if (result.externalSessionId) {
    await storage.updateErpInvoiceCheckoutSession(checkoutSession.id, {
      externalSessionId: result.externalSessionId,
      ...(result.mpesaStk ? {metadata: {invoiceNumber: invoice.invoiceNumber, transactionDecimalPlaces: digits, mpesaMerchantRequestId: result.mpesaStk.merchantRequestId}} : {}),
    });
  }

  if (gateway === 'bank_transfer' && result.bankDetails) {
    return { ...result, checkoutSessionId: checkoutSession.id };
  }

  if (gateway === 'mpesa' && result.mpesaStk) {
    return { ...result, checkoutSessionId: checkoutSession.id };
  }

  if (gateway === 'moyasar' && result.moyasarWidget && !result.checkoutUrl) {
    const moyasarRedirect = `${base}/payment/moyasar?checkout_session_id=${checkoutSession.id}`;
    return { ...result, checkoutSessionId: checkoutSession.id, checkoutUrl: moyasarRedirect };
  }

  if (!result.checkoutUrl) {
    throw new Error('Failed to create checkout session');
  }

  return { ...result, checkoutSessionId: checkoutSession.id, checkoutUrl: result.checkoutUrl };
}

export async function completeInvoiceCheckoutSession(
  checkoutSessionId: number,
  options: {
    referenceNumber?: string;
    externalSessionId?: string;
    recordedBy?: number | null;
    verifiedEvidence?:ErpGatewayEvidence;
    verifiedCompanyId?:number;
  } = {}
): Promise<{ invoice: Invoice; alreadyCompleted: boolean }> {
  const session = await storage.getErpInvoiceCheckoutSession(checkoutSessionId);
  if (!session) throw new Error('Checkout session not found');
  if(session.gateway!=='bank_transfer'){if(!options.verifiedEvidence||options.verifiedCompanyId==null)throw new Error('Verified provider payment evidence is required');assertErpGatewayEvidence(session,options.verifiedCompanyId,session.gateway as ErpOnlineGateway,options.verifiedEvidence);}
  const {requireInvoiceMutationActor}=await import('./erp/invoice-mutation-actor');
  await requireInvoiceMutationActor(session.companyId,session.invoiceId,options.recordedBy,'payment',session,{checkoutSessionId:session.id,verifiedEvidence:options.verifiedEvidence,verifiedCompanyId:options.verifiedCompanyId});

  if (session.status === 'completed') {
    const invoice = await storage.getInvoice(session.invoiceId);
    if (!invoice) throw new Error('Invoice not found');
    if(invoice.companyId!==session.companyId||invoice.currency!==session.currency)throw new Error('Checkout invoice scope changed');
    return { invoice, alreadyCompleted: true };
  }

  const invoice = await storage.getInvoice(session.invoiceId);
  if (!invoice) throw new Error('Invoice not found');

  if(invoice.companyId!==session.companyId||invoice.currency!==session.currency)throw new Error('Checkout invoice scope changed');
  const paymentMethod = ERP_GATEWAY_TO_PAYMENT_METHOD[session.gateway as ErpOnlineGateway] || session.gateway;

  await storage.recordInvoicePayment({
    invoiceId: session.invoiceId,
    companyId: session.companyId,
    amount: session.amount,
    paymentMethod: paymentMethod as any,
    referenceNumber: options.verifiedEvidence?.referenceNumber || options.referenceNumber || options.externalSessionId || session.externalSessionId || null,
    notes: `Online payment via ${session.gateway}`,
    recordedBy: options.recordedBy ?? null,
  }, { checkoutSessionId: session.id,verifiedEvidence:options.verifiedEvidence,verifiedCompanyId:options.verifiedCompanyId });

  const updatedInvoice = (await storage.getInvoice(session.invoiceId))!;
  if (updatedInvoice.status === 'paid') {
    void notifyInvoicePaymentStatusChange(updatedInvoice.id);
  }

  return { invoice: updatedInvoice, alreadyCompleted: false };
}

export function buildPublicCheckoutUrl(baseUrl: string, paymentToken: string, gateway: ErpOnlineGateway): string {
  const slug = gateway === 'bank_transfer' ? 'bank-transfer' : gateway;
  return `${baseUrl.replace(/\/$/, '')}/api/erp/public/invoices/${paymentToken}/checkout/${slug}`;
}

export async function getInvoicePaymentOptions(invoice: Invoice, baseUrl: string) {
  if (!invoice.paymentToken || invoice.type !== 'sales_invoice') return [];
  assertInvoicePayable(invoice);

  const { getEnabledErpPaymentMethods } = await import('./erp-payment-gateway-service');
  const methods = await getEnabledErpPaymentMethods(invoice.companyId);
  const onlineMethods = methods.filter((m) => m.type === 'online');

  return onlineMethods.map((m) => ({
    ...m,
    checkoutUrl: buildPublicCheckoutUrl(baseUrl, invoice.paymentToken!, m.id as ErpOnlineGateway),
  }));
}

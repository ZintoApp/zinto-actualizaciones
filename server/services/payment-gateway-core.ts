import {gatewayAmount,type ErpGatewayEvidence} from './erp-gateway-money';
import Stripe from 'stripe';
import paypal from '@paypal/checkout-server-sdk';
import {
  type ErpBankTransferSettings,
  type ErpMercadoPagoSettings,
  type ErpMpesaSettings,
  type ErpMoyasarSettings,
  type ErpOnlineGateway,
  type ErpPayPalSettings,
  type ErpPaystackSettings,
  type ErpStripeSettings,
  ERP_PAYMENT_SECRET_MASK,
} from '@shared/erp-payment-gateway';
import { getExchangeRate } from '../utils/exchange-rate';

export const PAYSTACK_SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'ZAR', 'USD', 'KES', 'XOF', 'EGP'];

export function validateOriginUrl(originUrl: string): string | null {
  try {
    const url = new URL(originUrl);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export function maskSecret(value: string | undefined | null): string {
  return value ? ERP_PAYMENT_SECRET_MASK : '';
}

export function resolveSecretField(
  incoming: string | undefined | null,
  existing: string | undefined | null
): string {
  const trimmed = String(incoming ?? '').trim();
  if (!trimmed || trimmed === ERP_PAYMENT_SECRET_MASK) {
    return String(existing ?? '').trim();
  }
  return trimmed;
}

export function generateOrderReference(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `ORD${suffix}`;
}

export function formatDarajaTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export async function getUsdToKesRate(): Promise<number> {
  return getExchangeRate('USD', 'KES');
}

export type CheckoutLineItem = {
  name: string;
  description?: string;
  amount: number;
  amountText?: string;
  currency: string;
};

export type CheckoutSessionInput = {
  gateway: ErpOnlineGateway;
  settings: Record<string, unknown>;
  lineItem: CheckoutLineItem;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
  phoneNumber?: string;
  notificationUrl?: string;
};

export type CheckoutSessionResult = {
  checkoutUrl?: string;
  externalSessionId?: string;
  /** Moyasar client-side widget payload */
  moyasarWidget?: {
    publishableKey: string;
    amount: number;
    currency: string;
    description: string;
    callbackUrl: string;
    metadata: Record<string, string>;
  };
  /** MPESA STK push result */
  mpesaStk?: {
    checkoutRequestId: string;
    merchantRequestId: string;
    customerMessage: string;
  };
  /** Bank transfer — no redirect */
  bankDetails?: ErpBankTransferSettings & { reference: string };
};

export async function testGatewayConnection(
  gateway: ErpOnlineGateway,
  settings: Record<string, unknown>
): Promise<{ message: string; details?: Record<string, unknown> }> {
  switch (gateway) {
    case 'stripe': {
      const cfg = settings as ErpStripeSettings;
      const stripe = new Stripe(cfg.secretKey, { apiVersion: '2025-09-30.clover' as any });
      const account = await stripe.accounts.retrieve();
      return {
        message: 'Stripe connection successful',
        details: { id: account.id, email: account.email, country: account.country },
      };
    }
    case 'paypal': {
      const cfg = settings as ErpPayPalSettings;
      const env = cfg.testMode
        ? new paypal.core.SandboxEnvironment(cfg.clientId, cfg.clientSecret)
        : new paypal.core.LiveEnvironment(cfg.clientId, cfg.clientSecret);
      const client = new paypal.core.PayPalHttpClient(env);
      const request = new paypal.orders.OrdersGetRequest('INVALID_TEST_ORDER');
      try {
        await client.execute(request);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 422) {
          return { message: 'PayPal connection successful' };
        }
        throw err;
      }
      return { message: 'PayPal connection successful' };
    }
    case 'paystack': {
      const cfg = settings as ErpPaystackSettings;
      const res = await fetch('https://api.paystack.co/transaction/totals', {
        headers: { Authorization: `Bearer ${cfg.secretKey}` },
      });
      if (!res.ok) throw new Error('Paystack authentication failed');
      return { message: 'Paystack connection successful' };
    }
    case 'mercadopago': {
      const cfg = settings as ErpMercadoPagoSettings;
      const res = await fetch('https://api.mercadopago.com/users/me', {
        headers: { Authorization: `Bearer ${cfg.accessToken}` },
      });
      if (!res.ok) throw new Error('Mercado Pago authentication failed');
      const data = await res.json();
      return { message: 'Mercado Pago connection successful', details: { id: data.id, nickname: data.nickname } };
    }
    case 'moyasar': {
      const cfg = settings as ErpMoyasarSettings;
      const auth = Buffer.from(`${cfg.secretKey}:`).toString('base64');
      const res = await fetch('https://api.moyasar.com/v1/payments?limit=1', {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) throw new Error('Moyasar authentication failed');
      return { message: 'Moyasar connection successful' };
    }
    case 'mpesa': {
      const cfg = settings as ErpMpesaSettings;
      const baseUrl = cfg.testMode ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
      const credentials = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
      const res = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
      if (!res.ok) throw new Error('MPESA authentication failed');
      return { message: 'MPESA connection successful' };
    }
    case 'bank_transfer': {
      const cfg = settings as ErpBankTransferSettings;
      if (!cfg.accountName || !cfg.accountNumber || !cfg.bankName) {
        throw new Error('Bank account details are incomplete');
      }
      return { message: 'Bank transfer settings are valid' };
    }
    default:
      throw new Error(`Unsupported gateway: ${gateway}`);
  }
}

export async function createGatewayCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
  const { gateway, settings, lineItem, metadata, successUrl, cancelUrl, customerEmail, phoneNumber, notificationUrl } =
    input;
  const amount = lineItem.amount;
  const currency = lineItem.currency.toUpperCase();

  const exact=lineItem.amountText??String(amount);
  const encoded=gateway==='bank_transfer'?null:gatewayAmount(exact,currency,gateway);
  switch (gateway) {
    case 'stripe': {
      const cfg = settings as ErpStripeSettings;
      const stripe = new Stripe(cfg.secretKey, { apiVersion: '2025-09-30.clover' as any });
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: { name: lineItem.name, description: lineItem.description || '' },
              unit_amount: encoded!.minor,
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
      });
      return { checkoutUrl: session.url ?? undefined, externalSessionId: session.id };
    }
    case 'paypal': {
      const cfg = settings as ErpPayPalSettings;
      const env = cfg.testMode
        ? new paypal.core.SandboxEnvironment(cfg.clientId.trim(), cfg.clientSecret.trim())
        : new paypal.core.LiveEnvironment(cfg.clientId.trim(), cfg.clientSecret.trim());
      const client = new paypal.core.PayPalHttpClient(env);
      const request = new paypal.orders.OrdersCreateRequest();
      request.prefer('return=representation');
      request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: currency, value: encoded!.amount },
            description: lineItem.description || lineItem.name,
            custom_id: metadata.checkoutSessionId || metadata.invoiceId,
          },
        ] as any,
        application_context: {
          brand_name: lineItem.name,
          landing_page: 'BILLING',
          user_action: 'PAY_NOW',
          return_url: successUrl,
          cancel_url: cancelUrl,
        },
      });
      const response = await client.execute(request);
      const approvalLink = response.result.links.find((link: any) => link.rel === 'approve');
      if (!approvalLink?.href) throw new Error('PayPal approval URL not found');
      return { checkoutUrl: approvalLink.href, externalSessionId: response.result.id };
    }
    case 'paystack': {
      const cfg = settings as ErpPaystackSettings;
      const merchantCurrency = (cfg.merchantCurrency || currency).toUpperCase();
      if(lineItem.amountText&&merchantCurrency!==currency)throw new Error('ERP checkout requires the configured gateway currency to match the invoice currency');
      let paystackAmount = amount;
      let paystackCurrency = merchantCurrency;
      if (merchantCurrency !== currency) {
        const rate = await getExchangeRate(currency, merchantCurrency);
        paystackAmount = amount * rate;
      }
      const reference = `ERP-${metadata.checkoutSessionId}-${Date.now()}`;
      const initResponse = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: customerEmail || 'no-email@bothiveplus.local',
          amount: lineItem.amountText?encoded!.minor:Math.round(paystackAmount * 100),
          currency: paystackCurrency,
          reference,
          callback_url: successUrl,
          metadata,
        }),
      });
      const initData = await initResponse.json().catch(() => ({}));
      if (!initResponse.ok || !initData?.data?.authorization_url) {
        throw new Error(initData?.message || 'Failed to initialize Paystack payment');
      }
      return { checkoutUrl: initData.data.authorization_url, externalSessionId: reference };
    }
    case 'mercadopago': {
      const cfg = settings as ErpMercadoPagoSettings;
      const preferenceData = {
        items: [
          {
            title: lineItem.name,
            description: lineItem.description || lineItem.name,
            quantity: 1,
            currency_id: currency,
            unit_price: amount,
          },
        ],
        back_urls: { success: successUrl, failure: cancelUrl, pending: successUrl },
        auto_return: 'approved',
        external_reference: metadata.checkoutSessionId,
        notification_url: notificationUrl,
        metadata,
      };
      const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferenceData),
      });
      const responseData = await response.json();
      if (!response.ok || !responseData?.init_point) {
        throw new Error(responseData?.message || 'Failed to create Mercado Pago preference');
      }
      return { checkoutUrl: responseData.init_point, externalSessionId: String(responseData.id) };
    }
    case 'moyasar': {
      const cfg = settings as ErpMoyasarSettings;
      if (currency !== 'SAR') {
        throw new Error('Moyasar only supports SAR currency');
      }
      const auth = Buffer.from(`${cfg.secretKey}:`).toString('base64');
      const invoiceRes = await fetch('https://api.moyasar.com/v1/invoices', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: encoded!.minor,
          currency: 'SAR',
          description: lineItem.description || lineItem.name,
          callback_url: successUrl,
          success_url: successUrl,
          back_url: cancelUrl,
          metadata,
        }),
      });
      const invoiceData = await invoiceRes.json().catch(() => ({}));
      if (!invoiceRes.ok || !invoiceData?.url) {
        return {
          moyasarWidget: {
            publishableKey: cfg.publishableKey,
            amount: encoded!.minor,
            currency: 'SAR',
            description: lineItem.description || lineItem.name,
            callbackUrl: successUrl,
            metadata,
          },
        };
      }
      return { checkoutUrl: invoiceData.url, externalSessionId: invoiceData.id };
    }
    case 'mpesa': {
      const cfg = settings as ErpMpesaSettings;
      if (!phoneNumber) throw new Error('Phone number is required for MPESA payment');
      const phoneRegex = /^254[0-9]{9}$/;
      if (!phoneRegex.test(phoneNumber)) {
        throw new Error('Invalid phone number format. Use format: 254XXXXXXXXX');
      }
      if(lineItem.amountText&&currency!=='KES')throw new Error('ERP MPESA checkout requires a KES invoice');
      let amountInKes = amount;
      if (currency !== 'KES') {
        const rate = currency === 'USD' ? await getUsdToKesRate() : await getExchangeRate(currency, 'KES');
        amountInKes = Math.round(amount * rate);
      }
      const baseUrl = cfg.testMode ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke';
      const credentials = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString('base64');
      const authResponse = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${credentials}` },
      });
      if (!authResponse.ok) throw new Error('Failed to authenticate with MPESA API');
      const authData = await authResponse.json();
      const timestamp = formatDarajaTimestamp();
      const password = Buffer.from(`${cfg.businessShortcode}${cfg.passkey}${timestamp}`).toString('base64');
      const orderReference = generateOrderReference();
      const transactionType =
        cfg.shortcodeType === 'buygoods' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline';
      const stkResponse = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authData.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          BusinessShortCode: cfg.businessShortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: transactionType,
          Amount: lineItem.amountText?encoded!.minor:Math.round(amountInKes),
          PartyA: phoneNumber,
          PartyB: cfg.businessShortcode,
          PhoneNumber: phoneNumber,
          CallBackURL: notificationUrl || cfg.callbackUrl,
          AccountReference: orderReference,
          TransactionDesc: lineItem.name,
        }),
      });
      const stkData = await stkResponse.json();
      if (!stkResponse.ok || stkData.ResponseCode !== '0') {
        throw new Error(stkData.ResponseDescription || stkData.errorMessage || 'MPESA payment initiation failed');
      }
      return {
        externalSessionId: stkData.CheckoutRequestID,
        mpesaStk: {
          checkoutRequestId: stkData.CheckoutRequestID,
          merchantRequestId: stkData.MerchantRequestID,
          customerMessage: stkData.CustomerMessage,
        },
      };
    }
    case 'bank_transfer': {
      const cfg = settings as ErpBankTransferSettings;
      const reference = `INV-${metadata.invoiceNumber || metadata.invoiceId}-${Date.now()}`;
      return {
        bankDetails: { ...cfg, reference },
      };
    }
    default:
      throw new Error(`Unsupported gateway: ${gateway}`);
  }
}

export async function verifyStripeCheckoutSession(
  settings: ErpStripeSettings,
  sessionId: string
): Promise<ErpGatewayEvidence & {paymentIntentId?:string}> {
  const stripe = new Stripe(settings.secretKey, { apiVersion: '2025-09-30.clover' as any });
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return {
    paid: session.payment_status === 'paid',minorAmount:session.amount_total??undefined,currency:session.currency??undefined,externalSessionId:session.id,referenceNumber:(session.payment_intent as string)||session.id,
    paymentIntentId: (session.payment_intent as string) || session.id,
    metadata: (session.metadata as Record<string, string>) || {},
  };
}

export async function verifyPaystackPayment(
  settings: ErpPaystackSettings,
  reference: string
): Promise<ErpGatewayEvidence & {amount?:number}> {
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${settings.secretKey}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Paystack verification failed');
  return {
    paid: data?.data?.status === 'success',minorAmount:data?.data?.amount,currency:data?.data?.currency,externalSessionId:data?.data?.reference,referenceNumber:data?.data?.reference,metadata:data?.data?.metadata,
    amount: data?.data?.amount ? data.data.amount / 100 : undefined,
  };
}

export async function capturePayPalOrder(
  settings: ErpPayPalSettings,
  orderId: string
): Promise<ErpGatewayEvidence & {captureId?:string}> {
  const env = settings.testMode
    ? new paypal.core.SandboxEnvironment(settings.clientId.trim(), settings.clientSecret.trim())
    : new paypal.core.LiveEnvironment(settings.clientId.trim(), settings.clientSecret.trim());
  const client = new paypal.core.PayPalHttpClient(env);
  const existing=await client.execute(new paypal.orders.OrdersGetRequest(orderId));
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({ payment_source: {} } as any);
  const response = existing.result.status==='COMPLETED'?existing:await client.execute(request);
  const status = response.result.status;
  const captureId = response.result.purchase_units?.[0]?.payments?.captures?.[0]?.id;
  const units=response.result.purchase_units??[],capture=units[0]?.payments?.captures?.[0];
  return { paid: status === 'COMPLETED'&&units.length===1&&units[0]?.payments?.captures?.length===1&&capture?.status==='COMPLETED', captureId,amountText:capture?.amount?.value,currency:capture?.amount?.currency_code,externalSessionId:response.result.id,referenceNumber:captureId,externalReference:units[0]?.custom_id };
}

export async function verifyMoyasarPayment(
  settings: ErpMoyasarSettings,
  paymentId: string
): Promise<ErpGatewayEvidence & {amount?:number}> {
  const auth = Buffer.from(`${settings.secretKey}:`).toString('base64');
  const res = await fetch(`https://api.moyasar.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || 'Moyasar verification failed');
  return {
    paid: data.status === 'paid' || data.status === 'captured',minorAmount:data.amount,currency:data.currency,referenceNumber:data.id,metadata:data.metadata,
    amount: data.amount ? data.amount / 100 : undefined,
  };
}

export async function verifyMercadoPagoPayment(
  settings: ErpMercadoPagoSettings,
  paymentId: string
): Promise<ErpGatewayEvidence> {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${settings.accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Mercado Pago verification failed');
  return {
    paid: data.status === 'approved',amountText:String(data.transaction_amount),currency:data.currency_id,referenceNumber:String(data.id),metadata:data.metadata,
    externalReference: data.external_reference,
  };
}

/** Authenticate STK status with the company's existing Daraja credentials. */
export async function verifyMpesaCheckout(settings:ErpMpesaSettings,checkoutRequestId:string):Promise<{paid:boolean;checkoutRequestId?:string;merchantRequestId?:string}>{
 const base=settings.testMode?'https://sandbox.safaricom.co.ke':'https://api.safaricom.co.ke';
 const auth=await fetch(base+'/oauth/v1/generate?grant_type=client_credentials',{headers:{Authorization:'Basic '+Buffer.from(`${settings.consumerKey}:${settings.consumerSecret}`).toString('base64')}});
 if(!auth.ok)throw new Error('MPESA verification authentication failed');const token=await auth.json(),timestamp=formatDarajaTimestamp();
 const response=await fetch(base+'/mpesa/stkpushquery/v1/query',{method:'POST',headers:{Authorization:'Bearer '+token.access_token,'Content-Type':'application/json'},body:JSON.stringify({BusinessShortCode:settings.businessShortcode,Password:Buffer.from(`${settings.businessShortcode}${settings.passkey}${timestamp}`).toString('base64'),Timestamp:timestamp,CheckoutRequestID:checkoutRequestId})});
 const data=await response.json();if(!response.ok)throw new Error('MPESA status verification failed');return {paid:String(data.ResultCode)==='0',checkoutRequestId:data.CheckoutRequestID,merchantRequestId:data.MerchantRequestID};
}

import { invoiceHeaderDiscountAmount, invoiceLineDiscountAmount } from '../../../../invoice-discount-math';
import crypto from 'node:crypto';
import {
  colombiaCustomerFiscalProfileSchema,
  colombiaProductFiscalProfileSchema,
  type FactusSettingsInput,
} from '../../../../../shared/factus';
import { ElectronicInvoicingRegistry } from '../registry';
import { ElectronicInvoicingUserError, type ElectronicInvoiceContext, type ElectronicInvoiceResult, type ElectronicInvoiceSubmission, type FactusNumberingRange, type IElectronicInvoiceProvider } from '../types';

const FACTUS_BASE_URLS = { sandbox: 'https://api-sandbox.factus.com.co', production: 'https://api.factus.com.co' } as const;
type Token = { accessToken: string; refreshToken: string; expiresAt: number };

export class FactusApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly details?: unknown, public readonly retryAfter?: number) { super(message); }
  get retryable(): boolean { return this.status == null || this.status === 429 || this.status >= 500; }
}

function errorMessages(body: any): string[] {
  const result: string[] = [];
  if (typeof body?.message === 'string') result.push(body.message);
  const collect = (value: unknown, path = ''): void => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result.push(path ? `${path}: ${String(value)}` : String(value));
    } else if (Array.isArray(value)) {
      value.forEach((entry) => collect(entry, path));
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => collect(entry, path ? `${path}.${key}` : key));
    }
  };
  if (body?.errors) {
    collect(body.errors);
  }
  return result.length ? result : ['Factus request failed'];
}

export class FactusClient {
  private static tokens = new Map<string, Token>();
  constructor(private readonly fetchFn: typeof fetch = fetch) {}
  private key(companyId: number, s: FactusSettingsInput) {
    const credentialVersion = crypto.createHash('sha256').update(`${s.password}\0${s.clientSecret}`).digest('hex').slice(0, 16);
    return `${companyId}:${s.environment}:${s.username}:${s.clientId}:${credentialVersion}`;
  }

  private async authenticate(companyId: number, settings: FactusSettingsInput, refreshToken?: string): Promise<Token> {
    const form = new FormData();
    form.set('grant_type', refreshToken ? 'refresh_token' : 'password');
    form.set('client_id', settings.clientId);
    form.set('client_secret', settings.clientSecret);
    if (refreshToken) form.set('refresh_token', refreshToken);
    else { form.set('username', settings.username); form.set('password', settings.password); }
    let response: Response;
    try {
      response = await this.fetchFn(`${FACTUS_BASE_URLS[settings.environment]}/oauth/token`, {
        method: 'POST', headers: { Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new FactusApiError(error instanceof Error ? error.message : 'Unable to authenticate with Factus');
    }
    const body = await response.json().catch(() => ({})) as any;
    if (!response.ok || !body.access_token) throw new FactusApiError(errorMessages(body).join('; '), response.status, body);
    const token = { accessToken: String(body.access_token), refreshToken: String(body.refresh_token || refreshToken || ''), expiresAt: Date.now() + Math.max(30, Number(body.expires_in || 600) - 30) * 1000 };
    FactusClient.tokens.set(this.key(companyId, settings), token);
    return token;
  }

  private async token(companyId: number, settings: FactusSettingsInput, force = false): Promise<Token> {
    const cached = FactusClient.tokens.get(this.key(companyId, settings));
    if (!force && cached && cached.expiresAt > Date.now()) return cached;
    if (cached?.refreshToken) {
      try { return await this.authenticate(companyId, settings, cached.refreshToken); } catch { /* password grant below */ }
    }
    return this.authenticate(companyId, settings);
  }

  async request(companyId: number, settings: FactusSettingsInput, path: string, init: RequestInit = {}, retried = false): Promise<any> {
    const token = await this.token(companyId, settings, retried);
    let response: Response;
    try {
      response = await this.fetchFn(`${FACTUS_BASE_URLS[settings.environment]}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers, Authorization: `Bearer ${token.accessToken}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      throw new FactusApiError(error instanceof Error ? error.message : 'Unable to connect to Factus');
    }
    if (response.status === 401 && !retried) {
      FactusClient.tokens.delete(this.key(companyId, settings));
      return this.request(companyId, settings, path, init, true);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const retryAfterValue = response.headers.get('retry-after');
      const retryAfter = retryAfterValue
        ? (/^\d+$/.test(retryAfterValue) ? Number(retryAfterValue) : Math.max(0, Math.ceil((Date.parse(retryAfterValue) - Date.now()) / 1000)))
        : undefined;
      throw new FactusApiError(errorMessages(body).join('; '), response.status, body, retryAfter);
    }
    return body;
  }
}

const money = (value: unknown) => Number(value || 0).toFixed(2);

function finiteNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.invalidNumber', '{{field}} must be a valid number', { field: label });
  return parsed;
}

function factusValidatedAt(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return undefined;
  let hour = Number(match[4]) % 12;
  if (match[7].toUpperCase() === 'PM') hour += 12;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), hour, Number(match[5]), Number(match[6]));
}

export function buildFactusInvoicePayload(data: ElectronicInvoiceSubmission, settings: FactusSettingsInput) {
  const { invoice, items, customer } = data;
  if (invoice.type !== 'sales_invoice') throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.standardSalesOnly', 'Factus currently supports standard sales invoices only');
  if (String(invoice.currency || '').toUpperCase() !== 'COP') throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.copOnly', 'Factus standard invoices must use COP');
  if (!items.length) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.itemsRequired', 'The invoice must contain at least one item');
  if (!settings.numberingRangeId) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.activeRangeRequired', 'An active Factus numbering range is required');
  if (!data.referenceCode.trim()) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.referenceRequired', 'A stable Factus reference code is required');
  const parsedCustomerProfile = colombiaCustomerFiscalProfileSchema.safeParse(customer.colombiaFiscalProfile);
  if (!parsedCustomerProfile.success) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.customerFiscalProfile', 'The customer Colombia fiscal profile is incomplete');
  const customerProfile = parsedCustomerProfile.data;
  const paymentForm = invoice.electronicPaymentForm || settings.defaults.paymentForm;
  const paymentMethodCode = invoice.electronicPaymentMethodCode || settings.defaults.paymentMethodCode;
  if (!paymentMethodCode) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.paymentMethodRequired', 'A Factus payment method is required');
  if (paymentForm === '2') {
    if (!invoice.dueDate) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.creditDueDateRequired', 'A due date is required for Factus credit invoices');
    const dueDate = new Date(invoice.dueDate);
    const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : undefined;
    if (Number.isNaN(dueDate.getTime())) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.invalidDueDate', 'Factus credit due date is invalid');
    if (issueDate && !Number.isNaN(issueDate.getTime()) && dueDate.getTime() < issueDate.getTime()) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.dueBeforeIssue', 'Factus credit due date cannot precede the invoice issue date');
  }

  const subtotal = finiteNumber(invoice.subtotal || 0, 'Invoice subtotal');
  const headerDiscount = invoiceHeaderDiscountAmount(subtotal, String(invoice.discountType || 'none'), finiteNumber(invoice.discountValue || 0, 'Invoice discount'));
  let allocated = 0;
  let mappedTaxableSubtotal = 0;
  let mappedTax = 0;
  let lineSubtotal = 0;
  const mappedItems = items.map((item, index) => {
    const fallback = {
      codeReference: item.product?.sku || undefined,
      unitMeasureCode: settings.defaults.unitMeasureCode,
      standardCode: settings.defaults.standardCode,
      taxCode: settings.defaults.taxCode,
      isExcluded: item.product?.isTaxable === false,
    };
    const parsedProfile = colombiaProductFiscalProfileSchema.safeParse({ ...fallback, ...(item.product?.colombiaFiscalProfile as object || {}), ...(item.colombiaFiscalProfile as object || {}) });
    if (!parsedProfile.success) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.productFiscalProfile', 'Item {{item}} has incomplete Colombia fiscal data', { item: index + 1 });
    const profile = parsedProfile.data;
    const quantity = finiteNumber(item.quantity, `Item ${index + 1} quantity`);
    const unitPrice = finiteNumber(item.unitPrice, `Item ${index + 1} price`);
    const taxRate = finiteNumber(item.taxRate || 0, `Item ${index + 1} tax rate`);
    if (quantity <= 0 || unitPrice < 0 || taxRate < 0) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.invalidItemValues', 'Item {{item}} has invalid quantity, price, or tax rate', { item: index + 1 });
    const lineDiscount = invoiceLineDiscountAmount({ quantity, unitPrice, discountType: item.discountType, discountValue: finiteNumber(item.discountValue || 0, `Item ${index + 1} discount`), discountPercent: finiteNumber(item.discountPercent || 0, `Item ${index + 1} discount rate`) });
    const storedLineTotal = finiteNumber(item.lineTotal, `Item ${index + 1} total`);
    lineSubtotal += storedLineTotal;
    const share = index === items.length - 1 ? headerDiscount - allocated : Math.round(headerDiscount * (storedLineTotal / Math.max(subtotal, 0.01)) * 100) / 100;
    allocated += share;
    const totalDiscount = Math.max(0, lineDiscount + share);
    const taxableBase = Math.max(0, quantity * unitPrice - totalDiscount);
    mappedTaxableSubtotal += taxableBase;
    if (!profile.isExcluded) mappedTax += taxableBase * taxRate / 100;
    const discount = share === 0 && item.discountType === 'percentage'
      ? { discount_rate: money(item.discountValue ?? item.discountPercent ?? 0) }
      : { discount_amount: money(totalDiscount) };
    return {
      code_reference: profile.codeReference || item.product?.sku || `ITEM-${item.id}`,
      name: item.description || item.product?.name || `Item ${index + 1}`, quantity: money(quantity), ...discount, price: money(unitPrice),
      unit_measure_code: profile.unitMeasureCode, standard_code: profile.standardCode,
      taxes: [{ code: profile.taxCode, rate: money(profile.isExcluded ? 0 : taxRate), ...(profile.isExcluded ? { is_excluded: true } : {}) }],
    };
  });

  if (Math.abs(lineSubtotal - subtotal) > 0.01) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.subtotalMismatch', 'Invoice line totals do not reconcile with the subtotal within COP 0.01');
  const surcharge = finiteNumber(invoice.tipAmount || 0, 'Invoice tip') + finiteNumber(invoice.serviceChargeAmount || 0, 'Invoice service charge');
  const expectedTotal = mappedTaxableSubtotal + mappedTax + surcharge;
  const invoiceTotal = finiteNumber(invoice.totalAmount, 'Invoice total');
  if (Math.abs(expectedTotal - invoiceTotal) > 0.01) throw new ElectronicInvoicingUserError('erp.electronicInvoicing.errors.totalMismatch', 'Invoice totals do not reconcile with the Factus payload within COP 0.01');
  const payload: any = {
    reference_code: data.referenceCode, document: '01', operation_type: '10', numbering_range_id: settings.numberingRangeId,
    send_email: false, ...(invoice.notes ? { observation: String(invoice.notes).slice(0, 250) } : {}),
    payment_details: [{ payment_form: paymentForm, payment_method_code: paymentMethodCode, reference_code: invoice.invoiceNumber, amount: money(invoiceTotal), ...(paymentForm === '2' ? { due_date: new Date(invoice.dueDate!).toISOString().slice(0, 10) } : {}) }],
    cash_rounding_amount: '0.00',
    customer: {
      identification_document_code: customerProfile.identificationDocumentCode,
      identification: customerProfile.identification.replace(/-\d$/, ''),
      ...(customerProfile.dv ? { dv: customerProfile.dv } : {}), legal_organization_code: customerProfile.legalOrganizationCode,
      ...(customerProfile.legalOrganizationCode === '1' ? { company: customerProfile.legalName } : { names: customerProfile.legalName }),
      ...(customerProfile.tradeName ? { trade_name: customerProfile.tradeName } : {}), tribute_code: customerProfile.tributeCode,
      responsibilities: customerProfile.responsibilities, ...(customerProfile.address ? { address: customerProfile.address } : {}),
      ...(customer.email ? { email: customer.email } : {}), ...(customer.phone ? { phone: customer.phone } : {}), country_code: customerProfile.countryCode,
      ...(customerProfile.countryCode === 'CO' && customerProfile.municipalityCode ? { municipality_code: customerProfile.municipalityCode } : {}),
    }, items: mappedItems,
  };
  if (surcharge > 0) payload.allowance_charges = [{ concept_type: '03', is_surcharge: true, reason: 'Tip/service charge', base_amount: money(subtotal), amount: money(surcharge) }];
  return payload;
}

export class FactusProvider implements IElectronicInvoiceProvider {
  constructor(private readonly client = new FactusClient()) {}
  getProviderName() { return 'factus'; }
  async validateConfiguration(context: ElectronicInvoiceContext) { await this.client.request(context.companyId, context.settings, '/v2/numbering-ranges'); }
  async listNumberingRanges(context: ElectronicInvoiceContext): Promise<FactusNumberingRange[]> {
    const body = await this.client.request(context.companyId, context.settings, '/v2/numbering-ranges');
    const rows = Array.isArray(body?.data?.data) ? body.data.data : Array.isArray(body?.data) ? body.data : [];
    return rows.map((row: any) => {
      const rawDocument = row.document_code ?? row.document_type?.code ?? row.document?.code ?? row.document?.name ?? row.document ?? '';
      const documentText = String(rawDocument).trim();
      const normalizedDocument = /factura(?!.*nota)/i.test(documentText) ? '01' : documentText;
      const activeValue = row.is_active ?? row.active ?? row.status;
      const explicitlyInactive = activeValue === false || activeValue === 0 || ['0', 'false', 'inactive', 'inactivo'].includes(String(activeValue).toLowerCase());
      const expired = row.is_expired === true || row.is_expired === 1 || String(row.is_expired).toLowerCase() === 'true';
      return {
        id: Number(row.id),
        document: normalizedDocument,
        prefix: row.prefix,
        from: row.from != null ? Number(row.from) : undefined,
        to: row.to != null ? Number(row.to) : undefined,
        current: row.current != null ? Number(row.current) : undefined,
        isActive: !explicitlyInactive && !expired,
      };
    }).filter((range: FactusNumberingRange) => Number.isInteger(range.id) && range.id > 0);
  }
  async emitInvoice(context: ElectronicInvoiceContext, data: ElectronicInvoiceSubmission): Promise<ElectronicInvoiceResult> {
    const payload = buildFactusInvoicePayload(data, context.settings);
    try {
      const ranges = await this.listNumberingRanges(context);
      if (!ranges.some((range) => range.id === context.settings.numberingRangeId && range.isActive && (!range.document || range.document === '01'))) {
        return { success: false, status: 'rejected', errors: ['The selected Factus sales-invoice numbering range is inactive or unavailable'], metadata: { referenceCode: payload.reference_code, numberingRangeId: payload.numbering_range_id } };
      }
      const body = await this.client.request(context.companyId, context.settings, '/v2/bills/validate', { method: 'POST', body: JSON.stringify(payload) });
      const result = body?.data || {};
      const valid = result.is_validated === true;
      const warnings = result.errors && Object.keys(result.errors).length ? errorMessages({ errors: result.errors }) : [];
      return { success: valid, status: valid ? 'validated' : 'rejected', documentNumber: result.number, cufe: result.cufe, publicUrl: result.links?.public_url, qrCodeText: result.links?.qr, validatedAt: valid ? factusValidatedAt(result.validated_at) ?? new Date() : undefined, errors: warnings, metadata: { factusStatus: body?.status, factusMessage: body?.message, totals: result.totals, referenceCode: payload.reference_code, numberingRangeId: payload.numbering_range_id } };
    } catch (error) {
      if (!(error instanceof FactusApiError)) throw error;
      return { success: false, status: error.status === 409 ? 'pending' : error.status === 400 || error.status === 422 ? 'rejected' : 'failed', errors: errorMessages(error.details), metadata: { httpStatus: error.status, retryable: error.retryable, retryAfter: error.retryAfter, referenceCode: payload.reference_code, numberingRangeId: payload.numbering_range_id } };
    }
  }
}

ElectronicInvoicingRegistry.registerInvoiceProvider('CO', new FactusProvider());

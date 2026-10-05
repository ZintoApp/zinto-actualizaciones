import path from 'path';
import fs from 'fs-extra';
import type { Invoice, InvoiceItem } from '@shared/schema';
import { storage } from '../storage';
import { getInvoiceTemplateSettingsWithMeta } from './erp-invoice-template-service';
import {
  renderA4Pdf,
  renderThermalPdf,
  type InvoicePdfTemplateType,
  type MoneyFormatFn,
} from './erp-invoice-pdf-service';
import {
  QUOTATION_PDF_RENDERER_CACHE_REVISION,
  quotationPdfCacheContentThresholdMs,
} from './erp-quotation-pdf-cache-invalidation';
import { formatCurrency } from './erp/currency-service';
import { toFullPublicMediaUrl } from './public-media-url';

export type GenerateQuotationPdfResult = {
  pdfUrl: string;
  filePath: string;
  /** @deprecated Use filePath; kept for internal compatibility */
  absolutePath: string;
  fileName: string;
  templateType: InvoicePdfTemplateType;
};

export {
  QUOTATION_PDF_RENDERER_CACHE_REVISION,
  quotationPdfCacheContentThresholdMs,
} from './erp-quotation-pdf-cache-invalidation';

function safeFileSegment(s: string): string {
  const t = String(s).replace(/[^\w.-]+/g, '_').trim();
  return t.slice(0, 80) || 'quotation';
}

function buildQuotationPdfResult(
  filePath: string,
  companyId: number,
  fileBase: string,
  templateType: InvoicePdfTemplateType
): GenerateQuotationPdfResult {
  const relativeMediaPath = `/uploads/erp/quotations/${companyId}/${fileBase}`;
  return {
    filePath,
    absolutePath: filePath,
    pdfUrl: toFullPublicMediaUrl(relativeMediaPath),
    fileName: fileBase,
    templateType,
  };
}

export async function generateQuotationPdf(
  salesOrderId: number,
  companyId: number,
  templateType: InvoicePdfTemplateType = 'a4',
  opts?: { language?: string }
): Promise<GenerateQuotationPdfResult> {
  const order = await storage.getSalesOrder(salesOrderId);
  if (!order || order.companyId !== companyId) {
    throw new Error('Sales order not found');
  }

  let language = opts?.language?.trim();
  if (!language && order.createdBy != null) {
    const creator = await storage.getUser(order.createdBy);
    language = creator?.languagePreference?.trim();
  }
  language = language || 'en';

  const currencyCode = (order.currency ?? 'USD').trim();
  const currencyRow = await storage.getCurrencyByCode(companyId, currencyCode);
  const currencyMeta = currencyRow
    ? {
        name: currencyRow.name,
        symbol: currencyRow.symbol,
        decimalPlaces: currencyRow.decimalPlaces,
      }
    : undefined;

  const formatMoneyAmount: MoneyFormatFn = (amount) =>
    formatCurrency(String(amount), currencyCode, companyId);

  const [items, templateMeta, company] = await Promise.all([
    storage.getSalesOrderItems(salesOrderId),
    getInvoiceTemplateSettingsWithMeta(companyId),
    storage.getCompany(companyId),
  ]);
  const { settings, templateSettingsUpdatedAt } = templateMeta;
  const companyName = company?.name?.trim() || '';

  let contactName = '—';
  if (order.contactId != null) {
    const c = await storage.getContact(order.contactId);
    contactName = c?.name?.trim() || '—';
  }

  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is number => id != null))];
  const productNames = new Map<number, string>();
  await Promise.all(
    productIds.map(async (pid) => {
      const p = await storage.getProduct(pid);
      if (p?.name) productNames.set(pid, p.name);
    })
  );

  const pseudoInvoice = {
    id: -order.id,
    companyId,
    invoiceNumber: order.orderNumber,
    type: 'quotation',
    status: order.status,
    issueDate: order.createdAt,
    dueDate: order.validUntil,
    subtotal: order.subtotal,
    taxAmount: order.taxAmount,
    discountAmount: order.discountAmount,
    totalAmount: order.totalAmount,
    currency: order.currency,
    notes: order.notes,
    tipAmount: '0',
    serviceChargeAmount: null,
    serviceChargeRate: null,
    amountPaid: '0',
    amountDue: order.totalAmount,
    termsAndConditions: null,
    contactId: order.contactId,
    supplierId: null,
    salesOrderId: order.id,
    pdfUrl: null,
    discountType: null,
    discountValue: null,
    createdBy: order.createdBy,
    updatedAt: order.updatedAt,
    createdAt: order.createdAt,
  } as unknown as Invoice;

  const invoiceItems: InvoiceItem[] = items.map(
    (item) =>
      ({
        ...item,
        discountType: null,
        discountValue: null,
      }) as unknown as InvoiceItem
  );

  const safeNum = safeFileSegment(order.orderNumber);
  const langSeg = safeFileSegment(language);
  const dir = path.join(process.cwd(), 'uploads', 'erp', 'quotations', String(companyId));
  const fileBase =
    templateType === 'a4'
      ? `quotation-${safeNum}-a4-${QUOTATION_PDF_RENDERER_CACHE_REVISION}-${langSeg}.pdf`
      : `quotation-${safeNum}-thermal-${langSeg}.pdf`;
  const filePath = path.join(dir, fileBase);

  const contentThresholdMs = quotationPdfCacheContentThresholdMs(
    order.updatedAt,
    templateSettingsUpdatedAt,
    currencyRow?.updatedAt
  );
  if (await fs.pathExists(filePath)) {
    const st = await fs.stat(filePath);
    if (st.mtimeMs >= contentThresholdMs - 500) {
      return buildQuotationPdfResult(filePath, companyId, fileBase, templateType);
    }
  }

  await fs.ensureDir(dir);

  const renderParams = {
    invoice: pseudoInvoice,
    items: invoiceItems,
    payments: [],
    settings,
    contactName,
    supplierName: '—',
    companyName,
    productNames,
    absolutePath: filePath,
    documentKind: 'quotation' as const,
    formatMoneyAmount,
  };

  if (templateType === 'a4') {
    await renderA4Pdf({
      ...renderParams,
      language,
      currencyMeta,
    });
  } else {
    await renderThermalPdf({
      ...renderParams,
      language,
    });
  }

  return buildQuotationPdfResult(filePath, companyId, fileBase, templateType);
}

import path from 'path';
import fs from 'fs-extra';
import axios from 'axios';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { Invoice, InvoiceItem, InvoicePayment } from '@shared/schema';
import { electronicInvoices } from '@shared/schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { storage } from '../storage';
import { invoiceLineDiscountAmount } from '../invoice-discount-math';
import {
  getInvoiceTemplateSettingsWithMeta,
  type InvoiceTemplateSettings,
} from './erp-invoice-template-service';
import {
  A4_INVOICE_PDF_RENDERER_CACHE_REVISION,
  invoicePdfCacheContentThresholdMs,
} from './erp-invoice-pdf-cache-invalidation';
import { formatAmountInWords } from '@shared/erp-invoice-amount-in-words';
import { registerAmountInWordsPdfFont, amountInWordsUsesRtl } from './erp-invoice-pdf-fonts';
import { buildInvoicePaymentOptionLines } from './erp-invoice-payment-options-service';
import serverI18n from '../utils/server-i18n';

export type InvoicePdfTemplateType = 'a4' | 'thermal';

export type DocumentKind = 'invoice' | 'quotation';

export type GenerateInvoicePdfResult = {
  pdfUrl: string;
  absolutePath: string;
  fileName: string;
  templateType: InvoicePdfTemplateType;
};

export {
  A4_INVOICE_PDF_RENDERER_CACHE_REVISION,
  invoicePdfCacheContentThresholdMs,
} from './erp-invoice-pdf-cache-invalidation';

function safeFileSegment(s: string): string {
  const t = String(s).replace(/[^\w.-]+/g, '_').trim();
  return t.slice(0, 80) || 'invoice';
}

function num(v: string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export type MoneyFormatFn = (amount: number) => string | Promise<string>;

async function resolveMoneyFormat(
  formatMoneyAmount: MoneyFormatFn | undefined,
  amount: number,
  currency: string,
  lineItem: boolean
): Promise<string> {
  if (!formatMoneyAmount) {
    return lineItem ? amount.toFixed(2) : formatMoney(amount, currency);
  }
  const result = formatMoneyAmount(amount);
  return typeof result === 'string' ? result : await result;
}

export type QuotationDocumentLabels = {
  title: string;
  validUntil: string;
  total: string;
  thermalTitle: string;
  thermalTotal: string;
  thermalIssueDueLine: (issue: string, due: string) => string;
};

/** Quotation PDF labels from render language; invoice rendering keeps English defaults. */
export function resolveQuotationDocumentLabels(language: string): QuotationDocumentLabels {
  const base = language.trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'es') {
    return {
      title: 'Cotización',
      validUntil: 'Válido hasta',
      total: 'Total cotización',
      thermalTitle: 'COTIZACIÓN',
      thermalTotal: 'TOTAL COTIZACIÓN',
      thermalIssueDueLine: (issue, due) => `Emisión: ${issue} | Válido hasta: ${due}`,
    };
  }
  return {
    title: 'Quotation',
    validUntil: 'Valid until',
    total: 'Quotation total',
    thermalTitle: 'QUOTATION',
    thermalTotal: 'QUOTATION TOTAL',
    thermalIssueDueLine: (issue, due) => `Issue: ${issue} | Valid until: ${due}`,
  };
}

function mmToPt(mm: number): number {
  return mm * 2.83465;
}

function effectiveLineDiscountPercent(item: InvoiceItem): number {
  const dv = num(item.discountValue);
  const dpc = num(item.discountPercent);
  return dv !== 0 ? dv : dpc;
}

function lineDiscountApplied(item: InvoiceItem): number {
  const qty = num(item.quantity);
  const price = num(item.unitPrice);
  const base = qty * price;
  const discountValueExplicit =
    item.discountValue !== null && item.discountValue !== undefined && String(item.discountValue).trim() !== '';
  return invoiceLineDiscountAmount({
    quantity: qty,
    unitPrice: price,
    discountType: item.discountType != null ? String(item.discountType) : undefined,
    discountValue: discountValueExplicit ? num(item.discountValue) : undefined,
    discountPercent: num(item.discountPercent),
  });
}

function lineTotalFromItem(item: InvoiceItem): number {
  const qty = num(item.quantity);
  const price = num(item.unitPrice);
  const base = qty * price;
  return base - lineDiscountApplied(item);
}

function pdfFontFamily(family: 'sans' | 'serif' | 'mono'): string {
  switch (family) {
    case 'serif':
      return 'Times-Roman';
    case 'mono':
      return 'Courier';
    default:
      return 'Helvetica';
  }
}

function pdfBoldFont(base: string): string {
  if (base === 'Times-Roman') return 'Times-Bold';
  return `${base}-Bold`;
}

const DEFAULT_ACCENT_HEX = '#2563eb';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const raw = hex.replace(/^#/, '');
  const expanded =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  const n = parseInt(expanded, 16);
  if (!Number.isFinite(n) || expanded.length !== 6) return { r: 37, g: 99, b: 235 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function normalizeAccentHex(input: string | null | undefined): string {
  const t = String(input ?? '').trim();
  const withHash = t.startsWith('#') ? t : `#${t}`;
  const raw = withHash.slice(1);
  const expanded =
    raw.length === 3 && /^[0-9a-fA-F]{3}$/.test(raw)
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return DEFAULT_ACCENT_HEX;
  return `#${expanded.toLowerCase()}`;
}

function formatBusinessDate(value: string | Date | null): string {
  if (!value) return '—';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '—' : value.toLocaleDateString();
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function stripUrlQueryAndHash(url: string): string {
  const t = url.trim();
  const q = t.indexOf('?');
  const h = t.indexOf('#');
  let end = t.length;
  if (q >= 0) end = Math.min(end, q);
  if (h >= 0) end = Math.min(end, h);
  return t.slice(0, end);
}

/** Map URL path (no query/hash) to on-disk paths mirroring express static mounts in server/routes.ts */
async function tryReadLogoFromDisk(cleanPath: string): Promise<Buffer | null> {
  if (!cleanPath.startsWith('/')) return null;

  const cwd = process.cwd();
  const pathsToTry: string[] = [];
  if (cleanPath.startsWith('/media/flow-media/')) {
    pathsToTry.push(
      path.join(cwd, 'uploads', 'flow-media', cleanPath.slice('/media/flow-media/'.length))
    );
  } else if (cleanPath.startsWith('/email-attachments/')) {
    const rest = cleanPath.slice('/email-attachments/'.length);
    pathsToTry.push(path.join(cwd, 'public', 'email-attachments', rest));
    pathsToTry.push(path.join(cwd, 'uploads', 'email-attachments', rest));
  } else if (cleanPath.startsWith('/uploads/')) {
    pathsToTry.push(path.join(cwd, cleanPath.slice(1)));
  } else if (cleanPath.startsWith('/media/')) {
    const rest = cleanPath.slice('/media/'.length);
    pathsToTry.push(path.join(cwd, 'public', 'media', rest));
    pathsToTry.push(path.join(cwd, 'uploads', rest));
  }

  for (const full of pathsToTry) {
    if (await fs.pathExists(full)) return fs.readFile(full);
  }
  return null;
}

/** Ensure PDFKit can embed the logo (JPEG/PNG); convert WebP/SVG/GIF/etc. via sharp. */
async function normalizeLogoBufferForPdf(buf: Buffer): Promise<Buffer | null> {
  try {
    const meta = await sharp(buf, { failOn: 'none' }).metadata();
    const fmt = (meta.format || '').toLowerCase();
    if (fmt === 'jpeg' || fmt === 'jpg' || fmt === 'png') {
      return buf;
    }
    return await sharp(buf, { failOn: 'none' }).png().toBuffer();
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

export async function loadLogoBuffer(logoUrl: string | null | undefined): Promise<Buffer | null> {
  const raw = logoUrl?.trim();
  if (!raw) return null;
  try {
    const cleaned = stripUrlQueryAndHash(raw);

    if (/^https?:\/\//i.test(raw)) {
      let parsed: URL;
      try {
        parsed = new URL(raw);
      } catch {
        return null;
      }
      if (isLoopbackHost(parsed.hostname)) {
        const fromDisk = await tryReadLogoFromDisk(parsed.pathname);
        if (fromDisk) return normalizeLogoBufferForPdf(fromDisk);
      }
      const res = await axios.get(raw, {
        responseType: 'arraybuffer',
        timeout: 25000,
        maxContentLength: 8 * 1024 * 1024,
      });
      return normalizeLogoBufferForPdf(Buffer.from(res.data));
    }

    const fromDisk = await tryReadLogoFromDisk(cleaned);
    if (fromDisk) return normalizeLogoBufferForPdf(fromDisk);

    return null;
  } catch {
    return null;
  }
}

function thermalLineHeightMult(spacing: 'tight' | 'normal' | 'loose'): number {
  switch (spacing) {
    case 'tight':
      return 1.2;
    case 'loose':
      return 1.65;
    default:
      return 1.4;
  }
}

function slugInvoiceType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function slugPaymentMethod(m: string | null): string {
  if (!m?.trim()) return '';
  return m.replace(/_/g, ' ');
}

type PdfDoc = InstanceType<typeof PDFDocument>;

async function writePdfToFile(
  absolutePath: string,
  build: (doc: PdfDoc) => void | Promise<void>
): Promise<void> {
  await fs.ensureDir(path.dirname(absolutePath));
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false });
    const stream = fs.createWriteStream(absolutePath);
    doc.pipe(stream);
    Promise.resolve(build(doc))
      .then(() => {
        doc.end();
      })
      .catch(reject);
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

export async function renderA4Pdf(params: {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  paymentOptionLines?: Array<{ label: string; detail?: string; url?: string }>;
  settings: InvoiceTemplateSettings;
  contactName: string;
  supplierName: string;
  companyName: string;
  productNames: Map<number, string>;
  absolutePath: string;
  language: string;
  currencyMeta?: { name?: string | null; symbol?: string | null; decimalPlaces?: number | null };
  documentKind?: DocumentKind;
  formatMoneyAmount?: MoneyFormatFn;
  electronicInvoice?: any;
}): Promise<void> {
  const {
    invoice,
    items,
    payments,
    paymentOptionLines = [],
    settings,
    contactName,
    supplierName,
    companyName,
    productNames,
    absolutePath,
    language,
    currencyMeta,
    documentKind = 'invoice',
    formatMoneyAmount,
    electronicInvoice,
  } = params;
  const isQuotation = documentKind === 'quotation';
  const quotationLabels = isQuotation ? resolveQuotationDocumentLabels(language) : null;
  const electronicLabels = electronicInvoice ? {
    title: await serverI18n.t('erp.electronicInvoicing.pdf.validationDetails', language, 'Electronic Invoice Validation Details'),
    status: await serverI18n.t('erp.common.status', language, 'Status'),
    validated: await serverI18n.t('erp.electronicInvoicing.status.validated', language, 'VALIDATED'),
    provider: await serverI18n.t('erp.electronicInvoicing.provider', language, 'Provider'),
  } : null;
  const currency = (invoice.currency ?? 'USD').toUpperCase();
  const h = settings.header;
  const f = settings.footer;
  const a4 = settings.a4;
  const marginPt = mmToPt(a4.marginMm);
  const pageSize = a4.paperSize === 'letter' ? 'LETTER' : 'A4';
  const font = pdfFontFamily(a4.fontFamily);
  const fz = a4.fontSizePt;
  const accentHex = normalizeAccentHex(a4.accentColor);
  const accentRgb = hexToRgb(accentHex);

  const displayName = h.businessName?.trim() || companyName || '—';

  await writePdfToFile(absolutePath, async (doc) => {
    doc.addPage({ size: pageSize, margins: { top: marginPt, bottom: marginPt, left: marginPt, right: marginPt } });

    const amountWordsFont = await registerAmountInWordsPdfFont(doc, language);

    const pageWidth = doc.page.width - marginPt * 2;
    let y = marginPt;

    if (a4.watermarkText?.trim()) {
      doc.save();
      doc.opacity(0.06);
      doc.fontSize(48)
        .font(pdfBoldFont(font))
        .fillColor('#000000')
        .rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text(a4.watermarkText, doc.page.width * 0.1, doc.page.height / 2, {
        width: doc.page.width * 0.8,
        align: 'center',
      });
      doc.restore();
      doc.fillColor('#111111').opacity(1);
    }

    const logoBuf = a4.showLogo ? await loadLogoBuffer(h.logoUrl) : null;
    let logoDrawn = false;

    if (a4.showHeader) {
      doc.fillColor(accentHex);
      let hx = marginPt;
      if (logoBuf) {
        try {
          doc.image(logoBuf, hx, y, { width: 56, height: 56, fit: [56, 56] });
          logoDrawn = true;
          hx += 70;
        } catch {
          /* skip bad image */
        }
      }
      doc.font(pdfBoldFont(font))
        .fontSize(fz + 4)
        .fillColor(accentHex)
        .text(displayName, hx, y, { width: pageWidth - (logoDrawn ? 70 : 0) });

      let ty = y + (fz + 4) + 4;
      doc.font(font).fontSize(fz).fillColor('#444444');
      const addrLines = [
        h.addressLine1,
        h.addressLine2,
        [h.city, h.country].filter(Boolean).join(', ') || null,
      ].filter((x) => x && String(x).trim()) as string[];
      for (const line of addrLines) {
        doc.text(line, hx, ty, { width: pageWidth - (logoDrawn ? 70 : 0) });
        ty += fz + 2;
      }
      const contactBits = [h.phone, h.email, h.website].filter(Boolean).join(' · ');
      if (contactBits) {
        doc.fontSize(fz - 1).fillColor('#555555').text(contactBits, hx, ty);
        ty += fz + 2;
      }
      if (h.taxId?.trim()) {
        doc.text(`Tax ID: ${h.taxId}`, hx, ty);
        ty += fz + 2;
      }

      const rightX = marginPt + pageWidth - 200;
      let ry = y;
      doc.font(pdfBoldFont(font)).fontSize(fz + 2).fillColor('#111111').text(isQuotation ? quotationLabels!.title : 'Invoice', rightX, ry, { width: 200, align: 'right' });
      ry += fz + 8;
      doc.font(font).fontSize(fz).text(`# ${invoice.invoiceNumber}`, rightX, ry, { width: 200, align: 'right' });
      ry += fz + 4;
      doc.text(slugInvoiceType(invoice.type), rightX, ry, { width: 200, align: 'right' });
      ry += fz + 4;
      doc.text(`Status: ${invoice.status}`, rightX, ry, { width: 200, align: 'right' });
      ry += fz + 4;
      doc.text(`Issue: ${formatBusinessDate(invoice.issueDate as string | null)}`, rightX, ry, { width: 200, align: 'right' });
      ry += fz + 4;
      doc.text(
        `${isQuotation ? quotationLabels!.validUntil : 'Due'}: ${formatBusinessDate(invoice.dueDate as string | null)}`,
        rightX,
        ry,
        { width: 200, align: 'right' }
      );
      ry += fz + 8;
      if (invoice.contactId != null) {
        doc.text(`Bill to: ${contactName}`, rightX, ry, { width: 200, align: 'right' });
        ry += fz + 4;
      }
      if (invoice.supplierId != null) {
        doc.text(`Supplier: ${supplierName}`, rightX, ry, { width: 200, align: 'right' });
      }

      y = Math.max(ty + 8, ry + fz + 8);
      doc.moveTo(marginPt, y).lineTo(marginPt + pageWidth, y).strokeColor(accentHex).lineWidth(2).stroke();
      y += 16;
    } else {
      doc.font(pdfBoldFont(font)).fontSize(fz).text(`# ${invoice.invoiceNumber}`, marginPt, y, {
        width: pageWidth,
        align: 'right',
      });
      y += fz + 12;
    }

    const subtotal = num(invoice.subtotal);
    const taxAmt = num(invoice.taxAmount);
    const discAmt = num(invoice.discountAmount);
    const tipAmt = num(invoice.tipAmount);
    const svcAmt = num(invoice.serviceChargeAmount);
    const totalAmt = num(invoice.totalAmount);
    const paidAmt = num(invoice.amountPaid);
    const dueAmt = num(invoice.amountDue);

    const colDesc = marginPt;
    const colQty = marginPt + pageWidth * 0.42;
    const colUnit = marginPt + pageWidth * 0.52;
    let colDisc = colUnit;
    let colTax = colUnit;
    let colLine = marginPt + pageWidth * 0.78;
    if (a4.showDiscountColumn) {
      colDisc = marginPt + pageWidth * 0.62;
      colTax = marginPt + pageWidth * 0.72;
      colLine = marginPt + pageWidth * 0.82;
    } else if (a4.showTaxColumn) {
      colTax = marginPt + pageWidth * 0.68;
      colLine = marginPt + pageWidth * 0.82;
    }

    const hdrY = y;
    doc.save();
    doc.opacity(0.09);
    doc
      .fillColor([accentRgb.r, accentRgb.g, accentRgb.b])
      .rect(marginPt, hdrY - 4, pageWidth, fz + 12)
      .fill();
    doc.restore();
    doc.font(pdfBoldFont(font)).fontSize(fz).fillColor(accentHex);
    doc.text(a4.showItemDescription ? 'Description' : 'Item', colDesc, hdrY, { width: colQty - colDesc - 6 });
    doc.text('Qty', colQty, hdrY, { width: colUnit - colQty - 6, align: 'right' });
    doc.text('Unit', colUnit, hdrY, { width: (a4.showDiscountColumn ? colDisc : colTax) - colUnit - 6, align: 'right' });
    if (a4.showDiscountColumn) {
      doc.text('Discount', colDisc, hdrY, { width: colTax - colDisc - 6, align: 'right' });
    }
    if (a4.showTaxColumn) {
      doc.text('Tax %', colTax, hdrY, { width: colLine - colTax - 6, align: 'right' });
    }
    doc.text('Total', colLine, hdrY, { width: marginPt + pageWidth - colLine, align: 'right' });
    y = hdrY + fz + 8;
    doc.moveTo(marginPt, y).lineTo(marginPt + pageWidth, y).strokeColor(accentHex).lineWidth(1).stroke();
    y += 8;

    doc.font(font).fillColor('#111111');
    for (const item of items) {
      const label =
        item.productId != null && productNames.has(item.productId)
          ? productNames.get(item.productId)!
          : item.description?.trim() || '—';
      doc.text(label, colDesc, y, { width: colQty - colDesc - 6 });
      let rowH = fz + 4;
      if (a4.showItemDescription && item.description?.trim() && item.productId != null) {
        doc.fontSize(fz - 1).fillColor('#666666').text(item.description, colDesc, y + fz + 2, {
          width: colQty - colDesc - 6,
        });
        doc.fontSize(fz).fillColor('#111111');
        rowH += fz + 4;
      }
      doc.text(String(item.quantity), colQty, y, { width: colUnit - colQty - 6, align: 'right' });
      doc.text(await resolveMoneyFormat(formatMoneyAmount, num(item.unitPrice), currency, true), colUnit, y, {
        width: (a4.showDiscountColumn ? colDisc : colTax) - colUnit - 6,
        align: 'right',
      });
      if (a4.showDiscountColumn) {
        const discCell =
          item.discountType === 'fixed_amount'
            ? await resolveMoneyFormat(formatMoneyAmount, num(item.discountValue), currency, false)
            : `${effectiveLineDiscountPercent(item).toFixed(2)}%`;
        doc.text(discCell, colDisc, y, { width: colTax - colDisc - 6, align: 'right' });
      }
      if (a4.showTaxColumn) {
        doc.text(num(item.taxRate).toFixed(2), colTax, y, { width: colLine - colTax - 6, align: 'right' });
      }
      doc.text(
        await resolveMoneyFormat(formatMoneyAmount, lineTotalFromItem(item), currency, true),
        colLine,
        y,
        { width: marginPt + pageWidth - colLine, align: 'right' }
      );
      y += rowH + 6;
      if (y > doc.page.height - marginPt - 120) {
        doc.addPage({ size: pageSize, margins: { top: marginPt, bottom: marginPt, left: marginPt, right: marginPt } });
        y = marginPt;
      }
    }

    const summaryLeft = marginPt + pageWidth - 280;
    const summaryW = 280;
    y += 10;
    doc.font(font).fontSize(fz);
    doc.text('Subtotal', summaryLeft, y);
    doc.text(await resolveMoneyFormat(formatMoneyAmount, subtotal, currency, false), summaryLeft, y, {
      width: summaryW,
      align: 'right',
    });
    y += fz + 4;
    if (discAmt > 0) {
      doc.text('Discount', summaryLeft, y);
      doc.text(await resolveMoneyFormat(formatMoneyAmount, discAmt, currency, false), summaryLeft, y, {
        width: summaryW,
        align: 'right',
      });
      y += fz + 4;
    }
    doc.text('Tax', summaryLeft, y);
    doc.text(await resolveMoneyFormat(formatMoneyAmount, taxAmt, currency, false), summaryLeft, y, {
      width: summaryW,
      align: 'right',
    });
    y += fz + 4;
    if (svcAmt > 0) {
      doc.text(
        invoice.serviceChargeRate ? `Service charge (${invoice.serviceChargeRate}%)` : 'Service charge',
        summaryLeft,
        y
      );
      doc.text(await resolveMoneyFormat(formatMoneyAmount, svcAmt, currency, false), summaryLeft, y, {
        width: summaryW,
        align: 'right',
      });
      y += fz + 4;
    }
    if (tipAmt > 0) {
      doc.text('Tip', summaryLeft, y);
      doc.text(await resolveMoneyFormat(formatMoneyAmount, tipAmt, currency, false), summaryLeft, y, {
        width: summaryW,
        align: 'right',
      });
      y += fz + 4;
    }
    doc.moveTo(summaryLeft, y).lineTo(summaryLeft + summaryW, y).strokeColor(accentHex).lineWidth(2).stroke();
    y += 8;
    doc.font(pdfBoldFont(font)).fontSize(fz + 1).fillColor(accentHex);
    doc.text(isQuotation ? quotationLabels!.total : 'Total', summaryLeft, y);
    doc.text(await resolveMoneyFormat(formatMoneyAmount, totalAmt, currency, false), summaryLeft, y, {
      width: summaryW,
      align: 'right',
    });
    y += fz + 10;
    doc.font(font).fontSize(fz - 1).fillColor('#555555');
    if (a4.showAmountInWords) {
      const wordsText = formatAmountInWords({
        amount: totalAmt,
        currencyCode: currency,
        language,
        currencyName: currencyMeta?.name,
        currencySymbol: currencyMeta?.symbol,
        currencyDecimalPlaces: currencyMeta?.decimalPlaces,
      });
      const rtl = amountInWordsUsesRtl(language);
      doc.font(amountWordsFont).fontSize(fz - 1).fillColor('#555555');
      doc.text(wordsText, summaryLeft, y, {
        width: summaryW,
        align: rtl ? 'right' : 'left',
      });
      y += fz + 8;
    }
    if (!isQuotation) {
      doc.font(font).fillColor('#111111').fontSize(fz);
      doc.text('Paid', summaryLeft, y);
      doc.text(await resolveMoneyFormat(formatMoneyAmount, paidAmt, currency, false), summaryLeft, y, {
        width: summaryW,
        align: 'right',
      });
      y += fz + 4;
      doc.font(pdfBoldFont(font)).text('Amount due', summaryLeft, y);
      doc.text(await resolveMoneyFormat(formatMoneyAmount, dueAmt, currency, false), summaryLeft, y, {
        width: summaryW,
        align: 'right',
      });
      y += fz + 16;
    }

    if (
      !isQuotation &&
      a4.showPaymentOptions !== false &&
      paymentOptionLines.length > 0
    ) {
      doc.font(pdfBoldFont(font)).fontSize(fz).fillColor(accentHex).text('Payment options', marginPt, y);
      y += fz + 6;
      doc.font(font).fontSize(fz - 1).fillColor('#111111');
      for (const line of paymentOptionLines) {
        const text = line.url ? `${line.label}: ${line.url}` : line.detail ? `${line.label}: ${line.detail}` : line.label;
        doc.text(text, marginPt, y, { width: pageWidth });
        y += fz + 2;
      }
      y += 8;
    }

    if (!isQuotation && a4.showPaymentsTable && payments.length > 0) {
      doc.font(pdfBoldFont(font)).fontSize(fz).fillColor(accentHex).text('Payments', marginPt, y);
      y += fz + 6;
      doc.font(font).fontSize(fz - 1).fillColor('#111111');
      for (const p of payments) {
        const pm = slugPaymentMethod(p.paymentMethod);
        const tail = [pm ? `(${pm})` : '', p.paymentDate ? formatBusinessDate(p.paymentDate) : '']
          .filter(Boolean)
          .join(' ');
        doc.text(
          `${await resolveMoneyFormat(formatMoneyAmount, num(p.amount), currency, false)} ${tail}`.trim(),
          marginPt,
          y,
          { width: pageWidth }
        );
        y += fz + 2;
      }
      y += 8;
    }

    if (a4.showFooter) {
      doc.font(font).fontSize(fz - 1).fillColor('#444444');
      if (f.thankYouNote?.trim()) {
        doc.text(f.thankYouNote, marginPt, y, { width: pageWidth, align: 'center' });
        y += fz + 6;
      }
      if (f.terms?.trim()) {
        doc.text(f.terms, marginPt, y, { width: pageWidth });
        y += fz * 2;
      }
      if (f.additionalInfo?.trim()) {
        doc.text(f.additionalInfo, marginPt, y, { width: pageWidth });
        y += fz * 2;
      }
    }

    if (invoice.notes?.trim()) {
      doc.font(pdfBoldFont(font)).fontSize(fz).fillColor('#111111').text('Notes', marginPt, y);
      y += fz + 4;
      doc.font(font).fontSize(fz - 1).text(invoice.notes, marginPt, y, { width: pageWidth });
      y += fz * 2;
    }

    if (invoice.termsAndConditions?.trim()) {
      doc.font(pdfBoldFont(font)).fontSize(fz).text('Terms', marginPt, y);
      y += fz + 4;
      doc.font(font).fontSize(fz - 1).text(invoice.termsAndConditions, marginPt, y, { width: pageWidth });
      y += fz * 2;
    }

    if (a4.showSignatureLine) {
      y += 24;
      doc.moveTo(marginPt, y).lineTo(marginPt + 200, y).strokeColor('#333333').stroke();
      y += 8;
      doc.font(font).fontSize(fz - 1).text('Authorized signature', marginPt, y);
    }

    if (electronicInvoice && electronicInvoice.status === 'validated') {
      y += 24;
      if (y + 110 > doc.page.height - marginPt) {
        doc.addPage({ size: pageSize, margins: { top: marginPt, bottom: marginPt, left: marginPt, right: marginPt } });
        y = marginPt;
      }
      
      doc.font(pdfBoldFont(font)).fontSize(fz).fillColor('#111111').text(electronicLabels!.title, marginPt, y);
      y += fz + 4;
      
      if (electronicInvoice.qrCodeText) {
        try {
          const qrBuf = await QRCode.toBuffer(electronicInvoice.qrCodeText, { type: 'png', width: 90 });
          doc.image(qrBuf, marginPt, y, { width: 90, height: 90 });
          
          doc.font(font).fontSize(fz - 1).fillColor('#333333');
          doc.text(`${electronicLabels!.status}: ${electronicLabels!.validated}`, marginPt + 105, y);
          doc.text(`${electronicLabels!.provider}: ${electronicInvoice.provider === 'factus' ? 'Factus' : electronicInvoice.provider === 'colombia_dian' ? 'Colombia DIAN' : electronicInvoice.provider}`, marginPt + 105, y + 16);
          if (electronicInvoice.cufe) {
            doc.text(`CUFE: ${electronicInvoice.cufe}`, marginPt + 105, y + 32, { width: pageWidth - 105 });
          }
          if (electronicInvoice.cuv) {
            doc.text(`CUV: ${electronicInvoice.cuv}`, marginPt + 105, y + 64, { width: pageWidth - 105 });
          }
          y += 95;
        } catch (e) {
          doc.font(font).fontSize(fz - 1).text(`${electronicLabels!.status}: ${electronicLabels!.validated} | CUFE: ${electronicInvoice.cufe || '—'} ${electronicInvoice.cuv ? `| CUV: ${electronicInvoice.cuv}` : ''}`, marginPt, y, { width: pageWidth });
          y += fz * 2;
        }
      } else {
        doc.font(font).fontSize(fz - 1).text(`${electronicLabels!.status}: ${electronicLabels!.validated} | CUFE: ${electronicInvoice.cufe || '—'} ${electronicInvoice.cuv ? `| CUV: ${electronicInvoice.cuv}` : ''}`, marginPt, y, { width: pageWidth });
        y += fz * 2;
      }
    }
  });
}

export async function renderThermalPdf(params: {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: InvoicePayment[];
  settings: InvoiceTemplateSettings;
  contactName: string;
  supplierName: string;
  companyName: string;
  productNames: Map<number, string>;
  absolutePath: string;
  language?: string;
  documentKind?: DocumentKind;
  formatMoneyAmount?: MoneyFormatFn;
}): Promise<void> {
  const {
    invoice,
    items,
    payments,
    settings,
    contactName,
    supplierName,
    companyName,
    productNames,
    absolutePath,
    language = 'en',
    documentKind = 'invoice',
    formatMoneyAmount,
  } = params;
  const isQuotation = documentKind === 'quotation';
  const quotationLabels = isQuotation ? resolveQuotationDocumentLabels(language) : null;
  const currency = (invoice.currency ?? 'USD').toUpperCase();
  const h = settings.header;
  const f = settings.footer;
  const th = settings.thermal;
  const widthPt = th.paperWidthMm * 2.83465;
  const margin = 10;
  const font = pdfFontFamily(th.fontFamily === 'sans' ? 'sans' : 'mono');
  const fs = th.fontSizePt;
  const lh = thermalLineHeightMult(th.lineSpacing);
  const lineGap = fs * lh;
  const wch = th.charsPerLine;

  const displayName = h.businessName?.trim() || companyName || '—';

  let contentHeight = margin * 2 + lineGap * 40;
  contentHeight += items.length * lineGap * 3;
  contentHeight += payments.length * lineGap;
  if (th.showQrCode) contentHeight += 120;
  const pageH = Math.min(Math.max(contentHeight, 400), 14000);

  await writePdfToFile(absolutePath, async (doc) => {
    doc.addPage({ size: [widthPt, pageH], margins: { top: margin, bottom: margin, left: margin, right: margin } });

    let y = margin;
    const textWidth = widthPt - margin * 2;

    const alignForDoc = th.headerAlign === 'center' ? 'center' : th.headerAlign === 'right' ? 'right' : 'left';

    if (th.showLogo && h.logoUrl) {
      const logoBuf = await loadLogoBuffer(h.logoUrl);
      if (logoBuf) {
        try {
          const lw = Math.min(widthPt - margin * 2, th.paperWidthMm * 2.83465 - margin * 2);
          doc.image(logoBuf, margin, y, { width: lw, height: 40, fit: [lw, 40] });
          y += 48;
        } catch {
          /* skip */
        }
      }
    }

    doc.font(pdfBoldFont(font)).fontSize(fs).text(displayName, margin, y, {
      width: textWidth,
      align: alignForDoc as 'left' | 'center' | 'right',
    });
    y += lineGap;

    doc.font(font).fontSize(Math.max(fs - 1, 7));
    const addrLines = [
      h.addressLine1,
      h.addressLine2,
      [h.city, h.country].filter(Boolean).join(', ') || null,
    ].filter((x) => x && String(x).trim()) as string[];
    for (const line of addrLines) {
      doc.text(line, margin, y, { width: textWidth, align: alignForDoc as 'left' | 'center' | 'right' });
      y += lineGap * 0.85;
    }
    for (const line of [h.phone, h.email, h.website, h.taxId ? `Tax ID: ${h.taxId}` : null].filter(Boolean)) {
      doc.text(String(line), margin, y, { width: textWidth, align: alignForDoc as 'left' | 'center' | 'right' });
      y += lineGap * 0.85;
    }

    y += lineGap * 0.5;
    doc.moveTo(margin, y).lineTo(widthPt - margin, y).dash(3, { space: 2 }).strokeColor('#333333').stroke().undash();
    y += lineGap * 0.6;

    doc.font(pdfBoldFont(font)).text(
      isQuotation ? quotationLabels!.thermalTitle : slugInvoiceType(invoice.type).toUpperCase(),
      margin,
      y,
      { width: textWidth }
    );
    y += lineGap * 0.9;
    doc.font(font).text(invoice.invoiceNumber, margin, y, { width: textWidth });
    y += lineGap * 0.9;
    const issueDate = formatBusinessDate(invoice.issueDate as string | null);
    const dueDate = formatBusinessDate(invoice.dueDate as string | null);
    doc.text(
      isQuotation
        ? quotationLabels!.thermalIssueDueLine(issueDate, dueDate)
        : `Issue: ${issueDate} | Due: ${dueDate}`,
      margin,
      y,
      { width: textWidth }
    );
    y += lineGap * 0.9;
    doc.text(`Status: ${invoice.status}`, margin, y, { width: textWidth });
    y += lineGap * 0.9;
    if (invoice.contactId != null) {
      doc.text(`To: ${contactName}`, margin, y, { width: textWidth });
      y += lineGap * 0.9;
    }
    if (invoice.supplierId != null) {
      doc.text(`Supplier: ${supplierName}`, margin, y, { width: textWidth });
      y += lineGap * 0.9;
    }

    y += lineGap * 0.4;
    doc.moveTo(margin, y).lineTo(widthPt - margin, y).strokeColor('#333333').stroke();
    y += lineGap * 0.6;

    for (const item of items) {
      const desc =
        item.productId != null && productNames.has(item.productId)
          ? productNames.get(item.productId)!
          : item.description?.trim() || '—';
      const lt = lineTotalFromItem(item);
      const qty = num(item.quantity);
      const totalStr = (await resolveMoneyFormat(formatMoneyAmount, lt, currency, false)).replace(/\s/g, ' ');
      const nameLine = `${desc} x${qty}`.slice(0, wch);
      const pad = Math.max(0, wch - nameLine.length - totalStr.length);
      const monoLine = `${nameLine}${' '.repeat(pad)}${totalStr}`;
      if (th.fontFamily === 'mono') {
        doc.font('Courier').fontSize(fs).text(monoLine, margin, y, { width: textWidth });
      } else {
        doc.font(font).fontSize(fs).text(desc, margin, y, { width: textWidth });
        y += lineGap * 0.85;
        const unitPriceStr = await resolveMoneyFormat(formatMoneyAmount, num(item.unitPrice), currency, true);
        const priceLine = `${qty} × ${unitPriceStr}`;
        const discSuffix =
          th.showDiscountLine && lineDiscountApplied(item) > 0
            ? item.discountType === 'fixed_amount'
              ? ` (−${await resolveMoneyFormat(formatMoneyAmount, num(item.discountValue), currency, false)})`
              : ` (−${effectiveLineDiscountPercent(item).toFixed(0)}%)`
            : '';
        doc.text(`${priceLine}${discSuffix}`, margin, y, { width: textWidth * 0.62 });
        doc.text(totalStr, margin + textWidth * 0.62, y, { width: textWidth * 0.38, align: 'right' });
      }
      y += lineGap;
      if (item.description?.trim() && item.productId != null) {
        doc.fontSize(Math.max(fs - 2, 6)).fillColor('#444444').text(item.description!, margin + 4, y, { width: textWidth - 4 });
        doc.fillColor('#111111').fontSize(fs);
        y += lineGap * 0.85;
      }
    }

    y += lineGap * 0.3;
    doc.moveTo(margin, y).lineTo(widthPt - margin, y).strokeColor('#333333').stroke();
    y += lineGap * 0.6;

    const subtotal = num(invoice.subtotal);
    const taxAmt = num(invoice.taxAmount);
    const discAmt = num(invoice.discountAmount);
    const tipAmt = num(invoice.tipAmount);
    const svcAmt = num(invoice.serviceChargeAmount);
    const totalAmt = num(invoice.totalAmount);
    const paidAmt = num(invoice.amountPaid);
    const dueAmt = num(invoice.amountDue);

    const row = async (label: string, val: string, bold = false) => {
      doc.font(bold ? pdfBoldFont(font) : font).fontSize(fs);
      doc.text(label, margin, y);
      doc.text(val, margin, y, { width: textWidth, align: 'right' });
      y += lineGap * 0.9;
    };

    await row('Subtotal', await resolveMoneyFormat(formatMoneyAmount, subtotal, currency, false));
    if (th.showDiscountLine && discAmt > 0) {
      await row('Discount', `−${await resolveMoneyFormat(formatMoneyAmount, discAmt, currency, false)}`);
    }
    if (th.showTaxLine) await row('Tax', await resolveMoneyFormat(formatMoneyAmount, taxAmt, currency, false));
    if (svcAmt > 0) await row('Service', await resolveMoneyFormat(formatMoneyAmount, svcAmt, currency, false));
    if (tipAmt > 0) await row('Tip', await resolveMoneyFormat(formatMoneyAmount, tipAmt, currency, false));
    await row(
      isQuotation ? quotationLabels!.thermalTotal : 'TOTAL',
      await resolveMoneyFormat(formatMoneyAmount, totalAmt, currency, false),
      true
    );
    if (!isQuotation) {
      await row('Paid', await resolveMoneyFormat(formatMoneyAmount, paidAmt, currency, false));
      await row('Due', await resolveMoneyFormat(formatMoneyAmount, dueAmt, currency, false));
    }

    if (!isQuotation && payments.length > 0) {
      y += lineGap * 0.4;
      doc.font(pdfBoldFont(font)).text('Payments', margin, y);
      y += lineGap * 0.85;
      doc.font(font).fontSize(Math.max(fs - 1, 7));
      for (const p of payments) {
        const pm = slugPaymentMethod(p.paymentMethod);
        doc.text(
          `${await resolveMoneyFormat(formatMoneyAmount, num(p.amount), currency, false)} ${pm ? `(${pm})` : ''} ${p.paymentDate ? formatBusinessDate(p.paymentDate) : ''}`.trim(),
          margin,
          y,
          { width: textWidth }
        );
        y += lineGap * 0.85;
      }
    }

    if (th.showQrCode) {
      const qrData = `${invoice.invoiceNumber}|${totalAmt}|${currency}`;
      try {
        const buf = await QRCode.toBuffer(qrData, { type: 'png', width: 96 });
        doc.image(buf, (widthPt - 96) / 2, y, { width: 96, height: 96 });
        y += 104;
      } catch {
        /* skip */
      }
    }

    if (th.footerNote?.trim()) {
      doc.font(font).fontSize(Math.max(fs - 1, 7)).text(th.footerNote, margin, y, {
        width: textWidth,
        align: 'center',
      });
      y += lineGap * 1.2;
    }
    if (f.thankYouNote?.trim()) {
      doc.text(f.thankYouNote, margin, y, { width: textWidth, align: 'center' });
    }
  });
}

export async function generateInvoicePdf(
  invoiceId: number,
  companyId: number,
  templateType: InvoicePdfTemplateType = 'a4',
  options?: { language?: string; baseUrl?: string }
): Promise<GenerateInvoicePdfResult> {
  const invoice = await storage.getInvoice(invoiceId);
  if (!invoice || invoice.companyId !== companyId) {
    throw new Error('Invoice not found');
  }

  let language = options?.language?.trim();
  if (!language && invoice.createdBy != null) {
    const creator = await storage.getUser(invoice.createdBy);
    language = creator?.languagePreference?.trim();
  }
  if (!language && invoice.salesOrderId != null) {
    const order = await storage.getSalesOrder(invoice.salesOrderId);
    if (order?.createdBy != null) {
      const orderCreator = await storage.getUser(order.createdBy);
      language = orderCreator?.languagePreference?.trim();
    }
  }
  language = language || 'en';

  const currencyRow = await storage.getCurrencyByCode(companyId, (invoice.currency ?? 'USD').trim());
  const currencyMeta = currencyRow
    ? {
        name: currencyRow.name,
        symbol: currencyRow.symbol,
        decimalPlaces: currencyRow.decimalPlaces,
      }
    : undefined;

  const [items, payments, templateMeta, eInvoice] = await Promise.all([
    storage.getInvoiceItems(invoiceId),
    storage.getInvoicePayments(invoiceId),
    getInvoiceTemplateSettingsWithMeta(companyId),
    db.select().from(electronicInvoices).where(eq(electronicInvoices.invoiceId, invoiceId)).limit(1).then(rows => rows[0]),
  ]);
  const { settings, templateSettingsUpdatedAt } = templateMeta;

  const company = await storage.getCompany(companyId);
  const companyName = company?.name?.trim() || '';

  let contactName = '—';
  if (invoice.contactId != null) {
    const c = await storage.getContact(invoice.contactId);
    contactName = c?.name?.trim() || '—';
  }
  let supplierName = '—';
  if (invoice.supplierId != null) {
    const s = await storage.getSupplier(invoice.supplierId);
    supplierName = s?.name?.trim() || '—';
  }

  const productIds = [...new Set(items.map((i) => i.productId).filter((id): id is number => id != null))];
  const productNames = new Map<number, string>();
  await Promise.all(
    productIds.map(async (pid) => {
      const p = await storage.getProduct(pid);
      if (p?.name) productNames.set(pid, p.name);
    })
  );

  const baseUrl = options?.baseUrl || process.env.BASE_URL || 'http://localhost:9000';
  const paymentOptionLines = await buildInvoicePaymentOptionLines(invoice, baseUrl);

  const safeNum = safeFileSegment(invoice.invoiceNumber);
  const langSeg = safeFileSegment(language);
  const dir = path.join(process.cwd(), 'uploads', 'erp', 'invoices', String(companyId));
  const fileBase =
    templateType === 'a4'
      ? `invoice-${safeNum}-${templateType}-${A4_INVOICE_PDF_RENDERER_CACHE_REVISION}-${langSeg}.pdf`
      : `invoice-${safeNum}-${templateType}-${langSeg}.pdf`;
  const absolutePath = path.join(dir, fileBase);
  const pdfUrl = `/uploads/erp/invoices/${companyId}/${fileBase}`;

  const contentThresholdMs = invoicePdfCacheContentThresholdMs(
    invoice.updatedAt,
    templateSettingsUpdatedAt,
    currencyRow?.updatedAt
  );
  const eInvoiceUpdated = eInvoice?.updatedAt ? new Date(eInvoice.updatedAt).getTime() : 0;
  if (await fs.pathExists(absolutePath)) {
    const st = await fs.stat(absolutePath);
    if (st.mtimeMs >= contentThresholdMs - 500 && st.mtimeMs >= eInvoiceUpdated - 500) {
      if (templateType === 'a4' && invoice.pdfUrl !== pdfUrl) {
        await storage.updateInvoicePdfUrlOnly(invoice.id, pdfUrl);
      }
      return { pdfUrl, absolutePath, fileName: fileBase, templateType };
    }
  }

  if (templateType === 'a4') {
    await renderA4Pdf({
      invoice,
      items,
      payments,
      paymentOptionLines,
      settings,
      contactName,
      supplierName,
      companyName,
      productNames,
      absolutePath,
      language,
      currencyMeta,
      electronicInvoice: eInvoice,
    });
  } else {
    await renderThermalPdf({
      invoice,
      items,
      payments,
      settings,
      contactName,
      supplierName,
      companyName,
      productNames,
      absolutePath,
    });
  }

  if (templateType === 'a4' && invoice.pdfUrl !== pdfUrl) {
    await storage.updateInvoicePdfUrlOnly(invoice.id, pdfUrl);
  }

  return { pdfUrl, absolutePath, fileName: fileBase, templateType };
}

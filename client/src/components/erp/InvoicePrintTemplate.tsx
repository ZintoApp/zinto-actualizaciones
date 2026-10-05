import type { CSSProperties } from 'react';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import type { InvoiceTemplateSettings } from '@/lib/erp-invoice-template-defaults';
import { formatAmountInWords } from '@shared/erp-invoice-amount-in-words';

export type InvoicePrintInvoice = {
  invoiceNumber: string;
  type: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  tipAmount: string | null;
  serviceChargeAmount: string | null;
  serviceChargeRate: string | null;
  totalAmount: string;
  amountPaid: string;
  amountDue: string;
  currency: string | null;
  notes: string | null;
  termsAndConditions: string | null;
  discountType?: string | null;
  discountValue?: string | null;
  contactId: number | null;
  supplierId: number | null;
  splitBillSeatLabel?: string | null;
  splitBillGroupId?: string | null;
};

export type InvoicePrintItem = {
  productId: number | null;
  description: string | null;
  quantity: string;
  unitPrice: string;
  discountType?: string | null;
  discountValue?: string | null;
  discountPercent: string | null;
  taxRate: string | null;
  lineTotal: string;
};

export type InvoicePrintPayment = {
  amount: string;
  paymentDate: string | null;
  paymentMethod: string | null;
  referenceNumber: string | null;
};

export type InvoicePrintTranslate = (
  key: string,
  fallback?: string,
  variables?: Record<string, unknown>
) => string;

export type InvoicePrintTemplateProps = {
  templateType: 'a4' | 'thermal';
  settings: InvoiceTemplateSettings;
  invoice: InvoicePrintInvoice;
  items: InvoicePrintItem[];
  payments: InvoicePrintPayment[];
  contactName: string;
  supplierName: string;
  companyName: string;
  language: string;
  currencyMeta?: { name?: string | null; symbol?: string | null; decimalPlaces?: number | null };
  productNameById?: Map<number, string>;
  t: InvoicePrintTranslate;
  documentKind?: 'invoice' | 'quotation';
};

function formatBusinessDate(value: string | null): string {
  if (!value) return '—';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString();
}

function num(v: string | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Percentage mode: discountValue is authoritative when non-zero; legacy rows with 0 value and non-zero percent use percent. */
function effectiveLineDiscountPercent(item: InvoicePrintItem): number {
  const dv = num(item.discountValue);
  const dpc = num(item.discountPercent);
  return dv !== 0 ? dv : dpc;
}

function lineDiscountApplied(item: InvoicePrintItem): number {
  const qty = num(item.quantity);
  const price = num(item.unitPrice);
  const base = qty * price;
  const dtype = item.discountType ?? 'percentage';
  if (dtype === 'fixed_amount') {
    return Math.min(Math.max(0, num(item.discountValue)), base);
  }
  const pct = effectiveLineDiscountPercent(item);
  const raw = base * (pct / 100);
  return Math.min(Math.max(0, raw), base);
}

function lineTotalFromItem(item: InvoicePrintItem): number {
  const qty = num(item.quantity);
  const price = num(item.unitPrice);
  const base = qty * price;
  return base - lineDiscountApplied(item);
}

function fontStack(family: 'sans' | 'serif' | 'mono'): string {
  switch (family) {
    case 'serif':
      return 'Georgia, "Times New Roman", serif';
    case 'mono':
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    default:
      return 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  }
}

function slugWordsLabel(slug: string): string {
  return slug.replace(/_/g, ' ');
}

function translatedInvoiceType(tPrint: InvoicePrintTranslate, type: string): string {
  return tPrint(`erp.invoicePrint.invoiceType.${type}`, slugWordsLabel(type));
}

function translatedInvoiceStatus(tPrint: InvoicePrintTranslate, status: string): string {
  return tPrint(`erp.invoicePrint.status.${status}`, slugWordsLabel(status));
}

function paymentMethodDisplay(tPrint: InvoicePrintTranslate, method: string | null | undefined): string {
  if (!method?.trim()) return '';
  const key = `erp.invoices.paymentMethod.${method}`;
  return tPrint(key, slugWordsLabel(method));
}

function thermalLineHeight(spacing: 'tight' | 'normal' | 'loose'): number {
  switch (spacing) {
    case 'tight':
      return 1.2;
    case 'loose':
      return 1.65;
    default:
      return 1.4;
  }
}

function wrapLine(input: string, width: number): string[] {
  const s = input.trim();
  if (!s) return [''];
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length <= width) {
      cur = next;
    } else {
      if (cur) lines.push(cur);
      cur = w.length > width ? w.slice(0, width) : w;
      while (cur.length >= width && width > 10) {
        lines.push(cur.slice(0, width));
        cur = cur.slice(width);
      }
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function InvoicePrintTemplate({
  templateType,
  settings,
  invoice,
  items,
  payments,
  contactName,
  supplierName,
  companyName,
  language,
  currencyMeta,
  productNameById,
  t,
  documentKind = 'invoice',
}: InvoicePrintTemplateProps) {
  const isQuotation = documentKind === 'quotation';
  const currency = (invoice.currency ?? 'USD').toUpperCase();
  const h = settings.header;
  const f = settings.footer;
  const a4 = settings.a4;
  const th = settings.thermal;

  const displayName =
    h.businessName?.trim() ||
    companyName ||
    t('erp.invoicePrint.placeholder.dash', '—');

  const addressLines = [
    h.addressLine1,
    h.addressLine2,
    [h.city, h.country].filter(Boolean).join(', ') || null,
  ].filter((x) => x && String(x).trim());

  const subtotal = num(invoice.subtotal);
  const taxAmt = num(invoice.taxAmount);
  const discAmt = num(invoice.discountAmount);
  const tipAmt = num(invoice.tipAmount);
  const svcAmt = num(invoice.serviceChargeAmount);
  const totalAmt = num(invoice.totalAmount);
  const paidAmt = num(invoice.amountPaid);
  const dueAmt = num(invoice.amountDue);

  const pageSizeCss =
    templateType === 'a4'
      ? `${a4.paperSize === 'letter' ? 'letter' : 'A4'}`
      : `${th.paperWidthMm}mm auto`;

  const pageMarginCss = templateType === 'a4' ? `${a4.marginMm}mm` : '0';

  const itemPrimaryLabel = (item: InvoicePrintItem): string => {
    if (item.productId != null) {
      const name = productNameById?.get(item.productId);
      if (name) return name;
    }
    return item.description?.trim() || t('erp.invoicePrint.placeholder.dash', '—');
  };

  if (templateType === 'thermal') {
    const fs = th.fontSizePt;
    const lh = thermalLineHeight(th.lineSpacing);
    const mono = th.fontFamily === 'mono';
    const font = fontStack(th.fontFamily);
    const wch = th.charsPerLine;
    const align: CSSProperties['textAlign'] = th.headerAlign;
    const qrData = `${invoice.invoiceNumber}|${totalAmt}|${currency}`;

    return (
      <div className="invoice-print-inner" style={{ fontFamily: font, fontSize: `${fs}pt`, lineHeight: lh, color: '#111' }}>
        <style>{`
          @page { size: ${pageSizeCss}; margin: ${pageMarginCss}; }
        `}</style>
        <div style={{ textAlign: align, marginBottom: '0.5em' }}>
          {th.showLogo && h.logoUrl ? (
            <img
              src={resolveMediaUrl(h.logoUrl)}
              alt=""
              style={{ maxWidth: `${Math.min(th.paperWidthMm - 8, 48)}mm`, maxHeight: '14mm', objectFit: 'contain' }}
            />
          ) : null}
          <div style={{ fontWeight: 700, marginTop: th.showLogo && h.logoUrl ? '0.35em' : 0 }}>{displayName}</div>
          {addressLines.map((line, i) => (
            <div key={i} style={{ fontSize: `${Math.max(fs - 1, 7)}pt`, opacity: 0.9 }}>
              {line}
            </div>
          ))}
          {[h.phone, h.email, h.website, h.taxId ? t('erp.invoicePrint.header.taxIdLine', 'Tax ID: {{id}}', { id: h.taxId }) : null]
            .filter(Boolean)
            .map((line, i) => (
              <div key={`c-${i}`} style={{ fontSize: `${Math.max(fs - 1, 7)}pt` }}>
                {line}
              </div>
            ))}
        </div>
        <div style={{ borderTop: '1px dashed #333', borderBottom: '1px dashed #333', padding: '0.4em 0', margin: '0.4em 0' }}>
          <div style={{ fontWeight: 700 }}>
            {isQuotation ? t('erp.invoicePrint.quotationTitleUpper', 'QUOTATION') : translatedInvoiceType(t, invoice.type).toUpperCase()}
          </div>
          <div>{invoice.invoiceNumber}</div>
          <div>
            {isQuotation
              ? t('erp.invoicePrint.thermal.issueValidUntilLine', 'Issue: {{issue}} | Valid until: {{due}}', {
                  issue: formatBusinessDate(invoice.issueDate),
                  due: formatBusinessDate(invoice.dueDate),
                })
              : t('erp.invoicePrint.thermal.issueDueLine', 'Issue: {{issue}} | Due: {{due}}', {
                  issue: formatBusinessDate(invoice.issueDate),
                  due: formatBusinessDate(invoice.dueDate),
                })}
          </div>
          <div>
            {t('erp.invoicePrint.statusLine', 'Status: {{status}}', {
              status: translatedInvoiceStatus(t, invoice.status),
            })}
          </div>
          {invoice.contactId != null && (
            <div>
              {t('erp.invoicePrint.billToLine', 'To: {{name}}', { name: contactName })}
            </div>
          )}
          {invoice.supplierId != null && (
            <div>
              {t('erp.invoicePrint.supplierLine', 'Supplier: {{name}}', { name: supplierName })}
            </div>
          )}
        </div>
        <div style={{ marginBottom: '0.5em' }}>
          {items.map((item, idx) => {
            const desc = itemPrimaryLabel(item);
            const lt = lineTotalFromItem(item);
            const qty = num(item.quantity);
            const nameLine = `${desc} x${qty}`.slice(0, wch);
            const totalStr = formatMoney(lt, currency).replace(/\s/g, ' ');
            const pad = Math.max(0, wch - nameLine.length - totalStr.length);
            const lineStr = mono ? `${nameLine}${' '.repeat(pad)}${totalStr}` : `${desc} x${qty}  ${totalStr}`;
            return (
              <div key={item.productId ?? idx} style={{ marginBottom: '0.15em' }}>
                {mono
                  ? wrapLine(lineStr, wch).map((L, li) => (
                      <div key={li} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {L}
                      </div>
                    ))
                  : (
                      <>
                        <div>{desc}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>
                            {qty} {t('erp.invoicePrint.times', '×')} {num(item.unitPrice).toFixed(2)}
                            {th.showDiscountLine && lineDiscountApplied(item) > 0
                              ? item.discountType === 'fixed_amount'
                                ? ` (−${formatMoney(num(item.discountValue), currency)})`
                                : ` (−${effectiveLineDiscountPercent(item).toFixed(0)}%)`
                              : ''}
                          </span>
                          <span>{formatMoney(lt, currency)}</span>
                        </div>
                      </>
                    )}
                {item.description?.trim() && item.productId != null ? (
                  <div style={{ fontSize: `${Math.max(fs - 2, 6)}pt`, opacity: 0.85, paddingLeft: '0.5em' }}>
                    {item.description}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div style={{ borderTop: '1px solid #333', paddingTop: '0.35em' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{t('erp.invoicePrint.subtotal', 'Subtotal')}</span>
            <span>{formatMoney(subtotal, currency)}</span>
          </div>
          {th.showDiscountLine && discAmt > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('erp.invoicePrint.discount', 'Discount')}</span>
              <span>-{formatMoney(discAmt, currency)}</span>
            </div>
          ) : null}
          {th.showTaxLine ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('erp.common.tax', 'Tax')}</span>
              <span>{formatMoney(taxAmt, currency)}</span>
            </div>
          ) : null}
          {svcAmt > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>
                {invoice.serviceChargeRate
                  ? t('erp.invoicePrint.serviceChargeShort', 'Service ({{rate}}%)', {
                      rate: String(invoice.serviceChargeRate),
                    })
                  : t('erp.invoicePrint.serviceShort', 'Service')}
              </span>
              <span>{formatMoney(svcAmt, currency)}</span>
            </div>
          ) : null}
          {tipAmt > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('erp.invoicePrint.tip', 'Tip')}</span>
              <span>{formatMoney(tipAmt, currency)}</span>
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
            <span>
              {isQuotation ? t('erp.invoicePrint.quotationTotalUpper', 'QUOTATION TOTAL') : t('erp.invoicePrint.totalUpper', 'TOTAL')}
            </span>
            <span>{formatMoney(totalAmt, currency)}</span>
          </div>
          {!isQuotation ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('erp.common.paid', 'Paid')}</span>
                <span>{formatMoney(paidAmt, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{t('erp.common.due', 'Due')}</span>
                <span>{formatMoney(dueAmt, currency)}</span>
              </div>
            </>
          ) : null}
        </div>
        {!isQuotation && payments.length > 0 ? (
          <div style={{ marginTop: '0.5em', fontSize: `${Math.max(fs - 1, 7)}pt` }}>
            <div style={{ fontWeight: 600 }}>{t('erp.invoicePrint.paymentsHeading', 'Payments')}</div>
            {payments.map((p, i) => (
              <div key={i}>
                {formatMoney(num(p.amount), currency)}{' '}
                {p.paymentMethod ? `(${paymentMethodDisplay(t, p.paymentMethod)})` : ''}{' '}
                {p.paymentDate ? formatBusinessDate(p.paymentDate) : ''}
              </div>
            ))}
          </div>
        ) : null}
        {th.showQrCode ? (
          <div style={{ textAlign: 'center', marginTop: '0.5em' }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=${encodeURIComponent(qrData)}`}
              alt=""
              width={96}
              height={96}
            />
          </div>
        ) : null}
        {th.footerNote?.trim() ? (
          <div style={{ textAlign: 'center', marginTop: '0.6em', fontSize: `${Math.max(fs - 1, 7)}pt` }}>
            {th.footerNote}
          </div>
        ) : null}
        {f.thankYouNote?.trim() ? (
          <div style={{ textAlign: 'center', marginTop: '0.4em', fontSize: `${Math.max(fs - 1, 7)}pt` }}>
            {f.thankYouNote}
          </div>
        ) : null}
      </div>
    );
  }

  // A4 layout
  const accent = a4.accentColor;
  const baseFont = fontStack(a4.fontFamily);
  const fz = a4.fontSizePt;

  return (
    <div
      className="invoice-print-inner"
      style={{
        fontFamily: baseFont,
        fontSize: `${fz}pt`,
        color: '#111',
        position: 'relative',
        boxSizing: 'border-box',
      }}
    >
      <style>{`
        @page { size: ${pageSizeCss}; margin: ${pageMarginCss}; }
      `}</style>
      {a4.watermarkText?.trim() ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              fontSize: '48pt',
              fontWeight: 700,
              color: 'rgba(0,0,0,0.06)',
              transform: 'rotate(-35deg)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {a4.watermarkText}
          </div>
        </div>
      ) : null}
      {a4.showHeader ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `2px solid ${accent}`, paddingBottom: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            {a4.showLogo && h.logoUrl ? (
              <img
                src={resolveMediaUrl(h.logoUrl)}
                alt=""
                style={{ width: '56px', height: '56px', objectFit: 'contain' }}
              />
            ) : null}
            <div>
              <div style={{ fontSize: `${fz + 4}pt`, fontWeight: 700, color: accent }}>{displayName}</div>
              {addressLines.map((line, i) => (
                <div key={i} style={{ fontSize: `${fz}pt`, color: '#444' }}>
                  {line}
                </div>
              ))}
              <div style={{ fontSize: `${fz - 1}pt`, color: '#555', marginTop: '4px' }}>
                {[h.phone, h.email, h.website].filter(Boolean).join(' · ')}
              </div>
              {h.taxId?.trim() ? (
                <div style={{ fontSize: `${fz - 1}pt`, marginTop: '2px' }}>
                  {t('erp.invoicePrint.header.taxIdLine', 'Tax ID: {{id}}', { id: h.taxId })}
                </div>
              ) : null}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: `${fz}pt` }}>
            <div style={{ fontWeight: 700, fontSize: `${fz + 2}pt` }}>
              {isQuotation ? t('erp.invoicePrint.quotationTitle', 'Quotation') : t('erp.invoicePrint.invoiceTitle', 'Invoice')}
            </div>
            <div>
              <strong>#</strong> {invoice.invoiceNumber}
            </div>
            <div className="capitalize">{translatedInvoiceType(t, invoice.type)}</div>
            <div>
              {t('erp.invoicePrint.statusLine', 'Status: {{status}}', {
                status: translatedInvoiceStatus(t, invoice.status),
              })}
            </div>
            <div>
              {t('erp.invoicePrint.issueColon', 'Issue:')} {formatBusinessDate(invoice.issueDate)}
            </div>
            <div>
              {isQuotation ? t('erp.invoicePrint.validUntilColon', 'Valid until:') : t('erp.invoicePrint.dueColon', 'Due:')}{' '}
              {formatBusinessDate(invoice.dueDate)}
            </div>
            {invoice.contactId != null && (
              <div style={{ marginTop: '6px' }}>
                <strong>{t('erp.invoicePrint.billTo', 'Bill to:')}</strong> {contactName}
              </div>
            )}
            {invoice.supplierId != null && (
              <div style={{ marginTop: '6px' }}>
                <strong>{t('erp.invoicePrint.supplier', 'Supplier:')}</strong> {supplierName}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: 'right', marginBottom: '12px', fontSize: `${fz}pt` }}>
          <div style={{ fontWeight: 700 }}>#{invoice.invoiceNumber}</div>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: `${fz}pt` }}>
        <thead>
          <tr style={{ background: `${accent}18`, borderBottom: `1px solid ${accent}` }}>
            {(a4.showItemDescription
              ? [t('erp.invoicePrint.col.description', 'Description')]
              : [t('erp.invoicePrint.col.item', 'Item')]
            ).map((col) => (
              <th key={col} style={{ textAlign: 'left', padding: '6px 8px' }}>
                {col}
              </th>
            ))}
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('erp.common.quantityShort', 'Qty')}</th>
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('erp.invoicePrint.col.unit', 'Unit')}</th>
            {a4.showDiscountColumn ? (
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('erp.invoicePrint.col.disc', 'Discount')}</th>
            ) : null}
            {a4.showTaxColumn ? (
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('erp.invoicePrint.col.taxPct', 'Tax %')}</th>
            ) : null}
            <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('erp.invoicePrint.col.lineTotal', 'Total')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>
                {itemPrimaryLabel(item)}
                {a4.showItemDescription && item.description?.trim() && item.productId != null ? (
                  <div style={{ fontSize: `${fz - 1}pt`, color: '#666', marginTop: '2px' }}>{item.description}</div>
                ) : null}
              </td>
              <td style={{ textAlign: 'right', padding: '6px 8px', verticalAlign: 'top' }}>{item.quantity}</td>
              <td style={{ textAlign: 'right', padding: '6px 8px', verticalAlign: 'top' }}>{num(item.unitPrice).toFixed(2)}</td>
              {a4.showDiscountColumn ? (
                <td style={{ textAlign: 'right', padding: '6px 8px', verticalAlign: 'top' }}>
                  {item.discountType === 'fixed_amount'
                    ? formatMoney(num(item.discountValue), currency)
                    : `${effectiveLineDiscountPercent(item).toFixed(2)}%`}
                </td>
              ) : null}
              {a4.showTaxColumn ? (
                <td style={{ textAlign: 'right', padding: '6px 8px', verticalAlign: 'top' }}>
                  {num(item.taxRate).toFixed(2)}
                </td>
              ) : null}
              <td style={{ textAlign: 'right', padding: '6px 8px', verticalAlign: 'top' }}>
                {lineTotalFromItem(item).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <div style={{ width: '280px', fontSize: `${fz}pt` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>{t('erp.invoicePrint.subtotal', 'Subtotal')}</span>
            <span>{formatMoney(subtotal, currency)}</span>
          </div>
          {discAmt > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>{t('erp.invoicePrint.discount', 'Discount')}</span>
              <span>{formatMoney(discAmt, currency)}</span>
            </div>
          ) : null}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>{t('erp.common.tax', 'Tax')}</span>
            <span>{formatMoney(taxAmt, currency)}</span>
          </div>
          {svcAmt > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>
                {invoice.serviceChargeRate
                  ? t('erp.invoicePrint.serviceCharge', 'Service charge ({{rate}}%)', {
                      rate: String(invoice.serviceChargeRate),
                    })
                  : t('erp.invoicePrint.serviceChargeBare', 'Service charge')}
              </span>
              <span>{formatMoney(svcAmt, currency)}</span>
            </div>
          ) : null}
          {tipAmt > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>{t('erp.invoicePrint.tip', 'Tip')}</span>
              <span>{formatMoney(tipAmt, currency)}</span>
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 700,
              fontSize: `${fz + 1}pt`,
              paddingTop: '6px',
              borderTop: `2px solid ${accent}`,
              color: accent,
            }}
          >
            <span>
              {isQuotation ? t('erp.invoicePrint.quotationTotal', 'Quotation total') : t('erp.invoicePrint.grandTotal', 'Total')}
            </span>
            <span>{formatMoney(totalAmt, currency)}</span>
          </div>
          {a4.showAmountInWords ? (
            <div style={{ fontSize: `${fz - 1}pt`, color: '#555', marginTop: '6px', fontStyle: 'italic' }}>
              {formatAmountInWords({
                amount: totalAmt,
                currencyCode: currency,
                language,
                currencyName: currencyMeta?.name,
                currencySymbol: currencyMeta?.symbol,
                currencyDecimalPlaces: currencyMeta?.decimalPlaces,
                formatNumericFallback: ({ amount: amt, currencyCode: cur, decimalPlaces: dp }) =>
                  t('erp.invoicePrint.amountWords.fallback', '{{amount}} {{currency}}', {
                    amount: amt.toFixed(dp),
                    currency: cur,
                  }),
              })}
            </div>
          ) : null}
          {!isQuotation ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                <span>{t('erp.common.paid', 'Paid')}</span>
                <span>{formatMoney(paidAmt, currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                <span>{t('erp.invoicePrint.amountDue', 'Amount due')}</span>
                <span>{formatMoney(dueAmt, currency)}</span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {!isQuotation && a4.showPaymentsTable && payments.length > 0 ? (
        <div style={{ marginBottom: '16px', fontSize: `${fz}pt` }}>
          <div style={{ fontWeight: 700, marginBottom: '6px', color: accent }}>{t('erp.invoicePrint.paymentsHeading', 'Payments')}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('erp.invoicePrint.payCol.date', 'Date')}</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('erp.invoicePrint.payCol.method', 'Method')}</th>
                <th style={{ textAlign: 'left', padding: '6px 8px' }}>{t('erp.invoicePrint.payCol.reference', 'Reference')}</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>{t('erp.invoicePrint.payCol.amount', 'Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '6px 8px' }}>{formatBusinessDate(p.paymentDate)}</td>
                  <td style={{ padding: '6px 8px' }}>{paymentMethodDisplay(t, p.paymentMethod) || t('erp.invoicePrint.placeholder.dash', '—')}</td>
                  <td style={{ padding: '6px 8px' }}>{p.referenceNumber ?? t('erp.invoicePrint.placeholder.dash', '—')}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{formatMoney(num(p.amount), currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {a4.showFooter ? (
        <div style={{ borderTop: '1px solid #ddd', paddingTop: '12px', fontSize: `${fz - 1}pt`, color: '#444' }}>
          {f.thankYouNote?.trim() ? <div style={{ marginBottom: '8px' }}>{f.thankYouNote}</div> : null}
          {f.terms?.trim() ? (
            <div style={{ marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
              <strong>{t('erp.invoicePrint.footer.termsHeading', 'Terms')}</strong>
              <br />
              {f.terms}
            </div>
          ) : null}
          {f.additionalInfo?.trim() ? (
            <div style={{ marginBottom: '8px', whiteSpace: 'pre-wrap' }}>{f.additionalInfo}</div>
          ) : null}
          {invoice.notes?.trim() ? (
            <div style={{ marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
              <strong>{t('erp.common.notes', 'Notes')}</strong>
              <br />
              {invoice.notes}
            </div>
          ) : null}
          {invoice.termsAndConditions?.trim() && !f.terms?.trim() ? (
            <div style={{ whiteSpace: 'pre-wrap' }}>
              <strong>{t('erp.invoicePrint.termsInvoice', 'Terms (invoice)')}</strong>
              <br />
              {invoice.termsAndConditions}
            </div>
          ) : null}
          {a4.showSignatureLine ? (
            <div style={{ marginTop: '24px', maxWidth: '240px' }}>
              <div style={{ borderBottom: '1px solid #333', height: '1px', marginBottom: '4px' }} />
              <div>{t('erp.invoicePrint.authorizedSignature', 'Authorized signature')}</div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

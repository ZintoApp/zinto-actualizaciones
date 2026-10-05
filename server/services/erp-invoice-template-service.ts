import { z } from 'zod';
import { storage } from '../storage';

export const ERP_INVOICE_TEMPLATE_SETTINGS_KEY = 'erp_invoice_template_settings';

export type InvoiceTemplateType = 'a4' | 'thermal';

const nullableString = z.union([z.string(), z.null()]).optional();

export type InvoiceTemplateSettings = {
  defaultTemplateType: InvoiceTemplateType;
  header: {
    businessName?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    taxId?: string | null;
    logoUrl?: string | null;
  };
  footer: {
    thankYouNote?: string | null;
    terms?: string | null;
    additionalInfo?: string | null;
  };
  a4: {
    paperSize: 'a4' | 'letter';
    accentColor: string;
    fontFamily: 'sans' | 'serif' | 'mono';
    fontSizePt: number;
    marginMm: number;
    showLogo: boolean;
    showHeader: boolean;
    showFooter: boolean;
    showTaxColumn: boolean;
    showDiscountColumn: boolean;
    showItemDescription: boolean;
    showPaymentsTable: boolean;
    showPaymentOptions: boolean;
    showAmountInWords: boolean;
    showSignatureLine: boolean;
    watermarkText?: string | null;
  };
  thermal: {
    paperWidthMm: 58 | 80;
    fontSizePt: number;
    fontFamily: 'mono' | 'sans';
    showLogo: boolean;
    headerAlign: 'left' | 'center' | 'right';
    lineSpacing: 'tight' | 'normal' | 'loose';
    showTaxLine: boolean;
    showDiscountLine: boolean;
    showQrCode: boolean;
    footerNote?: string | null;
    charsPerLine: number;
  };
};

export const DEFAULT_INVOICE_TEMPLATE_SETTINGS: InvoiceTemplateSettings = {
  defaultTemplateType: 'a4',
  header: {
    businessName: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    country: null,
    phone: null,
    email: null,
    website: null,
    taxId: null,
    logoUrl: null,
  },
  footer: {
    thankYouNote: 'Thank you for your business.',
    terms: null,
    additionalInfo: null,
  },
  a4: {
    paperSize: 'a4',
    accentColor: '#2563eb',
    fontFamily: 'sans',
    fontSizePt: 10,
    marginMm: 12,
    showLogo: true,
    showHeader: true,
    showFooter: true,
    showTaxColumn: true,
    showDiscountColumn: true,
    showItemDescription: true,
    showPaymentsTable: true,
    showPaymentOptions: true,
    showAmountInWords: false,
    showSignatureLine: false,
    watermarkText: null,
  },
  thermal: {
    paperWidthMm: 80,
    fontSizePt: 11,
    fontFamily: 'mono',
    showLogo: true,
    headerAlign: 'center',
    lineSpacing: 'normal',
    showTaxLine: true,
    showDiscountLine: true,
    showQrCode: false,
    footerNote: null,
    charsPerLine: 42,
  },
};

const headerSchema = z
  .object({
    businessName: nullableString,
    addressLine1: nullableString,
    addressLine2: nullableString,
    city: nullableString,
    country: nullableString,
    phone: nullableString,
    email: nullableString,
    website: nullableString,
    taxId: nullableString,
    logoUrl: nullableString,
  })
  .strict();

const footerSchema = z
  .object({
    thankYouNote: nullableString,
    terms: nullableString,
    additionalInfo: nullableString,
  })
  .strict();

const a4Schema = z
  .object({
    paperSize: z.enum(['a4', 'letter']),
    accentColor: z.string(),
    fontFamily: z.enum(['sans', 'serif', 'mono']),
    fontSizePt: z.number().finite(),
    marginMm: z.number().finite(),
    showLogo: z.boolean(),
    showHeader: z.boolean(),
    showFooter: z.boolean(),
    showTaxColumn: z.boolean(),
    showDiscountColumn: z.boolean(),
    showItemDescription: z.boolean(),
    showPaymentsTable: z.boolean(),
    showPaymentOptions: z.boolean().optional().default(true),
    showAmountInWords: z.boolean(),
    showSignatureLine: z.boolean(),
    watermarkText: nullableString,
  })
  .strict();

const thermalSchema = z
  .object({
    paperWidthMm: z.union([z.literal(58), z.literal(80)]),
    fontSizePt: z.number().finite(),
    fontFamily: z.enum(['mono', 'sans']),
    showLogo: z.boolean(),
    headerAlign: z.enum(['left', 'center', 'right']),
    lineSpacing: z.enum(['tight', 'normal', 'loose']),
    showTaxLine: z.boolean(),
    showDiscountLine: z.boolean(),
    showQrCode: z.boolean(),
    footerNote: nullableString,
    charsPerLine: z.number().finite().int().positive(),
  })
  .strict();

export const invoiceTemplateSettingsSchema = z
  .object({
    defaultTemplateType: z.enum(['a4', 'thermal']),
    header: headerSchema,
    footer: footerSchema,
    a4: a4Schema,
    thermal: thermalSchema,
  })
  .strict();

function cloneDefaults(): InvoiceTemplateSettings {
  return JSON.parse(JSON.stringify(DEFAULT_INVOICE_TEMPLATE_SETTINGS)) as InvoiceTemplateSettings;
}

function mergeHeader(
  base: InvoiceTemplateSettings['header'],
  partial: unknown
): InvoiceTemplateSettings['header'] {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return { ...base };
  const p = partial as Record<string, unknown>;
  const out = { ...base };
  for (const k of [
    'businessName',
    'addressLine1',
    'addressLine2',
    'city',
    'country',
    'phone',
    'email',
    'website',
    'taxId',
    'logoUrl',
  ] as const) {
    if (k in p) {
      const v = p[k];
      out[k] = v === null || typeof v === 'string' ? (v as string | null) : out[k];
    }
  }
  return out;
}

function mergeFooter(
  base: InvoiceTemplateSettings['footer'],
  partial: unknown
): InvoiceTemplateSettings['footer'] {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return { ...base };
  const p = partial as Record<string, unknown>;
  const out = { ...base };
  for (const k of ['thankYouNote', 'terms', 'additionalInfo'] as const) {
    if (k in p) {
      const v = p[k];
      out[k] = v === null || typeof v === 'string' ? (v as string | null) : out[k];
    }
  }
  return out;
}

function mergeA4(base: InvoiceTemplateSettings['a4'], partial: unknown): InvoiceTemplateSettings['a4'] {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return { ...base };
  const p = partial as Record<string, unknown>;
  const out = { ...base };
  if (p.paperSize === 'a4' || p.paperSize === 'letter') out.paperSize = p.paperSize;
  if (typeof p.accentColor === 'string') out.accentColor = p.accentColor;
  if (p.fontFamily === 'sans' || p.fontFamily === 'serif' || p.fontFamily === 'mono') out.fontFamily = p.fontFamily;
  if (typeof p.fontSizePt === 'number' && Number.isFinite(p.fontSizePt)) out.fontSizePt = p.fontSizePt;
  if (typeof p.marginMm === 'number' && Number.isFinite(p.marginMm)) out.marginMm = p.marginMm;
  for (const k of [
    'showLogo',
    'showHeader',
    'showFooter',
    'showTaxColumn',
    'showDiscountColumn',
    'showItemDescription',
    'showPaymentsTable',
    'showPaymentOptions',
    'showAmountInWords',
    'showSignatureLine',
  ] as const) {
    if (typeof p[k] === 'boolean') out[k] = p[k];
  }
  if ('watermarkText' in p) {
    const v = p.watermarkText;
    out.watermarkText = v === null || typeof v === 'string' ? v : out.watermarkText;
  }
  return out;
}

function mergeThermal(
  base: InvoiceTemplateSettings['thermal'],
  partial: unknown
): InvoiceTemplateSettings['thermal'] {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return { ...base };
  const p = partial as Record<string, unknown>;
  const out = { ...base };
  if (p.paperWidthMm === 58 || p.paperWidthMm === 80) out.paperWidthMm = p.paperWidthMm;
  if (typeof p.fontSizePt === 'number' && Number.isFinite(p.fontSizePt)) out.fontSizePt = p.fontSizePt;
  if (p.fontFamily === 'mono' || p.fontFamily === 'sans') out.fontFamily = p.fontFamily;
  for (const k of ['showLogo', 'showTaxLine', 'showDiscountLine', 'showQrCode'] as const) {
    if (typeof p[k] === 'boolean') out[k] = p[k];
  }
  if (p.headerAlign === 'left' || p.headerAlign === 'center' || p.headerAlign === 'right') {
    out.headerAlign = p.headerAlign;
  }
  if (p.lineSpacing === 'tight' || p.lineSpacing === 'normal' || p.lineSpacing === 'loose') {
    out.lineSpacing = p.lineSpacing;
  }
  if ('footerNote' in p) {
    const v = p.footerNote;
    out.footerNote = v === null || typeof v === 'string' ? v : out.footerNote;
  }
  if (typeof p.charsPerLine === 'number' && Number.isFinite(p.charsPerLine) && p.charsPerLine > 0) {
    out.charsPerLine = Math.round(p.charsPerLine);
  }
  return out;
}

function mergeFromPartial(raw: Record<string, unknown>): InvoiceTemplateSettings {
  const merged = cloneDefaults();
  if (raw.defaultTemplateType === 'a4' || raw.defaultTemplateType === 'thermal') {
    merged.defaultTemplateType = raw.defaultTemplateType;
  }
  merged.header = mergeHeader(merged.header, raw.header);
  merged.footer = mergeFooter(merged.footer, raw.footer);
  merged.a4 = mergeA4(merged.a4, raw.a4);
  merged.thermal = mergeThermal(merged.thermal, raw.thermal);
  return merged;
}

export function parseInvoiceTemplateSettings(value: unknown): InvoiceTemplateSettings {
  let raw: unknown = value;
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value) as unknown;
    } catch {
      return cloneDefaults();
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return cloneDefaults();
  }
  const merged = mergeFromPartial(raw as Record<string, unknown>);
  const parsed = invoiceTemplateSettingsSchema.safeParse(merged);
  if (!parsed.success) {
    return cloneDefaults();
  }
  return {
    ...parsed.data,
    a4: {
      ...parsed.data.a4,
      showPaymentOptions: parsed.data.a4.showPaymentOptions ?? true,
    },
  };
}

export type InvoiceTemplateSettingsWithMeta = {
  settings: InvoiceTemplateSettings;
  /** Row `updated_at` for `erp_invoice_template_settings`, or null when no row exists (defaults only). */
  templateSettingsUpdatedAt: Date | null;
};

export async function getInvoiceTemplateSettingsWithMeta(companyId: number): Promise<InvoiceTemplateSettingsWithMeta> {
  const row = await storage.getCompanySetting(companyId, ERP_INVOICE_TEMPLATE_SETTINGS_KEY);
  return {
    settings: parseInvoiceTemplateSettings(row?.value),
    templateSettingsUpdatedAt: row?.updatedAt ?? null,
  };
}

export async function getInvoiceTemplateSettings(companyId: number): Promise<InvoiceTemplateSettings> {
  const { settings } = await getInvoiceTemplateSettingsWithMeta(companyId);
  return settings;
}

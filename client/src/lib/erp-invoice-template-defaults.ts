/** Mirrors server DEFAULT_INVOICE_TEMPLATE_SETTINGS — keep in sync when changing shape. */

export type InvoiceTemplateType = 'a4' | 'thermal';

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

export const INVOICE_TEMPLATE_DEFAULTS: InvoiceTemplateSettings = {
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

import type { Company, Contact, Invoice, InvoiceItem, Product } from '../../../../shared/schema';
import type { FactusSettingsInput } from '../../../../shared/factus';

export class ElectronicInvoicingUserError extends Error {
  constructor(
    public readonly translationKey: string,
    fallback: string,
    public readonly variables?: Record<string, unknown>,
  ) {
    super(fallback);
  }
}

export interface ElectronicInvoiceContext {
  companyId: number;
  company: Company;
  settings: FactusSettingsInput;
}

export interface ElectronicInvoiceSubmission {
  invoice: Invoice;
  items: Array<InvoiceItem & { product?: Product | null }>;
  customer: Contact;
  referenceCode: string;
}

export interface ElectronicInvoiceResult {
  success: boolean;
  status: 'validated' | 'rejected' | 'failed' | 'pending';
  documentNumber?: string;
  cufe?: string;
  publicUrl?: string;
  xmlUrl?: string;
  qrCodeText?: string;
  validatedAt?: Date;
  metadata?: Record<string, unknown>;
  errors?: string[];
}

export interface FactusNumberingRange {
  id: number;
  document: string;
  prefix?: string;
  from?: number;
  to?: number;
  current?: number;
  isActive: boolean;
}

export interface IElectronicInvoiceProvider {
  getProviderName(): string;
  validateConfiguration(context: ElectronicInvoiceContext): Promise<void>;
  listNumberingRanges(context: ElectronicInvoiceContext): Promise<FactusNumberingRange[]>;
  emitInvoice(context: ElectronicInvoiceContext, data: ElectronicInvoiceSubmission): Promise<ElectronicInvoiceResult>;
}

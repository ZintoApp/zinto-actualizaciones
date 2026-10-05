import { and, sql, type SQL } from 'drizzle-orm';
import { contacts, invoices } from '../shared/schema';
import { contactAccessCondition, type ContactAccessOptions } from './contact-access';
import type { ContactViewScope } from '../shared/contact-access';

export type InvoiceAccessMode = 'view' | 'manage' | 'payment';
export type InvoiceAccessContext = {
  companyId: number;
  userId: number;
  contactScope: ContactViewScope | null;
  permissions: Record<string, boolean>;
};

const sourceFeatures: Record<string, string> = {
  rent: 'rent_collection', security_deposit: 'rent_collection',
  reservation_deposit: 'reservations', installment: 'payment_plans', expense: 'expenses',
};

/** Unknown source types stay private until their domain access policy is defined. */
export function invoiceSourceAllowed(sourceType: string, context: InvoiceAccessContext, mode: InvoiceAccessMode): boolean {
  const feature = sourceFeatures[sourceType], p = context.permissions;
  if (!feature || !p.view_real_estate_financials) return false;
  if (mode === 'view') return !!(p[`view_real_estate_${feature}`] || p[`manage_real_estate_${feature}`]);
  return !!p[`manage_real_estate_${feature}`] && (mode !== 'payment' || !!p.record_real_estate_payments);
}

/** Identical SQL policy for counts, pagination and individual invoice authorization. */
export function invoiceAccessCondition(context: InvoiceAccessContext, mode: InvoiceAccessMode = 'view'): SQL {
  const options: ContactAccessOptions = {companyId: context.companyId, userId: context.userId, contactScope: context.contactScope ?? undefined};
  const visibleContact = context.contactScope
    ? sql`EXISTS (SELECT 1 FROM ${contacts} WHERE ${contacts.id} = ${invoices.contactId} AND ${contactAccessCondition(options)})`
    : sql`false`;
  const types = Object.keys(sourceFeatures).filter(type => invoiceSourceAllowed(type, context, mode));
  const kinds = ['property', 'unit'].filter(kind => {
    const feature = kind === 'unit' ? 'units' : 'properties', p = context.permissions;
    return p[`view_real_estate_${feature}`] || p[`manage_real_estate_${feature}`];
  });
  const allowedTypes = types.length ? sql.join(types.map(type => sql`${type}`), sql`,`) : sql`NULL`;
  const allowedKinds = kinds.length ? sql.join(kinds.map(kind => sql`${kind}`), sql`,`) : sql`NULL`;
  return and(
    sql`${invoices.companyId} = ${context.companyId}`,
    sql`(${invoices.contactId} IS NULL OR ${visibleContact})`,
    // Parent notes inherit source access, even if opened directly through the ERP editor.
    sql`NOT EXISTS (
      SELECT 1 FROM real_estate_invoice_sources source
      WHERE source.company_id = ${context.companyId}
        AND (source.invoice_id = ${invoices.id} OR source.invoice_id = ${invoices.parentInvoiceId})
        AND (source.source_type NOT IN (${allowedTypes}) OR ${types.length === 0}
          OR (source.source_type <> 'expense' AND ${invoices.contactId} IS NULL)
          OR (source.source_type = 'expense' AND NOT EXISTS (
            SELECT 1 FROM real_estate_assets asset
            WHERE asset.company_id = source.company_id AND asset.id = source.asset_id
              AND asset.kind IN (${allowedKinds})
          )))
    )`,
    sql`(${invoices.parentInvoiceId} IS NULL OR EXISTS (
      SELECT 1 FROM invoices parent WHERE parent.id = ${invoices.parentInvoiceId}
        AND parent.company_id = ${context.companyId}
        AND (parent.contact_id IS NULL OR parent.contact_id = ${invoices.contactId})
    ))`,
  )!;
}

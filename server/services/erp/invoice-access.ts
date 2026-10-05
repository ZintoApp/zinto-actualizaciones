import type { Request } from 'express';
import { and, eq } from 'drizzle-orm';
import { invoices } from '../../../shared/schema';
import { resolveContactViewScope } from '../../../shared/contact-access';
import { db } from '../../db';
import { getUserPermissions } from '../../middleware';
import { storage } from '../../storage';
import { invoiceAccessCondition, type InvoiceAccessMode, type InvoiceAccessContext } from '../../erp-invoice-access';

export async function resolveInvoiceAccess(req: Request): Promise<InvoiceAccessContext> {
  const permissions = await getUserPermissions(req.user!);
  return {companyId: req.user!.companyId!, userId: req.user!.id,
    contactScope: resolveContactViewScope(permissions, req.user?.isSuperAdmin === true), permissions};
}

export async function loadAccessibleInvoice(req: Request, id: number, mode: InvoiceAccessMode = 'view') {
  if (!req.user?.companyId || !Number.isSafeInteger(id) || id <= 0) return undefined;
  const context = await resolveInvoiceAccess(req);
  const result = await db.select({id: invoices.id}).from(invoices)
    .where(and(eq(invoices.id, id), invoiceAccessCondition(context, mode))).limit(1);
  return result.length ? storage.getInvoice(id) : undefined;
}

export async function invoiceContactAllowed(req: Request, contactId: number | null | undefined): Promise<boolean> {
  if (contactId == null) return true;
  const context = await resolveInvoiceAccess(req);
  return !!context.contactScope && (await storage.getAccessibleContactIds([contactId], {
    companyId: context.companyId, userId: context.userId, contactScope: context.contactScope,
  })).includes(contactId);
}


/** Enumerate using the same policy as ERP invoice counts/details, not a domain copy. */
export async function accessibleInvoiceIds(req:Request,mode:InvoiceAccessMode = 'view'):Promise<number[]>{
 const context=await resolveInvoiceAccess(req);
 if(!context.permissions.view_invoices&&!context.permissions.manage_invoices&&!(mode==='payment'&&context.permissions.record_payments))return [];
 return (await db.select({id:invoices.id}).from(invoices).where(invoiceAccessCondition(context,mode))).map(row=>row.id);
}

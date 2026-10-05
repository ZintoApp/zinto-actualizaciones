import type {Request} from 'express';
import {accessibleInvoiceIds} from './invoice-access';
import {ErpValidationError} from '../../storage';

/** A financial decision needs all retained invoices, issued notes and posted
 * allocation endpoints. Reuse ERP visibility instead of dropping hidden funds. */
export async function requireRealEstateInvoiceEvidence(req:Request,client:{query:(text:string,args:any[])=>Promise<any>},companyId:number,invoiceIds:number[]){
 if(!invoiceIds.length)return;
 const visible=new Set(await accessibleInvoiceIds(req));
 const result=await client.query(`WITH RECURSIVE evidence(id) AS (
  SELECT unnest($2::int[])
  UNION
  SELECT edge.target_id FROM evidence prior JOIN (
   SELECT i.id source_id,i.parent_invoice_id target_id FROM invoices i
    WHERE i.company_id=$1 AND i.parent_invoice_id IS NOT NULL
   UNION SELECT n.parent_invoice_id,n.id FROM invoices n WHERE n.company_id=$1
    AND n.parent_invoice_id IS NOT NULL AND n.type IN('credit_note','debit_note')
    AND n.status IN('sent','overdue','partially_paid','paid')
   UNION SELECT a.target_invoice_id,a.credit_note_id FROM erp_credit_note_allocations a
    WHERE a.company_id=$1 AND a.status='posted'
   UNION SELECT a.credit_note_id,a.target_invoice_id FROM erp_credit_note_allocations a
    WHERE a.company_id=$1 AND a.status='posted'
  ) edge ON edge.source_id=prior.id
 ) SELECT id FROM evidence`,[companyId,invoiceIds]);
 if(invoiceIds.some(id=>!visible.has(id))||result.rows.some((row:{id:number})=>!visible.has(row.id)))throw new ErpValidationError('Linked invoice evidence not found','not_found');
}

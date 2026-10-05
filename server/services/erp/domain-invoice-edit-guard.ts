import {getPool} from '../../db';
import {ErpConflictError} from '../../storage';

/** Issued domain obligations retain the terms used by their posting journal. */
export async function assertDomainInvoiceTermsEditable(invoice:{id:number;companyId:number;status:string}, lookup?:()=>Promise<boolean>){
 if(invoice.status==='draft')return;
 const exists=lookup?await lookup():!!(await getPool().query('SELECT 1 FROM real_estate_invoice_sources s WHERE s.company_id=$1 AND (s.invoice_id=$2 OR EXISTS(SELECT 1 FROM invoices n WHERE n.company_id=s.company_id AND n.id=$2 AND n.parent_invoice_id=s.invoice_id)) LIMIT 1',[invoice.companyId,invoice.id])).rowCount;
 if(exists)throw new ErpConflictError('Issued Real Estate invoice terms are fixed. Use the existing ERP credit or debit note workflow for corrections.');
}

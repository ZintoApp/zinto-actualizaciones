import {Router} from 'express';
import {z} from 'zod';
import {requireAnyPermission} from '../../middleware';
import {storage,getErpErrorResponse} from '../../storage';
import {loadAccessibleInvoice} from '../../services/erp/invoice-access';
import {db} from '../../db';
import {sql} from 'drizzle-orm';
const router=Router(),ERP_INVOICE_READ_PERMISSIONS=['view_invoices','manage_invoices','record_payments'],ERP_PAYMENT_PERMISSIONS=['manage_invoices','record_payments'];
function handleRouteError(res:any,error:any,_label:string){const mapped=getErpErrorResponse(error);return res.status(error instanceof z.ZodError?400:mapped?.status??500).json({success:false,error:error instanceof z.ZodError?'Invalid refund request':mapped?.message??'Unexpected server error'});}
async function refundInvoiceAccess(req:any,res:any,invoiceId=Number(req.params.id),requireCredit=true){
  const invoice=await loadAccessibleInvoice(req,invoiceId,req.method==='POST'?'payment':'view');
  if(!invoice||(requireCredit?invoice.type!=='credit_note':invoice.type!=='sales_invoice'))return null;
  return invoice;
}
router.get('/:id/refunds',requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS),async(req,res)=>{
  try{const invoice=await refundInvoiceAccess(req,res);if(!invoice)return res.status(404).json({success:false,error:'Credit note not found'});return res.json({success:true,data:await storage.getCreditNoteRefunds(invoice.companyId,invoice.id)});}catch(e){return handleRouteError(res,e,'Credit note refunds');}
});

router.get('/:id/allocations',requireAnyPermission(ERP_INVOICE_READ_PERMISSIONS),async(req,res)=>{
 try{const invoice=await refundInvoiceAccess(req,res);if(!invoice)return res.status(404).json({success:false,error:'Credit note not found'});
   // Target access is revalidated before exposing linked invoice details.
   const rows=await storage.getCreditNoteAllocations(invoice.companyId,invoice.id),visible=[];
   for(const row of rows)if(await refundInvoiceAccess(req,res,Number(row.target_invoice_id),false))visible.push(row);
   return res.json({success:true,data:visible});
 }catch(e){return handleRouteError(res,e,'Credit allocations');}
});
router.get('/:id/allocation-context',requireAnyPermission(ERP_PAYMENT_PERMISSIONS),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res)=>{
 try{const invoice=await refundInvoiceAccess(req,res);if(!invoice)return res.status(404).json({success:false,error:'Credit note not found'});
   const candidates=await db.execute(sql`SELECT id,invoice_number,amount_due,currency FROM invoices WHERE company_id=${invoice.companyId} AND contact_id=${invoice.contactId} AND currency=${invoice.currency} AND type='sales_invoice' AND parent_invoice_id IS NULL AND id<>${invoice.parentInvoiceId??0} AND status IN('sent','overdue','partially_paid') AND amount_due>0 ORDER BY due_date,id LIMIT 200`),visible=[];
   for(const row of candidates.rows)if(await refundInvoiceAccess(req,res,Number(row.id),false))visible.push(row);
   return res.json({success:true,data:visible});
 }catch(e){return handleRouteError(res,e,'Allocation targets');}
});
router.post('/:id/allocations',requireAnyPermission(ERP_PAYMENT_PERMISSIONS),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res)=>{
 try{const invoice=await refundInvoiceAccess(req,res);if(!invoice)return res.status(404).json({success:false,error:'Credit note not found'});
   const v=z.object({amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/),targetInvoiceId:z.number().int().positive(),reference:z.string().trim().min(1).max(250),reason:z.string().trim().min(1).max(1000),confirmed:z.literal(true)}).strict().parse(req.body);
   if(!await refundInvoiceAccess(req,res,v.targetInvoiceId,false))return res.status(404).json({success:false,error:'Target invoice not found'});
   return res.json({success:true,data:await storage.allocateCreditNote(invoice.companyId,req.user!.id,invoice.id,v.targetInvoiceId,v.amount,v.reference,v.reason)});
 }catch(e){return handleRouteError(res,e,'Credit allocation');}
});
router.post('/:id/allocations/:allocationId/reverse',requireAnyPermission(ERP_PAYMENT_PERMISSIONS),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res)=>{
 try{const invoice=await refundInvoiceAccess(req,res);if(!invoice)return res.status(404).json({success:false,error:'Credit note not found'});
   z.object({confirmed:z.literal(true)}).strict().parse(req.body);const id=z.coerce.number().int().positive().parse(req.params.allocationId),row=(await storage.getCreditNoteAllocations(invoice.companyId,invoice.id)).find((a:any)=>Number(a.id)===id);
   if(!row||!await refundInvoiceAccess(req,res,Number(row.target_invoice_id),false))return res.status(404).json({success:false,error:'Allocation not found'});
   return res.json({success:true,data:await storage.reverseCreditNoteAllocation(invoice.companyId,req.user!.id,invoice.id,id)});
 }catch(e){return handleRouteError(res,e,'Credit allocation reversal');}
});
router.get('/:id/refund-context',requireAnyPermission(ERP_PAYMENT_PERMISSIONS),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res)=>{
  try{const invoice=await refundInvoiceAccess(req,res);if(!invoice)return res.status(404).json({success:false,error:'Credit note not found'});const accounts=(await storage.getChartOfAccounts(invoice.companyId)).filter(a=>a.type==='asset'&&a.isActive&&a.accountCode!=='1100');return res.json({success:true,data:accounts.map(a=>({id:a.id,name:a.name}))});}catch(e){return handleRouteError(res,e,'Refund accounts');}
});
router.post('/:id/refunds',requireAnyPermission(ERP_PAYMENT_PERMISSIONS),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res)=>{
  try{const invoice=await refundInvoiceAccess(req,res);if(!invoice)return res.status(404).json({success:false,error:'Credit note not found'});
    const v=z.object({amount:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/),cashAccountId:z.number().int().positive(),reference:z.string().trim().min(1).max(250),reason:z.string().trim().min(1).max(1000),fundsPaid:z.literal(true)}).strict().parse(req.body);
    return res.json({success:true,data:await storage.refundCreditNote(invoice.companyId,req.user!.id,invoice.id,v.amount,v.cashAccountId,v.reference,v.reason)});
  }catch(e){return handleRouteError(res,e,'Credit note refund');}
});
router.post('/:id/refunds/:refundId/reverse',requireAnyPermission(ERP_PAYMENT_PERMISSIONS),requireAnyPermission(['manage_accounting','post_journal_entries']),async(req,res)=>{
  try{const invoice=await refundInvoiceAccess(req,res);if(!invoice)return res.status(404).json({success:false,error:'Credit note not found'});
    z.object({fundsReturned:z.literal(true)}).strict().parse(req.body);const refundId=z.coerce.number().int().positive().parse(req.params.refundId);
    return res.json({success:true,data:await storage.reverseCreditNoteRefund(invoice.companyId,req.user!.id,invoice.id,refundId)});
  }catch(e){return handleRouteError(res,e,'Credit note refund reversal');}
});

export default router;

/** Verify completed ERP credit/refund resolution without rewriting receipt history. */
export async function isInvoiceFinanciallyResolved(client:{query:(query:string,args:any[])=>Promise<any>},companyId:number,invoiceId:number,allowPendingCredit=false):Promise<boolean>{
 await client.query('SELECT id FROM invoices WHERE company_id=$1 AND id=$2 FOR UPDATE',[companyId,invoiceId]);
 const result=await client.query(`SELECT i.*,
   COALESCE((SELECT sum(CASE WHEN n.type='credit_note' THEN n.total_amount ELSE -n.total_amount END) FROM invoices n WHERE n.company_id=i.company_id AND n.parent_invoice_id=i.id AND n.type IN('credit_note','debit_note') AND n.status IN('sent','overdue','partially_paid','paid')),0) credits,
   COALESCE((SELECT sum(p.amount) FROM invoice_payments p WHERE p.company_id=i.company_id AND p.invoice_id=i.id),0) receipts,
   COALESCE((SELECT sum(r.amount) FROM erp_credit_note_refunds r JOIN invoices n ON n.id=r.credit_note_id AND n.company_id=r.company_id WHERE r.company_id=i.company_id AND n.parent_invoice_id=i.id AND r.status='posted'),0) refunds,
   COALESCE((SELECT sum(a.amount) FROM erp_credit_note_allocations a JOIN invoices n ON n.id=a.credit_note_id AND n.company_id=a.company_id WHERE a.company_id=i.company_id AND n.parent_invoice_id=i.id AND a.status='posted'),0) allocations,
   NOT EXISTS(SELECT 1 FROM journal_entries j WHERE j.company_id=i.company_id AND j.reference_type='invoice' AND j.reference_id=i.id AND j.status='posted') unposted_invoice,
   EXISTS(SELECT 1 FROM erp_credit_note_allocations a JOIN invoices n ON n.id=a.credit_note_id AND n.company_id=a.company_id WHERE a.company_id=i.company_id AND n.parent_invoice_id=i.id AND a.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries j WHERE j.id=a.journal_entry_id AND j.company_id=a.company_id AND j.status='posted')) unposted_allocations,
   EXISTS(SELECT 1 FROM invoices n WHERE n.company_id=i.company_id AND n.parent_invoice_id=i.id AND n.status IN('sent','overdue','partially_paid','paid') AND NOT EXISTS(SELECT 1 FROM journal_entries j WHERE j.company_id=n.company_id AND j.reference_type='invoice' AND j.reference_id=n.id AND j.status='posted')) unposted_notes,
   EXISTS(SELECT 1 FROM invoice_payments p WHERE p.company_id=i.company_id AND p.invoice_id=i.id AND NOT EXISTS(SELECT 1 FROM journal_entries j WHERE j.company_id=p.company_id AND j.reference_type IN('payment','invoice_payment') AND j.reference_id=p.id AND j.status='posted')) unposted_receipts,
   EXISTS(SELECT 1 FROM erp_credit_note_refunds r JOIN invoices n ON n.id=r.credit_note_id AND n.company_id=r.company_id WHERE r.company_id=i.company_id AND n.parent_invoice_id=i.id AND r.status='posted' AND NOT EXISTS(SELECT 1 FROM journal_entries j WHERE j.id=r.journal_entry_id AND j.company_id=r.company_id AND j.status='posted')) unposted_refunds
   FROM invoices i WHERE i.company_id=$1 AND i.id=$2`,[companyId,invoiceId]);
 const i=result.rows[0];if(!i)return false;
 if(['cancelled','void'].includes(i.status))return Number(i.amount_paid)===0&&Number(i.receipts)===0&&Number(i.refunds)===0;
 const disposed=Number(i.refunds)+Number(i.allocations??0);
 return i.type==='sales_invoice'&&i.status!=='draft'&&Number(i.credits)===Number(i.total_amount)&&Number(i.receipts)===Number(i.amount_paid)&&(allowPendingCredit?disposed<=Number(i.receipts):disposed===Number(i.receipts))&&!i.unposted_invoice&&!i.unposted_notes&&!i.unposted_receipts&&!i.unposted_refunds&&!i.unposted_allocations;
}

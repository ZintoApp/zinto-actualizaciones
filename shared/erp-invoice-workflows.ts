/** Issuing adjustments and recording cash payments are distinct ERP workflows. */
export function invoiceSupportsWorkflow(type:string,action:'send'|'payment'):boolean {
 return action==='send'?['sales_invoice','purchase_invoice','credit_note','debit_note'].includes(type):['sales_invoice','purchase_invoice'].includes(type);
}

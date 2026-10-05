import type {ErpInvoicePostingContext} from './erp-invoice-posting';

export function invoicePostingAccountType(treatment:ErpInvoicePostingContext['treatment']):'asset'|'liability'|'expense'|'revenue'{
 if(['owner_funds','deposit','advance'].includes(treatment))return 'liability';
 if(treatment==='asset')return 'asset';
 return treatment==='expense'?'expense':'revenue';
}

export function invoicePostingTreatmentAllowed(type:string,treatment:ErpInvoicePostingContext['treatment']):boolean{
 return treatment==='asset'?type==='purchase_invoice':true;
}

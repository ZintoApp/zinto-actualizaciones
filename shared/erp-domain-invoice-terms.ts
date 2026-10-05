/** Financial and counterparty terms fixed by a domain obligation at creation. */
export function domainInvoiceTerms(invoice:any,items:any[]){
 const number=(value:unknown)=>Number(value??0).toFixed(6);
 const date=(value:unknown)=>value==null?null:new Date(value as string|Date).toISOString();
 return {
  type:invoice.type,contactId:invoice.contactId??null,supplierId:invoice.supplierId??null,currency:invoice.currency,
  issueDate:date(invoice.issueDate),dueDate:date(invoice.dueDate),
  subtotal:number(invoice.subtotal),taxAmount:number(invoice.taxAmount),totalAmount:number(invoice.totalAmount),
  discountAmount:number(invoice.discountAmount),tipAmount:number(invoice.tipAmount),serviceChargeAmount:number(invoice.serviceChargeAmount),
  items:items.map(item=>({productId:item.productId??null,quantity:number(item.quantity),unitPrice:number(item.unitPrice),lineTotal:number(item.lineTotal),taxRate:number(item.taxRate),taxGroupId:item.taxGroupId??null})),
 };
}

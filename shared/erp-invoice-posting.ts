export type ErpInvoicePostingContext={
  netAccountId:number;
  treatment:'revenue'|'owner_funds'|'deposit'|'advance'|'expense'|'asset';
  description:string;
};
export type ErpAtomicInvoiceOptions={
  recalculateTotalsFromLines:boolean;
  postingContext?:ErpInvoicePostingContext;
  source?:{assetId?:number|null;sourceType:'rent'|'security_deposit'|'reservation_deposit'|'installment'|'service'|'expense'|'asset';sourceId:number;periodKey:string;accountingContext:Record<string,unknown>};
};

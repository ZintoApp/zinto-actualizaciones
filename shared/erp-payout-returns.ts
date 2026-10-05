import {erpMinorUnits,erpMinorUnitsToAmount} from './erp-carrying-amount';
export type PayoutReturn = {journalEntryId:number;returnReference:string;reason:string;amount:string;transactionDecimalPlaces?:number;cashAccountId?:number;recoveredAt:string;actorUserId?:number};
export type ErpPayout = {reference:string;amount:string;cashAccountId:number;journalEntryId:number;transactionDecimalPlaces?:number;baseDecimalPlaces?:number;recovery?:PayoutReturn;recoveries?:PayoutReturn[]};

/** Legacy full returns and subsequent partial returns share one history. */
export function payoutReturns(payout: ErpPayout): PayoutReturn[] {
  return payout.recoveries ?? (payout.recovery ? [payout.recovery] : []);
}
export function payoutReturnBalance(payout: ErpPayout, digits=payout.transactionDecimalPlaces??2): string {
  const returned=payoutReturns(payout).reduce((sum,r)=>sum+erpMinorUnits(r.amount,digits),0n);
  const remaining=erpMinorUnits(payout.amount,digits)-returned;
  if(remaining<0n)throw new Error('Returned payouts exceed the original payout');
  return erpMinorUnitsToAmount(remaining,digits);
}

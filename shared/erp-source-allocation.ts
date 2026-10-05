import {allocateCarryingAmount, erpMinorUnits, erpMinorUnitsToAmount, type ErpCarryingPrecision} from './erp-carrying-amount';
export type SourceAllocationRange={start:string;amount:string};
/** Stable intervals preserve every other asset's base cents when a link is removed. */
export function findErpSourceAllocation(total:string,ranges:SourceAllocationRange[],requested?:string,transactionDigits=2){
 const cents=(v:string)=>erpMinorUnits(v,transactionDigits),money=(v:bigint)=>erpMinorUnitsToAmount(v,transactionDigits);
 const limit=cents(total),sorted=ranges.map(r=>({start:cents(r.start),amount:cents(r.amount)})).sort((a,b)=>a.start<b.start?-1:a.start>b.start?1:0);
 let used=0n,previous=0n;for(const r of sorted){if(r.amount<=0n||r.start<previous||r.start+r.amount>limit)throw new Error('Reconcile overlapping ERP source allocations');previous=r.start+r.amount;used+=r.amount;}
 const amount=requested==null?limit-used:cents(requested);if(amount<=0n||amount>limit-used)throw new Error('This ERP line is already attributed or allocation exceeds its remaining amount');
 let start=0n;for(const r of sorted){if(r.start-start>=amount)return {start:money(start),amount:money(amount)};start=r.start+r.amount;}
 if(limit-start<amount)throw new Error('Select an amount that fits an available ERP source portion');
 return {start:money(start),amount:money(amount)};
}
export function erpSourceAllocationBase(total:string,base:string,range:SourceAllocationRange,precision:ErpCarryingPrecision={transactionDigits:2,baseDigits:2}){
 const cents=(v:string)=>erpMinorUnits(v,precision.transactionDigits),money=(v:bigint)=>erpMinorUnitsToAmount(v,precision.transactionDigits);
 const start=cents(range.start),end=start+cents(range.amount),limit=cents(total);if(end>limit)throw new Error('ERP source allocation exceeds its source');
 const before=start?erpMinorUnits(allocateCarryingAmount(money(start),total,base,precision),precision.baseDigits):0n;
 return erpMinorUnitsToAmount(erpMinorUnits(allocateCarryingAmount(money(end),total,base,precision),precision.baseDigits)-before,precision.baseDigits);
}

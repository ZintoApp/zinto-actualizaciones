import {erpMinorUnits,erpMinorUnitsToAmount} from './erp-carrying-amount';
import {erpCurrencyDigits} from './erp-currency-precision';
/** Allocate revised net owner funds cumulatively across dated posted receipts.
 * Tax is excluded; receipts beyond the revised gross invoice earn no owner funds.
 */
export function ownerFundsAfterNotes(funded:string,net:string,total:string,percentage:string,digits=2){
 erpCurrencyDigits(digits);
 if([funded,net,total].some(v=>!/^\d+(\.\d+)?$/.test(v)))throw new Error('Invalid owner settlement basis');
 if(!/^\d+(\.\d{1,4})?$/.test(percentage))throw new Error('Invalid owner settlement share');
 const share=erpMinorUnits(percentage,4),received=erpMinorUnits(funded,6),n=erpMinorUnits(net,6),t=erpMinorUnits(total,6);
 if(share>1000000n||n>t)throw new Error('Invalid owner settlement share or net basis');
 if(t===0n)return erpMinorUnitsToAmount(0n,digits);
 const eligible=received<t?received:t,denominator=t*1000000n*1000000n,numerator=eligible*n*share*10n**BigInt(digits);
 return erpMinorUnitsToAmount((numerator+denominator/2n)/denominator,digits);
}

/** Exact cumulative allocation independent of monetary precision. */
export function allocateOwnerMinorUnitPortion(before:bigint,portion:bigint,original:bigint,revised:bigint){
 if(before<0n||portion<0n||original<=0n||revised<0n||before+portion>original)throw new Error('Reconcile owner receipt allocations before correction');
 const rounded=(v:bigint)=>(v*revised*2n+original)/(2n*original);
 return rounded(before+portion)-rounded(before);
}

/** Allocate partial snapshots against a receipt using cumulative cents. */
export function allocateOwnerReceiptPortion(before:number,portion:number,original:number,revised:number){
 if(![before,portion,original,revised].every(Number.isSafeInteger)||before<0||portion<0||original<=0||revised<0||before+portion>original)
  throw new Error('Reconcile owner receipt allocations before correction');
 const rounded=(v:number)=>(BigInt(v)*BigInt(revised)*2n+BigInt(original))/(2n*BigInt(original));
 return Number(rounded(before+portion)-rounded(before));
}

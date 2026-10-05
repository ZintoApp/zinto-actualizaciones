import {allocateCarryingAmount,erpMinorUnits,erpMinorUnitsToAmount,type ErpCarryingPrecision} from './erp-carrying-amount';
/** Release reduced payable at retained basis; preserve source dated base independently. */
export function payableCorrectionBasis(openAmount:string,openBase:string,amountDelta:string,sourceBaseDelta:string,precision:ErpCarryingPrecision={transactionDigits:2,baseDigits:2}){
 const signed=(v:string,digits:number)=>{if(!/^-?\d+(\.\d+)?$/.test(v))throw new Error('Invalid payable correction basis');return v.startsWith('-')?-erpMinorUnits(v.slice(1),digits):erpMinorUnits(v,digits);};
 const money=(v:bigint)=>v<0n?'-'+erpMinorUnitsToAmount(-v,precision.baseDigits):erpMinorUnitsToAmount(v,precision.baseDigits);
 const amount=signed(openAmount,precision.transactionDigits),base=signed(openBase,precision.baseDigits),delta=signed(amountDelta,precision.transactionDigits),source=signed(sourceBaseDelta,precision.baseDigits);
 if(amount<0n||base<0n||amount+delta<0n)throw new Error('Reconcile payable carrying balance before correction');
 const payable=delta<0n?-erpMinorUnits(allocateCarryingAmount(erpMinorUnitsToAmount(-delta,precision.transactionDigits),openAmount,openBase,precision),precision.baseDigits):source;
 if(base+payable<0n)throw new Error('Reconcile payable carrying balance before correction');
 return {payableBaseDelta:money(payable),exchangeDifference:money(payable-source)};
}

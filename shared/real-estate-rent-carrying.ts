import {allocateCarryingAmount,erpMinorUnits,erpMinorUnitsToAmount,type ErpCarryingPrecision} from './erp-carrying-amount';
/** Revalue immutable rent portion; unchanged corrections retain current carrying. */
export function revisedRentCarrying(originalAmount:string,originalBase:string,currentAmount:string,currentBase:string,revisedAmount:string,precision:ErpCarryingPrecision={transactionDigits:2,baseDigits:2}){
 const original=erpMinorUnits(originalAmount,precision.transactionDigits),current=erpMinorUnits(currentAmount,precision.transactionDigits),revised=erpMinorUnits(revisedAmount,precision.transactionDigits);
 if(revised===current)return currentBase;
 if(revised>original){if(original===0n)throw new Error('Invalid original rent carrying basis');const base=erpMinorUnits(originalBase,precision.baseDigits),value=(base*revised+original/2n)/original;return erpMinorUnitsToAmount(value,precision.baseDigits);}
 if(revised===0n)return erpMinorUnitsToAmount(0n,precision.baseDigits);
 return allocateCarryingAmount(revisedAmount,originalAmount,originalBase,precision);
}

import {erpMinorUnits,erpMinorUnitsToAmount,type ErpCarryingPrecision} from './erp-carrying-amount';
/** Preserve compatible source basis; reconcile zero or signed deficits using ERP exchange accounts. */
export function settlementPostingBasis(payableAmount:string,sourceBase:string,convertedPayableBase:string,precision:ErpCarryingPrecision={transactionDigits:2,baseDigits:2}){
 const signed=(v:string,digits:number)=>{if(!/^-?\d+(\.\d+)?$/.test(v))throw new Error('Invalid settlement posting basis');return v.startsWith('-')?-erpMinorUnits(v.slice(1),digits):erpMinorUnits(v,digits);};
 const money=(v:bigint)=>v<0n?'-'+erpMinorUnitsToAmount(-v,precision.baseDigits):erpMinorUnitsToAmount(v,precision.baseDigits);
 const amount=signed(payableAmount,precision.transactionDigits),source=signed(sourceBase,precision.baseDigits),converted=signed(convertedPayableBase,precision.baseDigits);
 if(amount<0n||converted<0n)throw new Error('Invalid settlement payable basis');
 const payable=amount===0n?0n:source>=0n?source:converted;
 return {payableBaseAmount:money(payable),exchangeDifference:money(payable-source)};
}

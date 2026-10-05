import {erpMinorUnits,erpMinorUnitsToAmount} from './erp-carrying-amount';
import {erpCurrencyDigits} from './erp-currency-precision';
import {z} from 'zod';
export const realEstateCommissionAgreementSchema=z.object({agentUserId:z.number().int().positive(),assetId:z.number().int().positive(),calculation:z.enum(['percentage','fixed']),value:z.string().regex(/^\d{1,10}(\.\d{1,6})?$/).refine(v=>Number(v)>0),currency:z.string().regex(/^[A-Z]{3}$/),effectiveFrom:z.string().date(),effectiveTo:z.string().date().nullable().optional(),expenseAccountId:z.number().int().positive(),payableAccountId:z.number().int().positive()}).strict().superRefine((v,c)=>{if(v.effectiveTo&&v.effectiveTo<v.effectiveFrom)c.addIssue({code:'custom',path:['effectiveTo'],message:'End date precedes start date'});if(v.calculation==='percentage'&&Number(v.value)>100)c.addIssue({code:'custom',path:['value'],message:'Percentage cannot exceed 100'});});
/** Monetary basis and rates retain six stored places; round only final entitlement. */
function roundedCommission(numerator:bigint,denominator:bigint,digits:number):string{
 erpCurrencyDigits(digits);if(denominator<=0n||numerator<0n)throw new Error('Invalid commission basis');
 const scaled=numerator*10n**BigInt(digits),units=(scaled+denominator/2n)/denominator;
 return erpMinorUnitsToAmount(units,digits);
}
export function commissionForReceipt(calculation:'percentage'|'fixed',value:string,receipt:string,invoiceNet:string,invoiceTotal:string,digits=2){
 const paid=erpMinorUnits(receipt,6),net=erpMinorUnits(invoiceNet,6),total=erpMinorUnits(invoiceTotal,6),rate=erpMinorUnits(value,6);
 if(paid<=0n||total<=0n)throw new Error('Invalid commission basis');
 return roundedCommission(calculation==='percentage'?paid*net*rate:paid*rate,calculation==='percentage'?total*100n*1000000n*1000000n:total*1000000n,digits);
}
/** Cumulative allocation keeps final minor units across mixed funding. */
export function commissionForFunding(calculation:'percentage'|'fixed',value:string,funding:string,invoiceNet:string,invoiceTotal:string,priorFunding:string,priorCommission:string,digits=2){
 const amount=erpMinorUnits(funding,6),prior=erpMinorUnits(priorFunding,6),total=erpMinorUnits(invoiceTotal,6);
 if(amount<=0n||total<=0n||prior+amount>total)throw new Error('Funding exceeds invoice commission basis');
 const cumulative=commissionForReceipt(calculation,value,erpMinorUnitsToAmount(prior+amount,6),invoiceNet,invoiceTotal,digits);
 const increment=erpMinorUnits(cumulative,digits)-erpMinorUnits(priorCommission,digits);
 if(increment<0n)throw new Error('Reconcile prior commission rounding before accrual');
 return erpMinorUnitsToAmount(increment,digits);
}
/** Entitlement after issued ERP notes, allocated cumulatively across funding. */
export function commissionAfterCredits(calculation:'percentage'|'fixed',value:string,funded:string,originalTotal:string,adjustedNet:string,adjustedTotal:string,digits=2){
 if([value,funded,originalTotal,adjustedNet,adjustedTotal].some(v=>!/^\d+(\.\d+)?$/.test(v)))throw new Error('Invalid adjusted commission basis');
 const fund=erpMinorUnits(funded,6),original=erpMinorUnits(originalTotal,6),net=erpMinorUnits(adjustedNet,6),total=erpMinorUnits(adjustedTotal,6),rate=erpMinorUnits(value,6);
 if(original<=0n)throw new Error('Invalid original commission total');if(total===0n)return erpMinorUnitsToAmount(0n,digits);
 const eligible=fund<total?fund:total;
 return roundedCommission(calculation==='percentage'?eligible*net*rate:eligible*rate,calculation==='percentage'?total*100n*1000000n*1000000n:original*1000000n,digits);
}

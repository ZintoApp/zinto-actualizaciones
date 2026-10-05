import {allocateOwnerMinorUnitPortion} from './real-estate-settlement-entitlement';
import {erpMinorUnits,erpMinorUnitsToAmount,type ErpCarryingPrecision} from './erp-carrying-amount';
export type ExpenseRecoveryBasis={accountId:number;amount:string;baseAmount:string};
/** Retain original portions, independent currency precision and signed source base. */
export function allocateExpenseRecovery(originalTotal:string,portions:string[],components:ExpenseRecoveryBasis[],precision:ErpCarryingPrecision={transactionDigits:2,baseDigits:2}){
 const units=(v:string)=>{if(!/^\d+(\.\d+)?$/.test(v))throw new Error('Invalid ERP expense carrying basis');return erpMinorUnits(v,precision.transactionDigits);},baseUnits=(v:string)=>v.startsWith('-')?-erpMinorUnits(v.slice(1),precision.baseDigits):erpMinorUnits(v,precision.baseDigits);
 const money=(v:bigint)=>erpMinorUnitsToAmount(v,precision.transactionDigits),baseMoney=(v:bigint)=>v<0n?'-'+erpMinorUnitsToAmount(-v,precision.baseDigits):erpMinorUnitsToAmount(v,precision.baseDigits);
 const original=units(originalTotal),parts=portions.map(units);
 if(original<=0n||parts.reduce((n,p)=>n+p,0n)>original||new Set(components.map(c=>c.accountId)).size!==components.length)throw new Error('Reconcile owner expense allocations before correction');
 const basis=components.map(c=>({...c,amountUnits:units(c.amount),baseUnits:baseUnits(c.baseAmount)})),total=basis.reduce((n,c)=>n+c.amountUnits,0n);
 let before=0n,revisedBefore=0n;
 return parts.map(part=>{
  const amount=allocateOwnerMinorUnitPortion(before,part,original,total);
  const recoveryComponents=basis.map(c=>({recoveryAccountId:c.accountId,
   amount:money(total?allocateOwnerMinorUnitPortion(revisedBefore,amount,total,c.amountUnits):0n),
   baseAmount:baseMoney((c.baseUnits<0n?-1n:1n)*allocateOwnerMinorUnitPortion(before,part,original,c.baseUnits<0n?-c.baseUnits:c.baseUnits)),
  })).filter(c=>units(c.amount)!==0n||baseUnits(c.baseAmount)!==0n);
  const residual=amount-recoveryComponents.reduce((n,c)=>n+units(c.amount),0n);
  if(residual){const last=[...recoveryComponents].reverse().find(c=>units(c.amount)+residual>=0n);if(!last)throw new Error('Reconcile expense component rounding');last.amount=money(units(last.amount)+residual);}
  before+=part;revisedBefore+=amount;
  return {amount:money(amount),baseAmount:baseMoney(recoveryComponents.reduce((n,c)=>n+baseUnits(c.baseAmount),0n)),recoveryComponents};
 });
}

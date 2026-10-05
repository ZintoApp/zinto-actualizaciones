import {erpMinorUnits,type ErpCarryingPrecision} from './erp-carrying-amount';
import {allocateExpenseRecovery,type ExpenseRecoveryBasis} from './real-estate-expense-reconciliation';
export type ExpensePostingItem={amount:string;originalAmount?:string;baseAmount?:string;recoveryComponents?:Array<{recoveryAccountId:number;amount:string;baseAmount:string}>};
/** Initial posting and note corrections share the immutable original portions.
 * Earlier posted portions must already reflect the current notes before another
 * owner can claim the remainder; signed and zero-charge base components survive.
 */
export function allocateInitialExpenseRecovery(originalTotal:string,components:ExpenseRecoveryBasis[],previous:ExpensePostingItem[],current:ExpensePostingItem[],position=previous.length,precision:ErpCarryingPrecision={transactionDigits:2,baseDigits:2}){
 const cents=(value:string)=>value.startsWith('-')?-erpMinorUnits(value.slice(1),6):erpMinorUnits(value,6);
 if(!Number.isInteger(position)||position<0||position>previous.length)throw new Error('Reconcile expense allocation order');
 const items=[...previous.slice(0,position),...current,...previous.slice(position)],portions=items.map(i=>i.originalAmount??i.amount);
 if(portions.some(v=>cents(v)<=0n))throw new Error('Reconcile original owner expense portions');
 const allocations=allocateExpenseRecovery(originalTotal,portions,components,precision);
 previous.forEach((item,index)=>{
  const expected=allocations[index<position?index:index+current.length];
  if(item.baseAmount==null||!Array.isArray(item.recoveryComponents)||cents(item.amount)!==cents(expected.amount)||cents(item.baseAmount)!==cents(expected.baseAmount))throw new Error('Reconcile prior owner expense allocations before posting');
  const actual=new Map(item.recoveryComponents.map(p=>[p.recoveryAccountId,p]));
  if(actual.size!==item.recoveryComponents.length||actual.size!==expected.recoveryComponents.length||expected.recoveryComponents.some(p=>{const old=actual.get(p.recoveryAccountId);return !old||old.baseAmount==null||cents(old.amount)!==cents(p.amount)||cents(old.baseAmount)!==cents(p.baseAmount);}))throw new Error('Reconcile prior owner expense components before posting');
 });
 return current.map((item,index)=>{
  const allocation=allocations[position+index];
  if(cents(item.amount)!==cents(allocation.amount))throw new Error('Owner expense amounts changed. Prepare the settlement again.');
  return {...allocation,originalAmount:portions[position+index]};
 });
}

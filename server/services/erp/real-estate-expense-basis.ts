import {erpMinorUnits,erpMinorUnitsToAmount} from '../../../shared/erp-carrying-amount';
import {erpCurrencyDigits} from '../../../shared/erp-currency-precision';
import {ErpValidationError} from '../../storage';
import {sql} from 'drizzle-orm';
import {allocateExpenseRecovery} from '../../../shared/real-estate-expense-reconciliation';

/** Purchase expense recovery uses posted debit components, including ERP input tax.
 * The parent invoice lock serializes issuance/voiding of its ERP notes.
 */
export async function loadOwnerExpenseBasis(tx:any,companyId:number,expenseId:number){
 const source=(await tx.execute(sql`SELECT e.id,e.asset_id,e.amount expense_amount,i.id invoice_id,i.currency,i.total_amount,c.net_account_id,
  j.id journal_id,j.base_currency,j.transaction_currency,j.transaction_decimal_places,j.base_decimal_places
  FROM real_estate_expenses e JOIN invoices i ON i.company_id=e.company_id AND i.id=e.invoice_id
  JOIN erp_invoice_posting_contexts c ON c.company_id=i.company_id AND c.invoice_id=i.id
  JOIN journal_entries j ON j.company_id=i.company_id AND j.reference_type='invoice' AND j.reference_id=i.id AND j.status='posted'
  WHERE e.company_id=${companyId} AND e.id=${expenseId} AND e.owner_chargeable=true AND e.status='posted'
   AND i.type='purchase_invoice' AND i.status IN('sent','overdue','partially_paid','paid') FOR UPDATE OF e,i`)).rows;
 if(source.length!==1)throw new ErpValidationError('Reconcile posted owner expense invoice before correction');
 const s=source[0],transactionDigits=erpCurrencyDigits(s.transaction_decimal_places),units=(v:unknown)=>erpMinorUnits(String(v),6),signedUnits=(v:unknown)=>String(v).startsWith('-')?-units(String(v).slice(1)):units(v),money=(v:bigint)=>erpMinorUnitsToAmount(v,6);if(units(s.expense_amount)!==units(s.total_amount))throw new ErpValidationError('Reconcile original expense invoice amount');const notes=(await tx.execute(sql`SELECT n.id,n.type,n.total_amount,n.subtotal,n.currency,j.id journal_id,j.status,j.base_currency,j.transaction_currency,j.base_decimal_places
  FROM invoices n LEFT JOIN journal_entries j ON j.company_id=n.company_id AND j.reference_type='invoice' AND j.reference_id=n.id
  WHERE n.company_id=${companyId} AND n.parent_invoice_id=${s.invoice_id} AND n.status IN('sent','overdue','partially_paid','paid') ORDER BY n.id`)).rows;
 if(s.transaction_currency!==s.currency||notes.some((n:any)=>!['credit_note','debit_note'].includes(n.type)||n.status!=='posted'||n.currency!==s.currency||n.transaction_currency!==s.currency||n.base_currency!==s.base_currency))throw new ErpValidationError('Reconcile posted owner expense credit or debit notes and currencies');
 const baseDigits=Math.max(erpCurrencyDigits(s.base_decimal_places),...notes.map((n:any)=>erpCurrencyDigits(n.base_decimal_places)));
 const precision={transactionDigits,baseDigits};
 const ids=[Number(s.invoice_id),...notes.map((n:any)=>Number(n.id))];
 const postings=(await tx.execute(sql`SELECT j.reference_id,l.account_id,sum(l.debit-l.credit)::text amount,
  sum(l.debit_base-l.credit_base)::text base_amount,bool_and(l.debit_base IS NOT NULL AND l.credit_base IS NOT NULL) complete
  FROM journal_entries j JOIN journal_entry_lines l ON l.journal_entry_id=j.id
  WHERE j.company_id=${companyId} AND j.reference_type='invoice' AND j.reference_id IN(${sql.join(ids.map(id=>sql`${id}`),sql`,`)}) AND j.status='posted'
  GROUP BY j.reference_id,l.account_id ORDER BY l.account_id,j.reference_id`)).rows;
 const original=postings.filter((p:any)=>Number(p.reference_id)===Number(s.invoice_id)&&Number(p.amount)>0);
 if(!original.length||original.some((p:any)=>!p.complete)||original.reduce((n:bigint,p:any)=>n+units(p.amount),0n)!==units(s.total_amount))throw new ErpValidationError('Reconcile owner expense debit component journals');
 const accounts=new Set(original.map((p:any)=>Number(p.account_id)));
 const adjusted=original.map((p:any)=>({accountId:Number(p.account_id),amountCents:units(p.amount),baseCents:signedUnits(p.base_amount)}));
 for(const p of postings.filter((p:any)=>Number(p.reference_id)!==Number(s.invoice_id))){
  if(!p.complete)throw new ErpValidationError('Reconcile missing expense note base values');
  // Purchase notes reverse the same debit component accounts; AP is excluded.
  if(!accounts.has(Number(p.account_id)))continue;
  const c=adjusted.find((c:any)=>c.accountId===Number(p.account_id))!;c.amountCents+=signedUnits(p.amount);c.baseCents+=signedUnits(p.base_amount);
 }
 const expected=units(s.total_amount)+notes.reduce((n:bigint,p:any)=>n+units(p.total_amount)*(p.type==='credit_note'?-1n:1n),0n);
 // Dated ERP notes can leave a signed base component even when its transaction
 // balance is zero. Preserve that actual posting independently of owner payable.
 if(expected<0n||adjusted.some((c:any)=>c.amountCents<0n)||adjusted.reduce((n:bigint,c:any)=>n+c.amountCents,0n)!==expected)throw new ErpValidationError('Reconcile adjusted expense/tax component carrying values');
 const transactionMoney=(v:bigint)=>erpMinorUnitsToAmount(erpMinorUnits(money(v),transactionDigits),transactionDigits),baseMoney=(v:bigint)=>{const negative=v<0n;const text=erpMinorUnitsToAmount(erpMinorUnits(money(negative?-v:v),baseDigits),baseDigits);return negative?'-'+text:text;};
 const originalComponents=original.map((p:any)=>({accountId:Number(p.account_id),amount:transactionMoney(units(p.amount)),baseAmount:baseMoney(signedUnits(p.base_amount))}));
 const components=adjusted.map((c:any)=>({accountId:c.accountId,amount:transactionMoney(c.amountCents),baseAmount:baseMoney(c.baseCents)}));
 return {...s,notes,precision,signature:JSON.stringify(notes.map((n:any)=>[n.id,n.type,n.subtotal,n.total_amount,n.journal_id])),adjustedTotal:erpMinorUnitsToAmount(erpMinorUnits(money(expected),transactionDigits),transactionDigits),components,originalComponents,
  allocateOriginal:(portions:string[])=>allocateExpenseRecovery(String(s.total_amount),portions,originalComponents,precision),
  allocate:(portions:string[])=>allocateExpenseRecovery(String(s.total_amount),portions,components,precision)};
}

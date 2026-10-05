import {useLocation} from 'wouter';
import {useTranslation} from '@/hooks/use-translation';
import {usePermissions} from '@/hooks/usePermissions';
import {Button} from '@/components/ui/button';
export type PlanDepositCredit={id:number;invoice_number:string;currency:string;amount_due:string;status:string};
export function RealEstatePlanCredits({credits}:{credits:PlanDepositCredit[]}){
 const {t,currentLanguage}=useTranslation(),[,navigate]=useLocation(),{hasAnyPermission}=usePermissions();
 if(!credits.length)return null;
 const canOpen=hasAnyPermission(['view_invoices','manage_invoices','record_payments']);
 return <section className="re-panel p-5"><h2 className="font-semibold">{t('erp.realEstate.paymentPlans.depositCredits','Reservation deposit credits')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('erp.realEstate.paymentPlans.depositCreditHelp','Open a deposit credit in ERP to apply its available collected balance to an issued installment.')}</p><div className="mt-4 grid gap-3 md:grid-cols-2">{credits.map(c=><article key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"><div><strong className="text-sm">{c.invoice_number}</strong><p className="mt-1 text-xs text-muted-foreground">{t('erp.realEstate.paymentPlans.creditRemaining','Credit remaining')}: {new Intl.NumberFormat(currentLanguage?.code,{style:'currency',currency:c.currency,minimumFractionDigits:2}).format(Number(c.amount_due))}</p></div>{canOpen&&<Button variant="outline" size="sm" onClick={()=>navigate(`/erp/invoices?detail=${c.id}`)}>{t('erp.realEstate.expenses.invoice','Open ERP invoice')}</Button>}</article>)}</div></section>;
}

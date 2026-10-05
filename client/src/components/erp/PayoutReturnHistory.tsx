import {payoutReturns,type ErpPayout} from '@shared/erp-payout-returns';
import {useTranslation} from '@/hooks/use-translation';
export function PayoutReturnHistory({payout,currency}:{payout:ErpPayout;currency:string}){
 const {t,currentLanguage}=useTranslation();
 return <>{payoutReturns(payout).map(r=><p key={r.journalEntryId} className="mt-2 break-words text-xs text-muted-foreground">{t('erp.realEstate.settlements.recovered','Returned')} · {r.returnReference} · {new Intl.NumberFormat(currentLanguage?.code,{style:'currency',currency,minimumFractionDigits:r.transactionDecimalPlaces??payout.transactionDecimalPlaces??2,maximumFractionDigits:r.transactionDecimalPlaces??payout.transactionDecimalPlaces??2}).format(Number(r.amount))}<br/>{new Intl.DateTimeFormat(currentLanguage?.code,{dateStyle:'medium',timeStyle:'short'}).format(new Date(r.recoveredAt))}<br/>{r.reason}</p>)}</>;
}

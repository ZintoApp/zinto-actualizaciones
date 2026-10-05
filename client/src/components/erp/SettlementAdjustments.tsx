import {useState} from 'react';
import {useMutation,useQueryClient} from '@tanstack/react-query';
import {apiRequest} from '@/lib/queryClient';
import {useTranslation} from '@/hooks/use-translation';
import {useToast} from '@/hooks/use-toast';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {SettlementAdjustment} from '@shared/real-estate-settlement-adjustments';
export function SettlementAdjustments({id,companyId,currency,decimalPlaces=2,items,accounts,editable}:{id:number;companyId:number;currency:string;decimalPlaces?:number;items:SettlementAdjustment[];accounts:Array<{id:number;name:string;type:string}>;editable:boolean}){
 const {t,currentLanguage}=useTranslation(),{toast}=useToast(),cache=useQueryClient();
 const [amount,setAmount]=useState('0'),[account,setAccount]=useState('none'),[reason,setReason]=useState('');
 const label=(key:string,fallback:string)=>t(`erp.realEstate.settlementAdjustments.${key}`,fallback);
 const save=useMutation({mutationFn:async(next:SettlementAdjustment[])=>apiRequest('PATCH',`/api/erp/real-estate/owner-settlements/${id}/adjustments`,{expected:JSON.stringify(items),adjustments:next}),onSuccess:()=>{cache.invalidateQueries({queryKey:['real-estate',companyId]});setAmount('0');setAccount('none');setReason('');toast({title:t('erp.common.saved','Saved')});},onError:(e:Error)=>toast({title:t('common.error','Error'),description:e.message,variant:'destructive'})});
 return <section className="re-panel space-y-4 p-5"><h2 className="font-semibold">{label('title','Approved adjustments')}</h2><p className="text-sm text-muted-foreground">{label('help','Positive amounts credit the owner through an ERP expense account. Negative amounts deduct from the owner through an ERP revenue account. Billable management fees use Catalog and ERP invoices.')}</p>
 {items.map((item,index)=><article key={index} className="flex flex-wrap justify-between gap-3 rounded-lg border p-4 text-sm"><div><p className="break-words">{item.reason}</p><span className="text-xs text-muted-foreground">{accounts.find(a=>a.id===item.accountId)?.name}</span></div><strong>{new Intl.NumberFormat(currentLanguage?.code,{style:'currency',currency,minimumFractionDigits:decimalPlaces,maximumFractionDigits:decimalPlaces}).format(Number(item.amount))}</strong>{editable&&<Button variant="outline" size="sm" disabled={save.isPending} onClick={()=>save.mutate(items.filter((_,i)=>i!==index))}>{label('remove','Remove adjustment')}</Button>}</article>)}
 {editable&&<><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="settlement-adjustment-amount">{label('amount','Adjustment amount')}</Label><Input id="settlement-adjustment-amount" type="number" step="any" value={amount} onChange={e=>{setAmount(e.target.value);setAccount('none');}}/></div><div className="space-y-2"><Label>{label('account','ERP adjustment account')}</Label><Select value={account} onValueChange={setAccount}><SelectTrigger aria-label={label('account','ERP adjustment account')}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{t('erp.common.none','None')}</SelectItem>{accounts.filter(a=>a.type===(Number(amount)>0?'expense':'revenue')).map(a=><SelectItem value={String(a.id)} key={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="settlement-adjustment-reason">{label('reason','Adjustment reason')}</Label><Input id="settlement-adjustment-reason" maxLength={1000} value={reason} onChange={e=>setReason(e.target.value)}/></div></div><Button disabled={save.isPending||!Number(amount)||account==='none'||!reason.trim()} onClick={()=>save.mutate([...items,{amount,accountId:Number(account),reason:reason.trim()}])}>{label('add','Add adjustment')}</Button></>}
 </section>;
}

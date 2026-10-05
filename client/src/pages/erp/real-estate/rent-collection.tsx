import {erpMinorUnits,erpMinorUnitsToAmount} from '@shared/erp-carrying-amount';
import {erpCurrencyDigits} from '@shared/erp-currency-precision';
import {ErpCalendarError} from '@/components/erp/ErpCalendarError';
import {useErpCalendar,useErpCalendarDefault} from '@/hooks/use-erp-calendar';
import {useErpCurrencies} from '@/hooks/use-erp-currencies';
import { useState } from 'react';
import {Link} from 'wouter';

import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';

import { useTranslation } from '@/hooks/use-translation';

import { usePermissions } from '@/hooks/usePermissions';

import { useToast } from '@/hooks/use-toast';

import { apiRequest } from '@/lib/queryClient';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';

import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';

import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter } from '@/components/ui/dialog';

import { Table,TableHeader,TableRow,TableHead,TableBody,TableCell } from '@/components/ui/table';

import { RealEstateShell } from './real-estate-shell';

import { useRealEstateAccess } from './use-real-estate-access';

type Receivable={id:number;invoice_number:string;asset_name?:string;contact_name:string;currency:string;currency_decimal_places?:number;total_amount:string;amount_paid:string;amount_due:string;due_date:string;status:string;source_type:string;period_key:string;payment_token:string|null;checkout_options:Array<{id:string;name:string;checkoutUrl:string}>};

export default function RentCollection(){
 const calendarAccess=useRealEstateAccess('rent_collection'),calendar=useErpCalendar(calendarAccess.enabled,'/api/erp/real-estate/calendar');

 const access=useRealEstateAccess('rent_collection'),{t,currentLanguage}=useTranslation(),{hasPermission}=usePermissions(),{toast}=useToast(),cache=useQueryClient();

 const [offset,setOffset]=useState(0),[dialog,setDialog]=useState<'generate'|'payment'|null>(null),[leaseId,setLeaseId]=useState('none'),[period,setPeriod]=useErpCalendarDefault(calendar,'month'),[sourceType,setSourceType]=useState('rent'),[selected,setSelected]=useState<Receivable|null>(null),[amount,setAmount]=useState(''),[method,setMethod]=useState('cash'),[reference,setReference]=useState('');

 const {formatMoney}=useErpCurrencies({enabled:access.enabled&&access.financial});
 const query=useQuery<{data:Receivable[];total:number;paymentMethods:Array<{id:string;name:string;type:string}>}>({enabled:access.enabled&&access.financial,queryKey:['real-estate',access.companyId,'rent-collection',offset],queryFn:async()=>(await apiRequest('GET',`/api/erp/real-estate/rent-collection?offset=${offset}`)).json()});

 const leases=useQuery<{data:Array<{id:number;name:string}>}>({enabled:dialog==='generate'&&access.enabled&&access.canManage&&access.financial&&(hasPermission('view_real_estate_leases')||hasPermission('manage_real_estate_leases')),queryKey:['real-estate',access.companyId,'active-leases'],queryFn:async()=>(await apiRequest('GET','/api/erp/real-estate/leases?status=active&limit=100')).json()});

 const refresh=()=>{cache.invalidateQueries({queryKey:['real-estate',access.companyId]});setDialog(null);toast({title:t('erp.common.saved','Saved')});};

 const generate=useMutation({mutationFn:async()=>apiRequest('POST',`/api/erp/real-estate/leases/${leaseId}/receivables`,{periodKey:period,sourceType}),onSuccess:refresh,onError:(error:Error)=>toast({title:t('common.error','Error'),description:error.message,variant:'destructive'})});

 const send=useMutation({mutationFn:async(invoiceId:number)=>apiRequest('POST',`/api/erp/real-estate/rent-collection/${invoiceId}/send`),onSuccess:refresh,onError:(error:Error)=>toast({title:t('common.error','Error'),description:error.message,variant:'destructive'})});

 const payment=useMutation({mutationFn:async()=>apiRequest('POST',`/api/erp/real-estate/rent-collection/${selected!.id}/payments`,{amount,paymentMethod:method,referenceNumber:reference}),onSuccess:refresh,onError:(error:Error)=>toast({title:t('common.error','Error'),description:error.message,variant:'destructive'})});

 const money=(value:string,currency:string,digits?:number)=>formatMoney(Number(value),currency,currentLanguage?.code,digits);

 const renderActions=(row:Receivable)=><div className="flex flex-wrap gap-2">{(hasPermission('view_invoices')||hasPermission('manage_invoices')||hasPermission('record_payments'))&&<Button asChild size="sm" variant="outline"><Link href={`/erp/invoices?detail=${row.id}`}>{t('erp.realEstate.rent_collection.openInvoice','Open ERP invoice')}</Link></Button>}{row.status==='draft'&&access.canManage&&hasPermission('manage_invoices')&&<Button size="sm" variant="outline" disabled={send.isPending} onClick={()=>send.mutate(row.id)}>{t('erp.realEstate.rent_collection.send','Issue invoice')}</Button>}{['sent','overdue','partially_paid'].includes(row.status)&&access.canManage&&hasPermission('record_real_estate_payments')&&(hasPermission('manage_invoices')||hasPermission('record_payments'))&&<Button size="sm" variant="outline" onClick={()=>{setSelected(row);setAmount(erpMinorUnitsToAmount(erpMinorUnits(row.amount_due,erpCurrencyDigits(row.currency_decimal_places)),erpCurrencyDigits(row.currency_decimal_places)));setDialog('payment');}}>{t('erp.realEstate.rent_collection.record','Record payment')}</Button>}{row.checkout_options?.map(option=><Button key={option.id} asChild variant="outline" size="sm"><a href={option.checkoutUrl} target="_blank" rel="noreferrer">{option.name}</a></Button>)}</div>;

 return <RealEstateShell title={t('erp.realEstate.rent_collection.title','Rent Collection')} description={t('erp.realEstate.rent_collection.description','Manage rent and deposit receivables through ERP invoices and payments.')} icon="ri-money-dollar-circle-line" actions={access.canManage&&access.financial&&hasPermission('manage_invoices')&&(hasPermission('view_real_estate_leases')||hasPermission('manage_real_estate_leases'))&&<Button onClick={()=>setDialog('generate')}>{t('erp.realEstate.rent_collection.generate','Generate obligation')}</Button>}>
 <ErpCalendarError calendar={calendar}/>

 {!access.financial?<div className="re-panel p-8">{t('erp.realEstate.financialAccessRequired','Financial access is required.')}</div>:query.isError?<div role="alert" className="re-panel p-8">{t('erp.realEstate.loadError','Unable to load this information.')}<Button variant="outline" onClick={()=>query.refetch()}>{t('common.retry','Retry')}</Button></div>:query.isLoading?<div role="status" className="re-panel h-64 animate-pulse"/>:!query.data?.data.length?<div className="re-panel py-16 text-center"><i className="ri-money-dollar-circle-line text-4xl text-primary" aria-hidden="true"/><h2 className="mt-4 font-semibold">{t('erp.realEstate.rent_collection.empty','No rent receivables yet')}</h2><p className="mt-2 text-sm text-muted-foreground">{t('erp.realEstate.rent_collection.emptyDescription','Configure Catalog and posting references on a lease, then generate its obligation.')}</p></div>:<><div className="space-y-3 md:hidden">{query.data.data.map(row=><article key={row.id} className="re-panel p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="text-sm font-semibold break-all">{row.invoice_number}</h2><p className="mt-1 text-xs text-muted-foreground">{row.asset_name}</p><p className="mt-1 text-xs text-muted-foreground">{row.contact_name} · {row.period_key}</p></div><span className={`re-status re-status-${row.status}`}>{t(`erp.realEstate.invoiceStatus.${row.status}`,row.status)}</span></div><dl className="my-4 grid grid-cols-2 gap-3 text-xs">{[['expected',row.total_amount],['received',row.amount_paid],['outstanding',row.amount_due]].map(([label,value])=><div key={label}><dt className="text-muted-foreground">{t(`erp.realEstate.rent_collection.columns.${label}`,label)}</dt><dd className="mt-1 font-semibold">{money(value,row.currency,row.currency_decimal_places)}</dd></div>)}</dl>{renderActions(row)}</article>)}</div><div className="re-panel hidden overflow-x-auto md:block"><Table><TableHeader><TableRow>{['invoice','property','contact','period','expected','received','outstanding','status','actions'].map(key=><TableHead key={key}>{t(`erp.realEstate.rent_collection.columns.${key}`,key.charAt(0).toUpperCase()+key.slice(1))}</TableHead>)}</TableRow></TableHeader><TableBody>{query.data.data.map(row=><TableRow key={row.id}><TableCell className="whitespace-nowrap font-medium">{row.invoice_number}<div className="text-xs text-muted-foreground">{row.source_type==='rent'?t('erp.realEstate.rent_collection.rent','Rent'):t('erp.realEstate.rent_collection.deposit','Deposit')}</div></TableCell><TableCell>{row.asset_name}</TableCell><TableCell>{row.contact_name}</TableCell><TableCell>{row.period_key}</TableCell><TableCell className="whitespace-nowrap">{money(row.total_amount,row.currency,row.currency_decimal_places)}</TableCell><TableCell className="whitespace-nowrap text-primary">{money(row.amount_paid,row.currency,row.currency_decimal_places)}</TableCell><TableCell className="whitespace-nowrap">{money(row.amount_due,row.currency,row.currency_decimal_places)}</TableCell><TableCell><span className={`re-status re-status-${row.status}`}>{t(`erp.realEstate.invoiceStatus.${row.status}`,row.status)}</span></TableCell><TableCell>{renderActions(row)}</TableCell></TableRow>)}</TableBody></Table></div></>}

 {!!query.data?.total&&<div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={!offset} onClick={()=>setOffset(offset-25)}>{t('erp.realEstate.pagination.previous','Previous')}</Button><Button size="sm" variant="outline" disabled={offset+25>=query.data.total} onClick={()=>setOffset(offset+25)}>{t('erp.realEstate.pagination.next','Next')}</Button></div>}

 <Dialog open={dialog!==null} onOpenChange={open=>{if(!open)setDialog(null);}}><DialogContent><DialogHeader><DialogTitle>{t(dialog==='generate'?'erp.realEstate.rent_collection.generate':'erp.realEstate.rent_collection.record',dialog==='generate'?'Generate obligation':'Record payment')}</DialogTitle><DialogDescription>{t('erp.realEstate.rent_collection.dialogHelp','Uses existing ERP invoice, tax, payment and accounting services.')}</DialogDescription></DialogHeader><div className="space-y-4">{dialog==='generate'?<><div className="space-y-2"><Label>{t('erp.realEstate.leases.title','Leases')}</Label><Select value={leaseId} onValueChange={setLeaseId}><SelectTrigger aria-label={t('erp.realEstate.leases.title','Leases')}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="none">{t('erp.common.none','None')}</SelectItem>{leases.data?.data.map(lease=><SelectItem key={lease.id} value={String(lease.id)}>{lease.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor="rent-period">{t('erp.realEstate.rent_collection.period','Rent month')}</Label><Input id="rent-period" type="month" value={period} onChange={event=>setPeriod(event.target.value)}/></div><Select value={sourceType} onValueChange={setSourceType}><SelectTrigger aria-label={t('erp.realEstate.rent_collection.obligationType','Obligation type')}><SelectValue/></SelectTrigger><SelectContent><SelectItem value="rent">{t('erp.realEstate.rent_collection.rent','Rent')}</SelectItem><SelectItem value="security_deposit">{t('erp.realEstate.rent_collection.deposit','Deposit')}</SelectItem></SelectContent></Select></>:<><div className="space-y-2"><Label htmlFor="rent-amount">{t('erp.realEstate.rent_collection.amount','Amount')}</Label><Input id="rent-amount" type="number" step="any" value={amount} onChange={event=>setAmount(event.target.value)}/></div><Select value={method} onValueChange={setMethod}><SelectTrigger aria-label={t('erp.realEstate.rent_collection.method','Payment method')}><SelectValue/></SelectTrigger><SelectContent>{query.data?.paymentMethods.filter(method=>method.type!=='online').map(method=><SelectItem key={method.id} value={method.id}>{method.name}</SelectItem>)}</SelectContent></Select><div className="space-y-2"><Label htmlFor="rent-reference">{t('erp.realEstate.rent_collection.reference','Reference')}</Label><Input id="rent-reference" value={reference} onChange={event=>setReference(event.target.value)}/></div></>}</div><DialogFooter><Button variant="outline" onClick={()=>setDialog(null)}>{t('common.cancel','Cancel')}</Button><Button disabled={generate.isPending||payment.isPending||(dialog==='generate'?leaseId==='none':!amount)} onClick={()=>dialog==='generate'?generate.mutate():payment.mutate()}>{t('erp.common.save','Save')}</Button></DialogFooter></DialogContent></Dialog>

 </RealEstateShell>;

}


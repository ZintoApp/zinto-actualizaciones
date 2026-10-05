import {useErpCurrencies} from '@/hooks/use-erp-currencies';
import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select,SelectContent,SelectItem,SelectTrigger,SelectValue } from '@/components/ui/select';
import { Table,TableBody,TableCell,TableHead,TableHeader,TableRow } from '@/components/ui/table';
import type { RealEstateAsset } from '@shared/real-estate-contracts';
import { RealEstateShell } from './real-estate-shell';
import { useRealEstateAccess } from './use-real-estate-access';

export default function RealEstateProperties({ kind='property' }: {kind?:'property'|'unit'}) {
  const {company,user}=useAuth(); const {t,currentLanguage}=useTranslation(); const {hasPermission}=usePermissions();
  const [,navigate]=useLocation(); const [search,setSearch]=useState(''); const [status,setStatus]=useState('all');
  const [view,setView]=useState<'cards'|'table'>('cards'); const [offset,setOffset]=useState(0);
  const section=kind==='unit'?'units':'properties'; const base=`/erp/real-estate/${section}`;
  const access=useRealEstateAccess(section);
  const canManage=hasPermission(`manage_real_estate_${section}`); const financial=hasPermission('view_real_estate_financials');
 const {formatMoney}=useErpCurrencies({enabled:access.enabled&&access.financial});
  const query=useQuery<{data:RealEstateAsset[];total:number}>({
    enabled:access.enabled,
    queryKey:['real-estate',company?.id??user?.companyId,section,search,status,offset],
    queryFn:async()=>{const params=new URLSearchParams({search,limit:'12',offset:String(offset)});if(status!=='all')params.set('status',status);
      return (await apiRequest('GET',`/api/erp/real-estate/${section}?${params}`)).json();},
  });
  const statusLabel=(value:string)=>t(`erp.realEstate.status.${value}`,value.charAt(0).toUpperCase()+value.slice(1));
  const money=(asset:RealEstateAsset)=>formatMoney(Number(asset.listing_purpose==='sale'?asset.sale_price:asset.rental_price)||0,asset.currency??'USD',currentLanguage?.code);
  return <RealEstateShell title={t(`erp.realEstate.${section}.title`,kind==='unit'?'Units':'Properties')}
    description={t('erp.realEstate.properties.description','Manage your portfolio, availability, and property operations.')} icon="ri-home-4-line"
    actions={canManage&&financial?<Button onClick={()=>navigate(`${base}/new`)}><i className="ri-add-line mr-2" aria-hidden="true" />{t(kind==='unit'?'erp.realEstate.units.add':'erp.realEstate.properties.add',kind==='unit'?'Add unit':'Add property')}</Button>:null}>
    <div className="re-panel mb-4 flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 flex-1 flex-wrap gap-2"><div className="relative min-w-48 flex-1 sm:max-w-sm"><i className="ri-search-line absolute left-3 top-2.5 text-muted-foreground" />
        <Input className="pl-9" aria-label={t('common.search','Search')} placeholder={t('erp.realEstate.properties.search','Search properties, codes, locations…')} value={search} onChange={event=>{setSearch(event.target.value);setOffset(0);}} /></div>
        <Select value={status} onValueChange={value=>{setStatus(value);setOffset(0);}}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>
          <SelectItem value="all">{t('erp.realEstate.allStatuses','All statuses')}</SelectItem>{['available','occupied','rented','reserved','sold','blocked'].map(value=><SelectItem key={value} value={value}>{statusLabel(value)}</SelectItem>)}
        </SelectContent></Select></div>
      <div className="flex gap-1"><Button variant={view==='cards'?'secondary':'ghost'} size="icon" aria-label={t('erp.realEstate.cardView','Card view')} onClick={()=>setView('cards')}><i className="ri-layout-grid-line" /></Button>
        <Button variant={view==='table'?'secondary':'ghost'} size="icon" aria-label={t('erp.realEstate.tableView','Table view')} onClick={()=>setView('table')}><i className="ri-list-check" /></Button></div>
    </div>
    {query.isLoading?<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status">{Array.from({length:6},(_,index)=><div key={index} className="re-panel h-72 animate-pulse bg-muted" />)}</div>
      :query.isError?<div role="alert" className="re-panel p-8 text-center"><p>{t('erp.realEstate.loadError','Unable to load this information.')}</p><Button variant="outline" className="mt-3" onClick={()=>query.refetch()}>{t('common.retry','Retry')}</Button></div>
      :!query.data?.data.length?<div className="re-panel flex flex-col items-center px-6 py-16 text-center"><div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl text-primary"><i className="ri-home-4-line" /></div>
        <h2 className="font-semibold">{t('erp.realEstate.properties.empty','Your portfolio starts here')}</h2><p className="mt-2 max-w-sm text-sm text-muted-foreground">{t('erp.realEstate.properties.emptyDescription','Add a property to manage occupancy, leases, viewings, and maintenance in one workspace.')}</p>
        {canManage&&financial&&<Button className="mt-5" onClick={()=>navigate(`${base}/new`)}>{t('erp.realEstate.properties.add','Add property')}</Button>}</div>
      :view==='cards'?<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{query.data.data.map(asset=><Link key={asset.id} href={`${base}/${asset.id}`} className="re-panel re-property-card block">
        <div className="re-property-image relative flex h-44 items-center justify-center">{asset.images[0]?<img className="h-full w-full object-cover" src={asset.images[0].url} alt={asset.images[0].alt??asset.name} />:<i className="ri-building-4-line text-5xl text-muted-foreground/40" />}
          <span className={`re-status re-status-${asset.status} absolute left-3 top-3`}>{statusLabel(asset.status)}</span><span className="absolute right-3 top-3 rounded bg-background/80 px-2 py-1 text-xs">{asset.code}</span></div>
        <div className="p-4"><div className="flex items-start justify-between gap-2"><h2 className="truncate font-semibold">{asset.name}</h2><i className="ri-arrow-right-up-line text-muted-foreground" /></div>
          <p className="mt-1 truncate text-xs text-muted-foreground"><i className="ri-map-pin-line mr-1" />{asset.location??t('erp.realEstate.locationNotSet','Location not set')}</p>
          <div className="mt-4 flex gap-4 border-b border-border pb-3 text-xs text-muted-foreground"><span><i className="ri-hotel-bed-line mr-1" />{asset.bedrooms??'—'}</span><span><i className="ri-drop-line mr-1" />{asset.bathrooms??'—'}</span><span><i className="ri-ruler-line mr-1" />{asset.area??'—'} {asset.area_measure==='sq_m'?'m²':'ft²'}</span></div>
          <div className="mt-3 flex items-center justify-between gap-2">{financial?<strong className="text-sm">{money(asset)}</strong>:<span className="text-xs text-muted-foreground">{asset.property_type_name??'—'}</span>}<span className="truncate text-xs text-muted-foreground">{asset.assigned_agent_name??'—'}</span></div>
        </div></Link>)}</div>:<div className="re-panel overflow-x-auto"><Table><TableHeader><TableRow>
          {['Property','Location','Status','Type',...(financial?['Price']:[]),'Agent'].map(label=><TableHead key={label}>{t(`erp.realEstate.table.${label.toLowerCase()}`,label)}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{query.data.data.map(asset=><TableRow key={asset.id} className="cursor-pointer" onClick={()=>navigate(`${base}/${asset.id}`)}><TableCell><strong>{asset.name}</strong><div className="text-xs text-muted-foreground">{asset.code}</div></TableCell><TableCell>{asset.location??'—'}</TableCell><TableCell><span className={`re-status re-status-${asset.status}`}>{statusLabel(asset.status)}</span></TableCell><TableCell>{asset.property_type_name??'—'}</TableCell>{financial&&<TableCell>{money(asset)}</TableCell>}<TableCell>{asset.assigned_agent_name??'—'}</TableCell></TableRow>)}</TableBody></Table></div>}
    {!!query.data?.total&&<div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>{offset+1}–{Math.min(offset+12,query.data.total)} / {query.data.total}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-12))}>{t('common.previous','Previous')}</Button><Button size="sm" variant="outline" disabled={offset+12>=query.data.total} onClick={()=>setOffset(offset+12)}>{t('common.next','Next')}</Button></div></div>}
  </RealEstateShell>;
}

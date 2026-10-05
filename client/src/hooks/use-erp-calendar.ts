import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useAuth} from './use-auth';
import {apiRequest} from '@/lib/queryClient';

/** Read existing ERP company calendar through the caller's authorized context. */
export function useErpCalendar(enabled:boolean,url:string){
 const {company,user}=useAuth(),companyId=company?.id??user?.companyId??undefined;
 const query=useQuery<{today:string;timezone:string}>({queryKey:[url,companyId],enabled:enabled&&!!companyId,queryFn:async()=>(await apiRequest('GET',url)).json(),staleTime:0,refetchOnMount:'always',refetchOnWindowFocus:true});
 return {...query,companyId};
}

/** User edits survive refetches; switching companies releases the prior override. */
export function useErpCalendarDefault(calendar:ReturnType<typeof useErpCalendar>,kind:'date'|'month'|'monthStart'='date'){
 const [override,setOverride]=useState<{companyId:number|undefined;value:string}|null>(null);
 const today=calendar.data?.today??'';
 const initial=kind==='month'?today.slice(0,7):kind==='monthStart'&&today?today.slice(0,8)+'01':today;
 const value=override&&override.companyId===calendar.companyId?override.value:initial;
 return [value,(value:string)=>setOverride({companyId:calendar.companyId,value})] as const;
}

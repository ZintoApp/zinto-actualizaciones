import {useQuery} from '@tanstack/react-query';
import {Link} from 'wouter';
import {useTranslation} from '@/hooks/use-translation';
import {apiRequest} from '@/lib/queryClient';
import {Button} from '@/components/ui/button';
import {useRealEstateAccess} from './use-real-estate-access';

/** Uses the existing document endpoints and shared media authorization. */
export function WorkspaceDocuments({entityType,entityId}:{entityType:string;entityId:number}){
 const access=useRealEstateAccess('documents'),{t}=useTranslation();
 const query=useQuery<{data:Array<{id:number;name:string;category:string}>;total:number}>({enabled:access.enabled,queryKey:['real-estate',access.companyId,'documents',entityType,entityId],queryFn:async()=>(await apiRequest('GET',`/api/erp/real-estate/documents?${new URLSearchParams({entityType,entityId:String(entityId),limit:'20'})}`)).json()});
 if(!access.enabled)return null;
 return <section className="re-panel mt-5 p-5"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="font-semibold">{t('erp.realEstate.documents.title','Documents')}</h2><Button asChild variant="outline" size="sm"><Link href="/erp/real-estate/documents">{t('erp.realEstate.dashboard.viewAll','View All')}</Link></Button></div>{query.isError?<div role="alert"><p>{t('erp.realEstate.loadError','Unable to load this information.')}</p><Button variant="outline" size="sm" onClick={()=>query.refetch()}>{t('common.retry','Retry')}</Button></div>:query.isLoading?<div role="status" className="h-20 animate-pulse rounded-lg bg-muted"/>:query.data?.data.length?<div className="space-y-3">{query.data.data.map(doc=><a key={doc.id} href={`/api/erp/real-estate/documents/${doc.id}/download`} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-lg border p-4 text-sm"><span className="min-w-0 break-words font-medium">{doc.name}</span><span className="text-xs text-muted-foreground">{doc.category}</span><i className="ri-download-line" aria-hidden="true"/></a>)}</div>:<p className="py-6 text-center text-sm text-muted-foreground">{t('erp.realEstate.documents.empty','No documents match this view')}</p>}</section>;
}

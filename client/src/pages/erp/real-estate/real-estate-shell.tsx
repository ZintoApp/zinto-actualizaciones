import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import Header from '@/components/layout/Header';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useTranslation } from '@/hooks/use-translation';
import { usePermissions } from '@/hooks/usePermissions';
import { useAppSidebarChrome } from '@/contexts/AppSidebarChromeContext';
import './real-estate.css';

export function RealEstateShell({ title, description, icon, actions, children }: {
  title: string; description: string; icon: string; actions?: ReactNode; children: ReactNode;
}) {
  const { isRealEstate, isLoading } = useErpBusinessType();
  const [location,navigate] = useLocation();
  const { hasAnyPermission,isLoading:permissionsLoading,error:permissionsError,refetch:retryPermissions } = usePermissions();
  const feature = location==='/erp/dashboard'?'dashboard':location.split('/')[3]?.replaceAll('-','_') ?? 'dashboard';
  const permitted = hasAnyPermission([`view_real_estate_${feature}`,`manage_real_estate_${feature}`] as import('@/hooks/usePermissions').Permission[]);
  const { t } = useTranslation();
  const { setSidebarCollapsed } = useAppSidebarChrome();
  useEffect(()=>{
    const viewport=window.matchMedia('(max-width: 767px)');
    const collapse=()=>{if(viewport.matches)setSidebarCollapsed(true);};
    collapse();viewport.addEventListener('change',collapse);
    return ()=>viewport.removeEventListener('change',collapse);
  },[setSidebarCollapsed]);
  useEffect(()=>{if(!isLoading&&!isRealEstate)navigate('/erp/settings');},[isLoading,isRealEstate,navigate]);
  useEffect(()=>{if(!permissionsLoading&&!permissionsError&&!permitted)navigate('/access-denied');},[permissionsLoading,permissionsError,permitted,navigate]);
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <Header />
    <main className="re-content min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6">
      {permissionsError?<div role="alert" className="re-panel p-8">{t('erp.realEstate.loadError','Unable to load this information.')}<button className="ml-3 text-primary underline" onClick={()=>retryPermissions()}>{t('common.retry','Retry')}</button></div>:isLoading||!isRealEstate||permissionsLoading||!permitted ? <div role="status" className="p-8 text-muted-foreground">{t('erp.common.loading','Loading...')}</div> : <>
        <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div><div className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground"><i className={icon} aria-hidden="true" />{t('erp.realEstate.title','Real Estate')}</div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>{children}
      </>}
    </main>
  </div>;
}

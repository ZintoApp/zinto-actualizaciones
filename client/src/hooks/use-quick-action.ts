import { useEffect, useRef } from 'react';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/usePermissions';
import { useErpBusinessType } from '@/hooks/use-erp-business-type';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { QUICK_ACTION_CATALOG, destinationAvailable } from '@shared/quick-actions';

/** One-shot navigation intent; the owning page retains its ordinary form and submit path. */
export function useQuickAction(id: string, { open, onOpen, ready = true, unavailable = false }: { open: boolean; onOpen: () => void; ready?: boolean; unavailable?: boolean }) {
  const [path,navigate] = useLocation();
  const search = useSearch();
  const { user,isLoading } = useAuth();
  const access = usePermissions();
  const business = useErpBusinessType();
  const { t } = useTranslation();
  const { toast } = useToast();
  const callback = useRef(onOpen); callback.current=onOpen;
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const intent=url.searchParams.get('quickAction');
    if (!intent) { handled.current=null; return; }
    if (!user || isLoading || access.isLoading || business.isLoading || !ready) return;
    if (handled.current===url.href) return;
    handled.current=url.href;
    const action=QUICK_ACTION_CATALOG.find(d => d.kind==='action' && d.id===intent);
    const allowed=action && action.id===id && new URL(action.path,url.origin).pathname===path && !access.error && !business.error && destinationAvailable(action,{permissions:access.permissions || {},superAdmin:user.isSuperAdmin === true,businessType:business.businessType});
    url.searchParams.delete('quickAction');
    navigate(url.pathname+url.search+url.hash,{replace:true});
    if (!allowed || unavailable) {
      toast({title:t('personalization.action_unavailable','This action is unavailable. Check your permissions and the page configuration.'),variant:'destructive'});
      return;
    }
    if (open) requestAnimationFrame(() => { const dialog=document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]'); (dialog?.querySelector<HTMLElement>('input:not([disabled]),button:not([disabled]),[tabindex="0"]') || dialog)?.focus(); });
    else callback.current();
  }, [path,search,id,user,isLoading,access.isLoading,access.error,access.permissions,business.isLoading,business.error,business.businessType,ready,unavailable,open,navigate,t,toast]);
}

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { useGuidedTours } from './GuidedTourProvider';
import type { GuidedTour } from '@shared/guided-tours';

export const AUTHORING_KEY = 'guided-tour-authoring';
export interface AuthoringSession { tourId:number; revision:number; stepId:string; route:string; mode:'pick'|'preview'; selector?:string; binding?:string; editorTab?:'overview'|'steps'|'media'; editingLanguage?:string; }
export function readAuthoring(): AuthoringSession | null {
  try { const data=JSON.parse(sessionStorage.getItem(AUTHORING_KEY) || 'null'); return data && Number.isInteger(data.tourId) && typeof data.stepId === 'string' ? data : null; } catch { return null; }
}
export function TourAuthoringBar() {
  const { user, isLoading: authLoading, returnFromImpersonationMutation, switchError } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const [location, navigate] = useLocation();
  const { preview,running } = useGuidedTours();
  const [session,setSession] = useState(readAuthoring), [picking,setPicking] = useState(false), [error,setError] = useState('');
  const [matches,setMatches]=useState<number | null>(null);
  const [busy, setBusy] = useState(false), [captured, setCaptured] = useState(false);
  const [modal, setModal] = useState<HTMLElement | null>(null);
  const pickButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (switchError) setError(t('guided_tours.return_failed','Could not return to the editor. Please retry.')); }, [switchError, t]);
  const visible = !!session && !location.startsWith('/admin') && !running;
  const access=useQuery<{allowed:boolean}>({ queryKey:['tour-authoring',user?.id],queryFn:async () => (await apiRequest('GET','/api/guided-tours/authoring')).json(),enabled:!!user && visible,staleTime:0,retry:false });
  const authorized = !!user && !!access.data?.allowed && !access.isError && !access.isFetching;
  const checking = authLoading || (!!user && (access.isPending || access.isFetching));
  useEffect(() => { if (!authorized || !visible) setPicking(false); }, [authorized, visible]);
  useEffect(() => { setPicking(false); }, [location]);
  useEffect(() => {
    if (!visible) { setModal(null); return; }
    // Stay in the active Radix focus scope. A sticky flex child reserves space
    // within the dialog instead of covering its fields with a fixed overlay.
    const check = () => setModal([...document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"][data-state="open"],[data-slot="alert-dialog-content"][data-state="open"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper] [role="dialog"]')].filter(node => node.getClientRects().length > 0).at(-1) || null);
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state', 'hidden'] });
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    const listener=() => { setSession(readAuthoring()); setPicking(false); setCaptured(false); setError(''); };
    window.addEventListener('tour-authoring',listener); return () => window.removeEventListener('tour-authoring',listener);
  },[]);
  useEffect(() => {
    if (!picking || !session || !authorized || !visible) return;
    let highlighted:HTMLElement | null=null,outline='';
    const clear=() => { if (highlighted) highlighted.style.outline=outline; highlighted=null; };
    const move=(event:Event) => {
      const element=(event.target as Element)?.closest<HTMLElement>('[data-tour],button,input,select,textarea,[role="tab"],[role="combobox"],[role="option"],[role="menuitem"],a');
      clear();
      if (!element || element.closest('[data-tour-authoring]')) return;
      highlighted=element; outline=element.style.outline; element.style.outline='2px solid hsl(var(--primary))';
      setMatches(element.dataset.tour?document.querySelectorAll(`[data-tour="${CSS.escape(element.dataset.tour)}"]`).length:null);
    };
    const click=(event:Event) => {
      if ((event.target as HTMLElement).closest('[data-tour-authoring]')) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      move(event);
      const element=highlighted;
      if (!element) return;
      let selector=element.dataset.tour ? `[data-tour="${CSS.escape(element.dataset.tour)}"]` : element.id ? `#${CSS.escape(element.id)}` : '';
      const dynamicAttribute=['data-tour-flow-status','data-tour-flow-assign'].find(name=>element.hasAttribute(name));
      const node=element.closest<HTMLElement>('.react-flow__node[data-id]');
      if(dynamicAttribute || node){
        if(!session.binding){setError(t('guided_tours.picker_binding','Configure a resource capture on an earlier step before picking a record control.'));return;}
        if(dynamicAttribute)selector=`[${dynamicAttribute}="{{${session.binding}}}"]`;
        else if(node)selector=`.react-flow__node[data-id="{{${session.binding}}}"]${selector?' '+selector:''}`;
      }
      // Never persist record IDs or positional paths from a customer's data.
      if (!selector || /\d{3,}/.test(selector) || (!dynamicAttribute && !node && document.querySelectorAll(selector).length !== 1)) { setError(t('guided_tours.picker_unstable','Choose a unique registered control, or enter a selector in the editor.')); return; }
      const updated={ ...session,selector };
      try { sessionStorage.setItem(AUTHORING_KEY,JSON.stringify(updated)); }
      catch { setError(t('guided_tours.picker_storage_failed','Could not keep the selected element. Please retry before leaving this page.')); return; }
      setSession(updated); setPicking(false); setCaptured(true); setError(''); clear();
      pickButton.current?.focus();
    };
    const block=(event:Event) => {
      if ((event.target as HTMLElement)?.closest('[data-tour-authoring]')) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    };
    const pointer=(event:PointerEvent) => { move(event); block(event); };
    const key=(event:KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        setPicking(false); setError(''); pickButton.current?.focus();
      } else if (event.key === 'Enter' || event.key === ' ') {
        // Keyboard selection must capture, never submit the real form.
        if (!(event.target as Element).closest('[data-tour-authoring]')) click(event);
      }
    };
    document.addEventListener('pointerdown',pointer,true); document.addEventListener('mousedown',block,true);
    // Radix Select commits on pointerup, before click. Block that phase too.
    document.addEventListener('pointerup',block,true); document.addEventListener('mouseup',block,true);
    document.addEventListener('touchend',block,{capture:true,passive:false});
    document.addEventListener('touchstart',block,{capture:true,passive:false});
    document.addEventListener('mousemove',move,true); document.addEventListener('focusin',move,true); document.addEventListener('click',click,true); window.addEventListener('keydown',key,true);
    return () => { clear(); document.removeEventListener('pointerdown',pointer,true); document.removeEventListener('mousedown',block,true); document.removeEventListener('pointerup',block,true); document.removeEventListener('mouseup',block,true); document.removeEventListener('touchend',block,true); document.removeEventListener('touchstart',block,true); document.removeEventListener('mousemove',move,true); document.removeEventListener('focusin',move,true); document.removeEventListener('click',click,true); window.removeEventListener('keydown',key,true); };
  },[picking,session,authorized,visible,t]);
  const returnToEditor=async () => {
    setPicking(false); setBusy(true); setError('');
    try {
      if (!user?.isSuperAdmin) {
        await returnFromImpersonationMutation.mutateAsync({ destination: '/admin/guided-tours' });
      } else navigate('/admin/guided-tours', { replace: true });
    } catch { setError(t('guided_tours.return_failed','Could not return to the editor. Please retry.')); setBusy(false); }
  };
  const startPreview=async () => {
    if (!session || !authorized || busy) return;
    setBusy(true); setError('');
    try { const tour:GuidedTour=await (await apiRequest('GET',`/api/guided-tours/${session.tourId}/revisions/${session.revision}`)).json(); preview(tour); }
    catch { setError(t('guided_tours.unavailable','Could not load guided tours.')); }
    finally { setBusy(false); }
  };
  if (!session || !visible) return null;
  return createPortal(<aside data-tour-authoring onPointerDown={event => event.stopPropagation()} dir={currentLanguage?.direction === 'rtl' ? 'rtl' : 'ltr'} className={`${modal ? 'sticky bottom-0 m-2 self-end shrink-0' : 'fixed bottom-3 end-3'} z-[11000] w-96 max-w-[calc(100%_-_24px)] space-y-2 rounded-lg border bg-card p-3 text-card-foreground shadow-xl`} style={{ pointerEvents: 'auto' }} aria-label={t('guided_tours.authoring','Tour authoring')}>
    <p className="text-sm font-medium">{t('guided_tours.authoring','Tour authoring')}</p>
    {checking ? <p role="status" className="text-sm">{t('guided_tours.picker_preparing','Preparing element picker…')}</p>
      : !authorized ? <p role="alert" className="text-sm">{access.isError ? t('guided_tours.picker_access_failed','Could not check authoring access. Retry, or sign in as an administrator.') : t('guided_tours.picker_access_denied','This authoring session is unavailable. Sign in as an administrator and reopen the editor.')}</p>
      : <p role="status" className="text-sm">{picking ? t('guided_tours.picker_select_hint','Select a control to capture it without activating it. Press Escape to cancel.') : captured ? t('guided_tours.picker_captured','Element selected. Return to the editor to review and save it.') : t('guided_tours.picker_navigate_hint','Open the page, menu, or dialog you need, then choose Pick element.')}</p>}
    {session.selector && <code className="block max-w-xs break-all text-xs">{session.selector}</code>}
    {picking && matches!==null && <p role="status" className="text-xs">{t('guided_tours.picker_matches','Selector matches: {{count}}',{count:matches})}</p>}
    {error && <p role="alert" className="max-w-xs text-xs text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2"><Button ref={pickButton} size="sm" disabled={!authorized || busy} variant={picking ? 'secondary' : 'outline'} aria-pressed={picking} onClick={() => { setError(''); setCaptured(false); setPicking(!picking); }}>{picking ? t('guided_tours.navigate','Navigate') : t('guided_tours.pick','Pick element')}</Button><Button size="sm" disabled={!authorized || busy || picking} onClick={startPreview}>{t('guided_tours.preview','Preview')}</Button><Button size="sm" variant="outline" disabled={busy} onClick={returnToEditor}>{t('guided_tours.return_editor','Return to editor')}</Button>
      {!authorized && <Button size="sm" variant="outline" disabled={checking || busy || !user} onClick={() => void access.refetch()}>{t('common.retry','Retry')}</Button>}
      {(!authorized || error) && <Button size="sm" variant="link" disabled={busy} onClick={() => window.location.assign('/admin/login?returnTo=%2Fadmin%2Fguided-tours')}>{t('guided_tours.admin_sign_in','Administrator sign-in')}</Button>}
    </div>
  </aside>, modal || document.body);
}

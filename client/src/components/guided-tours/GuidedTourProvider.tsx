import { createPortal } from 'react-dom';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Joyride, EVENTS, ACTIONS, type Step, type EventData } from 'react-joyride';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useSearch } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useAppSidebarChrome } from '@/contexts/AppSidebarChromeContext';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HelpCircle, Search } from 'lucide-react';
import { bindTourValue, contextualTours, matchTourRoute, resolveTourRoute, resolveTourText, type GuidedTour, type TourBindings } from '@shared/guided-tours';
import { TOUR_FEATURES } from '@shared/guided-tour-registry';
import { subscribeTourSignals } from './signals';
import { parseTourProgress, progressStorageKey, routeCompletesStep, signalCompletesStep, visibleTourTarget } from './runtime';
import { TourMedia } from './TourMedia';
import { TourAuthoringBar } from './TourAuthoringBar';
import { TourErrorBoundary } from './TourErrorBoundary';

interface TourContext { openHelp: () => void; preview: (tour: GuidedTour) => void; running: boolean; }
const Context = createContext<TourContext>({ openHelp:() => {}, preview:() => {}, running:false });
export const useGuidedTours = () => useContext(Context);
export function GuidedTourHelpButton() {
  const { openHelp } = useGuidedTours();
  const { t } = useTranslation();
  return <Button variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={openHelp} aria-label={t('guided_tours.help','Help & guided tours')} title={t('guided_tours.help','Help & guided tours')} data-tour="help"><HelpCircle className="h-4 w-4" /></Button>;
}
interface ActiveTour { tour:GuidedTour; index:number; bindings:TourBindings; preview:boolean; }
export function GuidedTourProvider({ children }: { children:React.ReactNode }) {
  const { user, company } = useAuth();
  const { t, currentLanguage } = useTranslation();
  const { toast } = useToast();
  const [location,navigate] = useLocation();
  const routeSearch = useSearch();
  const { setSidebarCollapsed } = useAppSidebarChrome();
  const [open,setOpen] = useState(false), [search,setSearch] = useState(''), [selected,setSelected] = useState<number>();
  const [active,setActive] = useState<ActiveTour | null>(null);
  const [target,setTarget] = useState<HTMLElement | null>(null), [paused,setPaused] = useState(false), [attempt,setAttempt] = useState(0);
  const [menuOpen,setMenuOpen]=useState(false);
  const [portalRoot,setPortalRoot]=useState<HTMLElement | null>(null);
  const [targetReady,setTargetReady]=useState(true);
  const [resume,setResume] = useState<ReturnType<typeof parseTourProgress>>(null);
  const [helpRoute,setHelpRoute] = useState('');
  const activeRef = useRef(active); activeRef.current = active;
  const armed = useRef(false);
  const enteredAt = useRef(0), progressing = useRef(false), focusReturn = useRef<HTMLElement | null>(null);
  const companyId = company?.id || user?.companyId;
  const storageKey = user && companyId ? progressStorageKey(user.id,companyId) : null;
  const language = currentLanguage?.code || 'en';
  const fullRoute = location + (routeSearch ? `?${routeSearch}` : '');
  const query = useQuery<GuidedTour[]>({ queryKey:['guided-tours',user?.id,companyId], queryFn:async () => (await apiRequest('GET','/api/guided-tours')).json(), enabled:!!user && !!companyId && (open || !!active), staleTime:0 });
  const tours = useMemo(() => contextualTours(query.data || [],helpRoute || fullRoute),[query.data,helpRoute,fullRoute]);
  const chosen = tours.find(tour => tour.id === selected) || tours[0];
  const text = (values:Record<string,string>) => resolveTourText(values,language);
  const tourText = (tour:GuidedTour,key:'title'|'description') => t(`guided_tour_${tour.id}_${tour.revision}.${key}`,text(tour.definition[key]));
  const needsRecord = (tour:GuidedTour) => {
    const feature=TOUR_FEATURES.find(item=>item.id===tour.definition.feature),url=new URL(fullRoute,window.location.origin);
    if(feature?.contextQuery?.length && (!matchTourRoute(feature.route,fullRoute) || feature.contextQuery.some(key=>!url.searchParams.get(key))))return true;
    return tour.definition.routes.every(route=>route.includes(':')) && !tour.definition.routes.some(route=>matchTourRoute(route.split('?')[0],fullRoute));
  };
  const openHelp = () => {
    focusReturn.current = document.activeElement as HTMLElement;
    const prefix=location==='/settings'?'pages-settings':location==='/erp/settings'?'pages-erp-settings':location.startsWith('/erp/dental/patients/')?'pages-erp-dental-patient-detail':null;
    const tab=prefix && document.querySelector<HTMLElement>(`[data-tour^="${prefix}.tabstrigger."][data-state="active"]`)?.dataset.tour?.split('.tabstrigger.')[1];
    setHelpRoute(tab?`${location}?tab=${tab}`:fullRoute);
    setSelected(undefined); setSearch(''); setOpen(true);
  };
  const markPage=() => {
    const header=document.querySelector('[data-tour-header]');
    const content=header?.nextElementSibling || header?.parentElement;
    document.querySelectorAll('[data-tour-current-page]').forEach(element=>{if(element!==content)element.removeAttribute('data-tour-current-page');});
    content?.setAttribute('data-tour-current-page','');
  };
  useEffect(()=>{if(!active)return;markPage();const observer=new MutationObserver(markPage);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();},[location,!!active]);
  const finish = useCallback((complete=false) => {
    setActive(null); setTarget(null); setPaused(false);
    if (complete && storageKey) { sessionStorage.removeItem(storageKey); setResume(null); }
    else if (storageKey) setResume(parseTourProgress(sessionStorage.getItem(storageKey)));
    if (complete) toast({ title:t('guided_tours.completed','Tour completed') });
    requestAnimationFrame(() => focusReturn.current?.isConnected && focusReturn.current.focus());
  },[storageKey,t,toast]);
  const advance = useCallback((bindings?:TourBindings) => {
    if (progressing.current) return;
    const current = activeRef.current;
    if (!current) return;
    progressing.current = true;
    if (current.index + 1 >= current.tour.definition.steps.length) { finish(true); return; }
    setTarget(null);
    setActive({ ...current,index:current.index+1,bindings:bindings || current.bindings });
  },[finish]);
  useEffect(() => {
    setActive(null); setTarget(null); setOpen(false);
    setResume(storageKey ? parseTourProgress(sessionStorage.getItem(storageKey)) : null);
  },[storageKey]);
  useEffect(() => {
    if (active && storageKey && !active.preview) sessionStorage.setItem(storageKey,JSON.stringify({ id:active.tour.id,revision:active.tour.revision,index:active.index,bindings:active.bindings }));
  },[active,storageKey]);
  useEffect(() => {
    if (active && !active.preview && query.isSuccess && !query.data.some(item => item.id === active.tour.id && !item.unavailable?.some(reason=>!(reason==='limit_flows' && active.bindings.flow)))) {
      setPaused(true); setTarget(null);
    }
  },[query.data,query.isSuccess,active?.tour.id]);
  const start = (tour:GuidedTour, preview=false, index=0, bindings:TourBindings={}) => {
    if (!preview && (tour.unavailable?.length || needsRecord(tour))) return;
    if (index >= tour.definition.steps.length) return;
    setOpen(false); setPaused(false); setTarget(null); setActive({ tour,index,bindings,preview });
  };
  const resumeTour = async () => {
    if (!resume) return;
    try {
      const tour:GuidedTour = await (await apiRequest('POST',`/api/guided-tours/${resume.id}/revisions/${resume.revision}/resume`,{index:resume.index,bindings:resume.bindings})).json();
      tour.unavailable=tour.unavailable?.filter(reason=>!(reason==='limit_flows' && resume.bindings.flow));
      if (tour.unavailable?.length) throw new Error();
      start(tour,false,resume.index,resume.bindings);
    } catch { toast({ title:t('guided_tours.resume_unavailable','This tour cannot be resumed. Start a current tour instead.'),variant:'destructive' }); }
  };
  const retryStep=async()=>{
    if(!active)return;
    if(!active.preview){
      const result=await query.refetch();
      const eligible=result.data?.find(item=>item.id===active.tour.id);
      if(result.isError || !eligible || eligible.unavailable?.some(reason=>!(reason==='limit_flows' && active.bindings.flow))){
        toast({title:t('guided_tours.resume_unavailable','This tour cannot be resumed. Start a current tour instead.'),variant:'destructive'});return;
      }
    }
    setPaused(false);setAttempt(value=>value+1);
  };
  const step = active?.tour.definition.steps[active.index];
  // Joyride's deferred position calculations must resolve the live target each
  // time: passing an HTMLElement retains detached dialog/route nodes between renders.
  const joyrideTarget = useCallback(() => {
    if (!target?.isConnected) return null;
    // Whole-form instructions belong by the heading, not over the fixed Save
    // footer when there is no room outside a tall mobile dialog.
    if (target.matches('[role="dialog"],[role="alertdialog"]')) {
      const headingId=target.getAttribute('aria-labelledby')?.split(' ')[0];
      const heading=headingId && document.getElementById(headingId);
      if(heading && target.contains(heading))return heading;
    }
    return target;
  }, [target]);
  useEffect(()=>{
    if(!active || !step || !target || paused)return;
    let missingSince=0;
    const check=()=>{
      if(target.isConnected && target.getClientRects().length){missingSince=0;setTargetReady(true);return;}
      setTargetReady(false);
      const selector=bindTourValue(step.target,active.bindings),replacement=selector && visibleTourTarget(selector);
      if(replacement){setTarget(replacement);setTargetReady(true);return;}
      missingSince ||= Date.now();
      if(Date.now()-missingSince>=12000){setPaused(true);setTarget(null);}
    };
    check();const timer=window.setInterval(check,250);
    const observer=new MutationObserver(check);
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>{clearInterval(timer);observer.disconnect();};
  },[active?.index,target,paused]);
  useEffect(()=>{
    if(!active){setMenuOpen(false);return;}
    // Radix portaled menus and nested dialogs own pointer/focus handling until they close.
    // Suspend Joyride rendering, preserving its controlled step and completion subscription.
    const check=()=>{
      const popupOpen=[...document.querySelectorAll<HTMLElement>('[role="listbox"],[role="menu"],[data-radix-popper-content-wrapper] [role="dialog"][data-state="open"]')].some(element=>element.getClientRects().length>0);
      const topDialog=[...document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"][data-state="open"],[data-slot="alert-dialog-content"][data-state="open"]')].filter(element=>element.getClientRects().length>0).at(-1);
      setMenuOpen(popupOpen || !!(topDialog && target && !topDialog.contains(target)));
    };
    check();const observer=new MutationObserver(check);observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-state','hidden']});
    return()=>observer.disconnect();
  },[!!active,target]);
  const portal=target?.closest<HTMLElement>('[role="dialog"],[role="alertdialog"]') || (paused?[...document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"][data-state="open"],[data-slot="alert-dialog-content"][data-state="open"]')].at(-1):undefined);
  // A modal form is one interaction scope: its scrollbar, labels, validation,
  // footer and related fields must remain usable. Keep the tooltip anchored to
  // the configured target while Joyride highlights the active dialog.
  const joyrideSpotlight = useCallback(() => {
    if (!target?.isConnected) return null;
    return target.closest<HTMLElement>('[role="dialog"],[role="alertdialog"]') || target;
  }, [target]);
  useLayoutEffect(()=>{
    if(!portal)return;
    // Transforms AND dark-theme backdrop blur create fixed-position containing
    // blocks. Keep Joyride in the modal focus scope, but let its SVG use viewport
    // coordinates. Restore the dialog's visual effects when the tour detaches.
    const properties=['transform','translate','left','top','animation','transition','filter','backdrop-filter','-webkit-backdrop-filter'] as const;
    const saved=properties.map(property=>[property,portal.style.getPropertyValue(property),portal.style.getPropertyPriority(property)] as const);
    const rect=portal.getBoundingClientRect();
    portal.style.setProperty('transition','none','important');
    portal.style.transform='none';portal.style.translate='none';portal.style.animation='none';
    for(const property of ['filter','backdrop-filter','-webkit-backdrop-filter'])portal.style.setProperty(property,'none','important');
    portal.style.left=`${rect.left}px`;portal.style.top=`${rect.top}px`;
    const host=document.createElement('div');host.setAttribute('data-tour-portal','');
    Object.assign(host.style,{position:'fixed',inset:'0',width:'100vw',height:'100vh',pointerEvents:'none',zIndex:'10000'});
    portal.appendChild(host);setPortalRoot(host);
    const center=()=>{portal.style.left=`${Math.max(0,(window.innerWidth-portal.offsetWidth)/2)}px`;portal.style.top=`${Math.max(0,(window.innerHeight-portal.offsetHeight)/2)}px`;};
    const observer=new ResizeObserver(center);observer.observe(portal);window.addEventListener('resize',center);
    return()=>{host.remove();setPortalRoot(null);observer.disconnect();window.removeEventListener('resize',center);for(const[property,value,priority]of saved){if(value)portal.style.setProperty(property,value,priority);else portal.style.removeProperty(property);}};
  },[portal]);
  useEffect(() => {
    if (!active || !step?.followDialogs || paused) return;
    const updateScope=() => {
      const dialogs=[...document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"][data-state="open"]')].filter(item=>item.getClientRects().length>0);
      const selector=bindTourValue(step.target,active.bindings);
      const next=dialogs.at(-1) || (selector && visibleTourTarget(selector));
      if(next)setTarget(current=>current===next?current:next);
    };
    const observer=new MutationObserver(updateScope);observer.observe(document.body,{subtree:true,childList:true});
    return()=>observer.disconnect();
  },[active?.tour.id,active?.index,paused]);
  useEffect(() => {
    if (!active || !step || paused) return;
    let disposed=false;
    progressing.current=false; armed.current=false; enteredAt.current=Date.now(); setTarget(null);
    if (step.prepare.includes('sidebar')) setSidebarCollapsed(false);
    if (step.prepare.includes('erp-menu')) document.querySelector<HTMLElement>('[data-tour="erp-menu"][aria-expanded="false"]')?.click();
    const boundRoute = step.route && bindTourValue(step.route,active.bindings);
    const route = boundRoute && resolveTourRoute(boundRoute,window.location.pathname+window.location.search);
    if (route && window.location.pathname + window.location.search !== route && !route.includes(':')) navigate(route);
    const started=Date.now();
    let lastRect='', stableSince=0;
    let scrolledTarget:HTMLElement | null=null;
    const locate = () => {
      if (disposed) return;
      markPage();
      if(step.target.startsWith('[data-tour-node-type=') && window.innerWidth<768)document.querySelector<HTMLElement>('[data-tour="pages-flow-builder.button.flow_builder.close_node_panel"][aria-expanded="false"]')?.click();
      const tab=route && new URL(route,window.location.origin).searchParams.get('tab');
      if (tab) {
        const prefix=route.startsWith('/erp/settings')?'pages-erp-settings':route.startsWith('/erp/dental/patients/')?'pages-erp-dental-patient-detail':'pages-settings';
        const trigger=document.querySelector<HTMLElement>(`[data-tour="${prefix}.tabstrigger.${CSS.escape(tab)}"]`);
        if(trigger && trigger.getAttribute('data-state')!=='active')trigger.click();
      }
      const selector=bindTourValue(step.target,active.bindings);
      const modal=step.followDialogs ? [...document.querySelectorAll<HTMLElement>('[data-slot="dialog-content"][data-state="open"]')].filter(item=>item.getClientRects().length>0).at(-1) : null;
      const found=modal || (selector && visibleTourTarget(selector));
      if (found) {
        // Settle the modal's own scrolling container before mounting the tour.
        // Joyride's page scrolling must not compete with Radix's scroll lock.
        if(found!==scrolledTarget && found.closest('[role="dialog"],[role="alertdialog"]')){
          found.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
          scrolledTarget=found;
        }
        const bounds=found.getBoundingClientRect();
        const rect=[bounds.x,bounds.y,bounds.width,bounds.height].map(value=>Math.round(value)).join(':');
        if(rect!==lastRect){lastRect=rect;stableSince=Date.now();}
        if(Date.now()-stableSince>=300){setTarget(found);return;}
      }
      if (Date.now()-started > 12000) { setPaused(true); return; }
      timer=window.setTimeout(locate,100);
    };
    let timer=window.setTimeout(locate,150);
    return () => { disposed=true; clearTimeout(timer); };
  },[active?.tour.id,active?.index,attempt,paused]);
  useEffect(() => {
    if (!active || !step || paused) return;
    if (routeCompletesStep(step,fullRoute,active.bindings)) advance();
  },[fullRoute,active?.index,paused]);
  useEffect(() => {
    if (!active || !step || paused) return;
    const current=active;
    const arm=(event:Event)=>{if(target && event.target instanceof Node && target.contains(event.target))armed.current=true;};
    const unsubscribe=subscribeTourSignals(signal => {
      if (!armed.current) return;
      if (!signalCompletesStep(step,signal,current.bindings,enteredAt.current)) return;
      // Only the current page's operation can complete the active task.
      if (signal.path !== window.location.pathname) return;
      const bindings={ ...current.bindings };
      if (step.completion.type === 'signal' && step.completion.capture && signal.resourceId) bindings[step.completion.capture]=signal.resourceId;
      advance(bindings);
    });
    const listener=(event:Event) => {
      const completion=step.completion;
      if (!target || (completion.type !== 'click' && completion.type !== 'change')) return;
      const selector=bindTourValue(completion.selector || step.target,current.bindings);
      const element=selector && visibleTourTarget(selector);
      if (!element || !(event.target instanceof Node) || !element.contains(event.target)) return;
      if (completion.type === 'click' && event.type === 'click') window.setTimeout(() => { if (!event.defaultPrevented) advance(); },0);
      if (completion.type === 'change' && event.type === 'change') {
        const input=event.target as HTMLInputElement;
        if ((!completion.nonEmpty || input.value?.trim()) && (!input.checkValidity || input.checkValidity())) advance();
      }
    };
    const initialText=target?.textContent;
    const selectionObserver=new MutationObserver(()=>{
      if(armed.current && step.completion.type==='change' && target?.getAttribute('role')==='combobox' && target.getAttribute('data-state')==='closed' && target.textContent!==initialText)advance();
    });
    if(target)selectionObserver.observe(target,{subtree:true,childList:true,characterData:true,attributes:true});
    document.addEventListener('pointerdown',arm,true);document.addEventListener('click',arm,true);document.addEventListener('keydown',arm,true);
    document.addEventListener('click',listener); document.addEventListener('change',listener);

    return () => { unsubscribe();selectionObserver.disconnect();document.removeEventListener('pointerdown',arm,true);document.removeEventListener('click',arm,true);document.removeEventListener('keydown',arm,true); document.removeEventListener('click',listener); document.removeEventListener('change',listener); };
  },[active?.index,active?.tour.id,paused,target,advance,finish]);
  useEffect(()=>{if(!active)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish();}};document.addEventListener('keydown',escape,true);return()=>document.removeEventListener('keydown',escape,true);},[!!active,finish]);
  const steps:Step[] = active ? active.tour.definition.steps.map((item,index) => ({
    id:item.id, target:index === active.index ? joyrideTarget : bindTourValue(item.target,active.bindings) || '[data-tour-missing]',
    title:t(`guided_tour_${active.tour.id}_${active.tour.revision}.${item.id}_title`,text(item.title)), content:<div dir={currentLanguage?.direction || 'ltr'} className="space-y-3 text-start text-sm">
      <p className="whitespace-pre-wrap">{t(`guided_tour_${active.tour.id}_${active.tour.revision}.${item.id}_content`,text(item.content))}</p>
      {item.consequential && <p className="rounded-md border border-border bg-muted p-2">{t('guided_tours.real_action','This changes real application data. Review the details before confirming.')}</p>}
      {item.completion.type !== 'next' && <p role="status" className="text-xs text-muted-foreground">{t('guided_tours.perform_action','Complete the highlighted action to continue.')}</p>}
      <TourMedia items={item.media} namespace={`guided_tour_${active.tour.id}_${active.tour.revision}`} />
    </div>, placement:index===active.index && target?.matches('[role="dialog"],[role="alertdialog"]') ? 'top' : item.placement, buttons:item.completion.type === 'next' ? ['primary','close'] : ['close'],
    spotlightTarget:index===active.index ? joyrideSpotlight : undefined,
    skipScroll:index===active.index && !!portal,
    skipBeacon:true, blockTargetInteraction:false, disableFocusTrap:item.completion.type !== 'next',
    floatingOptions:{shiftOptions:{crossAxis:true,padding:12,boundary:[]},flipOptions:index===active.index && target?.matches('[role="dialog"],[role="alertdialog"]') ? false : {boundary:[]}},
  })) : [];
  const onEvent=(event:EventData) => {
    if ([ACTIONS.SKIP].includes(event.action as any)) { finish(); return; }
    if (event.type === EVENTS.TARGET_NOT_FOUND && step?.completion.type==='signal' && armed.current) {setTargetReady(false);return;}
    if (event.type === EVENTS.TARGET_NOT_FOUND || event.type === EVENTS.ERROR) { setPaused(true); setTarget(null); return; }
    // Joyride can report a primary click during auto-scroll through SCROLL_END before STEP_AFTER.
    if ((event.type === EVENTS.STEP_AFTER || event.type === EVENTS.SCROLL_END) && event.action === ACTIONS.NEXT && event.index === active?.index && step?.completion.type === 'next') advance();
  };
  const matchingTours=tours.filter(tour=>`${tourText(tour,'title')} ${tourText(tour,'description')}`.toLowerCase().includes(search.toLowerCase()));
  const featureGroups=[...new Set(matchingTours.map(tour=>tour.definition.feature))];
  return <Context.Provider value={{ openHelp,preview:tour => start(tour,true),running:!!active }}>
    {children}
    <TourAuthoringBar />
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-3xl" closeButtonLabel={t('common.close','Close')}>
        <DialogHeader><DialogTitle>{t('guided_tours.title','Guided tours')}</DialogTitle><DialogDescription>{t('guided_tours.description','Learn by following the steps in your workspace.')}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          {active && <Button variant="outline" onClick={() => { setOpen(false); finish(); }}>{t('guided_tours.exit','Exit tour')}</Button>}
          {!active && resume && <Button variant="outline" onClick={resumeTour}>{t('guided_tours.resume','Resume tour')}</Button>}
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('guided_tours.search','Search tours')} aria-label={t('guided_tours.search','Search tours')} /></div>
          {query.isPending ? <p role="status">{t('common.loading','Loading…')}</p> : query.isError ? <div role="alert"><p>{t('guided_tours.unavailable','Could not load guided tours.')}</p><Button onClick={() => query.refetch()}>{t('common.retry','Retry')}</Button></div> : <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
            <nav aria-label={t('guided_tours.title','Guided tours')} className="max-h-[45vh] space-y-3 overflow-y-auto">{featureGroups.map(featureId=><section key={featureId} className="space-y-1"><h4 className="px-3 text-xs font-semibold text-muted-foreground">{t(`guided_tours.feature_${featureId}`,TOUR_FEATURES.find(feature=>feature.id===featureId)?.label||featureId)}</h4>{matchingTours.filter(tour=>tour.definition.feature===featureId).map(tour=><Button key={tour.id} variant={chosen?.id===tour.id?'secondary':'ghost'} className="h-auto w-full justify-start whitespace-normal text-start" aria-pressed={chosen?.id===tour.id} onClick={()=>setSelected(tour.id)}>{tourText(tour,'title')}</Button>)}</section>)}{!matchingTours.length&&<p className="px-3 text-sm">{t('guided_tours.no_matches','No matching tours.')}</p>}</nav>
            {chosen ? <section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">{tourText(chosen,'title')}</h3><p className="text-sm text-muted-foreground">{tourText(chosen,'description')}</p><p className="text-xs">{chosen.definition.steps.length} {t('guided_tours.steps','steps')}</p>
              {chosen.definition.steps.some(item => item.consequential) && <p className="rounded-md bg-muted p-2 text-sm">{t('guided_tours.real_notice','This tour uses your real workspace. Records you save, messages you send, and settings you change take effect normally.')}</p>}
              {chosen.unavailable?.map(reason => <p key={reason} role="status" className="text-sm text-destructive">{t(`guided_tours.prerequisite_${reason}`,reason === 'channel' ? 'Connect a channel in Settings before starting this tour.' : 'An active subscription is required.')}</p>)}
              {needsRecord(chosen) && <p role="status" className="text-sm text-muted-foreground">{t("guided_tours.open_record","Open the relevant record or email channel first, then open Help again.")}</p>}<TourMedia items={chosen.definition.media} namespace={`guided_tour_${chosen.id}_${chosen.revision}`}/><Button disabled={!!active || !!chosen.unavailable?.length || needsRecord(chosen)} onClick={() => start(chosen)}>{t('guided_tours.start','Start tour')}</Button>
            </section> : <p>{t('guided_tours.empty','No tours are available for your access level.')}</p>}
          </div>}
        </div>
      </DialogContent>
    </Dialog>
    {active && !paused && !menuOpen && targetReady && target && (!portal || portalRoot) && <TourErrorBoundary onError={()=>{setPaused(true);setTarget(null);}}><Joyride key={`${active.tour.id}:${active.tour.revision}`} run continuous stepIndex={active.index} steps={steps} onEvent={onEvent} portalElement={portalRoot}
      locale={{ back:t('common.back','Back'),close:t('guided_tours.exit','Exit tour'),last:t('guided_tours.finish','Finish'),next:t('common.next','Next'),skip:t('guided_tours.exit','Exit tour') }}
      options={{ closeButtonAction:'skip',dismissKeyAction:false,overlayClickAction:false,backgroundColor:'hsl(var(--popover))',textColor:'hsl(var(--popover-foreground))',primaryColor:'hsl(var(--primary))',arrowColor:'hsl(var(--popover))',zIndex:10000,spotlightRadius:6,targetWaitTimeout:12000 }}
      styles={{ overlay:portal?{position:'absolute',width:'100%',height:'100%'}:{},tooltip:{ pointerEvents:'auto',borderRadius:'var(--radius)',fontFamily:'inherit',maxWidth:'min(420px,calc(100vw - 24px))',border:'1px solid hsl(var(--border))' },tooltipContent:{ padding:'12px 0',maxHeight:'55vh',overflowY:'auto' },buttonPrimary:{ borderRadius:'var(--radius)',background:'hsl(var(--primary))',color:'hsl(var(--primary-foreground))',padding:'8px 16px' } }} /></TourErrorBoundary>}
    {active && paused && createPortal(<div role="alert" style={{pointerEvents:'auto'}} className="fixed bottom-4 left-1/2 z-[10001] w-[min(440px,calc(100vw-24px))] -translate-x-1/2 space-y-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg"><p>{t('guided_tours.target_missing','The next control is not available. Open the required page or dialog, then retry.')}</p><div className="flex gap-2"><Button onClick={retryStep}>{t('common.retry','Retry')}</Button><Button variant="outline" onClick={() => finish()}>{t('guided_tours.exit','Exit tour')}</Button></div></div>,portalRoot||document.body)}
  </Context.Provider>;
}

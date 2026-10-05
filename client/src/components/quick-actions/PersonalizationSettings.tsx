import { lazy, Suspense, useEffect, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel } from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { QUICK_ACTION_CATALOG, defaultPersonalization, personalizationSchema, quickShortcutSchema, type QuickShortcut } from '@shared/quick-actions';
import { useQuickSettings } from './use-quick-settings';
import { QuickActionIcon } from './QuickActionIcon';
import { ShortcutGrid, useShortcutLabel } from './QuickActionsMenu';
const IconPicker = lazy(() => import('./IconPicker'));

export default function PersonalizationSettings() {
  const { user } = useAuth();
  return <PersonalizationEditor key={`${user?.companyId}:${user?.id}`} />;
}
function PersonalizationEditor() {
  const query = useQuickSettings(true);
  const [draft,setDraft] = useState<QuickShortcut[] | null>(null);
  const [editing,setEditing] = useState<QuickShortcut | null>(null);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState('');
  const { t } = useTranslation();
  const { toast } = useToast();
  const label = useShortcutLabel();
  const client = useQueryClient();
  // Only initialize a draft. Background refreshes must not replace local edits.
  useEffect(() => { if (draft === null && query.data) setDraft(query.data.shortcuts); }, [draft,query.data]);
  const items = draft || [];
  const dirty = !!query.data && JSON.stringify(items) !== JSON.stringify(query.data.shortcuts);
  const editable = !!query.data?.canManage && !saving && !query.isError;
  const availableIds = query.data?.availableIds || [];
  const move = (from: number,to: number) => { if (!editable || to < 0 || to >= items.length) return; const next=[...items]; next.splice(to,0,next.splice(from,1)[0]); setDraft(next); };
  async function save() {
    setError('');
    const parsed = personalizationSchema.safeParse({shortcuts:items});
    if (!parsed.success) { setError(t('personalization.invalid','Check the shortcut configuration.')); return; }
    setSaving(true);
    try {
      const saved = await (await apiRequest('PUT','/api/company-settings/personalization',parsed.data)).json();

      setDraft(saved.shortcuts);
      await client.invalidateQueries({queryKey:['personalization']});
      toast({title:t('personalization.saved','Shortcuts saved')});
    } catch { setError(t('personalization.save_error','Could not save shortcuts. Your changes are preserved.')); }
    finally { setSaving(false); }
  }
  function commitEdit() {
    if (!editing) return;
    let candidate = editing;
    if (candidate.kind === 'url') {
      try { const url=new URL(candidate.url,window.location.origin); if (url.origin === window.location.origin) candidate={...candidate,url:url.pathname+url.search+url.hash}; } catch { /* schema supplies localized error */ }
    }
    if (!quickShortcutSchema.safeParse(candidate).success) { setError(t('personalization.invalid','Check the shortcut configuration.')); return; }
    setDraft(items.some(s => s.id === candidate.id) ? items.map(s => s.id === candidate.id ? candidate : s) : [...items,candidate]);
    setEditing(null); setError('');
  }
  if (query.isPending) return <p role="status" className="p-6 text-sm">{t('personalization.loading','Loading shortcuts…')}</p>;
  if (!query.data) return <div className="space-y-3 p-6" role="alert"><p>{t('personalization.load_error','Could not load shortcuts.')}</p><Button onClick={() => query.refetch()}>{t('personalization.retry','Retry')}</Button></div>;
  return <div className="space-y-6 rounded-lg border bg-card p-4 text-card-foreground sm:p-6">
    <div><h2 className="text-lg font-semibold">{t('personalization.title','Personalization')}</h2><p className="mt-1 text-sm text-muted-foreground">{t('personalization.description','Configure company-wide shortcuts to pages, creation forms, and links.')}</p></div>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(260px,2fr)]">
      <section className="min-w-0 space-y-3" aria-label={t('personalization.quick_actions','Quick actions')}>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-sm font-semibold">{t('personalization.quick_actions','Quick actions')} <span className="font-normal text-muted-foreground">{items.length}/24</span></h3><Button size="sm" className="w-full sm:w-auto" disabled={!editable || items.length>=24} onClick={() => { setError(''); setEditing({id:crypto.randomUUID(),kind:'page',destinationId:availableIds.find(id => QUICK_ACTION_CATALOG.some(d => d.id===id && d.kind==='page')) || 'inbox',label:'',icon:'zap',opening:'default'}); }}><Plus className="mr-2 h-4 w-4"/>{t('personalization.add','Add shortcut')}</Button></div>
        <p className="text-xs text-muted-foreground">{t('personalization.reorder_hint','Drag to reorder, or use the move buttons. With a focused handle, press Space, arrow keys, then Space to drop.')}</p>
        <DragDropContext onDragStart={(_, { announce }) => announce(t('personalization.drag_started','Shortcut picked up. Use arrow keys to move.'))} onDragUpdate={(result, { announce }) => announce(t('personalization.drag_position','Position {{position}}', {position:String((result.destination?.index ?? result.source.index)+1)}))} onDragEnd={(result, { announce }) => { if (result.destination) move(result.source.index,result.destination.index); announce(t('personalization.drag_finished','Reordering finished.')); }} dragHandleUsageInstructions={t('personalization.reorder_hint','Drag to reorder, or use the move buttons. With a focused handle, press Space, arrow keys, then Space to drop.')}>
          <Droppable droppableId="company-shortcuts">{provided => <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">{items.map((s,index) => <Draggable key={s.id} draggableId={s.id} index={index} isDragDisabled={!editable} disableInteractiveElementBlocking>{(drag,snapshot) => <div ref={drag.innerRef} {...drag.draggableProps} className={`flex flex-wrap items-center gap-2 rounded-md border bg-background p-3 ${snapshot.isDragging ? 'ring-2 ring-ring' : ''}`}>
            <button type="button" {...drag.dragHandleProps} disabled={!editable} className="rounded p-1 text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" aria-label={t('personalization.reorder','Reorder shortcut') + ': '+label(s)}><GripVertical className="h-4 w-4"/></button><QuickActionIcon name={s.icon}/>
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{label(s)}</p>{s.kind!=='url' && !availableIds.includes(s.destinationId) && <p className="text-xs text-muted-foreground">{t('personalization.unavailable','Unavailable with your current permissions or company configuration.')}</p>}</div>
            <div className="ml-auto flex w-full items-center justify-end sm:w-auto">{[['up',ArrowUp,() => move(index,index-1),index===0],['down',ArrowDown,() => move(index,index+1),index===items.length-1],['edit',Pencil,() => { setError(''); setEditing({...s}); },false],['remove',Trash2,() => setDraft(items.filter(i => i.id!==s.id)),false]].map(([key,Icon,handler,disabled]) => { const Glyph=Icon as typeof Pencil; return <Button key={key as string} size="icon" variant="ghost" className="h-8 w-8" disabled={!editable || !!disabled} onClick={handler as () => void} aria-label={t('personalization.'+key, {up:'Move up',down:'Move down',edit:'Edit',remove:'Remove'}[key as string]!) + ': '+label(s)} title={t('personalization.'+key, {up:'Move up',down:'Move down',edit:'Edit',remove:'Remove'}[key as string]!)}><Glyph className="h-4 w-4"/></Button>; })}</div>
          </div>}</Draggable>)}{provided.placeholder}{!items.length && <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">{t('personalization.empty','No shortcuts configured.')}</p>}</div>}</Droppable>
        </DragDropContext>
      </section>
      <section className="self-start rounded-lg border bg-background p-4"><h3 className="mb-3 text-sm font-semibold">{t('personalization.preview','Menu preview')}</h3><div className="max-h-[60vh] overflow-y-auto"><ShortcutGrid shortcuts={items} preview/></div><p className="mt-3 text-xs text-muted-foreground">{t('personalization.preview_hint','Each user sees only the shortcuts they can access.')}</p></section>
    </div>
    {error && !editing && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {query.isError && <p role="alert" className="text-sm text-destructive">{t('personalization.load_error','Could not load shortcuts.')}</p>}
    <div className="flex flex-wrap items-center gap-2 border-t pt-4"><Button variant="outline" disabled={!editable} onClick={() => setDraft(defaultPersonalization().shortcuts)}>{t('personalization.reset','Reset to defaults')}</Button><span className="flex-1 text-xs text-muted-foreground" role="status">{dirty ? t('personalization.unsaved','Unsaved changes') : t('personalization.saved','Shortcuts saved')}</span><Button variant="outline" disabled={saving || !dirty} onClick={() => {setDraft(query.data.shortcuts);setError('');}}>{t('personalization.cancel_changes','Cancel changes')}</Button><Button disabled={!editable || !dirty} onClick={save}>{saving ? t('personalization.saving','Saving…') : t('personalization.save','Save changes')}</Button></div>
    <Dialog open={!!editing} onOpenChange={open => {if (!open) {setEditing(null);setError('');}}}><DialogContent className="max-w-xl" closeButtonLabel={t('common.close','Close')}><DialogHeader><DialogTitle>{t('personalization.edit_shortcut','Configure shortcut')}</DialogTitle><DialogDescription>{t('personalization.edit_description','Choose a destination, label, and icon. Actions open a form for you to complete.')}</DialogDescription></DialogHeader>
      {editing && <div className="space-y-4 py-4">
        <div className="space-y-2"><Label htmlFor="shortcut-type">{t('personalization.type','Type')}</Label><Select value={editing.kind} onValueChange={kind => {const common={id:editing.id,label:editing.label,icon:editing.icon,opening:editing.opening};setEditing(kind==='url' ? {...common,kind,url:''} : {...common,kind:kind as 'page'|'action',destinationId:QUICK_ACTION_CATALOG.find(d => d.kind===kind && availableIds.includes(d.id))?.id || ''});}}><SelectTrigger id="shortcut-type"><SelectValue/></SelectTrigger><SelectContent>{(['page','action','url'] as const).map(kind => <SelectItem key={kind} value={kind}>{t('personalization.type_'+kind,{page:'App page',action:'Action',url:'Custom URL'}[kind])}</SelectItem>)}</SelectContent></Select></div>
        {editing.kind==='url' ? <div className="space-y-2"><Label htmlFor="shortcut-url">{t('personalization.url','URL')}</Label><Input id="shortcut-url" value={editing.url} maxLength={2000} placeholder="https://example.com" onChange={e => setEditing({...editing,url:e.target.value})}/><p className="text-xs text-muted-foreground">{t('personalization.url_hint','Use an app path or an HTTP/HTTPS link.')}</p></div> : <div className="space-y-2"><Label htmlFor="shortcut-destination">{t('personalization.destination','Destination')}</Label><Select value={editing.destinationId || undefined} onValueChange={id => setEditing({...editing,destinationId:id,icon:QUICK_ACTION_CATALOG.find(d => d.id===id)!.icon})}><SelectTrigger id="shortcut-destination"><SelectValue placeholder={t('personalization.choose','Choose a destination')}/></SelectTrigger><SelectContent searchable searchPlaceholder={t('personalization.search_destinations','Search destinations')}>{['main','erp','dental','restaurant','settings'].map(group => <SelectGroup key={group} className="mt-2 first:mt-0"><SelectLabel className="pl-3 font-bold">{t('personalization.group_'+group,{main:'Workspace',erp:'ERP',dental:'Dental',restaurant:'Restaurant',settings:'Settings'}[group]!)}</SelectLabel>{QUICK_ACTION_CATALOG.filter(d => d.kind===editing.kind && d.group===group).map(d => <SelectItem key={d.id} className="pl-8 font-normal" value={d.id} disabled={!availableIds.includes(d.id)}>{t('personalization.destination.'+d.id,d.label)}</SelectItem>)}</SelectGroup>)}</SelectContent></Select></div>}
        <div className="space-y-2"><Label htmlFor="shortcut-label">{t('personalization.label','Custom label (optional)')}</Label><Input id="shortcut-label" value={editing.label} maxLength={40} onChange={e => setEditing({...editing,label:e.target.value})}/><p className="text-xs text-muted-foreground">{t('personalization.label_hint','Leave blank to use the translated default label.')} {editing.label.length}/40</p></div>
        <div className="space-y-2"><Label htmlFor="shortcut-opening">{t('personalization.opening','Open in')}</Label><Select value={editing.opening} onValueChange={opening => setEditing({...editing,opening:opening as QuickShortcut['opening']})}><SelectTrigger id="shortcut-opening"><SelectValue/></SelectTrigger><SelectContent>{(['default','same-tab','new-tab'] as const).map(mode => <SelectItem key={mode} value={mode}>{t('personalization.open_'+mode,{'default':'Default (external links in a new tab)','same-tab':'Current tab','new-tab':'New tab'}[mode])}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><p className="text-sm font-medium">{t('personalization.icon','Icon')}</p><Suspense fallback={<p>{t('personalization.loading','Loading shortcuts…')}</p>}><IconPicker value={editing.icon} onChange={icon => setEditing({...editing,icon})}/></Suspense></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => {setEditing(null);setError('');}}>{t('personalization.cancel','Cancel')}</Button><Button onClick={commitEdit} disabled={!editable}>{t('personalization.apply','Apply')}</Button></DialogFooter>
    </DialogContent></Dialog>
  </div>;
}

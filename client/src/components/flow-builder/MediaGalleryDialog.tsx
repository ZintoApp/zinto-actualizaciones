import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronUp, Copy, Download, ExternalLink, File, FileAudio, GripHorizontal, Image, Loader2, Maximize2, Minimize2, Pencil, RefreshCw, Trash2, Upload, Video, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import {
  collectDeclaredFlowVariableNames,
  normalizeFlowMediaVariableName,
  removeStaleInferredAiMediaVariables,
  type FlowMediaAsset,
} from '@shared/types/flow-media';

const ACCEPT = '.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.avi,.mp3,.wav,.ogg,.m4a,.aac,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const RESIZE_HANDLES: Array<{ direction: ResizeDirection; className: string }> = [
  { direction: 'n', className: 'left-3 right-3 top-0 h-1.5 cursor-n-resize' },
  { direction: 's', className: 'bottom-0 left-3 right-3 h-1.5 cursor-s-resize' },
  { direction: 'e', className: 'bottom-3 right-0 top-3 w-1.5 cursor-e-resize' },
  { direction: 'w', className: 'bottom-3 left-0 top-3 w-1.5 cursor-w-resize' },
  { direction: 'ne', className: 'right-0 top-0 h-3 w-3 cursor-ne-resize' },
  { direction: 'nw', className: 'left-0 top-0 h-3 w-3 cursor-nw-resize' },
  { direction: 'se', className: 'bottom-0 right-0 h-3 w-3 cursor-se-resize' },
  { direction: 'sw', className: 'bottom-0 left-0 h-3 w-3 cursor-sw-resize' },
];

interface MediaGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flowId?: number | null;
  ensureFlowId: () => Promise<number>;
  nodes: unknown[];
  customVariables: unknown[];
  onAssetsChange?: (assets: FlowMediaAsset[]) => void;
  onVariableTakeover?: (variableName: string) => void;
}

function kindIcon(kind: FlowMediaAsset['mediaKind']) {
  if (kind === 'image') return <Image className="h-5 w-5" />;
  if (kind === 'video') return <Video className="h-5 w-5" />;
  if (kind === 'audio') return <FileAudio className="h-5 w-5" />;
  return <File className="h-5 w-5" />;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MediaGalleryDialog({ open, onOpenChange, flowId, ensureFlowId, nodes, customVariables, onAssetsChange, onVariableTakeover }: MediaGalleryDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [assets, setAssets] = useState<FlowMediaAsset[]>([]);
  const [activeFlowId, setActiveFlowId] = useState<number | null>(flowId ?? null);
  const [variableName, setVariableName] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [position, setPosition] = useState(() => ({
    x: typeof window === 'undefined' ? 16 : Math.max(16, window.innerWidth - 556),
    y: 16,
  }));
  const [size, setSize] = useState(() => ({
    width: typeof window === 'undefined' ? 540 : Math.min(540, window.innerWidth - 32),
    height: typeof window === 'undefined' ? 760 : Math.min(760, window.innerHeight - 32),
  }));
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    direction: ResizeDirection;
    startX: number;
    startY: number;
    position: { x: number; y: number };
    size: { width: number; height: number };
  } | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const references = useMemo(() => JSON.stringify(nodes), [nodes]);
  const publish = (next: FlowMediaAsset[]) => {
    setAssets(next);
    onAssetsChange?.(next);
    window.dispatchEvent(new CustomEvent('flow-media-changed', { detail: next }));
  };

  const load = async (id: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/flows/${id}/media`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('flow_builder.media_gallery.load_failed_description', 'Failed to load media.'));
      publish(body.data || []);
    } catch (error) {
      toast({ title: t('flow_builder.media_gallery.load_failed', 'Could not load Media Gallery'), description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setActiveFlowId(flowId ?? null);
    if (open && flowId) void load(flowId);
    if (open && !flowId) publish([]);
  }, [open, flowId]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resize = resizeRef.current;
      if (resize && event.pointerId === resize.pointerId && !maximized) {
        event.preventDefault();
        const deltaX = event.clientX - resize.startX;
        const deltaY = event.clientY - resize.startY;
        const movesWest = resize.direction.includes('w');
        const movesEast = resize.direction.includes('e');
        const movesNorth = resize.direction.includes('n');
        const movesSouth = resize.direction.includes('s');
        let width = resize.size.width;
        let height = resize.size.height;
        let x = resize.position.x;
        let y = resize.position.y;

        if (movesEast) width = Math.min(Math.max(360, resize.size.width + deltaX), window.innerWidth - resize.position.x - 8);
        if (movesSouth) height = Math.min(Math.max(240, resize.size.height + deltaY), window.innerHeight - resize.position.y - 8);
        if (movesWest) {
          width = Math.min(Math.max(360, resize.size.width - deltaX), resize.position.x + resize.size.width - 8);
          x = resize.position.x + resize.size.width - width;
        }
        if (movesNorth) {
          height = Math.min(Math.max(240, resize.size.height - deltaY), resize.position.y + resize.size.height - 8);
          y = resize.position.y + resize.size.height - height;
        }

        setPosition({ x, y });
        setSize({ width, height });
        return;
      }
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId || maximized) return;
      event.preventDefault();
      const panelWidth = panelRef.current?.getBoundingClientRect().width ?? 320;
      setPosition({
        x: Math.min(Math.max(8, event.clientX - drag.offsetX), Math.max(8, window.innerWidth - Math.min(panelWidth, window.innerWidth - 16))),
        y: Math.min(Math.max(8, event.clientY - drag.offsetY), Math.max(8, window.innerHeight - 48)),
      });
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
      if (resizeRef.current?.pointerId === event.pointerId) resizeRef.current = null;
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [maximized]);

  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (maximized || event.button !== 0) return;
    const bounds = panelRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - bounds.left,
      offsetY: event.clientY - bounds.top,
    };
  };

  const startResize = (direction: ResizeDirection, event: React.PointerEvent<HTMLDivElement>) => {
    if (collapsed || maximized || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = panelRef.current?.getBoundingClientRect();
    if (!bounds) return;
    resizeRef.current = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      position: { x: bounds.left, y: bounds.top },
      size: { width: bounds.width, height: bounds.height },
    };
  };

  const copyVariable = async (asset: FlowMediaAsset) => {
    try {
      await navigator.clipboard.writeText(`{{${asset.variableName}}}`);
      setCopiedId(asset.id);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopiedId(null), 1600);
    } catch {
      toast({ title: t('flow_builder.media_gallery.copy_failed', 'Copy failed'), description: t('flow_builder.media_gallery.copy_failed_description', 'Could not copy the variable to the clipboard.'), variant: 'destructive' });
    }
  };

  const conflictsWithProtectedVariable = (name: string) => {
    const sanitizedNodes = removeStaleInferredAiMediaVariables(nodes, new Set([name]));
    return collectDeclaredFlowVariableNames(sanitizedNodes, customVariables).has(name);
  };

  const uploadFile = async (file: File, replaceAssetId?: number) => {
    if (!replaceAssetId && !/^[a-z][a-z0-9_]*$/.test(variableName.trim())) {
      toast({ title: t('flow_builder.media_gallery.invalid_variable', 'Invalid variable name'), description: t('flow_builder.media_gallery.invalid_variable_description', 'Use snake_case starting with a letter.'), variant: 'destructive' });
      return;
    }
    if (!replaceAssetId && conflictsWithProtectedVariable(variableName.trim())) {
      toast({ title: t('flow_builder.media_gallery.upload_failed', 'Upload failed'), description: 'Variable name conflicts with an existing flow variable.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const id = activeFlowId || flowId || await ensureFlowId();
      setActiveFlowId(id);
      const form = new FormData();
      form.append('file', file);
      if (!replaceAssetId) form.append('variableName', variableName.trim());
      const response = await fetch(
        replaceAssetId ? `/api/flows/${id}/media/${replaceAssetId}/file` : `/api/flows/${id}/media`,
        { method: replaceAssetId ? 'PUT' : 'POST', body: form },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('flow_builder.media_gallery.upload_failed', 'Upload failed'));
      if (replaceAssetId) publish(assets.map((asset) => asset.id === replaceAssetId ? body.data : asset));
      else {
        publish([...assets, body.data]);
        onVariableTakeover?.(body.data.variableName);
      }
      setVariableName('');
      toast({ title: replaceAssetId ? t('flow_builder.media_gallery.replaced', 'Media replaced') : t('flow_builder.media_gallery.uploaded', 'Media uploaded') });
    } catch (error) {
      toast({ title: t('flow_builder.media_gallery.upload_failed', 'Upload failed'), description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const saveRename = async (asset: FlowMediaAsset) => {
    const name = editingName.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      toast({ title: t('flow_builder.media_gallery.invalid_variable', 'Invalid variable name'), description: t('flow_builder.media_gallery.invalid_variable_description', 'Use snake_case starting with a letter.'), variant: 'destructive' });
      return;
    }
    if (conflictsWithProtectedVariable(name)) {
      toast({ title: t('flow_builder.media_gallery.rename_failed', 'Rename failed'), description: 'Variable name conflicts with an existing flow variable.', variant: 'destructive' });
      return;
    }
    if (name !== asset.variableName && references.includes(`{{${asset.variableName}}}`) &&
        !window.confirm(t('flow_builder.media_gallery.rename_reference_warning', '{{variable}} is referenced in this flow. Rename it without updating those references?', { variable: `{{${asset.variableName}}}` }))) {
      return;
    }
    const response = await fetch(`/api/flows/${asset.flowId}/media/${asset.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ variableName: name }),
    });
    const body = await response.json();
    if (!response.ok) {
      toast({ title: t('flow_builder.media_gallery.rename_failed', 'Rename failed'), description: body.error, variant: 'destructive' });
      return;
    }
    publish(assets.map((item) => item.id === asset.id ? body.data : item));
    onVariableTakeover?.(body.data.variableName);
    setEditingId(null);
  };

  const remove = async (asset: FlowMediaAsset) => {
    const token = `{{${asset.variableName}}}`;
    const used = references.includes(token);
    if (!window.confirm(used
      ? t('flow_builder.media_gallery.delete_reference_warning', '{{variable}} is referenced in this flow. Delete it anyway?', { variable: token })
      : t('flow_builder.media_gallery.delete_confirmation', 'Delete {{filename}}?', { filename: asset.originalName }))) return;
    const response = await fetch(`/api/flows/${asset.flowId}/media/${asset.id}`, { method: 'DELETE' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      toast({ title: t('flow_builder.media_gallery.delete_failed', 'Delete failed'), description: body.error, variant: 'destructive' });
      return;
    }
    publish(assets.filter((item) => item.id !== asset.id));
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby="flow-media-gallery-title"
      className={cn(
        'fixed z-[70] flex min-h-[52px] min-w-[300px] flex-col overflow-hidden rounded-lg border bg-background shadow-2xl',
        !collapsed && !maximized && 'max-h-[calc(100vh-16px)] max-w-[calc(100vw-16px)]',
      )}
      style={{
        left: maximized ? 16 : position.x,
        top: maximized ? 16 : position.y,
        width: maximized ? 'calc(100vw - 32px)' : size.width,
        height: collapsed ? 'auto' : maximized ? 'calc(100vh - 32px)' : size.height,
      }}
    >
      <div className="flex min-h-[52px] shrink-0 items-center border-b bg-muted/40 px-3">
        <div
          className={cn('flex min-w-0 flex-1 touch-none select-none items-center gap-2 py-3', maximized ? 'cursor-default' : 'cursor-move')}
          onPointerDown={startDrag}
        >
          <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span id="flow-media-gallery-title" className="truncate text-base font-semibold">{t('flow_builder.media_gallery.title', 'Media Gallery')}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.expand" type="button" size="icon" variant="ghost" className="h-8 w-8" title={collapsed ? t('flow_builder.media_gallery.expand', 'Expand gallery') : t('flow_builder.media_gallery.collapse', 'Collapse gallery')} aria-label={collapsed ? t('flow_builder.media_gallery.expand', 'Expand gallery') : t('flow_builder.media_gallery.collapse', 'Collapse gallery')} onClick={() => { setCollapsed((value) => !value); if (maximized) setMaximized(false); }}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.restore" type="button" size="icon" variant="ghost" className="h-8 w-8" title={maximized ? t('flow_builder.media_gallery.restore', 'Restore gallery') : t('flow_builder.media_gallery.maximize', 'Maximize gallery')} aria-label={maximized ? t('flow_builder.media_gallery.restore', 'Restore gallery') : t('flow_builder.media_gallery.maximize', 'Maximize gallery')} onClick={() => { setCollapsed(false); setMaximized((value) => !value); }}>
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.close" type="button" size="icon" variant="ghost" className="h-8 w-8" title={t('flow_builder.media_gallery.close', 'Close Media Gallery')} aria-label={t('flow_builder.media_gallery.close', 'Close Media Gallery')} onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!collapsed ? (
        <div className="company-sidebar-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input data-tour="components-flow-builder-mediagallerydialog.input.flow_builder.media_gallery.variable_placeholder" value={variableName} onChange={(event) => setVariableName(normalizeFlowMediaVariableName(event.target.value))} placeholder={t('flow_builder.media_gallery.variable_placeholder', 'variable_name (for example milk_bottle)')} aria-label={t('flow_builder.media_gallery.variable_label', 'Media variable name')} className="font-mono" />
              <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.upload" asChild size="icon" className="h-10 w-10" disabled={loading || !variableName.trim()}>
                <label className="cursor-pointer" title={t('flow_builder.media_gallery.upload', 'Upload media')} aria-label={t('flow_builder.media_gallery.upload', 'Upload media')}><Upload className="h-4 w-4" /><input data-tour="components-flow-builder-mediagallerydialog.input.flow_builder.media_gallery.upload" className="hidden" type="file" accept={ACCEPT} disabled={loading || !variableName.trim()} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); event.currentTarget.value = ''; }} /></label>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('flow_builder.media_gallery.file_help', 'Images, video, audio, PDF, Office, and text documents. Maximum 30 MB per file.')}</p>
          </div>

          {loading && assets.length === 0 ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div> : null}
          {!loading && assets.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t('flow_builder.media_gallery.empty', 'No media uploaded to this flow yet.')}</p> : null}
          <TooltipProvider delayDuration={200}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2">
              {assets.map((asset) => (
                <div key={asset.id} className="flex min-w-0 gap-2 rounded-lg border p-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted" tabIndex={0}>
                        {asset.mediaKind === 'image' ? <img src={asset.fileUrl} alt={asset.originalName} className="h-full w-full object-cover" /> : null}
                        {asset.mediaKind === 'video' ? <video src={asset.fileUrl} muted preload="metadata" className="h-full w-full object-cover" aria-label={asset.originalName} /> : null}
                        {asset.mediaKind === 'audio' || asset.mediaKind === 'document' ? kindIcon(asset.mediaKind) : null}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs break-all text-xs">{asset.originalName}</TooltipContent>
                  </Tooltip>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {editingId === asset.id ? (
                      <div className="flex gap-1"><Input data-tour="components-flow-builder-mediagallerydialog.input.flow_builder.media_gallery.variable_label" value={editingName} onChange={(event) => setEditingName(normalizeFlowMediaVariableName(event.target.value))} aria-label={t('flow_builder.media_gallery.variable_label', 'Media variable name')} className="h-8 font-mono text-xs" /><Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.save" size="sm" onClick={() => void saveRename(asset)}>{t('flow_builder.media_gallery.save', 'Save')}</Button></div>
                    ) : (
                      <div className="flex min-h-7 items-center gap-1">
                        <Badge variant="secondary" className="max-w-full truncate font-mono">{`{{${asset.variableName}}}`}</Badge>
                        <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.copied" size="icon" variant="ghost" className={cn('h-7 w-7 transition-all duration-200', copiedId === asset.id && 'scale-110 bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 hover:text-emerald-600')} title={copiedId === asset.id ? t('flow_builder.media_gallery.copied', 'Copied!') : t('flow_builder.media_gallery.copy_variable', 'Copy variable')} onClick={() => void copyVariable(asset)} aria-label={copiedId === asset.id ? t('flow_builder.media_gallery.variable_copied', 'Variable copied') : t('flow_builder.media_gallery.copy_variable', 'Copy variable')}>
                          {copiedId === asset.id ? <Check className="h-4 w-4 animate-in zoom-in spin-in-90 duration-200" /> : <Copy className="h-3.5 w-3.5" />}
                        </Button>
                        {copiedId === asset.id ? <span className="animate-in fade-in slide-in-from-left-1 text-xs font-medium text-emerald-600 duration-200">{t('flow_builder.media_gallery.copied', 'Copied!')}</span> : null}
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground"><span>{t(`flow_builder.media_gallery.kind_${asset.mediaKind}`, asset.mediaKind)}</span><span>{formatBytes(asset.fileSize)}</span></div>
                    <div className="flex items-center gap-0.5">
                      <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.preview" asChild size="icon" variant="ghost" className="h-7 w-7"><a href={asset.fileUrl} target="_blank" rel="noreferrer" title={t('flow_builder.media_gallery.preview', 'Preview')} aria-label={t('flow_builder.media_gallery.preview_file', 'Preview {{filename}}', { filename: asset.originalName })}><ExternalLink className="h-3.5 w-3.5" /></a></Button>
                      <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.download" asChild size="icon" variant="ghost" className="h-7 w-7"><a href={asset.fileUrl} download={asset.originalName} title={t('flow_builder.media_gallery.download', 'Download')} aria-label={t('flow_builder.media_gallery.download_file', 'Download {{filename}}', { filename: asset.originalName })}><Download className="h-3.5 w-3.5" /></a></Button>
                      <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.rename" size="icon" variant="ghost" className="h-7 w-7" title={t('flow_builder.media_gallery.rename', 'Rename variable')} aria-label={t('flow_builder.media_gallery.rename_variable', 'Rename {{variable}}', { variable: asset.variableName })} onClick={() => { setEditingId(asset.id); setEditingName(asset.variableName); }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.replace" asChild size="icon" variant="ghost" className="h-7 w-7" disabled={loading}><label className="cursor-pointer" title={t('flow_builder.media_gallery.replace', 'Replace file')} aria-label={t('flow_builder.media_gallery.replace_file', 'Replace {{filename}}', { filename: asset.originalName })}><RefreshCw className="h-3.5 w-3.5" /><input data-tour="components-flow-builder-mediagallerydialog.input.flow_builder.media_gallery.replace" className="hidden" type="file" accept={ACCEPT} disabled={loading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file, asset.id); event.currentTarget.value = ''; }} /></label></Button>
                      <Button data-tour="components-flow-builder-mediagallerydialog.button.flow_builder.media_gallery.delete" size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title={t('flow_builder.media_gallery.delete', 'Delete')} aria-label={t('flow_builder.media_gallery.delete_file', 'Delete {{filename}}', { filename: asset.originalName })} onClick={() => void remove(asset)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </TooltipProvider>
        </div>
      ) : null}
      {!collapsed && !maximized ? RESIZE_HANDLES.map((handle) => (
        <div
          key={handle.direction}
          aria-hidden="true"
          className={cn('absolute z-20 touch-none', handle.className)}
          onPointerDown={(event) => startResize(handle.direction, event)}
        />
      )) : null}
    </div>,
    document.body,
  );
}

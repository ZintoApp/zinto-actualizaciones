import {
  useCallback,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
  type JSX,
} from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FileUpload } from '@/components/ui/file-upload';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import {
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  Video as VideoIcon,
  FileAudio,
  File as FileIcon,
} from 'lucide-react';
import { nanoid } from 'nanoid';
import { MediaItem, MEDIA_ITEMS_MAX } from '@shared/types/node-types';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';
import { EnhancedVariablePicker } from './EnhancedVariablePicker';

export type MediaItemsEditorVariableButton = {
  name: string;
  description: string;
};

export interface MediaItemsEditorProps {
  items: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  isEditing: boolean;
  fileTypeAccept: string;
  itemTypeLabel: string;
  emptyLabel: string;
  maxFileSizeMB?: number;
  uploadEndpoint?: string;
  uploadTypeField?: string;
  enableUrlInput?: boolean;
  enableFileNameField?: boolean;
  showCaption?: boolean;
  variableButtons?: MediaItemsEditorVariableButton[];
  customVariables?: FlowCustomVariable[];
  flowId?: number;
}

type UploadResponse = {
  url: string;
  originalName?: string;
  mimetype?: string;
  size?: number;
};

function deriveFileNameFromUrl(url: string): string {
  const urlParts = url.split('/');
  return urlParts[urlParts.length - 1] || '';
}

function uploadOne(
  file: File,
  kind: string,
  opts: {
    endpoint: string;
    maxFileSizeMB: number;
    t: (key: string, fallback?: string, variables?: Record<string, unknown>) => string;
    toast: (args: {
      title?: string;
      description?: string;
      variant?: 'destructive';
    }) => void;
    onStart: () => void;
    onProgress: (pct: number) => void;
    onEndLoading: () => void;
    onSuccess: (response: UploadResponse) => void;
  }
): void {
  if (!file) {
    opts.toast({
      title: opts.t('flow_builder.error.no_file', 'No file selected'),
      description: opts.t('flow_builder.error.no_file_desc', 'Please select a file to upload'),
      variant: 'destructive',
    });
    return;
  }

  const maxBytes = opts.maxFileSizeMB * 1024 * 1024;
  if (file.size > maxBytes) {
    opts.toast({
      title: opts.t('flow_builder.error.file_too_large', 'File too large'),
      description: opts.t(
        'flow_builder.error.max_file_size',
        'Maximum file size is {{max}}MB',
        { max: opts.maxFileSizeMB }
      ),
      variant: 'destructive',
    });
    return;
  }

  opts.onStart();

  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', kind);

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener('progress', (event) => {
    if (event.lengthComputable) {
      const progress = Math.round((event.loaded / event.total) * 100);
      opts.onProgress(progress);
    }
  });

  xhr.addEventListener('load', () => {
    opts.onEndLoading();
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const response = JSON.parse(xhr.responseText) as UploadResponse;
        if (response.url) {
          opts.onSuccess(response);
        } else {
          opts.toast({
            title: opts.t('flow_builder.error.upload_failed', 'Upload failed'),
            description: opts.t(
              'flow_builder.error.upload_error',
              'An error occurred while uploading the file'
            ),
            variant: 'destructive',
          });
        }
      } catch {
        console.error('Error parsing upload response');
        opts.toast({
          title: opts.t('flow_builder.error.upload_failed', 'Upload failed'),
          description: opts.t(
            'flow_builder.error.upload_error',
            'An error occurred while uploading the file'
          ),
          variant: 'destructive',
        });
      }
    } else {
      let errorMessage = opts.t('flow_builder.error.upload_failed', 'Upload failed');
      try {
        const errorResponse = JSON.parse(xhr.responseText) as {
          error?: string;
          message?: string;
        };
        errorMessage =
          errorResponse.error || errorResponse.message || errorMessage;
      } catch {
        /* ignore */
      }
      opts.toast({
        title: opts.t('flow_builder.error.upload_failed', 'Upload failed'),
        description: errorMessage,
        variant: 'destructive',
      });
    }
  });

  xhr.addEventListener('error', () => {
    opts.onEndLoading();
    opts.toast({
      title: opts.t('flow_builder.error.upload_failed', 'Upload failed'),
      description: opts.t(
        'flow_builder.error.upload_error',
        'An error occurred while uploading the file'
      ),
      variant: 'destructive',
    });
  });

  xhr.addEventListener('timeout', () => {
    opts.onEndLoading();
    opts.toast({
      title: opts.t('flow_builder.error.upload_failed', 'Upload failed'),
      description: opts.t(
        'flow_builder.error.upload_error',
        'An error occurred while uploading the file'
      ),
      variant: 'destructive',
    });
  });

  xhr.timeout = 60000;
  xhr.open('POST', opts.endpoint);
  xhr.send(formData);
}

function KindIcon({
  kind,
  className,
}: {
  kind: 'image' | 'video' | 'audio' | 'document';
  className?: string;
}): JSX.Element {
  switch (kind) {
    case 'image':
      return <ImageIcon className={className} />;
    case 'video':
      return <VideoIcon className={className} />;
    case 'audio':
      return <FileAudio className={className} />;
    case 'document':
      return <FileIcon className={className} />;
  }
}

function videoPreviewSrc(url: string): string {
  const u = url.trim();
  if (!u || u.includes('#')) return u;
  if (u.startsWith('blob:')) return u;
  if (/^https?:\/\//i.test(u)) return `${u}#t=0.1`;
  return u;
}

function MediaItemAccordionPreview({
  mediaKind,
  item,
  title,
}: {
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  item: MediaItem;
  title: string;
}): JSX.Element {
  const url = item.mediaUrl?.trim() ?? '';
  const [mediaFailed, setMediaFailed] = useState(false);

  useEffect(() => {
    setMediaFailed(false);
  }, [url, mediaKind, item.id]);

  const placeholder = (
    <div
      className="flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted/60"
      title={title}
      aria-hidden
    >
      <KindIcon kind={mediaKind} className="h-4 w-4 text-muted-foreground" />
    </div>
  );

  if (!url || mediaFailed) {
    return placeholder;
  }

  const shellClass =
    'pointer-events-none h-9 w-16 shrink-0 overflow-hidden rounded border border-border bg-muted';

  if (mediaKind === 'image') {
    return (
      <div className={shellClass} title={title}>
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setMediaFailed(true)}
        />
      </div>
    );
  }

  if (mediaKind === 'video') {
    return (
      <div className={`relative ${shellClass}`} title={title}>
        <video
          src={videoPreviewSrc(url)}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
          onError={() => setMediaFailed(true)}
        />
      </div>
    );
  }

  if (mediaKind === 'audio') {
    return (
      <div
        className={`flex ${shellClass} items-center justify-center`}
        title={title}
        aria-hidden
      >
        <FileAudio className="h-5 w-5 text-primary" />
      </div>
    );
  }

  return (
    <div
      className={`flex ${shellClass} items-center justify-center`}
      title={title}
      aria-hidden
    >
      <FileIcon className="h-5 w-5 text-primary" />
    </div>
  );
}

function shortLabelFor(
  item: MediaItem,
  t: (key: string, fallback?: string, variables?: Record<string, unknown>) => string
): string {
  if (item.fileName?.trim()) return item.fileName.trim();
  if (item.originalName?.trim()) return item.originalName.trim();
  const url = item.mediaUrl?.trim();
  if (url) {
    try {
      const seg = url.split('/').filter(Boolean).pop();
      if (seg) return decodeURIComponent(seg);
    } catch {
      const seg = url.split('/').filter(Boolean).pop();
      if (seg) return seg;
    }
  }
  return t('flow_builder.media_items.item_fallback', 'Media item');
}

function formatVariablesText(text: string | undefined): ReactNode {
  if (text == null || text === '') return text ?? '';

  const regex = /\{\{([^}]+)\}\}/g;

  if (!regex.test(text)) {
    return text;
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  regex.lastIndex = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    parts.push(
      <span
        key={match.index}
        className="bg-primary/10 text-primary px-1 rounded"
      >
        {match[0]}
      </span>
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}

function uploadSuccessToast(
  mediaKind: 'image' | 'video' | 'audio' | 'document',
  t: (key: string, fallback?: string, variables?: Record<string, unknown>) => string,
  toastFn: (args: { title?: string; description?: string }) => void
): void {
  switch (mediaKind) {
    case 'image':
      toastFn({
        title: t('flow_builder.success.upload_complete', 'Upload complete'),
        description: t(
          'flow_builder.success.image_uploaded',
          'Image uploaded successfully'
        ),
      });
      break;
    case 'video':
      toastFn({
        title: t('flow_builder.video_upload_upload_complete', 'Upload complete'),
        description: t(
          'flow_builder.video_upload_upload_success',
          'Video uploaded successfully'
        ),
      });
      break;
    case 'audio':
      toastFn({
        title: t('flow_builder.audio_upload_upload_complete', 'Upload complete'),
        description: t(
          'flow_builder.audio_upload_upload_success',
          'Audio uploaded successfully'
        ),
      });
      break;
    case 'document':
      toastFn({
        title: t(
          'flow_builder.document_upload_upload_complete',
          'Upload complete'
        ),
        description: t(
          'flow_builder.document_upload_upload_success',
          'Document uploaded successfully'
        ),
      });
      break;
    default:
      toastFn({
        title: t('flow_builder.success.upload_complete', 'Upload complete'),
        description: t(
          'flow_builder.success.image_uploaded',
          'Image uploaded successfully'
        ),
      });
  }
}

function ImageThumbCell({
  url,
  alt,
}: {
  url: string;
  alt: string;
}): JSX.Element {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <ImageIcon className="h-5 w-5 text-muted-foreground" aria-hidden />
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      className="object-cover w-full h-full"
      onError={() => setFailed(true)}
    />
  );
}

export function MediaItemsEditor(props: MediaItemsEditorProps): JSX.Element {
  const {
    items,
    onChange,
    mediaKind,
    isEditing,
    fileTypeAccept,
    emptyLabel,
    maxFileSizeMB = 30,
    uploadEndpoint = '/api/upload',
    uploadTypeField,
    enableUrlInput = true,
    enableFileNameField = false,
    showCaption = true,
    variableButtons: _variableButtons = [],
    customVariables,
    flowId,
  } = props;

  const { t } = useTranslation();
  const { toast: toastFn } = useToast();

  const typeField = uploadTypeField ?? mediaKind;

  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [openItemId, setOpenItemId] = useState<string>('');

  const patchItem = useCallback(
    (id: string, patch: Partial<MediaItem>) => {
      onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    },
    [items, onChange]
  );

  const removeItem = useCallback(
    (id: string) => {
      if (openItemId === id) setOpenItemId('');
      onChange(items.filter((i) => i.id !== id));
    },
    [items, onChange, openItemId]
  );

  const moveItem = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = items.findIndex((i) => i.id === id);
      const j = idx + dir;
      if (idx < 0 || j < 0 || j >= items.length) return;
      const next = [...items];
      [next[idx], next[j]] = [next[j], next[idx]];
      onChange(next);
    },
    [items, onChange]
  );

  const addItem = useCallback(() => {
    if (items.length >= MEDIA_ITEMS_MAX) {
      toastFn({
        title: t('flow_builder.media_items.cap_reached', 'Maximum {{max}} items per node', {
          max: MEDIA_ITEMS_MAX,
        }),
      });
      return;
    }
    const newId = nanoid();
    onChange([...items, { id: newId, mediaUrl: '' }]);
    setOpenItemId(newId);
  }, [items, onChange, t, toastFn]);

  const sectionHeading = useMemo(() => {
    switch (mediaKind) {
      case 'image':
        return t('flow_builder.media_items.heading_image', 'Images');
      case 'video':
        return t('flow_builder.media_items.heading_video', 'Videos');
      case 'audio':
        return t('flow_builder.media_items.heading_audio', 'Audio');
      case 'document':
        return t('flow_builder.media_items.heading_document', 'Documents');
    }
  }, [mediaKind, t]);

  const countLabel = useMemo(
    () =>
      t('flow_builder.media_items.items_count', '{{count}} / {{max}}', {
        count: items.length,
        max: MEDIA_ITEMS_MAX,
      }),
    [items.length, t]
  );

  if (!isEditing) {
    const firstCaptioned = items.find(
      (i) => (i.caption ?? '').trim().length > 0
    );
    const captionedIndex = firstCaptioned
      ? items.indexOf(firstCaptioned)
      : -1;

    return (
      <div className="space-y-2">
        {items.length === 0 ? (
          mediaKind === 'image' || mediaKind === 'video' ? (
            <div className="aspect-video rounded flex items-center justify-center text-muted-foreground">
              <div className="text-center text-xs flex flex-col items-center gap-1">
                <KindIcon kind={mediaKind} className="h-6 w-6" />
                {emptyLabel}
              </div>
            </div>
          ) : (
            <div className="rounded border border-border bg-muted/30 px-3 py-2 flex items-center gap-2 text-muted-foreground text-xs">
              <KindIcon kind={mediaKind} className="h-5 w-5 shrink-0" />
              <span className="text-left">{emptyLabel}</span>
            </div>
          )
        ) : (
          <>
            <div className="flex items-center gap-1 flex-wrap">
              {items.slice(0, 4).map((item, idx) => (
                <div
                  key={item.id}
                  className="relative w-14 h-14 rounded overflow-hidden border border-border bg-muted/30 flex items-center justify-center"
                >
                  {mediaKind === 'image' && (
                    <ImageThumbCell
                      url={item.mediaUrl}
                      alt={t('flow_builder.media_items.preview_alt', 'Item {{n}} preview', {
                        n: idx + 1,
                      })}
                    />
                  )}
                  {mediaKind === 'video' &&
                    (item.mediaUrl ? (
                      <video
                        src={item.mediaUrl}
                        muted
                        preload="metadata"
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <VideoIcon className="h-5 w-5 text-muted-foreground" />
                    ))}
                  {(mediaKind === 'audio' || mediaKind === 'document') && (
                    <KindIcon
                      kind={mediaKind}
                      className="h-6 w-6 text-muted-foreground"
                    />
                  )}
                  <span className="absolute bottom-0.5 right-0.5 text-[9px] px-1 bg-background/80 rounded">
                    {idx + 1}
                  </span>
                </div>
              ))}
              {items.length > 4 && (
                <div className="w-14 h-14 rounded border border-border bg-muted/30 flex items-center justify-center text-xs font-medium text-muted-foreground">
                  {t('flow_builder.media_items.more_count', '+{{n}} more', {
                    n: items.length - 4,
                  })}
                </div>
              )}
            </div>

            {firstCaptioned && captionedIndex >= 0 && (
              <>
                <div className="text-xs text-muted-foreground">
                  {t('flow_builder.caption_label', 'Caption:')} (
                  {t('flow_builder.media_items.item_label', 'Item {{n}}', {
                    n: captionedIndex + 1,
                  })}
                  )
                </div>
                <div className="text-sm p-2 rounded border border-border line-clamp-2">
                  {formatVariablesText(firstCaptioned.caption)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{sectionHeading}</span>
        <span className="text-muted-foreground">({countLabel})</span>
      </div>

      <Accordion
        type="single"
        collapsible
        value={openItemId}
        onValueChange={(v) => setOpenItemId(v ?? '')}
        className="min-w-0 space-y-1"
      >
        {items.map((item, index) => (
          <AccordionItem
            key={item.id}
            value={item.id}
            className="min-w-0 overflow-hidden rounded border border-border"
          >
            <AccordionTrigger className="min-w-0 px-2 py-1.5 hover:no-underline">
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden pr-0.5">
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-primary text-xs font-medium text-white">
                  {index + 1}
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">
                    {t('flow_builder.media_items.item_label', 'Item {{n}}', {
                      n: index + 1,
                    })}{' '}
                    —{' '}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground">
                    {shortLabelFor(item, t)}
                  </span>
                </div>
                <MediaItemAccordionPreview
                  mediaKind={mediaKind}
                  item={item}
                  title={shortLabelFor(item, t)}
                />
                <div className="flex shrink-0 items-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === 0}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveItem(item.id, -1);
                          }}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          {t('flow_builder.media_items.move_up', 'Move up')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={index === items.length - 1}
                          onClick={(e) => {
                            e.stopPropagation();
                            moveItem(item.id, 1);
                          }}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          {t('flow_builder.media_items.move_down', 'Move down')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeItem(item.id);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="text-xs">
                          {t('flow_builder.media_items.remove_item', 'Remove item')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </AccordionTrigger>

            <AccordionContent className="px-2 pb-2 pt-1 space-y-2">
              <div>
                <label className="text-xs font-medium mb-1 block">
                  {t('flow_builder.media_items.upload_label', 'Upload:')}
                </label>
                <FileUpload
                  onFileSelected={(file) =>
                    uploadOne(file, typeField, {
                      endpoint: uploadEndpoint,
                      maxFileSizeMB,
                      t,
                      toast: toastFn,
                      onStart: () => {
                        setUploadingId(item.id);
                        setUploadProgress(0);
                      },
                      onProgress: setUploadProgress,
                      onEndLoading: () => {
                        setUploadingId(null);
                        setUploadProgress(0);
                      },
                      onSuccess: (response) => {
                        const derived =
                          mediaKind === 'document' && !item.fileName?.trim()
                            ? deriveFileNameFromUrl(response.url)
                            : undefined;
                        patchItem(item.id, {
                          mediaUrl: response.url,
                          originalName: response.originalName,
                          mimetype: response.mimetype,
                          size: response.size,
                          ...(derived ? { fileName: derived } : {}),
                        });
                        uploadSuccessToast(mediaKind, t, toastFn);
                      },
                    })
                  }
                  fileType={fileTypeAccept}
                  maxSize={maxFileSizeMB}
                  className="w-full"
                  showProgress={uploadingId === item.id}
                  progress={uploadingId === item.id ? uploadProgress : 0}
                />
              </div>

              {enableUrlInput && (
                <div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {t('flow_builder.media_items.url_label', 'Or enter URL:')}
                  </div>
                  <EnhancedVariablePicker
                    value={item.mediaUrl}
                    onChange={(value) =>
                      patchItem(item.id, {
                        mediaUrl: value,
                        originalName: '',
                        mimetype: '',
                        size: 0,
                      })
                    }
                    placeholder={t(
                      'flow_builder.media_items.url_placeholder',
                      'Enter URL or path'
                    )}
                    customVariables={customVariables}
                    flowId={flowId}
                    className="text-xs"
                  />
                  {!!item.mediaUrl && (
                    <button data-tour="components-flow-builder-mediaitemseditor.button.flow_builder.media_items.remove_media"
                      type="button"
                      className="w-full mt-2 px-3 py-1 text-xs bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 rounded hover:bg-red-200 dark:hover:bg-red-900/30 transition-colors"
                      onClick={() =>
                        patchItem(item.id, {
                          mediaUrl: '',
                          originalName: '',
                          mimetype: '',
                          size: 0,
                        })
                      }
                    >
                      {t(
                        'flow_builder.media_items.remove_media',
                        'Remove media'
                      )}
                    </button>
                  )}
                </div>
              )}

              {enableFileNameField && (
                <div>
                  <label className="text-xs font-medium mb-1 block">
                    {t(
                      'flow_builder.media_items.file_name_label',
                      'File name (optional)'
                    )}
                  </label>
                  <input data-tour="components-flow-builder-mediaitemseditor.input.flow_builder.media_items.file_name_label"
                    className="w-full p-2 text-sm border rounded"
                    value={item.fileName ?? ''}
                    onChange={(e) =>
                      patchItem(item.id, { fileName: e.target.value })
                    }
                    placeholder={t(
                      'flow_builder.media_items.file_name_placeholder',
                      'Enter file name (e.g. report.pdf)'
                    )}
                  />
                </div>
              )}

              {showCaption && (
                <div>
                  <label className="text-xs font-medium mb-1 block">
                    {t('flow_builder.caption_optional', 'Caption (optional):')}
                  </label>
                  <EnhancedVariablePicker
                    multiline
                    value={item.caption ?? ''}
                    onChange={(val) => patchItem(item.id, { caption: val })}
                    placeholder={t(
                      'flow_builder.media_items.caption_placeholder',
                      'Add a caption…'
                    )}
                    customVariables={customVariables}
                    flowId={flowId}
                    className="min-h-[60px] text-xs"
                  />
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      {items.length < MEDIA_ITEMS_MAX ? (
        <Button data-tour="components-flow-builder-mediaitemseditor.button.flow_builder.media_items.add_item"
          type="button"
          variant="ghost"
          size="sm"
          className="group h-8 text-xs w-full justify-center rounded-md border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
          onClick={addItem}
        >
          <Plus className="h-3 w-3 mr-1 shrink-0 text-primary" />
          <span className="motion-safe:animate-media-add-attention group-hover:animate-none group-focus-visible:animate-none">
            {t('flow_builder.media_items.add_item', 'Add item')}
          </span>
        </Button>
      ) : (
        <p className="text-[10px] text-muted-foreground text-center">
          {t('flow_builder.media_items.cap_reached', 'Maximum {{max}} items per node', {
            max: MEDIA_ITEMS_MAX,
          })}
        </p>
      )}
    </div>
  );
}

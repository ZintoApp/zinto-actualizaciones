import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { NodeResizer, useReactFlow, useUpdateNodeInternals, type NodeProps } from 'reactflow';
import { Pin, PinOff } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { useFlowContext } from '../../pages/flow-builder';
import { NodeToolbar } from './NodeToolbar';
import { FlowNotesEditor } from './FlowNotesEditor';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  NOTES_COLOR_PRESETS,
  NOTES_DEFAULT_HEIGHT,
  NOTES_DEFAULT_WIDTH,
  NOTES_FLOW_NODE_ICON_SRC,
  NOTES_IDLE_MIN_HEIGHT,
  NOTES_IDLE_MIN_WIDTH,
  NOTES_MIN_HEIGHT,
  NOTES_MIN_WIDTH,
  normalizeNotesBackgroundColor,
  type NotesBackgroundColor,
} from './notes-node-colors';

const NOTES_CHROME_HEIGHT_ACTIVE = 118;

export interface NotesNodeData {
  label?: string;
  title?: string;
  body?: string;
  backgroundColor?: NotesBackgroundColor;
  pinned?: boolean;
  width?: number;
  height?: number;
}

export function NotesNode({ id, data, selected }: NodeProps<NotesNodeData>) {
  const { t } = useTranslation();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const { onDeleteNode, onDuplicateNode } = useFlowContext();

  const [title, setTitle] = useState(data.title || t('flow_builder.notes_default_title', 'Note'));
  const [body, setBody] = useState(data.body || '');
  const [backgroundColor, setBackgroundColor] = useState<NotesBackgroundColor>(
    normalizeNotesBackgroundColor(data.backgroundColor)
  );
  const [pinned, setPinned] = useState(Boolean(data.pinned));
  const [width, setWidth] = useState(data.width || NOTES_DEFAULT_WIDTH);
  const [height, setHeight] = useState(data.height || NOTES_DEFAULT_HEIGHT);
  const [idleSize, setIdleSize] = useState<{ width: number; height: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const idleMeasureRef = useRef<HTMLDivElement>(null);
  const colorPreset = NOTES_COLOR_PRESETS[backgroundColor];

  // Single-click selects only; edit mode requires an explicit double-click.
  useEffect(() => {
    if (!selected) setIsEditing(false);
  }, [selected]);

  useEffect(() => {
    if (!isEditing) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsEditing(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditing]);

  const updateNode = useCallback(
    (updates: Partial<NotesNodeData>, nodeUpdates?: { draggable?: boolean; style?: CSSProperties }) => {
      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;
          return {
            ...node,
            draggable: nodeUpdates?.draggable ?? node.draggable,
            style: nodeUpdates?.style ? { ...node.style, ...nodeUpdates.style } : node.style,
            data: {
              ...node.data,
              ...updates,
            },
          };
        })
      );
    },
    [id, setNodes]
  );

  const updateSize = useCallback(
    (nextWidth: number, nextHeight: number, persist = true) => {
      const clampedWidth = Math.max(NOTES_MIN_WIDTH, Math.round(nextWidth));
      const clampedHeight = Math.max(NOTES_MIN_HEIGHT, Math.round(nextHeight));
      setWidth(clampedWidth);
      setHeight(clampedHeight);
      if (persist) {
        updateNode(
          { width: clampedWidth, height: clampedHeight },
          { style: { width: clampedWidth, height: clampedHeight } }
        );
      } else {
        updateNode({}, { style: { width: clampedWidth, height: clampedHeight } });
      }
    },
    [updateNode]
  );

  const handleTitleChange = (value: string) => {
    setTitle(value);
    updateNode({ title: value });
  };

  const handleBodyChange = (value: string) => {
    setBody(value);
    updateNode({ body: value });
  };

  const handleBackgroundColorChange = (color: NotesBackgroundColor) => {
    setBackgroundColor(color);
    updateNode({ backgroundColor: color });
  };

  const handlePinnedToggle = () => {
    const nextPinned = !pinned;
    setPinned(nextPinned);
    updateNode({ pinned: nextPinned }, { draggable: !nextPinned });
  };

  const handleContentHeightChange = useCallback(
    (contentHeight: number) => {
      if (!isEditing) return;
      const neededHeight = contentHeight + NOTES_CHROME_HEIGHT_ACTIVE;
      if (neededHeight > height) {
        updateSize(width, neededHeight);
      }
    },
    [height, isEditing, updateSize, width]
  );

  const handleDoubleClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      setIsEditing(true);
      if (!selected) {
        setNodes((nodes) =>
          nodes.map((node) => ({
            ...node,
            selected: node.id === id,
          }))
        );
      }
    },
    [id, selected, setNodes]
  );

  const hasBody = Boolean(body && body.replace(/<[^>]*>/g, '').trim());

  // Idle: shrink node to content. Editing: restore saved editor size.
  useLayoutEffect(() => {
    if (isEditing) {
      setIdleSize(null);
      return;
    }

    const el = idleMeasureRef.current;
    if (!el) return;

    const measure = () => {
      const nextWidth = Math.max(
        NOTES_IDLE_MIN_WIDTH,
        Math.min(width, Math.ceil(el.scrollWidth))
      );
      const nextHeight = Math.max(NOTES_IDLE_MIN_HEIGHT, Math.ceil(el.scrollHeight));
      setIdleSize((prev) => {
        if (prev && prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isEditing, title, body, width, hasBody]);

  const displayWidth = isEditing ? width : idleSize?.width ?? Math.min(width, NOTES_DEFAULT_WIDTH);
  const displayHeight = isEditing ? height : idleSize?.height ?? NOTES_IDLE_MIN_HEIGHT;

  // Keep React Flow node hitbox in sync. Idle shrink does not overwrite saved editor width/height in data.
  useEffect(() => {
    setNodes((nodes) =>
      nodes.map((node) => {
        if (node.id !== id) return node;
        const styleWidth = node.style?.width;
        const styleHeight = node.style?.height;
        if (styleWidth === displayWidth && styleHeight === displayHeight) return node;
        return {
          ...node,
          style: {
            ...node.style,
            width: displayWidth,
            height: displayHeight,
          },
        };
      })
    );
    updateNodeInternals(id);
  }, [displayHeight, displayWidth, id, setNodes, updateNodeInternals]);

  const colorOptions = useMemo(
    () =>
      (Object.keys(NOTES_COLOR_PRESETS) as NotesBackgroundColor[]).map((color) => ({
        color,
        ...NOTES_COLOR_PRESETS[color],
        label: t(NOTES_COLOR_PRESETS[color].labelKey, NOTES_COLOR_PRESETS[color].labelDefault),
      })),
    [t]
  );

  return (
    <>
      <NodeResizer
        isVisible={isEditing && !pinned}
        minWidth={NOTES_MIN_WIDTH}
        minHeight={NOTES_MIN_HEIGHT}
        onResize={(_, params) => {
          updateSize(params.width, params.height);
        }}
        lineClassName="border-amber-400/70"
        handleClassName="h-2.5 w-2.5 rounded-sm border border-amber-400/80 bg-background"
      />

      {/* Outer wrapper keeps group-hover toolbar outside overflow-hidden (same pattern as Wait/Message). */}
      <div
        className="group relative"
        style={{
          width: displayWidth,
          height: displayHeight,
          minWidth: isEditing ? NOTES_MIN_WIDTH : NOTES_IDLE_MIN_WIDTH,
          minHeight: isEditing ? NOTES_MIN_HEIGHT : NOTES_IDLE_MIN_HEIGHT,
        }}
        onDoubleClick={handleDoubleClick}
      >
        <NodeToolbar id={id} onDuplicate={onDuplicateNode} onDelete={onDeleteNode} />

        <div
          ref={idleMeasureRef}
          className={cn(
            'flex flex-col rounded-2xl border-2 shadow-md',
            isEditing ? 'h-full overflow-hidden' : 'h-auto w-max overflow-visible',
            colorPreset.containerClass,
            selected && 'ring-2 ring-amber-400/50'
          )}
          style={isEditing ? undefined : { maxWidth: width }}
        >
          <div
            className={cn(
              'flex shrink-0 items-center gap-2 px-3 py-2',
              isEditing && 'border-b border-black/5 dark:border-white/10'
            )}
          >
            <img
              src={NOTES_FLOW_NODE_ICON_SRC}
              alt={t('flow_builder.notes_icon_alt', 'Notes')}
              className="h-4 w-4 shrink-0 opacity-80"
            />
            <span className="text-xs font-semibold uppercase tracking-wide text-foreground/80">
              {t('flow_builder.notes_node_label', 'Notes')}
            </span>

            {isEditing && (
              <div className="ml-auto flex items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant={pinned ? 'secondary' : 'ghost'}
                        size="icon"
                        className="nodrag nopan h-7 w-7"
                        onClick={handlePinnedToggle}
                        aria-pressed={pinned}
                      >
                        {pinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {pinned
                          ? t('flow_builder.notes_unpin', 'Unpin note')
                          : t('flow_builder.notes_pin', 'Pin note to canvas')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="nodrag nopan flex items-center gap-1 rounded-md border border-black/5 bg-background/50 p-0.5 dark:border-white/10">
                  {colorOptions.map((option) => (
                    <button
                      key={option.color}
                      type="button"
                      className={cn(
                        'h-4 w-4 rounded-full border border-black/10 transition-transform hover:scale-110 dark:border-white/20',
                        option.swatchClass,
                        backgroundColor === option.color && 'ring-2 ring-primary ring-offset-1'
                      )}
                      aria-label={option.label}
                      title={option.label}
                      onClick={() => handleBackgroundColorChange(option.color)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className={cn(
              'flex flex-col gap-2 p-3 pt-1',
              isEditing ? 'min-h-0 flex-1' : 'h-auto'
            )}
          >
            {isEditing ? (
              <>
                <Input data-tour="components-flow-builder-notesnode.input.flow_builder.notes_title_placeholder"
                  value={title}
                  onChange={(event) => handleTitleChange(event.target.value)}
                  placeholder={t('flow_builder.notes_title_placeholder', 'Note title')}
                  className="nodrag nopan h-8 border-black/10 bg-background/60 text-sm font-medium dark:border-white/10"
                />

                <FlowNotesEditor
                  value={body}
                  onChange={handleBodyChange}
                  placeholder={t(
                    'flow_builder.notes_body_placeholder',
                    'Add details, context, or reminders…'
                  )}
                  linkPrompt={t('flow_builder.notes_link_prompt', 'Enter URL:')}
                  minHeight={72}
                  onContentHeightChange={handleContentHeightChange}
                />
              </>
            ) : (
              <>
                <div className="px-0.5 text-sm font-semibold text-foreground">
                  {title || t('flow_builder.notes_default_title', 'Note')}
                </div>

                {hasBody ? (
                  <FlowNotesEditor value={body} readOnly minHeight={0} />
                ) : (
                  <p className="px-0.5 text-sm italic text-muted-foreground">
                    {t('flow_builder.notes_empty_preview', 'Empty note')}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

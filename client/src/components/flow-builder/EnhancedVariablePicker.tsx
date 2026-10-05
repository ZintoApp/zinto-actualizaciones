import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import React, { useMemo, useState } from 'react';
import { useNodes } from 'reactflow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Variable,
  User,
  Settings,
  Workflow,
  Database,
  Loader2,
  RefreshCw,
  History,
  Wrench,
  Image,
  Building2,
  CalendarClock,
} from 'lucide-react';
import { getFlowNodeVariablesFromNodes, useFlowVariables, getCategoryLabel, getCategoryIcon, type FlowVariable } from '@/hooks/useFlowVariables';
import type { FlowCustomVariable } from '@shared/types/flow-custom-variable';
import {
  getCenteredPromptScrollTop,
  getNextPromptPlaceholderRange,
  getPromptPlaceholderSegments,
} from '@shared/prompt-placeholder-navigation';

interface EnhancedVariablePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  flowId?: number;
  customVariables?: FlowCustomVariable[];
  /** Variables derived from the current unsaved canvas, such as Data Capture rule outputs. */
  additionalVariables?: FlowVariable[];
  /** Add or override variables in the Flow-derived catalogue while retaining this picker's UX. */
  availableVariables?: FlowVariable[];
  disabled?: boolean;
  /** When false, inserts the variable path only (e.g. contact.name). Default true inserts {{contact.name}} for templates. */
  wrapInBraces?: boolean;
  /** Optional className for the insert-variable trigger button (e.g. h-6 for compact rows). */
  pickerButtonClassName?: string;
  /** Place the picker in the field row or in the parent field header. */
  pickerButtonPlacement?: 'inline' | 'header';
  /** Use a textarea instead of a single-line input (e.g. JSON body). */
  multiline?: boolean;
  /** Visually mark complete {{placeholder}} tokens in a multiline editor. */
  highlightPlaceholders?: boolean;
  maxLength?: number;
}

export interface EnhancedVariablePickerHandle {
  /** Focus and select an exact {{variableName}} token. Repeated calls cycle duplicate occurrences. */
  focusPlaceholder: (variableName: string) => boolean;
}

const getCategoryIconComponent = (category: FlowVariable['category']) => {
  switch (category) {
    case 'contact': return <User className="w-3 h-3" />;
    case 'message': return <InboxConversationIcon className="w-3 h-3" />;
    case 'system': return <Settings className="w-3 h-3" />;
    case 'company': return <Building2 className="w-3 h-3" />;
    case 'conversation': return <InboxConversationIcon className="w-3 h-3" />;
    case 'appointment': return <CalendarClock className="w-3 h-3" />;
    case 'erp': return <Database className="w-3 h-3" />;
    case 'flow': return <Workflow className="w-3 h-3" />;
    case 'captured': return <Database className="w-3 h-3" />;
    case 'observed': return <History className="w-3 h-3" />;
    case 'custom': return <Wrench className="w-3 h-3" />;
    case 'media': return <Image className="w-3 h-3" />;
    default: return <Variable className="w-3 h-3" />;
  }
};

export const EnhancedVariablePicker = React.forwardRef<EnhancedVariablePickerHandle, EnhancedVariablePickerProps>(function EnhancedVariablePicker({
  value, 
  onChange, 
  placeholder, 
  className, 
  flowId,
  customVariables,
  additionalVariables = [],
  availableVariables,
  disabled = false,
  wrapInBraces = true,
  pickerButtonClassName,
  pickerButtonPlacement = 'inline',
  multiline = false,
  highlightPlaceholders = false,
  maxLength,
}, forwardedRef) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [cursorPosition, setCursorPosition] = useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const textareaContainerRef = React.useRef<HTMLDivElement>(null);
  const placeholderOverlayRef = React.useRef<HTMLDivElement>(null);
  const [overlayLayout, setOverlayLayout] = React.useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    contentWidth: number;
    textStyle: React.CSSProperties;
  } | null>(null);
  const placeholderNavigationRef = React.useRef<{
    variableName: string;
    value: string;
    start: number;
  } | null>(null);
  const placeholderNavigationFrameRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    placeholderNavigationRef.current = null;
    if (placeholderNavigationFrameRef.current !== null) {
      cancelAnimationFrame(placeholderNavigationFrameRef.current);
      placeholderNavigationFrameRef.current = null;
    }
  }, [value]);

  React.useEffect(() => () => {
    if (placeholderNavigationFrameRef.current !== null) {
      cancelAnimationFrame(placeholderNavigationFrameRef.current);
    }
  }, []);

  const syncPlaceholderOverlayScroll = React.useCallback(() => {
    const textarea = textareaRef.current;
    const overlay = placeholderOverlayRef.current;
    if (!textarea || !overlay) return;
    overlay.scrollTop = textarea.scrollTop;
    overlay.scrollLeft = textarea.scrollLeft;
  }, []);

  React.useLayoutEffect(() => {
    if (!multiline || !highlightPlaceholders) {
      setOverlayLayout(null);
      return;
    }

    const textarea = textareaRef.current;
    const container = textareaContainerRef.current;
    if (!textarea || !container) return;

    const measure = () => {
      const textareaRect = textarea.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const computed = window.getComputedStyle(textarea);
      setOverlayLayout({
        left: textareaRect.left - containerRect.left + textarea.clientLeft,
        top: textareaRect.top - containerRect.top + textarea.clientTop,
        width: textarea.clientWidth,
        height: textarea.clientHeight,
        contentWidth: textarea.clientWidth,
        textStyle: {
          boxSizing: 'border-box',
          width: textarea.clientWidth,
          minHeight: '100%',
          paddingTop: computed.paddingTop,
          paddingRight: computed.paddingRight,
          paddingBottom: computed.paddingBottom,
          paddingLeft: computed.paddingLeft,
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontStyle: computed.fontStyle,
          fontWeight: computed.fontWeight,
          letterSpacing: computed.letterSpacing,
          lineHeight: computed.lineHeight,
          textAlign: computed.textAlign as React.CSSProperties['textAlign'],
          textIndent: computed.textIndent,
          textTransform: computed.textTransform as React.CSSProperties['textTransform'],
          wordSpacing: computed.wordSpacing,
          tabSize: computed.tabSize,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
        },
      });
      requestAnimationFrame(syncPlaceholderOverlayScroll);
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(textarea);
    observer?.observe(container);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [className, highlightPlaceholders, multiline, syncPlaceholderOverlayScroll]);

  React.useLayoutEffect(() => {
    if (highlightPlaceholders) syncPlaceholderOverlayScroll();
  }, [highlightPlaceholders, overlayLayout, syncPlaceholderOverlayScroll, value]);

  React.useImperativeHandle(forwardedRef, () => ({
    focusPlaceholder: (variableName: string) => {
      const previous = placeholderNavigationRef.current;
      const previousStart = previous?.variableName === variableName && previous.value === value
        ? previous.start
        : undefined;
      const range = getNextPromptPlaceholderRange(value, variableName, previousStart);
      const element = multiline ? textareaRef.current : inputRef.current;
      if (!range || !element || disabled) return false;

      const revealPlaceholder = () => {
        if (!element.isConnected) return;

        // Center the editor in its surrounding scroll container as well as the
        // placeholder inside the editor. Browser focus/selection handling can
        // otherwise leave only the edge of a long textarea visible.
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
        element.focus({ preventScroll: true });
        element.setSelectionRange(range.start, range.end);

        if (multiline && element instanceof HTMLTextAreaElement) {
          const overlay = placeholderOverlayRef.current;
          const marker = overlay?.querySelector<HTMLElement>(`[data-placeholder-start="${range.start}"]`);
          if (overlay && marker) {
            const overlayRect = overlay.getBoundingClientRect();
            const markerRect = marker.getBoundingClientRect();
            const markerTop = markerRect.top - overlayRect.top + overlay.scrollTop;
            const scrollTop = getCenteredPromptScrollTop(
              markerTop,
              markerRect.height,
              element.clientHeight,
              element.scrollHeight,
            );
            element.scrollTop = scrollTop;
            overlay.scrollTop = scrollTop;
          }
        }
      };

      if (placeholderNavigationFrameRef.current !== null) {
        cancelAnimationFrame(placeholderNavigationFrameRef.current);
      }
      revealPlaceholder();
      // Reapply after focus, selection, layout, and scroll anchoring have
      // settled. A second frame covers nested scroll containers consistently.
      placeholderNavigationFrameRef.current = requestAnimationFrame(() => {
        revealPlaceholder();
        placeholderNavigationFrameRef.current = requestAnimationFrame(() => {
          revealPlaceholder();
          placeholderNavigationFrameRef.current = null;
        });
      });
      setCursorPosition(range.end);
      placeholderNavigationRef.current = { variableName, value, start: range.start };
      return true;
    },
  }), [disabled, multiline, value]);
  const canvasNodes = useNodes();
  const mergedAdditionalVariables = useMemo(() => {
    const merged = new Map<string, FlowVariable>();
    getFlowNodeVariablesFromNodes(canvasNodes).forEach((variable) => merged.set(variable.value, variable));
    additionalVariables.forEach((variable) => merged.set(variable.value, variable));
    return [...merged.values()];
  }, [canvasNodes, additionalVariables]);

  const {
    variables,
    capturedVariables,
    loading,
    error,
    fetchCapturedVariables,
    getVariablesByCategory
  } = useFlowVariables(flowId, customVariables, mergedAdditionalVariables);

  const pickerVariables = useMemo(() => {
    if (!availableVariables) return variables;
    const merged = new Map(variables.map(variable => [variable.value, variable]));
    availableVariables.forEach(variable => merged.set(variable.value, variable));
    return [...merged.values()];
  }, [availableVariables, variables]);
  const filteredVariables = pickerVariables.filter(variable =>
    variable.label.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.value.toLowerCase().includes(searchValue.toLowerCase()) ||
    variable.description.toLowerCase().includes(searchValue.toLowerCase())
  );

  const groupedVariables = filteredVariables.reduce((acc, variable) => {
    if (!acc[variable.category]) {
      acc[variable.category] = [];
    }
    acc[variable.category].push(variable);
    return acc;
  }, {} as Record<string, FlowVariable[]>);

  const handleFieldChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value);
    setCursorPosition(e.target.selectionStart || 0);
  };

  const handleFieldSelect = (e: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement | HTMLTextAreaElement;
    setCursorPosition(target.selectionStart || 0);
  };

  const placeholderSegments = React.useMemo(
    () => highlightPlaceholders && multiline ? getPromptPlaceholderSegments(value) : [],
    [highlightPlaceholders, multiline, value],
  );

  const insertVariable = (variableValue: string) => {
    const currentValue = value || '';
    const beforeCursor = currentValue.substring(0, cursorPosition);
    const afterCursor = currentValue.substring(cursorPosition);
    const insertion = wrapInBraces ? `{{${variableValue}}}` : variableValue;
    const newValue = `${beforeCursor}${insertion}${afterCursor}`;

    onChange(newValue);
    setOpen(false);

    setTimeout(() => {
      const el = multiline ? textareaRef.current : inputRef.current;
      if (el) {
        const newCursorPosition = beforeCursor.length + insertion.length;
        el.focus();
        el.setSelectionRange(newCursorPosition, newCursorPosition);
        setCursorPosition(newCursorPosition);
      }
    }, 0);
  };

  const handleRefresh = () => {
    fetchCapturedVariables();
  };

  return (
    <div className={cn('relative flex gap-2', multiline && 'items-start')}>
      {multiline ? (
        <div ref={textareaContainerRef} className="relative min-w-0 flex-1 [&>div>button]:z-20">
          {highlightPlaceholders && overlayLayout && (
            <div
              ref={placeholderOverlayRef}
              aria-hidden="true"
              className={cn(
                'pointer-events-none absolute z-0 overflow-hidden rounded-[calc(var(--radius)-1px)] bg-background text-foreground',
                disabled && 'opacity-50',
              )}
              style={{
                left: overlayLayout.left,
                top: overlayLayout.top,
                width: overlayLayout.width,
                height: overlayLayout.height,
              }}
            >
              <div style={overlayLayout.textStyle}>
                {placeholderSegments.map((segment) => segment.isPlaceholder ? (
                  <span
                    key={`${segment.start}-${segment.end}`}
                    data-placeholder-start={segment.start}
                    className="rounded-[2px] bg-amber-200/90 text-amber-950 shadow-[inset_0_0_0_1px_rgb(217_119_6_/_0.28)] box-decoration-clone dark:bg-amber-400/25 dark:text-amber-100 dark:shadow-[inset_0_0_0_1px_rgb(251_191_36_/_0.38)]"
                  >
                    {segment.text}
                  </span>
                ) : (
                  <React.Fragment key={`${segment.start}-${segment.end}`}>{segment.text}</React.Fragment>
                ))}
                {'\u200b'}
              </div>
            </div>
          )}
          <Textarea data-tour="components-flow-builder-enhancedvariablepicker.textarea.value"
            ref={textareaRef}
            value={value}
            onChange={handleFieldChange}
            onSelect={handleFieldSelect}
            onKeyUp={handleFieldSelect}
            onClick={handleFieldSelect}
            onScroll={highlightPlaceholders ? syncPlaceholderOverlayScroll : undefined}
            placeholder={placeholder}
            className={cn(
              'font-mono text-xs min-h-[200px] resize-y',
              highlightPlaceholders && 'relative z-10 bg-transparent text-transparent caret-foreground selection:bg-primary/30 placeholder:text-muted-foreground',
              className,
            )}
            disabled={disabled}
            maxLength={maxLength}
          />
        </div>
      ) : (
        <Input data-tour="components-flow-builder-enhancedvariablepicker.input.value"
          ref={inputRef}
          value={value}
          onChange={handleFieldChange}
          onSelect={handleFieldSelect}
          onKeyUp={handleFieldSelect}
          onClick={handleFieldSelect}
          placeholder={placeholder}
          className={cn('font-mono text-xs', className)}
          disabled={disabled}
          maxLength={maxLength}
        />
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              'h-8 px-2 flex items-center gap-1 shrink-0',
              pickerButtonPlacement === 'header' && 'absolute -top-8 right-0 h-7 w-7 p-0',
              pickerButtonClassName
            )}
            title="Insert variable"
            disabled={disabled}
          >
            <Variable className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <Command>
            <div className="flex items-center gap-2 p-2 border-b">
              <CommandInput
                placeholder="Search variables..."
                value={searchValue}
                onValueChange={setSearchValue}
                className="flex-1"
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={handleRefresh}
                      disabled={loading}
                    >
                      {loading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">Refresh captured variables</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <CommandList>
              <CommandEmpty>
                {error ? (
                  <div className="text-center py-4">
                    <p className="text-xs text-red-600">Error loading variables</p>
                    <p className="text-xs text-muted-foreground">{error}</p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-xs">No variables found.</p>
                  </div>
                )}
              </CommandEmpty>

              {Object.entries(groupedVariables).map(([category, categoryVariables]) => (
                <CommandGroup
                  key={category}
                  heading={
                    <div className="flex items-center gap-2">
                      <span>{getCategoryIcon(category as FlowVariable['category'])}</span>
                      <span>{getCategoryLabel(category as FlowVariable['category'])}</span>
                      {(category === 'captured' || category === 'observed') && categoryVariables.length > 0 && (
                        <Badge variant="secondary" className="text-[9px] px-1">
                          {categoryVariables.length}
                        </Badge>
                      )}
                    </div>
                  }
                >
                  {categoryVariables.map((variable) => (
                    <CommandItem
                      key={variable.value}
                      value={variable.value}
                      onSelect={() => insertVariable(variable.value)}
                      className="flex items-center gap-3 p-3"
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {getCategoryIconComponent(variable.category)}
                        <div className="flex-1">
                          <div className="font-medium text-xs">{variable.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {variable.description}
                          </div>
                          {variable.dataType && (
                            <div className="text-[10px] text-blue-600 font-mono">
                              {variable.dataType}
                            </div>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs font-mono">
                          {`{{${variable.value}}}`}
                        </Badge>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
});

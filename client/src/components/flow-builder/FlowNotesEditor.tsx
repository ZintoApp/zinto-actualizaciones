import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

interface FlowNotesEditorProps {
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  linkPrompt?: string;
  className?: string;
  minHeight?: number;
  readOnly?: boolean;
  onContentHeightChange?: (height: number) => void;
}

export function FlowNotesEditor({
  value,
  onChange,
  placeholder = 'Write your note…',
  linkPrompt = 'Enter URL:',
  className = '',
  minHeight = 96,
  readOnly = false,
  onContentHeightChange,
}: FlowNotesEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef(false);

  useEffect(() => {
    if (readOnly) return;
    if (editorRef.current && !isUpdatingRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [readOnly, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !onContentHeightChange) return;

    const notify = () => {
      onContentHeightChange(editor.scrollHeight);
    };

    notify();
    const observer = new ResizeObserver(notify);
    observer.observe(editor);
    return () => observer.disconnect();
  }, [onContentHeightChange, value]);

  const handleInput = () => {
    if (!editorRef.current || !onChange) return;
    isUpdatingRef.current = true;
    onChange(editorRef.current.innerHTML);
    window.setTimeout(() => {
      isUpdatingRef.current = false;
    }, 0);
  };

  const execCommand = (command: string, commandValue?: string) => {
    document.execCommand(command, false, commandValue);
    editorRef.current?.focus();
    handleInput();
  };

  const insertLink = () => {
    const url = window.prompt(linkPrompt);
    if (url) {
      execCommand('createLink', url);
    }
  };

  if (readOnly) {
    return (
      <div className={cn(className)}>
        <div
          ref={editorRef}
          className="flow-notes-editor text-sm leading-relaxed"
          style={minHeight ? { minHeight } : undefined}
          dangerouslySetInnerHTML={{ __html: value }}
        />
        <FlowNotesEditorStyles />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col rounded-md border border-black/5 bg-background/40 dark:border-white/10',
        className
      )}
    >
      <div className="nodrag nopan flex flex-wrap items-center gap-0.5 border-b border-black/5 p-1 dark:border-white/10">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('bold')}
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('italic')}
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('underline')}
        >
          <Underline className="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('insertUnorderedList')}
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => execCommand('insertOrderedList')}
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={insertLink}>
          <Link className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder}
        className="flow-notes-editor nodrag nopan min-h-0 flex-1 overflow-y-auto p-2 text-sm leading-relaxed focus:outline-none"
        style={{ minHeight }}
      />

      <FlowNotesEditorStyles />
    </div>
  );
}

function FlowNotesEditorStyles() {
  return (
    <style>{`
      .flow-notes-editor:empty:before {
        content: attr(data-placeholder);
        color: hsl(var(--muted-foreground));
        pointer-events: none;
      }
      .flow-notes-editor ul,
      .flow-notes-editor ol {
        margin: 0.35rem 0;
        padding-left: 1.25rem;
      }
      .flow-notes-editor p {
        margin: 0.25rem 0;
      }
      .flow-notes-editor a {
        color: hsl(var(--primary));
        text-decoration: underline;
      }
    `}</style>
  );
}

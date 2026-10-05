import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { getPromptPlaceholderSegments } from '@shared/prompt-placeholder-navigation';

/** Native plain-text editing with a non-interactive placeholder overlay, as in Flow Builder. */
export function ReminderMessageEditor({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ frame: React.CSSProperties; text: React.CSSProperties } | null>(null);
  const segments = useMemo(() => getPromptPlaceholderSegments(value), [value]);
  const syncScroll = useCallback(() => {
    if (input.current && overlay.current) {
      overlay.current.scrollTop = input.current.scrollTop;
      overlay.current.scrollLeft = input.current.scrollLeft;
    }
  }, []);
  useLayoutEffect(() => {
    const textarea = input.current;
    const wrapper = container.current;
    if (!textarea || !wrapper) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const rect = textarea.getBoundingClientRect();
      const parent = wrapper.getBoundingClientRect();
      const css = getComputedStyle(textarea);
      setLayout({
        frame: { left: rect.left - parent.left + textarea.clientLeft, top: rect.top - parent.top + textarea.clientTop,
          width: textarea.clientWidth, height: textarea.clientHeight },
        text: { boxSizing: 'border-box', width: textarea.clientWidth, minHeight: '100%',
          paddingTop: css.paddingTop, paddingRight: css.paddingRight, paddingBottom: css.paddingBottom, paddingLeft: css.paddingLeft,
          fontFamily: css.fontFamily, fontSize: css.fontSize, fontWeight: css.fontWeight, fontStyle: css.fontStyle,
          letterSpacing: css.letterSpacing, lineHeight: css.lineHeight, wordSpacing: css.wordSpacing, tabSize: css.tabSize,
          textAlign: css.textAlign as React.CSSProperties['textAlign'], textIndent: css.textIndent,
          textTransform: css.textTransform as React.CSSProperties['textTransform'], whiteSpace: 'pre-wrap', overflowWrap: 'break-word' },
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(textarea);
    observer.observe(wrapper);
    const themeObserver = new MutationObserver(measure);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('resize', measure);
    document.fonts.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); themeObserver.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useLayoutEffect(syncScroll, [syncScroll, value, layout]);
  return <div ref={container} className="reminder-message-editor" data-highlighted={!!layout} data-disabled={disabled}>
    {layout && <div ref={overlay} aria-hidden="true" className="reminder-message-overlay" style={layout.frame}>
      <div style={layout.text}>{segments.map(segment => segment.isPlaceholder
        ? <span className="reminder-message-token" key={segment.start}>{segment.text}</span>
        : <React.Fragment key={segment.start}>{segment.text}</React.Fragment>)}{'\u200b'}</div>
    </div>}
    <Textarea data-tour="components-erp-dental-remindermessageeditor.textarea.batch-message" ref={input} id="batch-message" aria-describedby="batch-message-help" showExpandButton={false}
      rows={9} maxLength={8000} value={value} disabled={disabled}
      onChange={event => onChange(event.target.value)} onScroll={syncScroll} />
  </div>;
}

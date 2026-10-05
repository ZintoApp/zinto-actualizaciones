import { useRef, useState, useCallback } from 'react';

export type AssistPayload = {
  action:
    | 'improve'
    | 'fix_grammar'
    | 'polite'
    | 'friendly'
    | 'shorten'
    | 'lengthen'
    | 'simplify'
    | 'tone'
    | 'translate'
    | 'continue'
    | 'summarize_reply'
    | 'custom';
  text: string;
  toneVariant?: string;
  targetLanguage?: string;
  instruction?: string;
  conversationId?: number;
  recentMessages?: Array<{ role: 'agent' | 'contact'; content: string; createdAt?: string }>;
};

export type AssistError = {
  code: 'NO_AI_CREDENTIALS' | 'INTERNAL' | string;
  message?: string;
};

type StartCallbacks = {
  onDelta: (delta: string) => void;
  onDone?: () => void;
};

export function useAiTextAssist() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<AssistError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async (payload: AssistPayload, { onDelta, onDone }: StartCallbacks) => {
    abortRef.current?.abort();

    setError(null);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/ai-assist/improve', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        try {
          const body = await response.json();
          const code =
            body.code ??
            body.error?.code ??
            (typeof body.error === 'string' ? body.error : undefined) ??
            'INTERNAL';
          const message =
            body.message ??
            (typeof body.error === 'object' && body.error?.message ? body.error.message : undefined);
          setError({ code, message });
        } catch {
          setError({ code: 'INTERNAL' });
        }
        setIsStreaming(false);
        return;
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        while (buffer.includes('\n\n')) {
          const idx = buffer.indexOf('\n\n');
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          let eventName = 'message';
          let dataLines: string[] = [];

          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLines.push(line.slice(5).trimStart());
            }
          }

          const data = dataLines.join('\n');
          if (!data) continue;

          if (eventName === 'done') {
            onDone?.();
            setIsStreaming(false);
            return;
          }

          if (eventName === 'error') {
            try {
              const parsed = JSON.parse(data);
              setError({ code: parsed.code, message: parsed.message });
            } catch {
              setError({ code: 'INTERNAL' });
            }
            setIsStreaming(false);
            return;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.delta) onDelta(parsed.delta);
          } catch {
            // ignore malformed delta
          }
        }
      }

      onDone?.();
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // swallow
      } else {
        setError({ code: 'INTERNAL' });
      }
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { isStreaming, error, start, cancel, clearError };
}

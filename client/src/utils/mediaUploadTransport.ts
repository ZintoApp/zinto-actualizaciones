export const MEDIA_UPLOAD_TIMEOUT_BASE_MS = 90_000;
export const MEDIA_UPLOAD_TIMEOUT_MAX_MS = 180_000;

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export function findMediaConversation<T extends { id: number }>(
  conversationId: number,
  individualConversations: T[],
  groupConversations: T[],
): T | undefined {
  return individualConversations.find(conversation => conversation.id === conversationId) ||
    groupConversations.find(conversation => conversation.id === conversationId);
}

export function getMediaUploadTimeoutMs(fileSize: number): number {
  const extraMs = Math.floor(fileSize / (1024 * 1024)) * 1000;
  return Math.min(MEDIA_UPLOAD_TIMEOUT_BASE_MS + extraMs, MEDIA_UPLOAD_TIMEOUT_MAX_MS);
}

export function deriveMediaType(file: File): 'image' | 'video' | 'audio' | 'document' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'document';
}

export function getMediaPlaceholderMessage(mediaType: string): string {
  return `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} message`;
}

/** Matches outbound media when caption was empty or rewritten by the server (placeholder / agent signature). */
export function mediaCaptionMatchesFingerprint(
  msgContent: string | undefined | null,
  fingerprintCaption: string,
  mediaType: string,
): boolean {
  const content = (msgContent || '').trim();
  const expected = fingerprintCaption.trim();
  if (content === expected) return true;
  if (expected !== '' && content.includes(expected)) return true;
  if (expected === '') {
    if (content === getMediaPlaceholderMessage(mediaType)) return true;
    if (/^> \*[^*\n]+\*(\n\n)?$/.test(content)) return true;
  }
  return false;
}

export function uploadFormDataWithProgress(
  url: string,
  formData: FormData,
  options?: {
    onProgress?: (progress: UploadProgress) => void;
    signal?: AbortSignal;
    timeoutMs?: number;
  },
): Promise<{ ok: boolean; status: number; statusText: string; json: () => Promise<any> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const onAbort = () => {
      xhr.abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    if (options?.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.onload = () => {
      options?.signal?.removeEventListener('abort', onAbort);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          ok: true,
          status: xhr.status,
          statusText: xhr.statusText,
          json: () => JSON.parse(xhr.responseText),
        });
      } else {
        resolve({
          ok: false,
          status: xhr.status,
          statusText: xhr.statusText,
          json: () => {
            try {
              return JSON.parse(xhr.responseText);
            } catch {
              return { error: xhr.statusText };
            }
          },
        });
      }
    };

    xhr.onerror = () => {
      options?.signal?.removeEventListener('abort', onAbort);
      reject(new Error('Network error'));
    };

    xhr.ontimeout = () => {
      options?.signal?.removeEventListener('abort', onAbort);
      reject(new Error('Upload timeout'));
    };

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options?.onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        options.onProgress({ loaded: event.loaded, total: event.total, percent });
      }
    };

    if (options?.timeoutMs) {
      xhr.timeout = options.timeoutMs;
    }

    xhr.open('POST', url, true);
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}

import { digitalTicketLinkSchema } from '@shared/types/dental-queue';

export function resolveDigitalTicketLink(value: unknown, frontendOrigin: string) {
  const link = digitalTicketLinkSchema.parse(value);
  const path = new URL(link.url, frontendOrigin).pathname;
  // Preserve the frontend's protocol, domain, subdomain, and port, including for
  // absolute links returned by older servers. Never use a backend/webhook origin.
  return { ...link, url: new URL(path, frontendOrigin).href };
}

/** Bound requests so an unavailable QR service never prevents ordinary printing. */
export async function requestDigitalTicket(url: string, method: 'GET' | 'POST', signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const timeout = window.setTimeout(abort, 10000);
  try {
    const response = await fetch(url, { method, signal: controller.signal, credentials: method === 'POST' ? 'include' : 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (!response.ok) throw Object.assign(new Error('Ticket unavailable'), { status: response.status });
    return (await response.json()).data as unknown;
  } finally { window.clearTimeout(timeout); signal.removeEventListener('abort', abort); }
}

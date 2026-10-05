// Account transitions must also cover callers that use fetch directly (uploads,
// inbox pagination, etc.), rather than only React Query's default query function.
let generation = 0;
let paused = false;
let originalFetch: typeof fetch | null = null;
const reads = new Set<AbortController>();
const writes = new Set<Promise<unknown>>();
let operations = 0;
const xhrReads = new Set<XMLHttpRequest>();
const stale = () => new DOMException('Workspace changed', 'AbortError');
const isAccountRequest = (url: URL, method: string) => {
  if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return false;
  // These endpoints are public and independent of the authenticated identity.
  // Translation and subdomain providers remain mounted during transitions.
  return !(method === 'GET' && (['/api/languages', '/api/subdomain-info'].includes(url.pathname) || /^\/api\/translations\/language\/[^/]+$/.test(url.pathname)));
};

// For operations completed by a server acknowledgement rather than HTTP.
export function beginAccountOperation() {
  if (paused) throw stale();
  operations++;
  let finished = false;
  return () => { if (!finished) { finished = true; operations--; } };
}

export function accountGeneration() { return generation; }
export function accountNetworkPaused() { return paused; }

export function installAccountNetwork() {
  if (originalFetch) return;
  const nativeFetch = window.fetch.bind(window);
  originalFetch = nativeFetch;
  const xhrRequests = new WeakMap<XMLHttpRequest, { scoped: boolean; read: boolean }>();
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...options: any[]) {
    const target = new URL(String(url), window.location.href);
    xhrRequests.set(this, { scoped: isAccountRequest(target, method.toUpperCase()), read: /^(GET|HEAD)$/i.test(method) });
    return Reflect.apply(open, this, [method, url, ...options]);
  } as typeof open;
  XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body) {
    const request = xhrRequests.get(this);
    if (!request?.scoped) return send.call(this, body);
    if (paused) throw stale();
    const finish = request.read ? () => { xhrReads.delete(this); } : beginAccountOperation();
    if (request.read) xhrReads.add(this);
    // Native load handlers and their promise continuations finish before drain.
    this.addEventListener('loadend', finish, { once: true });
    try { return send.call(this, body); }
    catch (error) { this.removeEventListener('loadend', finish); finish(); throw error; }
  };
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!isAccountRequest(url, method)) return nativeFetch(input, init);
    if (paused) throw stale();
    const epoch = generation;
    const read = method === 'GET' || method === 'HEAD';
    const controller = new AbortController();
    const externalSignal = init?.signal || (input instanceof Request ? input.signal : undefined);
    const signal = externalSignal ? AbortSignal.any([externalSignal, controller.signal]) : controller.signal;
    if (read) reads.add(controller);
    const request = (async () => {
      try {
        const response = await nativeFetch(input, { ...init, signal });
        // Wait for write responses to finish before changing the server session.
        if (!read) await response.clone().arrayBuffer();
        if (epoch !== generation || paused) throw stale();
        const guard = (res: Response): Response => {
          for (const key of ['json', 'text', 'blob', 'arrayBuffer', 'formData'] as const) {
            const consume = res[key].bind(res);
            Object.defineProperty(res, key, { value: async () => {
              const body = await consume();
              if (epoch !== generation || paused) throw stale();
              return body;
            } });
          }
          const clone = res.clone.bind(res);
          Object.defineProperty(res, 'clone', { value: () => guard(clone()) });
          return res;
        };
        return guard(response);
      } finally {
        reads.delete(controller);
      }
    })();
    if (!read) writes.add(request);
    try { return await request; } finally { writes.delete(request); }
  };
}

export function pauseAccountNetwork() {
  paused = true;
  generation++;
  reads.forEach(controller => controller.abort());
  reads.clear();
  xhrReads.forEach(request => request.abort());
  xhrReads.clear();
  window.dispatchEvent(new Event('account-network-state'));
}
export function resumeAccountNetwork() { paused = false; window.dispatchEvent(new Event('account-network-state')); }
export function pendingAccountWrites() { return writes.size + operations; }

// Only the transition coordinator may bypass the gate, to switch/verify identity.
export async function accountSessionRequest(url: string, method = 'GET') {
  installAccountNetwork();
  // Do not time out a POST locally while the server may still be saving the new
  // session. Verification reads can be retried safely; account mutations cannot.
  const response = await originalFetch!(url, { method, credentials: 'include', cache: 'no-store', signal: method === 'GET' ? AbortSignal.timeout(20000) : undefined });
  if (!response.ok) throw Object.assign(new Error('Session request failed'), { status: response.status });
  return response.json();
}

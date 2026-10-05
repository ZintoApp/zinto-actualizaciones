// Web Locks give us an exact inventory of mounted app tabs. A switch waits for
// each of them to quiesce; a sleeping/unresponsive tab fails closed, not silently.
const PREFIX = 'bothive-workspace-tab:';
const SWITCH = 'bothive-workspace-switch';
const CHANNEL = 'bothive-workspace';
export const TRANSITION_STORAGE_KEY = 'bothive-workspace-transition';
type Notice = { type: 'prepare' | 'ready' | 'failed' | 'complete'; id: string; sender: string; };

export function readStableAccountSession<T>(read: () => Promise<T>): Promise<T> {
  if (!navigator.locks) return read();
  return navigator.locks.request(SWITCH, { mode: 'shared' }, () => {
    // No switching writer can be active while this shared lock is held.
    localStorage.removeItem(TRANSITION_STORAGE_KEY);
    return read();
  });
}

export function registerAccountTab(prepare: () => Promise<void>, reconcile: () => Promise<void>) {
  const id = crypto.randomUUID();
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
  let release: (() => void) | undefined;
  let disposed = false;
  let preparing = Promise.resolve();
  const waiters = new Map<string, { peers: Set<string>; resolve: () => void; reject: (error: Error) => void }>();
  let ready: Promise<void>;
  let supported = !!navigator.locks && !!channel;
  if (navigator.locks) {
    ready = new Promise<void>(resolve => {
      void navigator.locks.request(PREFIX + id, () => new Promise<void>(done => { release = done; resolve(); if (disposed) done(); })).catch(() => { supported = false; resolve(); });
    });
  } else ready = Promise.resolve();
  const send = (type: Notice['type'], operation: string) => channel?.postMessage({ type, id: operation, sender: id } satisfies Notice);
  if (channel) channel.onmessage = async ({ data }: MessageEvent<Notice>) => {
    if (!data || data.sender === id) return;
    if (data.type === 'prepare') {
      preparing = prepare().then(() => send('ready', data.id), () => send('failed', data.id));
      await preparing;
    } else if (data.type === 'complete') {
      await preparing;
      await reconcile();
    } else {
      const waiter = waiters.get(data.id);
      if (!waiter?.peers.has(data.sender)) return;
      if (data.type === 'failed') waiter.reject(new Error('Another tab could not finish its work'));
      else { waiter.peers.delete(data.sender); if (!waiter.peers.size) waiter.resolve(); }
    }
  };
  return {
    dispose() { disposed = true; release?.(); channel?.close(); },
    async run<T>(work: () => Promise<T>): Promise<T> {
      await ready;
      if (!supported) throw new Error('Secure cross-tab switching is unavailable');
      return navigator.locks.request(SWITCH, { ifAvailable: true }, async lock => {
        if (!lock) throw new Error('An account switch is already in progress');
        const operation = crypto.randomUUID();
        localStorage.setItem(TRANSITION_STORAGE_KEY, operation);
        try {
          const inventory = await navigator.locks.query();
          const peers = new Set(inventory.held?.filter(item => item.name?.startsWith(PREFIX) && item.name !== PREFIX + id).map(item => item.name!.slice(PREFIX.length)));
          const prepared = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Another tab is still busy')), 15000);
            waiters.set(operation, { peers, resolve: () => { clearTimeout(timer); resolve(); }, reject: error => { clearTimeout(timer); reject(error); } });
            if (!peers.size) { clearTimeout(timer); resolve(); }
          });
          send('prepare', operation);
          await Promise.all([prepare(), prepared]);
          return await work();
        } finally {
          waiters.delete(operation);
          localStorage.removeItem(TRANSITION_STORAGE_KEY);
          send('complete', operation);
        }
      });
    },
  };
}

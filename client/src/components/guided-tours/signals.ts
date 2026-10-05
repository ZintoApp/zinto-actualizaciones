import { TOUR_API_SIGNALS, type TourSignalName } from '@shared/guided-tour-registry';
import { matchTourRoute } from '@shared/guided-tours';

export interface TourSignal { name: TourSignalName; resourceId?: string; path: string; time: number; }
const listeners = new Set<(signal: TourSignal) => void>();
export function subscribeTourSignals(listener: (signal: TourSignal) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function emitTourSignal(name: TourSignalName, resourceId?: string | number) {
  if (typeof window === 'undefined') return;
  const id = resourceId == null ? undefined : String(resourceId);
  const event: TourSignal = { name, ...(id && /^[\w-]{1,100}$/.test(id) ? { resourceId: id } : {}), path: window.location.pathname, time: Date.now() };
  listeners.forEach(listener => listener(event));
}
// Only registered, successful operations are observable. No request bodies are retained.
export async function reportTourResponse(method: string, url: string, response: Response) {
  if (!listeners.size || !response.ok) return;
  const entry = TOUR_API_SIGNALS.find(item => item.method === method.toUpperCase() && matchTourRoute(item.route, url));
  if (!entry) return;
  try {
    const body = await response.clone().json();
    if (body?.success === false || body?.error) return;
    const id = body?.id ?? body?.data?.id ?? body?.contact?.id ?? body?.patient?.contactId;
    emitTourSignal(entry.name, id);
  } catch { /* Non-JSON responses do not prove a registered operation succeeded. */ }
}

import { bindTourValue, matchTourRoute, type TourBindings, type TourStep } from '@shared/guided-tours';
import type { TourSignal } from './signals';

export function visibleTourTarget(selector: string): HTMLElement | null {
  try {
    const matches = [...document.querySelectorAll<HTMLElement>(selector)].filter(element => {
      const style = getComputedStyle(element);
      return element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('[hidden],[inert]');
    });
    return matches.length === 1 ? matches[0] : null;
  } catch { return null; }
}
export function signalCompletesStep(step: TourStep, signal: TourSignal, bindings: TourBindings, enteredAt: number) {
  const condition = step.completion;
  return condition.type === 'signal' && condition.name === signal.name && signal.time >= enteredAt
    && (!condition.capture || !!signal.resourceId)
    && (!condition.resource || signal.resourceId === bindings[condition.resource]);
}
export function routeCompletesStep(step: TourStep, route: string, bindings: TourBindings) {
  if (step.completion.type !== 'route') return false;
  const expected = bindTourValue(step.completion.path,bindings);
  return !!expected && matchTourRoute(expected,route);
}
export function progressStorageKey(user: number, company: number) { return `guided-tour:${user}:${company}`; }
export interface SavedTourProgress { id:number; revision:number; index:number; bindings:TourBindings; }
export function parseTourProgress(value: string | null): SavedTourProgress | null {
  try {
    const parsed = JSON.parse(value || 'null');
    if (!parsed || !Number.isInteger(parsed.id) || !Number.isInteger(parsed.revision) || !Number.isInteger(parsed.index) || parsed.index < 0) return null;
    if (!parsed.bindings || typeof parsed.bindings !== 'object' || Array.isArray(parsed.bindings)) return null;
    if (!Object.entries(parsed.bindings).every(([key,id]) => /^[a-z][a-z0-9_-]{0,79}$/.test(key) && typeof id === 'string' && /^[\w-]{1,100}$/.test(id))) return null;
    return { id:parsed.id,revision:parsed.revision,index:parsed.index,bindings:parsed.bindings };
  } catch { return null; }
}

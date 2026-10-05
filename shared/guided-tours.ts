import { z } from 'zod';

export const TOUR_MEDIA_LIMIT = 30 * 1024 * 1024;
export const localizedTourText = z.record(z.string().regex(/^[a-z]{2,3}(?:[-_][a-zA-Z0-9]+)*$/), z.string().max(12000));
const identifier = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
export const tourSelector = z.string().min(1).max(500).refine(value =>
  !/[<>\x00-\x1f]/.test(value) && !/:(?:has|visited)\b/i.test(value), 'Invalid target selector');
export const tourRoute = z.string().max(300).refine(value =>
  /^\/(?!\/)(?:[a-zA-Z0-9_/?=&.:%{}-])*$/.test(value) && !value.includes('..') && !value.startsWith('/api/'), 'Use an application route');
export const tourCompletionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('next') }).strict(),
  z.object({ type: z.literal('click'), selector: tourSelector.optional() }).strict(),
  z.object({ type: z.literal('change'), selector: tourSelector.optional(), nonEmpty: z.boolean().default(true) }).strict(),
  z.object({ type: z.literal('route'), path: tourRoute }).strict(),
  z.object({ type: z.literal('signal'), name: identifier, capture: identifier.optional(), resource: identifier.optional() }).strict(),
]);
export const tourMediaSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['image', 'video', 'pdf', 'youtube']),
  url: z.string().max(2000), caption: localizedTourText, alt: localizedTourText,
  language: z.string().max(30).optional(),
}).strict();
export const tourStepSchema = z.object({
  id: identifier, target: tourSelector, title: localizedTourText, content: localizedTourText,
  placement: z.enum(['auto', 'top', 'bottom', 'left', 'right', 'center']).default('auto'),
  completion: tourCompletionSchema,
  route: tourRoute.optional(),
  prepare: z.array(z.enum(['sidebar', 'erp-menu'])).max(2).default([]),
  media: z.array(tourMediaSchema).max(10).default([]),
  consequential: z.boolean().default(false),
  followDialogs: z.boolean().optional(),
}).strict();
export const tourDefinitionSchema = z.object({
  slug: identifier, feature: identifier, category: z.string().min(1).max(80),
  title: localizedTourText, description: localizedTourText,
  routes: z.array(tourRoute).min(1).max(20), order: z.number().int().min(0).max(10000).default(0),
  permissions: z.array(z.string().max(80)).max(30).default([]),
  businessTypes: z.array(z.enum(['standard', 'restaurant', 'dental'])).default([]),
  prerequisites: z.array(z.enum(['channel', 'patient', 'product', 'conversation'])).default([]),
  kind: z.enum(['overview', 'task']), media: z.array(tourMediaSchema).max(20).default([]),
  steps: z.array(tourStepSchema).min(1).max(100),
}).strict();
export type TourStep = z.infer<typeof tourStepSchema>;
export type TourMedia = z.infer<typeof tourMediaSchema>;
export type TourDefinition = z.infer<typeof tourDefinitionSchema>;
export interface TourRevision { revision: number; definition: TourDefinition; publishedAt?: string | null; }
export interface GuidedTour extends TourRevision {
  id: number; version: number; status: 'draft' | 'published' | 'archived';
  publishedRevision: number | null; unavailable?: string[];
}
// Admin search needs metadata only; steps and media are fetched on selection.
export interface GuidedTourSummary extends Omit<GuidedTour, 'definition'> {
  definition: Pick<TourDefinition, 'title' | 'feature' | 'order'>;
  stepCount: number;
}
export type TourBindings = Record<string, string>;
export const tourResumeSchema=z.object({index:z.number().int().nonnegative(),bindings:z.record(identifier,z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/))}).strict();
export const tourWriteSchema = z.object({ version: z.number().int().nonnegative(), definition: tourDefinitionSchema }).strict();
export const tourVersionSchema = z.object({ version: z.number().int().nonnegative() }).strict();

export function resolveTourText(text: Record<string, string>, language = 'en'): string {
  return text[language] || text[language.split(/[-_]/)[0].toLowerCase()] || text.en || Object.values(text).find(Boolean) || '';
}
export function bindTourValue(value: string, bindings: TourBindings): string | null {
  let valid = true;
  const result = value.replace(/\{\{([a-z][a-z0-9_-]*)\}\}/g, (_, key) => {
    const id = bindings[key];
    if (!id || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) { valid = false; return ''; }
    return id;
  });
  return valid ? result : null;
}
export function matchTourRoute(pattern: string, actual: string): boolean {
  const [path, query] = pattern.split('?');
  const url = new URL(actual, 'https://tour.local');
  const expression = path.split('/').map(part => part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
  if (!new RegExp(`^${expression}/?$`).test(url.pathname)) return false;
  return [...new URLSearchParams(query)].every(([key, value]) => url.searchParams.get(key) === value);
}
export function resolveTourRoute(pattern:string, actual:string):string | null {
  if(!pattern.includes(':')){
    const target=new URL(pattern,'https://tour.local'),current=new URL(actual,'https://tour.local');
    if(target.pathname===current.pathname)for(const key of ['contactId','patientId','channelId']){
      const value=current.searchParams.get(key);if(value && !target.searchParams.has(key))target.searchParams.set(key,value);
    }
    return target.pathname+target.search;
  }
  const [path,query]=pattern.split('?');
  if(!matchTourRoute(path,actual))return null;
  return new URL(actual,'https://tour.local').pathname+(query?`?${query}`:'');
}
export function contextualTours(tours: GuidedTour[], route: string): GuidedTour[] {
  const score = (tour: GuidedTour) => Math.max(-1, ...tour.definition.routes.map(pattern =>
    matchTourRoute(pattern, route) ? pattern.split('?')[0].length + (pattern.includes('?') ? 1000 : 0) : -1));
  return [...tours].sort((a, b) => score(b) - score(a) || a.definition.order - b.definition.order || a.id - b.id);
}
export function normalizeTourMediaUrl(value: string, kind: TourMedia['kind']): string | null {
  if (/^\/api\/guided-tours\/media\/[a-f0-9-]{36}$/.test(value) && kind !== 'youtube') return value;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (kind !== 'youtube') return url.href;
    const host = url.hostname.toLowerCase();
    const id = host === 'youtu.be' ? url.pathname.slice(1) : ['youtube.com', 'www.youtube.com', 'www.youtube-nocookie.com'].includes(host)
      ? url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1] : null;
    return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  } catch { return null; }
}
export function tourPublicationErrors(definition: TourDefinition, signals: readonly string[]): string[] {
  const errors: string[] = [];
  if (!definition.title.en?.trim() || !definition.description.en?.trim()) errors.push('default_language');
  if (new Set(definition.steps.map(step => step.id)).size !== definition.steps.length) errors.push('duplicate_steps');
  const captures = new Set<string>();
  for (const step of definition.steps) {
    if (!step.title.en?.trim() || !step.content.en?.trim()) errors.push('default_language');
    if (step.completion.type === 'signal' && !signals.includes(step.completion.name)) errors.push('unknown_signal');
    if (step.completion.type === 'signal' && step.completion.resource && !captures.has(step.completion.resource)) errors.push('missing_binding');
    for (const template of [step.target, step.route || '', step.completion.type === 'route' ? step.completion.path : '', (step.completion.type === 'click' || step.completion.type === 'change') ? step.completion.selector || '' : '']) {
      for (const match of template.matchAll(/\{\{([\w-]+)\}\}/g)) if (!captures.has(match[1])) errors.push('missing_binding');
    }
    if (step.completion.type === 'signal' && step.completion.capture) captures.add(step.completion.capture);
  }
  for (const media of [...definition.media, ...definition.steps.flatMap(step => step.media)]) {
    if (!normalizeTourMediaUrl(media.url, media.kind)) errors.push('invalid_media');
    if (!media.caption.en?.trim() || (media.kind === 'image' && !media.alt.en?.trim())) errors.push('media_description');
  }
  return [...new Set(errors)];
}

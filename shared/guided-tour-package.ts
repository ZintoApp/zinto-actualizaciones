import { z } from 'zod';
import { TOUR_MEDIA_LIMIT, type GuidedTour, type TourDefinition } from './guided-tours';

export const TOUR_PACKAGE_LIMITS = { zip: 250 * 1024 ** 2, expanded: 500 * 1024 ** 2, manifest: 20 * 1024 ** 2, tours: 500, entries: 5000, ttl: 30 * 60_000 } as const;
export const tourPackageSchema = z.object({
  format: z.literal('guided-tours'), version: z.literal(1),
  tours: z.array(z.object({ definition: z.unknown() }).strict()).min(1).max(TOUR_PACKAGE_LIMITS.tours),
  assets: z.array(z.object({ id: z.string().uuid(), path: z.string().regex(/^assets\/[a-f0-9-]{36}$/),
    mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'application/pdf']),
    size: z.number().int().positive().max(TOUR_MEDIA_LIMIT), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).max(TOUR_PACKAGE_LIMITS.entries - 1),
}).strict();
export type TourPackage = z.infer<typeof tourPackageSchema>;
const selection = z.object({ id: z.number().int().positive(), version: z.number().int().nonnegative() }).strict();
export const tourExportSchema = z.object({ tours: z.array(selection).min(1).max(TOUR_PACKAGE_LIMITS.tours) }).strict()
  .refine(value => new Set(value.tours.map(tour => tour.id)).size === value.tours.length);
export const tourImportSchema = z.object({ token: z.string().uuid(), selections: z.array(z.object({
  index: z.number().int().nonnegative(), action: z.enum(['copy', 'replace']), destination: selection.optional(),
}).strict()).min(1).max(TOUR_PACKAGE_LIMITS.tours), confirmReplacements: z.boolean().default(false) }).strict()
  .refine(value => new Set(value.selections.map(item => item.index)).size === value.selections.length);
export type TourImportRequest = z.infer<typeof tourImportSchema>;
export interface TourImportPreview {
  token: string; expiresAt: number;
  tours: { index: number; title: Record<string, string>; slug: string; feature: string; steps: number; media: number;
    languages: string[]; errors: string[]; warnings: string[];
    match?: Pick<GuidedTour, 'id' | 'version' | 'status'> & { title: Record<string, string> };
  }[];
}
export const tourMediaItems = (definition: TourDefinition) => [...definition.media, ...definition.steps.flatMap(step => step.media)];

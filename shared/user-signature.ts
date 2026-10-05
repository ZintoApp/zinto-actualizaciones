import { z } from 'zod';

export const SIGNATURE_MAX_BYTES = 5 * 1024 * 1024;
export const SIGNATURE_MAX_DIMENSION = 2048;
export const signatureSettingsSchema = z.object({
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  crop: z.object({ x: z.number().min(0).max(99), y: z.number().min(0).max(99), width: z.number().min(1).max(100), height: z.number().min(1).max(100) })
    .refine(crop => crop.x + crop.width <= 100.01 && crop.y + crop.height <= 100.01),
  brightness: z.number().min(-100).max(100), contrast: z.number().min(-100).max(100),
  removeBackground: z.boolean(), threshold: z.number().min(150).max(254),
}).strict();
export type SignatureSettings = z.infer<typeof signatureSettingsSchema>;
export const DEFAULT_SIGNATURE_SETTINGS: SignatureSettings = { rotation: 0, crop: { x: 0, y: 0, width: 100, height: 100 }, brightness: 0, contrast: 0, removeBackground: false, threshold: 220 };
export type UserSignatureMetadata = { revision: string; updatedAt: string; settings: SignatureSettings; imageUrl: string; originalUrl: string };
export function signatureCropPixels(crop: SignatureSettings['crop'], width: number, height: number) {
  const left = Math.floor(crop.x * width / 100), top = Math.floor(crop.y * height / 100);
  return { left, top, width: Math.max(1, Math.min(width - left, Math.floor(crop.width * width / 100))), height: Math.max(1, Math.min(height - top, Math.floor(crop.height * height / 100))) };
}
/** Identical color and alpha adjustments for the live canvas and server output. */
export function enhanceSignaturePixels(pixels: Uint8Array | Uint8ClampedArray, settings: SignatureSettings) {
  const contrast = 2 ** (settings.contrast / 50), brightness = settings.brightness * 2.55;
  for (let i = 0; i < pixels.length; i += 4) {
    for (let c = 0; c < 3; c++) pixels[i + c] = Math.max(0, Math.min(255, Math.round((pixels[i + c] - 128) * contrast + 128 + brightness)));
    if (settings.removeBackground) {
      const light = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
      if (light > settings.threshold) pixels[i + 3] = Math.round(pixels[i + 3] * (255 - light) / (255 - settings.threshold));
    }
  }
}

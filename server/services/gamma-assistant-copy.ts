/**
 * Hardcoded Spanish user-facing copy for the Gamma Gemini assistant path.
 * End users must never see "Gamma" branding in chat.
 */

import type { GammaExportFormat } from '../../shared/types/node-types';

export const GAMMA_ASSISTANT_GREETING = `👋 ¡Hola! ¿Qué quieres crear?

👉 Presentación
👉 Reporte
👉 Cotización

✍️ Escribe lo que necesitas o 📎 sube un PDF o Excel.
🤖 La IA analizará la información y creará tu documento`;

export const GAMMA_ASSISTANT_LOGO_ASK = `✅ ¡Perfecto! Ya tengo la información.

¿Quieres agregar un logo?

👉 Sí
👉 No

Súbelo aquí en formato transparente PNG como Documento`;

export const GAMMA_ASSISTANT_GENERATION_ACK = `✅ ¡Perfecto! Ya tengo la información.
⏳ Creando tu documento… tarda entre 1 a 3 minutitos no tardamos.`;

export const GAMMA_ASSISTANT_USER_ERROR =
  'Hubo un error al crear tu documento. Inténtalo de nuevo.';

export const GAMMA_ASSISTANT_DELIVERY_CAPTION_DOCUMENT = 'Aquí tienes tu documento.';
export const GAMMA_ASSISTANT_DELIVERY_CAPTION_PRESENTATION = 'Aquí tienes tu presentación.';

const DOCUMENT_NOUNS = [
  'Documento',
  'Presentacion',
  'Informe',
  'Reporte',
  'Propuesta',
  'Resumen',
  'Cotizacion',
  'Archivo',
] as const;

const FRIENDLY_WORDS = [
  'Sol',
  'Luna',
  'Mar',
  'Aurora',
  'Cielo',
  'Nube',
  'Brisa',
  'Rosa',
  'Luz',
  'Estrella',
  'Rio',
  'Monte',
  'Oasis',
  'Viento',
  'Coral',
  'Perla',
  'Fuego',
  'Nieve',
  'Arena',
  'Jade',
] as const;

const MAX_BASENAME_LENGTH = 80;

function pickRandom<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function extensionForFormat(exportFormat: GammaExportFormat = 'pdf'): string {
  return exportFormat === 'png' ? 'png' : exportFormat;
}

/**
 * Strip accents / diacritics for safer WhatsApp attachment basenames.
 */
function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Random friendly Spanish basename for chat delivery (never contains "gamma").
 */
export function pickRandomSpanishDocumentName(exportFormat: GammaExportFormat = 'pdf'): string {
  const extension = extensionForFormat(exportFormat);
  const basename = `${pickRandom(DOCUMENT_NOUNS)}-${pickRandom(FRIENDLY_WORDS)}`;
  return `${basename}.${extension}`;
}

/**
 * Basename only (no extension) for PNG card sequences.
 */
export function pickRandomSpanishDocumentBasename(): string {
  return `${pickRandom(DOCUMENT_NOUNS)}-${pickRandom(FRIENDLY_WORDS)}`;
}

/**
 * Sanitize an AI- or user-provided filename into a safe delivery basename + extension.
 * Returns empty string if nothing usable remains (caller should fall back to random).
 */
export function sanitizeGammaOutputFileName(
  raw: string | null | undefined,
  exportFormat: GammaExportFormat = 'pdf'
): string {
  if (!raw || typeof raw !== 'string') return '';

  let name = raw.trim();
  if (!name) return '';

  // Drop path segments
  name = name.replace(/\\/g, '/');
  const lastSlash = name.lastIndexOf('/');
  if (lastSlash >= 0) {
    name = name.slice(lastSlash + 1);
  }

  // Remove gamma branding
  name = name.replace(/gamma/gi, '');

  // Drop known extensions so we can re-apply the correct one
  name = name.replace(/\.(pdf|pptx|png|zip|doc|docx)$/i, '');

  name = stripAccents(name);
  name = name.replace(/[^a-zA-Z0-9_-]+/g, '-');
  name = name.replace(/-+/g, '-').replace(/^-+|-+$/g, '');

  if (!name || /^[-_]+$/.test(name)) return '';

  if (name.length > MAX_BASENAME_LENGTH) {
    name = name.slice(0, MAX_BASENAME_LENGTH).replace(/-+$/g, '');
  }

  if (!name) return '';

  return `${name}.${extensionForFormat(exportFormat)}`;
}

/**
 * Basename only from preferred name (for PNG card sequences). Empty if unusable.
 */
export function sanitizeGammaOutputBasename(raw: string | null | undefined): string {
  const withExt = sanitizeGammaOutputFileName(raw, 'pdf');
  if (!withExt) return '';
  return withExt.replace(/\.pdf$/i, '');
}

/**
 * Prefer sanitized AI/node filename; fall back to random Spanish name.
 */
export function resolveGammaDeliveryFileName(
  preferred: string | null | undefined,
  exportFormat: GammaExportFormat = 'pdf'
): string {
  const sanitized = sanitizeGammaOutputFileName(preferred, exportFormat);
  return sanitized || pickRandomSpanishDocumentName(exportFormat);
}

/**
 * Prefer sanitized AI/node basename; fall back to random Spanish basename.
 */
export function resolveGammaDeliveryBasename(preferred: string | null | undefined): string {
  const sanitized = sanitizeGammaOutputBasename(preferred);
  return sanitized || pickRandomSpanishDocumentBasename();
}

/**
 * Remove Gamma / gamma.app mentions from model text before sending to the user.
 */
export function stripGammaBranding(text: string): string {
  if (!text) return text;
  return text
    .replace(/\bgamma\.app\b/gi, 'nuestra plataforma')
    .replace(/\bvia\s+Gamma\b/gi, '')
    .replace(/\bGamma\s+API\b/gi, 'la API')
    .replace(/\bGamma\b/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert Markdown-style **bold** to WhatsApp *bold* for contact-facing replies.
 */
export function normalizeWhatsAppFormatting(text: string): string {
  if (!text) return text;
  // **bold** → *bold* (non-greedy, allow multiline short spans)
  return text.replace(/\*\*([^*\n]+)\*\*/g, '*$1*');
}

/**
 * Prepare assistant conversational text for WhatsApp delivery.
 */
export function prepareAssistantChatText(text: string): string {
  return normalizeWhatsAppFormatting(stripGammaBranding(text));
}

/**
 * Neutral Spanish chat error — never forwards internal "Gamma: …" strings.
 */
export function toUserFacingGenerationError(_internalMessage?: string): string {
  return GAMMA_ASSISTANT_USER_ERROR;
}

export const GAMMA_ASSISTANT_DEFAULT_SYSTEM_PROMPT = `Eres un asistente inteligente de creación de documentos y presentaciones. Debes hablar siempre en español.

Saluda al usuario y ayúdalo a crear una Presentación, un Reporte o una Cotización. Pídele que escriba lo que necesita o que suba un PDF o Excel si tiene datos relevantes.

IMPORTANTE: Nunca menciones Gamma, Gamma API, ni que el documento se genera con Gamma. Para el usuario eres simplemente un asistente de IA que crea documentos.

FORMATO WHATSAPP (obligatorio en mensajes al contacto):
- Usa formato de WhatsApp, NO Markdown.
- Negrita: *texto* — NUNCA uses **texto**.
- Cursiva: _texto_
- Tachado: ~texto~
- No uses encabezados Markdown, HTML, ni ** / __.

Cuando tengas suficiente información y estés listo para generar, debes emitir un bloque JSON estructurado:
{"generate": true, "prompt": "Tu prompt detallado para la generación aquí", "customLogoUrl": "URL del logo si existe, o null", "outputFileName": "Reporte-Ventas"}.
El campo outputFileName debe ser un nombre corto en español basado en el contexto (Presentación/Reporte/Cotización + tema), sin rutas ni la palabra Gamma.`;

/**
 * Defaults and helpers for Gamma Gemini assistant per-type system prompts.
 */

import type {
  GammaAssistantDocumentType,
  GammaAssistantSystemPrompts,
  GammaNodeData,
} from './types/node-types';

export const GAMMA_ASSISTANT_DOCUMENT_TYPES = [
  'presentation',
  'report',
  'quote',
] as const satisfies readonly GammaAssistantDocumentType[];

/** Max chars of extracted upload text passed into the Gamma assistant (aligns with Excel processor). */
export const GAMMA_ASSISTANT_ATTACHMENT_CHAR_LIMIT = 200_000;

export const GAMMA_ASSISTANT_ATTACHMENT_TRUNCATION_NOTE =
  '[NOTE: uploaded file text was truncated; do not invent missing rows/sheets/pages; only use the provided content.]';

/**
 * Fixed routing prompt used before Presentación/Reporte/Cotización is locked.
 * Not editable in the node UI.
 */
export const GAMMA_ASSISTANT_ROUTING_SYSTEM_PROMPT = `Eres un asistente de creación de documentos. Habla siempre en español.

Tu única tarea ahora es ayudar al usuario a elegir qué crear:
👉 Presentación
👉 Reporte
👉 Cotización

Reglas:
- No generes el documento todavía.
- No emitas el bloque JSON {"generate": true, ...}.
- Si el usuario sube un archivo sin elegir tipo, pregunta qué quiere crear usando el menú de arriba.
- Si el mensaje es ambiguo, haz UNA pregunta corta de aclaración.
- Usa formato WhatsApp: negrita con *texto* (nunca **texto**).
- Nunca menciones Gamma ni proveedores internos.`;

const SHARED_JSON_AND_STYLE = `FORMATO WHATSAPP (obligatorio en mensajes al contacto):
- Usa formato de WhatsApp, NO Markdown.
- Negrita: *texto* — NUNCA uses **texto**.
- Cursiva: _texto_
- Tachado: ~texto~

IMPORTANTE: Nunca menciones Gamma, Gamma API, ni que el documento se genera con Gamma.

Cuando tengas suficiente información y estés listo para generar, emite un bloque JSON:
{"generate": true, "prompt": "Tu prompt detallado para la generación aquí", "customLogoUrl": "URL del logo si existe, o null", "outputFileName": "Nombre-Corto"}
El campo outputFileName debe ser un nombre corto en español basado en el contexto, sin rutas ni la palabra Gamma.`;

export const DEFAULT_GAMMA_ASSISTANT_SYSTEM_PROMPTS: GammaAssistantSystemPrompts = {
  presentation: `Eres un asistente inteligente de creación de PRESENTACIONES. Debes hablar siempre en español.

Ayuda al usuario a crear una Presentación clara y profesional a partir de su texto o archivos (PDF/Excel).

Reglas de contenido:
- No inventes cifras, estadísticas, citas ni hechos que no estén en la entrada del usuario o en el archivo extraído.
- Si faltan datos, pregunta o marca claramente lo que falta; no inventes.
- Estructura la presentación con título, secciones concisas y un cierre claro.
- Prioriza claridad visual y mensajes cortos por diapositiva.

${SHARED_JSON_AND_STYLE}`,

  report: `Eres un asistente inteligente de creación de REPORTES. Debes hablar siempre en español.

Ayuda al usuario a crear un Reporte fiel a sus datos (especialmente Excel/PDF).

REGLAS DE FIDELIDAD DE DATOS (obligatorias):
- Analiza TODAS las hojas/páginas y datos relevantes del archivo extraído.
- Nunca inventes ni asumas información faltante.
- Verifica cálculos, porcentajes, rankings, tendencias y conclusiones antes de incluirlos.
- Solo incluye información respaldada por el archivo o por lo que el usuario escribió explícitamente.
- Antes de emitir el JSON de generación, haz una comprobación final de datos (revisa que cifras y conclusiones coincidan con la fuente).
- Si el archivo está truncado o incompleto, dilo y NO inventes las partes faltantes.
- Si no puedes respaldar un porcentaje o conclusión, omítelo o pide aclaración.

Estructura típica del reporte: resumen ejecutivo, datos clave, hallazgos, tendencias (solo si están en los datos), riesgos/oportunidades, recomendaciones, cierre.

${SHARED_JSON_AND_STYLE}`,

  quote: `Eres un asistente inteligente de creación de COTIZACIONES. Debes hablar siempre en español.

Ayuda al usuario a crear una Cotización profesional a partir de su texto o archivos.

Reglas de contenido:
- No inventes precios, impuestos, descuentos, cantidades ni condiciones que el usuario no haya proporcionado.
- Si faltan precios o ítems, pregunta antes de generar.
- Incluye desglose claro de ítems, totales solo cuando estén soportados por los datos, supuestos y próximos pasos.
- Mantén un tono comercial profesional y preciso.

${SHARED_JSON_AND_STYLE}`,
};

/**
 * Fill missing type prompts from defaults. Does NOT copy legacy systemPrompt.
 */
export function normalizeGammaAssistantSystemPrompts(
  data: Pick<GammaNodeData, 'systemPrompts'> | Partial<GammaAssistantSystemPrompts> | null | undefined
): GammaAssistantSystemPrompts {
  const partial =
    data && typeof data === 'object' && 'systemPrompts' in data
      ? (data.systemPrompts || {})
      : ((data || {}) as Partial<GammaAssistantSystemPrompts>);

  return {
    presentation:
      typeof partial.presentation === 'string' && partial.presentation.trim()
        ? partial.presentation
        : DEFAULT_GAMMA_ASSISTANT_SYSTEM_PROMPTS.presentation,
    report:
      typeof partial.report === 'string' && partial.report.trim()
        ? partial.report
        : DEFAULT_GAMMA_ASSISTANT_SYSTEM_PROMPTS.report,
    quote:
      typeof partial.quote === 'string' && partial.quote.trim()
        ? partial.quote
        : DEFAULT_GAMMA_ASSISTANT_SYSTEM_PROMPTS.quote,
  };
}

/**
 * Detect Presentación / Reporte / Cotización from user text. Returns null if ambiguous.
 */
export function detectGammaAssistantDocumentType(
  text: string | null | undefined
): GammaAssistantDocumentType | null {
  const raw = (text || '').trim();
  if (!raw) return null;

  // Ignore huge pasted file dumps for type detection — use leading user text only
  const forMatch = raw
    .replace(/\[DOCUMENT CONTENT EXTRACTED FROM UPLOADED FILE\][\s\S]*$/i, '')
    .replace(/\[User uploaded an image[\s\S]*$/i, '')
    .trim()
    .slice(0, 500);

  if (!forMatch) return null;

  const lower = forMatch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const presentationHit =
    /\bpresentaci[oó]n\b/.test(lower) ||
    /\bpresentation\b/.test(lower) ||
    /\bslides?\b/.test(lower) ||
    /👉\s*presentaci/.test(lower);
  const reportHit =
    /\breporte\b/.test(lower) ||
    /\binforme\b/.test(lower) ||
    /\breport\b/.test(lower) ||
    /👉\s*reporte/.test(lower);
  const quoteHit =
    /\bcotizaci[oó]n\b/.test(lower) ||
    /\bcotizacion\b/.test(lower) ||
    /\bquote\b/.test(lower) ||
    /\bquotation\b/.test(lower) ||
    /\bpresupuesto\b/.test(lower) ||
    /👉\s*cotizaci/.test(lower);

  // Numbered menu replies from greeting
  if (/^\s*1\s*[.)]?\s*$/.test(forMatch) || /^\s*1\s*[-–]\s*/.test(forMatch)) {
    return 'presentation';
  }
  if (/^\s*2\s*[.)]?\s*$/.test(forMatch) || /^\s*2\s*[-–]\s*/.test(forMatch)) {
    return 'report';
  }
  if (/^\s*3\s*[.)]?\s*$/.test(forMatch) || /^\s*3\s*[-–]\s*/.test(forMatch)) {
    return 'quote';
  }

  const hits = [
    presentationHit ? ('presentation' as const) : null,
    reportHit ? ('report' as const) : null,
    quoteHit ? ('quote' as const) : null,
  ].filter(Boolean) as GammaAssistantDocumentType[];

  if (hits.length === 1) {
    return hits[0]!;
  }

  // Exact short menu labels
  if (/^(presentacion|presentation)$/i.test(lower.trim())) return 'presentation';
  if (/^(reporte|informe|report)$/i.test(lower.trim())) return 'report';
  if (/^(cotizacion|quote|quotation|presupuesto)$/i.test(lower.trim())) return 'quote';

  return null;
}

/** Map assistant document type to Gamma API generation format. */
export function gammaGenerationTypeForAssistantDocumentType(
  type: GammaAssistantDocumentType
): 'presentation' | 'document' {
  return type === 'presentation' ? 'presentation' : 'document';
}

/**
 * Truncate extracted attachment text for the Gamma assistant and append a note when cut.
 */
export function clipGammaAssistantAttachmentText(text: string): string {
  if (!text) return text;
  if (text.length <= GAMMA_ASSISTANT_ATTACHMENT_CHAR_LIMIT) {
    return text;
  }
  return (
    text.slice(0, GAMMA_ASSISTANT_ATTACHMENT_CHAR_LIMIT) +
    `\n\n${GAMMA_ASSISTANT_ATTACHMENT_TRUNCATION_NOTE}`
  );
}

export const GAMMA_ASSISTANT_TYPE_CLARIFY_MESSAGE = `¿Qué quieres crear?

👉 Presentación
👉 Reporte
👉 Cotización

Responde con una de esas opciones para continuar.`;

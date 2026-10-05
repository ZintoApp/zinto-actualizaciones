/**
 * Google Cloud / Vertex / Slides configuration for Document Generator.
 */

import type { DocumentGeneratorResolvedType } from './types/node-types';

export const DOCUMENT_GENERATOR_OUTPUT_FORMATS = [
  'pdf',
  'pptx',
  'google_slides_link',
  'png_per_slide',
] as const;

export type DocumentGeneratorOutputFormat =
  (typeof DOCUMENT_GENERATOR_OUTPUT_FORMATS)[number];

export const DOCUMENT_GENERATOR_DEFAULT_OUTPUT_FORMAT: DocumentGeneratorOutputFormat = 'pdf';

export const DOCUMENT_GENERATOR_DEFAULT_GCP_LOCATION = 'us-central1';

export const DOCUMENT_GENERATOR_DEFAULT_VERTEX_TEXT_MODEL = 'gemini-2.0-flash-001';

export const DOCUMENT_GENERATOR_DEFAULT_VERTEX_IMAGEN_MODEL = 'imagen-3.0-generate-002';

export const DOCUMENT_GENERATOR_VERTEX_TEXT_MODELS = [
  { id: 'gemini-2.0-flash-001', label: 'Gemini 2.0 Flash (recommended)' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
] as const;

export type DocumentGeneratorVertexTextModelId =
  (typeof DOCUMENT_GENERATOR_VERTEX_TEXT_MODELS)[number]['id'];

export const DOCUMENT_GENERATOR_SLIDES_THEMES = [
  { id: 'professional', name: 'Professional (blue/white)' },
  { id: 'modern', name: 'Modern (dark accent)' },
  { id: 'minimal', name: 'Minimal (clean gray)' },
] as const;

export type DocumentGeneratorSlidesThemeId =
  (typeof DOCUMENT_GENERATOR_SLIDES_THEMES)[number]['id'];

export const DOCUMENT_GENERATOR_DEFAULT_SLIDES_THEME_ID: DocumentGeneratorSlidesThemeId =
  'professional';

export type DocumentGeneratorWizardStep =
  | 'choose_mode'
  | 'wait_own_template'
  | 'ask_logo'
  | 'ensure_content'
  | 'ask_entry_mode'
  | 'paste_content'
  | 'ask_field'
  | 'generating'
  | 'done';

export type DocumentGeneratorGenerationMode =
  | 'vertex_slides'
  | 'clone'
  | 'gemini_html'
  | 'gemini_image';

export interface DocumentDeckSlide {
  title: string;
  subtitle?: string;
  bullets: string[];
  speakerNotes?: string;
  imagePrompt?: string;
}

export interface DocumentDeckStructure {
  title: string;
  slides: DocumentDeckSlide[];
}

const OUTPUT_FORMAT_SET = new Set<string>(DOCUMENT_GENERATOR_OUTPUT_FORMATS);

export function normalizeDocumentGeneratorOutputFormat(
  value: unknown
): DocumentGeneratorOutputFormat {
  if (typeof value === 'string' && OUTPUT_FORMAT_SET.has(value)) {
    return value as DocumentGeneratorOutputFormat;
  }
  return DOCUMENT_GENERATOR_DEFAULT_OUTPUT_FORMAT;
}

export function normalizeDocumentGeneratorVertexTextModel(
  value: unknown
): DocumentGeneratorVertexTextModelId {
  if (
    typeof value === 'string' &&
    DOCUMENT_GENERATOR_VERTEX_TEXT_MODELS.some((model) => model.id === value)
  ) {
    return value as DocumentGeneratorVertexTextModelId;
  }
  return DOCUMENT_GENERATOR_DEFAULT_VERTEX_TEXT_MODEL;
}

export function normalizeDocumentGeneratorSlidesThemeId(
  value: unknown
): DocumentGeneratorSlidesThemeId {
  if (
    typeof value === 'string' &&
    DOCUMENT_GENERATOR_SLIDES_THEMES.some((theme) => theme.id === value)
  ) {
    return value as DocumentGeneratorSlidesThemeId;
  }
  return DOCUMENT_GENERATOR_DEFAULT_SLIDES_THEME_ID;
}

export function documentGeneratorOutputFormatUsesGcp(
  outputFormat: DocumentGeneratorOutputFormat
): boolean {
  return outputFormat !== 'pdf';
}

export function documentGeneratorResolvedTypeUsesGcpDeck(
  resolvedType: DocumentGeneratorResolvedType
): boolean {
  return resolvedType === 'presentation' || resolvedType === 'report';
}

export function parseDocumentDeckStructure(raw: string): DocumentDeckStructure {
  const parsed = JSON.parse(raw) as DocumentDeckStructure;
  if (!parsed || typeof parsed.title !== 'string' || !Array.isArray(parsed.slides)) {
    throw new Error('Vertex AI returned invalid deck structure');
  }
  parsed.slides = parsed.slides.map((slide, index) => ({
    title: String(slide?.title || `Slide ${index + 1}`).trim(),
    subtitle: slide?.subtitle ? String(slide.subtitle).trim() : undefined,
    bullets: Array.isArray(slide?.bullets)
      ? slide.bullets.map((item) => String(item).trim()).filter(Boolean)
      : [],
    speakerNotes: slide?.speakerNotes ? String(slide.speakerNotes).trim() : undefined,
    imagePrompt: slide?.imagePrompt ? String(slide.imagePrompt).trim() : undefined,
  }));
  return parsed;
}

export function buildQuoteDeckStructure(content: string, slideCount: number): DocumentDeckStructure {
  const chunks = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const slides: DocumentDeckSlide[] = [];
  for (let index = 0; index < slideCount; index++) {
    const chunk = chunks[index] || chunks[chunks.length - 1] || content.trim();
    const lines = chunk.split('\n').map((line) => line.trim()).filter(Boolean);
    slides.push({
      title: lines[0] || `Section ${index + 1}`,
      bullets: lines.slice(1).length > 0 ? lines.slice(1) : [chunk],
    });
  }
  return {
    title: linesTitle(content) || 'Quote',
    slides,
  };
}

function linesTitle(content: string): string {
  const firstLine = content.split('\n').map((line) => line.trim()).find(Boolean);
  return firstLine || '';
}

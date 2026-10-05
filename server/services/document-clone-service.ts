/**
 * Clone a reference PDF's visual style into a new PDF filled with fresh content.
 * Pipeline: Google Gemini (HTML from PDF reference) → Playwright HTML→PDF.
 */

import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  DOCUMENT_GENERATOR_DEFAULT_GEMINI_MODEL,
  geminiModelRequiresThinkingMode,
  getGeminiThinkingBudget,
  normalizeDocumentGeneratorGeminiModel,
} from '@shared/document-generator-defaults';

const MAX_PDF_BYTES = 12 * 1024 * 1024;

export interface DocumentCloneRequest {
  referencePdfPath: string;
  content: string;
  apiKey: string;
  model?: string;
  logoPath?: string | null;
  language?: string;
}

export interface DocumentCloneResult {
  pdfPath: string;
  model: string;
}

export type HtmlToPdfFn = (html: string, outputPath: string) => Promise<void>;
export type GenerateCloneHtmlFn = (params: {
  apiKey: string;
  model: string;
  pdfBase64: string;
  content: string;
  logoBase64?: string | null;
  logoMimeType?: string | null;
  language?: string;
}) => Promise<string>;

let htmlToPdfImpl: HtmlToPdfFn | undefined;
let generateCloneHtmlImpl: GenerateCloneHtmlFn | undefined;

/** Test hooks — inject mocks without hitting Playwright / Gemini. */
export function setDocumentCloneHtmlToPdfForTests(fn: HtmlToPdfFn | undefined): void {
  htmlToPdfImpl = fn;
}

export function setDocumentCloneGenerateHtmlForTests(fn: GenerateCloneHtmlFn | undefined): void {
  generateCloneHtmlImpl = fn;
}

async function defaultHtmlToPdf(html: string, outputPath: string): Promise<void> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    });
  } finally {
    await browser.close();
  }
}

export function extractHtmlDocument(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || trimmed).trim();
  if (!/<html[\s>]/i.test(candidate)) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
body{font-family:Arial,sans-serif;margin:24px;color:#111}
</style></head><body>${candidate}</body></html>`;
  }
  return candidate;
}

function buildClonePrompt(params: {
  content: string;
  language?: string;
  hasLogo: boolean;
}): string {
  return [
    'You are a document layout cloning engine.',
    'Recreate the visual style of the attached reference quote/document PDF as a single self-contained HTML document.',
    'Fill the document with the NEW content below — do not copy old client names, prices, or dates from the reference unless they also appear in the new content.',
    'Match colors, typography, spacing, section structure, and table layout as closely as possible.',
    'Return ONLY HTML (a full <html> document with inline CSS). No markdown fences.',
    params.language ? `Language for all visible text: ${params.language}.` : '',
    params.hasLogo
      ? 'A logo image is attached — place it where the reference shows a logo (or top-left/header if unclear).'
      : 'No logo was provided — omit logo placeholders.',
    '',
    'NEW CONTENT:',
    params.content,
  ]
    .filter(Boolean)
    .join('\n');
}

async function defaultGenerateCloneHtml(params: {
  apiKey: string;
  model: string;
  pdfBase64: string;
  content: string;
  logoBase64?: string | null;
  logoMimeType?: string | null;
  language?: string;
}): Promise<string> {
  const genAI = new GoogleGenerativeAI(params.apiKey);
  const model = genAI.getGenerativeModel({ model: params.model });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    {
      text: buildClonePrompt({
        content: params.content,
        language: params.language,
        hasLogo: Boolean(params.logoBase64),
      }),
    },
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: params.pdfBase64,
      },
    },
  ];

  if (params.logoBase64) {
    parts.push({
      inlineData: {
        mimeType: params.logoMimeType || 'image/png',
        data: params.logoBase64,
      },
    });
  }

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 16384,
      // Prefer visible HTML output over long internal reasoning for clone tasks.
      thinkingConfig: { thinkingBudget: getGeminiThinkingBudget(params.model, 'generation') },
    } as any,
  });

  let text = '';
  try {
    text = result.response.text();
  } catch {
    text = '';
  }
  if (!text || !text.trim()) {
    const partsOut = result.response.candidates?.[0]?.content?.parts || [];
    text = partsOut
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('');
  }
  if (!text || !text.trim()) {
    throw new Error('Document clone model returned empty HTML.');
  }
  return extractHtmlDocument(text);
}

function mimeTypeForImagePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * Ping Gemini with a tiny request to validate the API key / model.
 * Thinking models (2.5 / 3.5) can consume the entire maxOutputTokens budget on
 * internal reasoning, leaving response.text() empty — keep the ping generous and
 * request minimal thinking when the API accepts it.
 */
export async function testGeminiCloneCredentials(params: {
  apiKey: string;
  model?: string;
}): Promise<{ ok: true; model: string } | { ok: false; error: string }> {
  const apiKey = (params.apiKey || '').trim();
  if (!apiKey) {
    return {
      ok: false,
      error: 'Gemini API key is required on the Document Generator node.',
    };
  }

  const modelId = normalizeDocumentGeneratorGeminiModel(params.model);

  const extractText = (result: any): string => {
    try {
      const direct = result?.response?.text?.()?.trim?.() || '';
      if (direct) return direct;
    } catch {
      // blocked / no text parts
    }
    const parts = result?.response?.candidates?.[0]?.content?.parts || [];
    return parts
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  };

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelId });
    const requiresThinking = geminiModelRequiresThinkingMode(modelId);

    // Thinking-only models (3.1 Pro) reject thinkingBudget=0 — use thinking mode from the start.
    let result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Reply with exactly the word OK.' }] }],
      generationConfig: {
        maxOutputTokens: requiresThinking ? 1024 : 256,
        temperature: 0,
        thinkingConfig: {
          thinkingBudget: getGeminiThinkingBudget(modelId, 'ping'),
        },
      } as any,
    });

    let text = extractText(result);
    if (!text && !requiresThinking) {
      // Retry with more thinking room for models that support optional thinking.
      result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Reply with exactly the word OK.' }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          temperature: 0,
          thinkingConfig: { thinkingBudget: getGeminiThinkingBudget(modelId, 'ping') },
        } as any,
      });
      text = extractText(result);
    }

    if (!text) {
      const finishReason = result?.response?.candidates?.[0]?.finishReason;
      return {
        ok: false,
        error: finishReason
          ? `Gemini returned an empty response (${finishReason}). Try Gemini 2.5 Flash for a quicker connection test.`
          : 'Gemini returned an empty response. Try Gemini 2.5 Flash — thinking models may use all tokens on reasoning.',
      };
    }
    return { ok: true, model: modelId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Gemini connection failed',
    };
  }
}

/**
 * Clone a reference PDF into a new PDF that matches its visual style with new content.
 */
export async function cloneDocumentFromReference(
  request: DocumentCloneRequest
): Promise<DocumentCloneResult> {
  const apiKey = (request.apiKey || '').trim();
  if (!apiKey) {
    throw new Error(
      'Gemini API key is required for document cloning. Set it on the Document Generator node (Interactive quote wizard → Gemini API key).'
    );
  }

  const referencePath = request.referencePdfPath;
  if (!(await fs.pathExists(referencePath))) {
    throw new Error('Reference document file was not found.');
  }

  const ext = path.extname(referencePath).toLowerCase();
  if (ext !== '.pdf') {
    throw new Error(
      'Own-template cloning currently supports PDF references only. Please upload a PDF of your quote.'
    );
  }

  const stats = await fs.stat(referencePath);
  if (stats.size > MAX_PDF_BYTES) {
    throw new Error(
      `Reference PDF is too large (max ${Math.floor(MAX_PDF_BYTES / (1024 * 1024))}MB).`
    );
  }

  const htmlToPdf = htmlToPdfImpl || defaultHtmlToPdf;
  const generateHtml = generateCloneHtmlImpl || defaultGenerateCloneHtml;
  const model = normalizeDocumentGeneratorGeminiModel(
    request.model || DOCUMENT_GENERATOR_DEFAULT_GEMINI_MODEL
  );

  const pdfBase64 = (await fs.readFile(referencePath)).toString('base64');

  let logoBase64: string | null = null;
  let logoMimeType: string | null = null;
  if (request.logoPath && (await fs.pathExists(request.logoPath))) {
    logoBase64 = (await fs.readFile(request.logoPath)).toString('base64');
    logoMimeType = mimeTypeForImagePath(request.logoPath);
  }

  const html = await generateHtml({
    apiKey,
    model,
    pdfBase64,
    content: request.content,
    logoBase64,
    logoMimeType,
    language: request.language,
  });

  const outputPath = path.join(os.tmpdir(), `doc-clone-${randomUUID()}.pdf`);
  await htmlToPdf(html, outputPath);

  return { pdfPath: outputPath, model };
}

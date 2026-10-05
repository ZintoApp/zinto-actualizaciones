/**
 * Design a Canva-like quote as HTML/CSS via Gemini, then render A4 PDF with Playwright.
 * Logo is injected server-side via {{LOGO_SRC}} so image bytes stay intact.
 */

import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  DOCUMENT_GENERATOR_DEFAULT_GEMINI_MODEL,
  DOCUMENT_GENERATOR_LOGO_SRC_TOKEN,
  getGeminiThinkingBudget,
  normalizeDocumentGeneratorGeminiModel,
} from '@shared/document-generator-defaults';
import { buildQuoteHtmlPrompt } from '@shared/document-quote-design-prompt';
import { extractHtmlDocument } from './document-clone-service';

export interface DocumentHtmlDesignRequest {
  content: string;
  apiKey: string;
  model?: string;
  logoPath?: string | null;
  language?: string;
}

export interface DocumentHtmlDesignResult {
  pdfPath: string;
  model: string;
  html?: string;
}

export type HtmlToPdfFn = (html: string, outputPath: string) => Promise<void>;
export type GenerateQuoteHtmlFn = (params: {
  apiKey: string;
  model: string;
  content: string;
  language?: string;
  hasLogo: boolean;
  logoBase64?: string | null;
  logoMimeType?: string | null;
}) => Promise<string>;

let htmlToPdfImpl: HtmlToPdfFn | undefined;
let generateQuoteHtmlImpl: GenerateQuoteHtmlFn | undefined;

/** Test hooks — inject mocks without hitting Playwright / Gemini. */
export function setDocumentHtmlDesignHtmlToPdfForTests(fn: HtmlToPdfFn | undefined): void {
  htmlToPdfImpl = fn;
}

export function setDocumentHtmlDesignGenerateHtmlForTests(
  fn: GenerateQuoteHtmlFn | undefined
): void {
  generateQuoteHtmlImpl = fn;
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
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
  } finally {
    await browser.close();
  }
}

function mimeTypeForImagePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export function injectLogoIntoHtml(
  html: string,
  logoDataUri: string | null
): string {
  if (!logoDataUri) {
    return html
      .replace(new RegExp(DOCUMENT_GENERATOR_LOGO_SRC_TOKEN.replace(/[{}]/g, '\\$&'), 'g'), '')
      .replace(/src=["']\s*["']/g, 'src=""');
  }
  return html.split(DOCUMENT_GENERATOR_LOGO_SRC_TOKEN).join(logoDataUri);
}

export { buildQuoteHtmlPrompt } from '@shared/document-quote-design-prompt';

async function defaultGenerateQuoteHtml(params: {
  apiKey: string;
  model: string;
  content: string;
  language?: string;
  hasLogo: boolean;
  logoBase64?: string | null;
  logoMimeType?: string | null;
}): Promise<string> {
  const genAI = new GoogleGenerativeAI(params.apiKey);
  const model = genAI.getGenerativeModel({ model: params.model });

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [
    {
      text: buildQuoteHtmlPrompt({
        content: params.content,
        language: params.language,
        hasLogo: params.hasLogo,
      }),
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
      temperature: 0.65,
      maxOutputTokens: 16384,
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
    throw new Error('Quote HTML design model returned empty HTML.');
  }
  return extractHtmlDocument(text);
}

/**
 * Generate a designed quote PDF from freeform/structured content via Gemini HTML → Playwright.
 */
export async function designQuoteHtmlToPdf(
  request: DocumentHtmlDesignRequest
): Promise<DocumentHtmlDesignResult> {
  const apiKey = (request.apiKey || '').trim();
  if (!apiKey) {
    throw new Error(
      'Gemini API key is required for quote design. Set it on the Document Generator node.'
    );
  }

  const content = (request.content || '').trim();
  if (!content) {
    throw new Error('Quote content is required to generate the document.');
  }

  const htmlToPdf = htmlToPdfImpl || defaultHtmlToPdf;
  const generateHtml = generateQuoteHtmlImpl || defaultGenerateQuoteHtml;
  const model = normalizeDocumentGeneratorGeminiModel(
    request.model || DOCUMENT_GENERATOR_DEFAULT_GEMINI_MODEL
  );

  let logoDataUri: string | null = null;
  let logoBase64: string | null = null;
  let logoMimeType: string | null = null;
  if (request.logoPath && (await fs.pathExists(request.logoPath))) {
    const mime = mimeTypeForImagePath(request.logoPath);
    const fileBuffer = await fs.readFile(request.logoPath);
    logoBase64 = fileBuffer.toString('base64');
    logoMimeType = mime;
    logoDataUri = `data:${mime};base64,${logoBase64}`;
  }

  const rawHtml = await generateHtml({
    apiKey,
    model,
    content,
    language: request.language,
    hasLogo: Boolean(logoDataUri),
    logoBase64,
    logoMimeType,
  });

  const html = injectLogoIntoHtml(rawHtml, logoDataUri);
  const outputPath = path.join(os.tmpdir(), `doc-quote-html-${randomUUID()}.pdf`);
  await htmlToPdf(html, outputPath);

  return { pdfPath: outputPath, model, html };
}

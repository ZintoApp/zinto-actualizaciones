/**
 * Design a Canva-like quote as a native Gemini image, then wrap the PNG in an A4 PDF.
 */

import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import PDFDocument from 'pdfkit';
import {
  DOCUMENT_GENERATOR_DEFAULT_GEMINI_IMAGE_MODEL,
  normalizeDocumentGeneratorGeminiImageModel,
} from '@shared/document-generator-defaults';
import { buildQuoteImagePrompt } from '@shared/document-quote-design-prompt';

export interface DocumentImageDesignRequest {
  content: string;
  apiKey: string;
  model?: string;
  logoPath?: string | null;
  language?: string;
}

export interface DocumentImageDesignResult {
  pdfPath: string;
  imagePath: string;
  model: string;
}

export type GenerateQuoteImageFn = (params: {
  apiKey: string;
  model: string;
  content: string;
  language?: string;
  logoBase64?: string | null;
  logoMimeType?: string | null;
}) => Promise<{ imageBase64: string; mimeType: string }>;

export type ImageToPdfFn = (imagePath: string, outputPath: string) => Promise<void>;

let generateQuoteImageImpl: GenerateQuoteImageFn | undefined;
let imageToPdfImpl: ImageToPdfFn | undefined;

/** Test hooks — inject mocks without hitting Gemini / pdfkit. */
export function setDocumentImageDesignGenerateForTests(
  fn: GenerateQuoteImageFn | undefined
): void {
  generateQuoteImageImpl = fn;
}

export function setDocumentImageDesignImageToPdfForTests(fn: ImageToPdfFn | undefined): void {
  imageToPdfImpl = fn;
}

function mimeTypeForImagePath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function defaultGenerateQuoteImage(params: {
  apiKey: string;
  model: string;
  content: string;
  language?: string;
  logoBase64?: string | null;
  logoMimeType?: string | null;
}): Promise<{ imageBase64: string; mimeType: string }> {
  const parts: Array<Record<string, unknown>> = [
    {
      text: buildQuoteImagePrompt({
        content: params.content,
        language: params.language,
        hasLogo: Boolean(params.logoBase64),
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    }),
  });

  const payload = (await response.json().catch(() => null)) as any;
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `Gemini image generation failed (${response.status} ${response.statusText})`;
    throw new Error(message);
  }

  const responseParts = payload?.candidates?.[0]?.content?.parts || [];
  for (const part of responseParts) {
    const inline = part?.inlineData || part?.inline_data;
    if (inline?.data) {
      return {
        imageBase64: inline.data,
        mimeType: inline.mimeType || inline.mime_type || 'image/png',
      };
    }
  }

  throw new Error('Gemini image model returned no image data.');
}

async function defaultImageToPdf(imagePath: string, outputPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 24 });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);
    doc.image(imagePath, {
      fit: [doc.page.width - 48, doc.page.height - 48],
      align: 'center',
      valign: 'center',
    });
    doc.end();
    stream.on('finish', () => resolve());
    stream.on('error', reject);
  });
}

/**
 * Generate a designed quote PDF from content via Gemini native image → PDF wrap.
 */
export async function designQuoteImageToPdf(
  request: DocumentImageDesignRequest
): Promise<DocumentImageDesignResult> {
  const apiKey = (request.apiKey || '').trim();
  if (!apiKey) {
    throw new Error(
      'Gemini API key is required for quote image design. Set it on the Document Generator node.'
    );
  }

  const content = (request.content || '').trim();
  if (!content) {
    throw new Error('Quote content is required to generate the document.');
  }

  const generateImage = generateQuoteImageImpl || defaultGenerateQuoteImage;
  const imageToPdf = imageToPdfImpl || defaultImageToPdf;
  const model = normalizeDocumentGeneratorGeminiImageModel(
    request.model || DOCUMENT_GENERATOR_DEFAULT_GEMINI_IMAGE_MODEL
  );

  let logoBase64: string | null = null;
  let logoMimeType: string | null = null;
  if (request.logoPath && (await fs.pathExists(request.logoPath))) {
    logoBase64 = (await fs.readFile(request.logoPath)).toString('base64');
    logoMimeType = mimeTypeForImagePath(request.logoPath);
  }

  const { imageBase64, mimeType } = await generateImage({
    apiKey,
    model,
    content,
    language: request.language,
    logoBase64,
    logoMimeType,
  });

  const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
  const imagePath = path.join(os.tmpdir(), `doc-quote-img-${randomUUID()}.${ext}`);
  const pdfPath = path.join(os.tmpdir(), `doc-quote-img-${randomUUID()}.pdf`);

  await fs.writeFile(imagePath, Buffer.from(imageBase64, 'base64'));
  try {
    await imageToPdf(imagePath, pdfPath);
  } catch (error) {
    await fs.remove(imagePath).catch(() => {});
    throw error;
  }

  return { pdfPath, imagePath, model };
}

/**
 * Orchestrate Vertex deck generation → Imagen images → Google Slides → export.
 */

import {
  DOCUMENT_GENERATOR_DEFAULT_VERTEX_IMAGEN_MODEL,
  DOCUMENT_GENERATOR_DEFAULT_VERTEX_TEXT_MODEL,
  normalizeDocumentGeneratorOutputFormat,
  normalizeDocumentGeneratorVertexTextModel,
  type DocumentDeckSlide,
  type DocumentDeckStructure,
  type DocumentGeneratorOutputFormat,
} from '@shared/document-generator-gcp';
import {
  DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS,
  normalizeDocumentGeneratorDocumentType,
  normalizeDocumentGeneratorSystemPrompts,
} from '@shared/document-generator-defaults';
import type {
  DocumentGeneratorNodeData,
  DocumentGeneratorResolvedType,
} from '@shared/types/node-types';
import { parseDocumentGcpCredentials } from './document-gcp-auth';
import { createPresentationFromDeck } from './document-google-slides-service';
import {
  exportPresentationFile,
  exportSlideThumbnails,
  makePresentationPublicViewLink,
} from './document-google-export-service';
import { generateDocumentDeckStructure } from './document-vertex-content-service';
import { generateSlideImage } from './document-vertex-imagen-service';

const IMAGEN_CONCURRENCY = 3;

export interface RunVertexSlidesGenerationParams {
  nodeData: DocumentGeneratorNodeData;
  userContent: string;
  resolvedDocumentType?: DocumentGeneratorResolvedType;
  /** When set, skip Vertex content generation and build Slides from this structure. */
  deckOverride?: DocumentDeckStructure;
}

export interface RunVertexSlidesGenerationResult {
  outputFormat: DocumentGeneratorOutputFormat;
  presentationId: string;
  slidesUrl: string;
  deck: DocumentDeckStructure;
  filePath?: string;
  slideImagePaths?: string[];
}

function resolveDocumentType(
  nodeData: DocumentGeneratorNodeData,
  override?: DocumentGeneratorResolvedType
): DocumentGeneratorResolvedType {
  if (override) return override;
  const normalized = normalizeDocumentGeneratorDocumentType(nodeData.documentType);
  if (normalized === 'auto') return 'presentation';
  return normalized;
}

function resolveSlideCount(documentType: DocumentGeneratorResolvedType): number {
  return DOCUMENT_GENERATOR_ENFORCED_CARD_COUNTS[documentType];
}

function resolveSystemInstruction(
  nodeData: DocumentGeneratorNodeData,
  documentType: DocumentGeneratorResolvedType
): string {
  const prompts = normalizeDocumentGeneratorSystemPrompts({
    documentType: nodeData.documentType,
    systemPrompts: nodeData.systemPrompts,
    instructions: nodeData.instructions,
  });
  return prompts[documentType];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runVertexSlidesGeneration(
  params: RunVertexSlidesGenerationParams
): Promise<RunVertexSlidesGenerationResult> {
  const nodeData = params.nodeData;
  const credentials = parseDocumentGcpCredentials({
    gcpProjectId: nodeData.gcpProjectId as string | undefined,
    gcpLocation: nodeData.gcpLocation as string | undefined,
    gcpServiceAccountJson: nodeData.gcpServiceAccountJson as string | undefined,
  });

  const documentType = resolveDocumentType(nodeData, params.resolvedDocumentType);
  const slideCount = resolveSlideCount(documentType);
  const outputFormat = normalizeDocumentGeneratorOutputFormat(nodeData.outputFormat);
  const vertexTextModel = normalizeDocumentGeneratorVertexTextModel(nodeData.vertexTextModel);
  const vertexImagenModel =
    typeof nodeData.vertexImagenModel === 'string' && nodeData.vertexImagenModel.trim()
      ? nodeData.vertexImagenModel.trim()
      : DOCUMENT_GENERATOR_DEFAULT_VERTEX_IMAGEN_MODEL;
  const imageType = nodeData.imageType === 'stock' ? 'stock' : 'ai-generated';
  const language =
    typeof nodeData.language === 'string' && nodeData.language.trim()
      ? nodeData.language.trim()
      : 'Spanish';

  const deck =
    params.deckOverride ??
    (await generateDocumentDeckStructure({
      projectId: credentials.projectId,
      location: credentials.location,
      serviceAccountJson: credentials.serviceAccountJson,
      model: vertexTextModel || DOCUMENT_GENERATOR_DEFAULT_VERTEX_TEXT_MODEL,
      systemInstruction: resolveSystemInstruction(nodeData, documentType),
      userContent: params.userContent,
      slideCount,
      documentType,
      language,
      imageType,
    }));

  let slideImages: string[] | undefined;
  if (imageType === 'ai-generated') {
    slideImages = await mapWithConcurrency<DocumentDeckSlide, string>(
      deck.slides,
      IMAGEN_CONCURRENCY,
      async (slide) => {
        const prompt =
          slide.imagePrompt?.trim() ||
          `Professional presentation slide illustration for "${slide.title}". Clean, modern, no text.`;
        return generateSlideImage({
          projectId: credentials.projectId,
          location: credentials.location,
          serviceAccountJson: credentials.serviceAccountJson,
          model: vertexImagenModel,
          prompt,
        });
      }
    );
  }

  const { presentationId, slidesUrl } = await createPresentationFromDeck({
    serviceAccountJson: credentials.serviceAccountJson,
    deck,
    themeId:
      typeof nodeData.slidesThemeId === 'string' ? nodeData.slidesThemeId : undefined,
    slidesFolderId:
      typeof nodeData.slidesFolderId === 'string' ? nodeData.slidesFolderId : undefined,
    slideImages,
  });

  const result: RunVertexSlidesGenerationResult = {
    outputFormat,
    presentationId,
    slidesUrl,
    deck,
  };

  switch (outputFormat) {
    case 'pdf':
      result.filePath = await exportPresentationFile({
        serviceAccountJson: credentials.serviceAccountJson,
        presentationId,
        mimeType: 'application/pdf',
      });
      break;
    case 'pptx':
      result.filePath = await exportPresentationFile({
        serviceAccountJson: credentials.serviceAccountJson,
        presentationId,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      break;
    case 'google_slides_link':
      result.slidesUrl = await makePresentationPublicViewLink({
        serviceAccountJson: credentials.serviceAccountJson,
        presentationId,
      });
      break;
    case 'png_per_slide':
      result.slideImagePaths = await exportSlideThumbnails({
        serviceAccountJson: credentials.serviceAccountJson,
        presentationId,
      });
      break;
    default:
      break;
  }

  return result;
}

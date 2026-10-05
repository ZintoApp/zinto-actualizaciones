/**
 * Build Google Slides presentations from DocumentDeckStructure via batchUpdate.
 */

import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import fs from 'fs-extra';
import type { slides_v1 } from 'googleapis';
import {
  DOCUMENT_GENERATOR_DEFAULT_SLIDES_THEME_ID,
  normalizeDocumentGeneratorSlidesThemeId,
  type DocumentDeckStructure,
  type DocumentGeneratorSlidesThemeId,
} from '@shared/document-generator-gcp';
import { createDocumentGoogleClients } from './document-gcp-auth';

export interface CreatePresentationFromDeckParams {
  serviceAccountJson: string;
  deck: DocumentDeckStructure;
  themeId?: DocumentGeneratorSlidesThemeId | string;
  slidesFolderId?: string;
  slideImages?: string[];
}

export interface CreatePresentationFromDeckResult {
  presentationId: string;
  slidesUrl: string;
}

interface SlidesThemePalette {
  background: { red: number; green: number; blue: number };
  titleColor: { red: number; green: number; blue: number };
  bodyColor: { red: number; green: number; blue: number };
}

const SLIDES_THEME_PALETTES: Record<DocumentGeneratorSlidesThemeId, SlidesThemePalette> = {
  professional: {
    background: { red: 1, green: 1, blue: 1 },
    titleColor: { red: 0.1, green: 0.45, blue: 0.91 },
    bodyColor: { red: 0.2, green: 0.2, blue: 0.2 },
  },
  modern: {
    background: { red: 0.12, green: 0.12, blue: 0.14 },
    titleColor: { red: 0.95, green: 0.95, blue: 0.98 },
    bodyColor: { red: 0.82, green: 0.84, blue: 0.88 },
  },
  minimal: {
    background: { red: 0.96, green: 0.96, blue: 0.96 },
    titleColor: { red: 0.25, green: 0.25, blue: 0.25 },
    bodyColor: { red: 0.35, green: 0.35, blue: 0.35 },
  },
};

function getThemePalette(themeId?: string): SlidesThemePalette {
  const normalized = normalizeDocumentGeneratorSlidesThemeId(
    themeId || DOCUMENT_GENERATOR_DEFAULT_SLIDES_THEME_ID
  );
  return SLIDES_THEME_PALETTES[normalized];
}

function findPlaceholderObjectId(
  slide: slides_v1.Schema$Page,
  placeholderType: string
): string | undefined {
  for (const element of slide.pageElements ?? []) {
    if (element.shape?.placeholder?.type === placeholderType && element.objectId) {
      return element.objectId;
    }
  }
  return undefined;
}

function findNotesPlaceholderObjectId(notesPage: slides_v1.Schema$Page | undefined): string | undefined {
  return findPlaceholderObjectId(notesPage ?? {}, 'BODY') ?? findPlaceholderObjectId(notesPage ?? {}, 'SLIDE_IMAGE');
}

function buildBulletsText(bullets: string[]): string {
  return bullets.map((bullet) => `• ${bullet}`).join('\n');
}

async function uploadSlideImageToDrive(params: {
  drive: ReturnType<typeof createDocumentGoogleClients>['drive'];
  imagePath: string;
  slidesFolderId?: string;
}): Promise<string> {
  const fileName = `slide-image-${randomUUID()}.png`;
  const parents = params.slidesFolderId ? [params.slidesFolderId] : undefined;

  const created = await params.drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: 'image/png',
      parents,
    },
    media: {
      mimeType: 'image/png',
      body: createReadStream(params.imagePath),
    },
    fields: 'id',
  });

  const fileId = created.data.id;
  if (!fileId) {
    throw new Error('Failed to upload slide image to Google Drive.');
  }

  await params.drive.permissions.create({
    fileId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

export async function createPresentationFromDeck(
  params: CreatePresentationFromDeckParams
): Promise<CreatePresentationFromDeckResult> {
  const { slides, drive } = createDocumentGoogleClients(params.serviceAccountJson);
  const theme = getThemePalette(params.themeId);

  const created = await slides.presentations.create({
    requestBody: {
      title: params.deck.title,
    },
  });

  const presentationId = created.data.presentationId;
  if (!presentationId) {
    throw new Error('Google Slides did not return a presentation ID.');
  }

  if (params.slidesFolderId) {
    await drive.files.update({
      fileId: presentationId,
      addParents: params.slidesFolderId,
      fields: 'id',
    });
  }

  const initial = await slides.presentations.get({ presentationId });
  const initialSlides = initial.data.slides ?? [];
  const firstSlideId = initialSlides[0]?.objectId;

  const createSlideRequests: slides_v1.Schema$Request[] = [];
  if (firstSlideId && params.deck.slides.length > 1) {
    for (let index = 1; index < params.deck.slides.length; index++) {
      createSlideRequests.push({
        createSlide: {
          insertionIndex: index,
          slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
        },
      });
    }
  } else if (!firstSlideId && params.deck.slides.length > 0) {
    for (let index = 0; index < params.deck.slides.length; index++) {
      createSlideRequests.push({
        createSlide: {
          insertionIndex: index,
          slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
        },
      });
    }
  }

  if (createSlideRequests.length > 0) {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: createSlideRequests },
    });
  }

  const refreshed = await slides.presentations.get({ presentationId });
  const deckSlides = refreshed.data.slides ?? [];
  if (deckSlides.length < params.deck.slides.length) {
    throw new Error('Google Slides returned fewer slides than expected after creation.');
  }

  const contentRequests: slides_v1.Schema$Request[] = [];

  for (let index = 0; index < params.deck.slides.length; index++) {
    const deckSlide = params.deck.slides[index];
    const page = deckSlides[index];
    const slideObjectId = page.objectId;
    if (!slideObjectId) continue;

    contentRequests.push({
      updatePageProperties: {
        objectId: slideObjectId,
        pageProperties: {
          pageBackgroundFill: {
            solidFill: { color: { rgbColor: theme.background } },
          },
        },
        fields: 'pageBackgroundFill',
      },
    });

    const titleId = findPlaceholderObjectId(page, 'TITLE') ?? findPlaceholderObjectId(page, 'CENTERED_TITLE');
    const bodyId = findPlaceholderObjectId(page, 'BODY') ?? findPlaceholderObjectId(page, 'SUBTITLE');

    const titleText = deckSlide.subtitle
      ? `${deckSlide.title}\n${deckSlide.subtitle}`
      : deckSlide.title;

    if (titleId) {
      contentRequests.push({
        insertText: {
          objectId: titleId,
          insertionIndex: 0,
          text: titleText,
        },
      });
      contentRequests.push({
        updateTextStyle: {
          objectId: titleId,
          style: { foregroundColor: { opaqueColor: { rgbColor: theme.titleColor } } },
          fields: 'foregroundColor',
        },
      });
    }

    if (bodyId && deckSlide.bullets.length > 0) {
      contentRequests.push({
        insertText: {
          objectId: bodyId,
          insertionIndex: 0,
          text: buildBulletsText(deckSlide.bullets),
        },
      });
      contentRequests.push({
        updateTextStyle: {
          objectId: bodyId,
          style: { foregroundColor: { opaqueColor: { rgbColor: theme.bodyColor } } },
          fields: 'foregroundColor',
        },
      });
    }

    const notesPlaceholderId = findNotesPlaceholderObjectId(page.slideProperties?.notesPage ?? undefined);
    if (notesPlaceholderId && deckSlide.speakerNotes) {
      contentRequests.push({
        insertText: {
          objectId: notesPlaceholderId,
          insertionIndex: 0,
          text: deckSlide.speakerNotes,
        },
      });
    }

    const imagePath = params.slideImages?.[index];
    if (imagePath && (await fs.pathExists(imagePath))) {
      const imageUrl = await uploadSlideImageToDrive({
        drive,
        imagePath,
        slidesFolderId: params.slidesFolderId,
      });
      const imageObjectId = `slide_image_${index}_${randomUUID().replace(/-/g, '')}`;
      contentRequests.push({
        createImage: {
          objectId: imageObjectId,
          url: imageUrl,
          elementProperties: {
            pageObjectId: slideObjectId,
            size: {
              width: { magnitude: 3200000, unit: 'EMU' },
              height: { magnitude: 1800000, unit: 'EMU' },
            },
            transform: {
              scaleX: 1,
              scaleY: 1,
              translateX: 5600000,
              translateY: 2200000,
              unit: 'EMU',
            },
          },
        },
      });
    }
  }

  if (contentRequests.length > 0) {
    await slides.presentations.batchUpdate({
      presentationId,
      requestBody: { requests: contentRequests },
    });
  }

  return {
    presentationId,
    slidesUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
  };
}

/**
 * Export Google Slides presentations via Drive and Slides APIs.
 */

import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { createDocumentGoogleClients } from './document-gcp-auth';

export type PresentationExportMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const EXPORT_EXTENSION: Record<PresentationExportMimeType, string> = {
  'application/pdf': '.pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

export async function exportPresentationFile(params: {
  serviceAccountJson: string;
  presentationId: string;
  mimeType: PresentationExportMimeType;
}): Promise<string> {
  const { drive } = createDocumentGoogleClients(params.serviceAccountJson);

  const response = await drive.files.export(
    {
      fileId: params.presentationId,
      mimeType: params.mimeType,
    },
    { responseType: 'arraybuffer' }
  );

  const ext = EXPORT_EXTENSION[params.mimeType];
  const tempPath = path.join(os.tmpdir(), `slides-export-${randomUUID()}${ext}`);
  await fs.writeFile(tempPath, Buffer.from(response.data as ArrayBuffer));
  return tempPath;
}

export async function exportSlideThumbnails(params: {
  serviceAccountJson: string;
  presentationId: string;
}): Promise<string[]> {
  const { slides } = createDocumentGoogleClients(params.serviceAccountJson);
  const presentation = await slides.presentations.get({ presentationId: params.presentationId });
  const pageIds = (presentation.data.slides ?? [])
    .map((slide) => slide.objectId)
    .filter((id): id is string => Boolean(id));

  const imagePaths: string[] = [];

  for (let index = 0; index < pageIds.length; index++) {
    const pageObjectId = pageIds[index];
    const thumbnail = await slides.presentations.pages.getThumbnail({
      presentationId: params.presentationId,
      pageObjectId,
      'thumbnailProperties.thumbnailSize': 'LARGE',
    });

    const contentUrl = thumbnail.data.contentUrl;
    if (!contentUrl) {
      throw new Error(`Google Slides returned no thumbnail URL for slide ${index + 1}.`);
    }

    const response = await fetch(contentUrl);
    if (!response.ok) {
      throw new Error(`Failed to download slide thumbnail (${response.status}).`);
    }

    const tempPath = path.join(os.tmpdir(), `slides-thumb-${randomUUID()}.png`);
    await fs.writeFile(tempPath, Buffer.from(await response.arrayBuffer()));
    imagePaths.push(tempPath);
  }

  return imagePaths;
}

export async function makePresentationPublicViewLink(params: {
  serviceAccountJson: string;
  presentationId: string;
}): Promise<string> {
  const { drive } = createDocumentGoogleClients(params.serviceAccountJson);

  await drive.permissions.create({
    fileId: params.presentationId,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return `https://docs.google.com/presentation/d/${params.presentationId}/view`;
}

/**
 * Generate slide images via Vertex AI Imagen predict API.
 */

import { randomUUID } from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { getDocumentGcpAccessToken } from './document-gcp-auth';

export interface GenerateSlideImageParams {
  projectId: string;
  location: string;
  serviceAccountJson: string;
  model: string;
  prompt: string;
}

function vertexImagenPredictUrl(projectId: string, location: string, model: string): string {
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(
    model
  )}:predict`;
}

export async function generateSlideImage(params: GenerateSlideImageParams): Promise<string> {
  const accessToken = await getDocumentGcpAccessToken(params.serviceAccountJson);
  const url = vertexImagenPredictUrl(params.projectId, params.location, params.model);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt: params.prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9',
        addWatermark: false,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Vertex Imagen predict failed (${response.status}): ${errorBody.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>;
  };

  const imageBase64 = payload.predictions?.[0]?.bytesBase64Encoded;
  if (!imageBase64) {
    throw new Error('Vertex Imagen returned no image bytes.');
  }

  const tempPath = path.join(os.tmpdir(), `vertex-imagen-${randomUUID()}.png`);
  await fs.writeFile(tempPath, Buffer.from(imageBase64, 'base64'));
  return tempPath;
}

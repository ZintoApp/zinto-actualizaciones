/**
 * Validate Document Generator GCP credentials (service account + Slides API).
 */

import {
  createDocumentGoogleClients,
  parseDocumentGcpCredentials,
} from './document-gcp-auth';

export interface TestDocumentGeneratorGcpCredentialsParams {
  gcpProjectId?: string;
  gcpLocation?: string;
  gcpServiceAccountJson?: string;
}

export interface TestDocumentGeneratorGcpCredentialsResult {
  ok: boolean;
  message: string;
}

export async function testDocumentGeneratorGcpCredentials(
  params: TestDocumentGeneratorGcpCredentialsParams
): Promise<TestDocumentGeneratorGcpCredentialsResult> {
  try {
    const credentials = parseDocumentGcpCredentials(params);
    const { slides, drive } = createDocumentGoogleClients(credentials.serviceAccountJson);

    const created = await slides.presentations.create({
      requestBody: {
        title: 'BotHive Document Generator Connection Test',
      },
    });

    const presentationId = created.data.presentationId;
    if (!presentationId) {
      return {
        ok: false,
        message: 'Slides API responded but did not return a presentation ID.',
      };
    }

    await slides.presentations.get({ presentationId });

    await drive.files.delete({ fileId: presentationId });

    return {
      ok: true,
      message: `Google Cloud credentials verified for project ${credentials.projectId} (${credentials.location}).`,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Failed to validate Google Cloud credentials.',
    };
  }
}

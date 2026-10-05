import { JWT } from 'google-auth-library';
import { google } from 'googleapis';

export const DOCUMENT_GCP_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.file',
];

export interface DocumentGcpCredentials {
  projectId: string;
  location: string;
  serviceAccountJson: string;
}

export function parseDocumentGcpCredentials(params: {
  gcpProjectId?: string;
  gcpLocation?: string;
  gcpServiceAccountJson?: string;
}): DocumentGcpCredentials {
  const serviceAccountJson = (params.gcpServiceAccountJson || '').trim();
  if (!serviceAccountJson) {
    throw new Error('Google Cloud service account JSON is required on the Document Generator node.');
  }

  let parsed: { project_id?: string };
  try {
    parsed = JSON.parse(serviceAccountJson);
  } catch {
    throw new Error('Invalid Google Cloud service account JSON.');
  }

  const projectId = (params.gcpProjectId || parsed.project_id || '').trim();
  if (!projectId) {
    throw new Error('GCP project ID is required on the Document Generator node.');
  }

  const location = (params.gcpLocation || 'us-central1').trim() || 'us-central1';

  return { projectId, location, serviceAccountJson };
}

export function createDocumentGcpAuthClient(serviceAccountJson: string): JWT {
  try {
    const credentials = JSON.parse(serviceAccountJson);
    return new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: DOCUMENT_GCP_SCOPES,
    });
  } catch (error) {
    throw new Error(
      `Invalid service account JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

export async function getDocumentGcpAccessToken(serviceAccountJson: string): Promise<string> {
  const auth = createDocumentGcpAuthClient(serviceAccountJson);
  const tokenResponse = await auth.getAccessToken();
  const token = tokenResponse.token;
  if (!token) {
    throw new Error('Failed to obtain Google Cloud access token.');
  }
  return token;
}

export function createDocumentGoogleClients(serviceAccountJson: string) {
  const auth = createDocumentGcpAuthClient(serviceAccountJson);
  return {
    auth,
    slides: google.slides({ version: 'v1', auth }),
    drive: google.drive({ version: 'v3', auth }),
  };
}

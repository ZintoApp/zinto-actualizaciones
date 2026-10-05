import OpenAI, { AzureOpenAI } from 'openai';
import { createAzure, type AzureOpenAIProvider } from '@ai-sdk/azure';
import {
  type AzureConnectionConfig,
  type AzureDeploymentCatalogItem,
  azureDeploymentsListUrl,
  azureResourceNameFromEndpoint,
  DEFAULT_AZURE_OPENAI_API_VERSION,
  isAzureAiFoundryHost,
  normalizeAzureEndpoint,
  toAzureDeploymentCatalogItem,
  uniqueAzureDeploymentCatalog,
} from '@shared/ai-providers';

export function createAzureOpenAIRestClient(connection: AzureConnectionConfig, deployment?: string): OpenAI {
  const endpoint = normalizeAzureEndpoint(connection.endpoint);
  if (isAzureAiFoundryHost(new URL(endpoint).hostname)) {
    return new OpenAI({
      baseURL: endpoint,
      apiKey: connection.apiKey,
    });
  }
  return new AzureOpenAI({
    apiKey: connection.apiKey,
    endpoint,
    apiVersion: connection.apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION,
    ...(deployment ? { deployment } : {}),
  });
}

export function createAzureAiSdkProvider(connection: AzureConnectionConfig): AzureOpenAIProvider {
  const endpoint = normalizeAzureEndpoint(connection.endpoint);
  const resourceName = azureResourceNameFromEndpoint(endpoint);
  const apiVersion = connection.apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION;
  const foundry = isAzureAiFoundryHost(new URL(endpoint).hostname);
  if (foundry) {
    return createAzure({
      baseURL: endpoint,
      apiKey: connection.apiKey,
    });
  }
  return createAzure({
    resourceName,
    apiKey: connection.apiKey,
    apiVersion,
    useDeploymentBasedUrls: true,
  });
}

export async function listAzureDeployments(connection: AzureConnectionConfig): Promise<AzureDeploymentCatalogItem[]> {
  const endpoint = normalizeAzureEndpoint(connection.endpoint);
  const apiVersion = connection.apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION;
  const foundry = isAzureAiFoundryHost(new URL(endpoint).hostname);
  const url = azureDeploymentsListUrl(endpoint, apiVersion);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const headers: Record<string, string> = {
      'api-key': connection.apiKey,
      'Content-Type': 'application/json',
    };
    if (foundry) {
      headers.Authorization = `Bearer ${connection.apiKey}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Azure OpenAI deployments request failed (${response.status})${body ? `: ${body.slice(0, 300)}` : ''}`
      );
    }

    const payload = (await response.json()) as { data?: Array<{ id?: string; model?: string; name?: string }> };
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const mapped = rows
      .map((row) => toAzureDeploymentCatalogItem({
        id: String(row.id || row.name || ''),
        model: row.model || row.id,
        name: row.name || row.id,
      }))
      .filter((item) => item.id);
    return uniqueAzureDeploymentCatalog(mapped);
  } finally {
    clearTimeout(timeout);
  }
}

export function requireAzureConnection(
  apiKey: string | undefined,
  endpoint: string | undefined,
  apiVersion?: string,
  defaultChatDeployment?: string
): AzureConnectionConfig {
  if (!apiKey?.trim()) {
    throw new Error('Azure OpenAI API key is required');
  }
  return {
    apiKey: apiKey.trim(),
    endpoint: normalizeAzureEndpoint(endpoint),
    apiVersion: (apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION).trim() || DEFAULT_AZURE_OPENAI_API_VERSION,
    defaultChatDeployment: defaultChatDeployment?.trim() || undefined,
  };
}

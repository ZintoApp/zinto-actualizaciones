import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { AzureDeploymentCatalogItem } from '@shared/ai-providers';

export type AzureDeployment = AzureDeploymentCatalogItem;

async function fetchStoredAzureDeployments(): Promise<AzureDeployment[]> {
  const response = await apiRequest('GET', '/api/azure/deployments');
  const payload = await response.json();
  if (Array.isArray(payload?.data)) {
    return payload.data as AzureDeployment[];
  }
  throw new Error(payload?.error || 'Failed to load Azure deployments');
}

export async function previewAzureDeployments(input: {
  apiKey: string;
  endpoint: string;
  apiVersion?: string;
}): Promise<AzureDeployment[]> {
  const response = await apiRequest('POST', '/api/azure/deployments', input);
  const payload = await response.json();
  if (Array.isArray(payload?.data)) {
    return payload.data as AzureDeployment[];
  }
  throw new Error(payload?.error || 'Failed to load Azure deployments');
}

export function useAzureDeployments(enabled: boolean) {
  return {
    queryKey: ['azure-deployments'] as const,
    queryFn: fetchStoredAzureDeployments,
    enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  };
}

export function useAzureDeploymentsQuery(enabled: boolean) {
  return useQuery(useAzureDeployments(enabled));
}

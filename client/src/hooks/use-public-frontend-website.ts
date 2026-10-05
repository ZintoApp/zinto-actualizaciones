import { useQuery } from '@tanstack/react-query';
import type { PublicFrontendWebsiteResponse } from '@shared/frontend-website-settings';

export async function fetchPublicFrontendWebsite(
  lang?: string
): Promise<PublicFrontendWebsiteResponse> {
  const params = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const res = await fetch(`/api/public/frontend-website${params}`);
  if (!res.ok) {
    throw new Error('Failed to fetch frontend website config');
  }
  return res.json();
}

export function usePublicFrontendWebsite(lang?: string) {
  return useQuery({
    queryKey: ['public-frontend-website', lang ?? 'default'],
    queryFn: () => fetchPublicFrontendWebsite(lang),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

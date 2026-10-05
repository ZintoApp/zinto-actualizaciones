import { useQuery } from '@tanstack/react-query';
import type { PublicFrontendWebsitePageResponse } from '@shared/frontend-website-settings';

export async function fetchPublicFrontendPage(
  slug: string,
  lang?: string
): Promise<PublicFrontendWebsitePageResponse | null> {
  const params = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const res = await fetch(`/api/public/frontend-website/pages/${encodeURIComponent(slug)}${params}`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error('Failed to fetch frontend website page');
  }
  return res.json();
}

export function usePublicFrontendPage(slug?: string, lang?: string) {
  return useQuery({
    queryKey: ['public-frontend-page', slug ?? '', lang ?? 'default'],
    queryFn: () => fetchPublicFrontendPage(slug!, lang),
    enabled: !!slug,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

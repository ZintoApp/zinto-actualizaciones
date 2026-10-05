import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsEvents, SETTINGS_EVENTS } from '@/lib/settings-events';

export type WebsiteEnabledSettings = {
  enabled: boolean;
};

export async function fetchWebsiteEnabled(): Promise<WebsiteEnabledSettings> {
  try {
    const res = await fetch('/api/public/website-enabled');
    if (!res.ok) {
      return { enabled: false };
    }
    const data = await res.json();
    return data;
  } catch {
    return { enabled: false };
  }
}

export function useWebsiteEnabled() {
  const query = useQuery({
    queryKey: ['website-enabled'],
    queryFn: fetchWebsiteEnabled,
    retry: false,
    staleTime: 0,
    gcTime: 30 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { refetch } = query;

  useEffect(() => {
    const unsubscribe = settingsEvents.subscribe(SETTINGS_EVENTS.FRONTEND_WEBSITE_TOGGLED, () => {
      refetch();
    });

    return unsubscribe;
  }, [refetch]);

  return query;
}

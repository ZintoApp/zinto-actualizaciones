import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "./use-auth";
import useSocket from "./useSocket";

export interface GeneralSettings {
  defaultCurrency: string;
  dateFormat: string;
  timeFormat: string;
  subdomainAuthentication: boolean;
  frontendWebsiteEnabled: boolean;
  planRenewalEnabled: boolean;
  helpSupportUrl: string;
  customCurrencies?: Array<{
    code: string;
    name: string;
    symbol: string;
  }>;
}

export function useGeneralSettings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { onMessage } = useSocket('/ws');

  const { data: settings, isLoading, error, refetch } = useQuery<GeneralSettings>({
    queryKey: ['/api/public/general-settings'],
    queryFn: async () => {
      const res = await fetch("/api/public/general-settings");
      if (!res.ok) {

        return {
          defaultCurrency: 'USD',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
          subdomainAuthentication: false,
          frontendWebsiteEnabled: false,
          planRenewalEnabled: true, // Default to enabled for safety
          helpSupportUrl: '',
          customCurrencies: []
        };
      }
      return res.json();
    },
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 1,
  });


  useEffect(() => {
    if (!onMessage) return;

    const handleSettingsUpdate = (message: any) => {
      if (message.key === 'general_settings') {

        queryClient.invalidateQueries({ queryKey: ['/api/public/general-settings'] });
      }
    };

    const cleanup = onMessage('settingsUpdated', handleSettingsUpdate);

    return cleanup;
  }, [onMessage, queryClient]);

  return {
    settings: settings || {
      defaultCurrency: 'USD',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h',
      subdomainAuthentication: false,
      frontendWebsiteEnabled: false,
      planRenewalEnabled: true,
      helpSupportUrl: '',
      customCurrencies: []
    },
    isLoading,
    error,
    refetch
  };
}

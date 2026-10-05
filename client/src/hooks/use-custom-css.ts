import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { createDefaultCustomCssSettings, type CustomCssSettings } from '@shared/customization-settings';
import { removeCustomCss, shouldLoadCompanyScopedCustomization, upsertCustomCss } from '@/lib/company-customization';

export function useCustomCss() {
  const { user } = useAuth();
  const shouldLoadCompanyCustomization = shouldLoadCompanyScopedCustomization(user);

  // Fetch app-level CSS
  const { data: appCssData } = useQuery({
    queryKey: ['/public/custom-css'],
    queryFn: async () => {
      let res = await fetch('/public/custom-css', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) {
        res = await apiRequest('GET', '/api/admin/settings/custom-css');
        if (!res.ok) {
          return createDefaultCustomCssSettings();
        }
      }

      return res.json();
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });

  // Fetch company-level CSS (only if user has companyId and is not superadmin)
  const { data: companyCssData } = useQuery({
    queryKey: ['/api/company-settings/custom-css'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/custom-css');
      if (!res.ok) {
        return createDefaultCustomCssSettings();
      }
      return res.json();
    },
    enabled: shouldLoadCompanyCustomization,
    staleTime: 1 * 60 * 1000, // 1 minute
    refetchOnWindowFocus: false,
  });

  const appCssSettings: CustomCssSettings | undefined = React.useMemo(() => {
    if (!appCssData) {
      return undefined;
    }
    return appCssData;
  }, [appCssData]);

  const companyCssSettings: CustomCssSettings | undefined = React.useMemo(() => {
    if (!companyCssData) {
      return undefined;
    }
    return companyCssData;
  }, [companyCssData]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    removeCustomCss(document, 'app');
    removeCustomCss(document, 'company');

    // Inject app-level CSS first
    if (appCssSettings?.enabled && appCssSettings.css) {
      upsertCustomCss(document, appCssSettings.css, 'app');
    }

    // Inject company-level CSS after app CSS (so it can override)
    if (companyCssSettings?.enabled && companyCssSettings.css) {
      upsertCustomCss(document, companyCssSettings.css, 'company');
    }

    return () => {
      removeCustomCss(document, 'app');
      removeCustomCss(document, 'company');
    };
  }, [appCssSettings?.enabled, appCssSettings?.css, companyCssSettings?.enabled, companyCssSettings?.css]);

  // Handle WebSocket updates
  useEffect(() => {
    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'customCssUpdated') {
          const { data } = message;
          if (data?.enabled && data.css) {
            upsertCustomCss(document, data.css, 'app');
          } else {
            removeCustomCss(document, 'app');
          }
        }
      } catch (error) {
        // Ignore parsing errors
      }
    };

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);
      socket.addEventListener('message', handleWebSocketMessage);
    } catch (error) {
      // Ignore connection errors
    }

    return () => {
      if (socket) {
        socket.removeEventListener('message', handleWebSocketMessage);
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
          socket.close();
        }
      }
    };
  }, []);

  return {
    appCssSettings,
    companyCssSettings,
    isAppEnabled: appCssSettings?.enabled || false,
    isCompanyEnabled: companyCssSettings?.enabled || false,
    stylesCount: typeof document !== 'undefined' ? document.querySelectorAll('style[data-custom-css]').length : 0
  };
}


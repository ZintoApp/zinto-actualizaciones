import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { coerceCustomJsSettings, createDefaultCustomJsSettings, type CustomJsSettings } from '@shared/customization-settings';
import { removeCompanyCustomJs, shouldLoadCompanyScopedCustomization, syncCompanyCustomJs } from '@/lib/company-customization';

export function useCompanyCustomJs() {
  const { user } = useAuth();
  const shouldLoadCompanyCustomization = shouldLoadCompanyScopedCustomization(user);

  const { data: companyCustomJsData } = useQuery({
    queryKey: ['/api/company-settings/custom-js'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/company-settings/custom-js');
      if (!res.ok) {
        return createDefaultCustomJsSettings();
      }
      return res.json();
    },
    enabled: shouldLoadCompanyCustomization,
    staleTime: 1 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const companyCustomJsSettings: CustomJsSettings | undefined = React.useMemo(() => {
    if (!companyCustomJsData) {
      return undefined;
    }

    return coerceCustomJsSettings(companyCustomJsData);
  }, [companyCustomJsData]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    syncCompanyCustomJs(document, companyCustomJsSettings);

    return () => {
      removeCompanyCustomJs(document);
    };
  }, [companyCustomJsSettings?.enabled, companyCustomJsSettings?.js, companyCustomJsSettings?.lastModified]);

  return {
    companyCustomJsSettings,
    isEnabled: companyCustomJsSettings?.enabled || false,
    scriptCount: typeof document !== 'undefined' ? document.querySelectorAll('[data-company-custom-js="true"]').length : 0
  };
}
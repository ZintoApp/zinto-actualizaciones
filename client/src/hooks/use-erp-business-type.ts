import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';

export type { ErpBusinessType } from '@shared/erp-capabilities';
import { normalizeErpBusinessType, type ErpBusinessType } from '@shared/erp-capabilities';

const ERP_BUSINESS_TYPE_QUERY_ROOT = '/api/company-settings/erp-business-type';

export const getNormalizedErpBusinessType = normalizeErpBusinessType;

export const getErpBusinessTypeQueryKey = (companyId?: number | null) =>
  [ERP_BUSINESS_TYPE_QUERY_ROOT, companyId ?? null] as const;

export function useErpBusinessType() {
  const { user, company } = useAuth();
  const companyId = company?.id ?? user?.companyId ?? null;

  const {
    data: businessType = 'standard',
    isLoading,
    error,
  } = useQuery<ErpBusinessType>({
    queryKey: getErpBusinessTypeQueryKey(companyId),
    queryFn: async () => {
      const res = await apiRequest('GET', ERP_BUSINESS_TYPE_QUERY_ROOT);
      if (!res.ok) throw new Error('Unable to load ERP business type');
      const json = await res.json();
      return getNormalizedErpBusinessType(json?.businessType);
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
    retry: 1,
  });

  return {
    businessType,
    isRestaurant: businessType === 'restaurant',
    isDental: businessType === 'dental',
    isRealEstate: businessType === 'real_estate',
    isLoading,
    error,
    queryKey: getErpBusinessTypeQueryKey(companyId),
  };
}

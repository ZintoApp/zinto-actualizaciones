import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { DentalTimezoneStatus } from '@shared/types/dental-timezone';

export function useDentalTimezone(url = '/api/erp/dental/timezone') {
  return useQuery<DentalTimezoneStatus>({
    queryKey: [url],
    queryFn: async () => (await apiRequest('GET', url)).json(),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

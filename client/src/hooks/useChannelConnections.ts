import { useQuery } from '@tanstack/react-query';
import { ChannelConnection } from '@shared/schema';
import { useAuth } from './use-auth';

export function useChannelConnections() {
  const { company, user } = useAuth();

  return useQuery<ChannelConnection[]>({
    queryKey: ['/api/channel-connections', company?.id],
    staleTime: 1000 * 60 * 5, // Increase stale time to 5 minutes
    refetchOnWindowFocus: false, // Disable to prevent excessive refetching
    refetchOnReconnect: false, // Disable to prevent excessive refetching
    enabled: !!company?.id && !!user, // Only run query when company and user are available
    retry: (failureCount, error: any) => {

      if (error?.status === 400 || error?.status === 401 || error?.status === 403) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
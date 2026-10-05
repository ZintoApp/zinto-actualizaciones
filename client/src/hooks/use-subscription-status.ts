import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useSocket from '@/hooks/useSocket';
import { useAuth } from '@/hooks/use-auth';

/**
 * Hook to listen for subscription status changes and refresh company data
 */
export function useSubscriptionStatus() {
  const queryClient = useQueryClient();
  const { company } = useAuth();
  const { onMessage } = useSocket('/ws');

  useEffect(() => {
    if (!company?.id) return;


    const unsubscribeSubscriptionStatus = onMessage('subscription_status_changed', (data) => {

      

      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
      

      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    });


    const unsubscribePlanUpdated = onMessage('plan_updated', (data) => {

      

      queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
      

      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    });

    return () => {
      unsubscribeSubscriptionStatus();
      unsubscribePlanUpdated();
    };
  }, [company?.id, onMessage, queryClient]);


  const refreshSubscriptionStatus = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
    queryClient.invalidateQueries({ queryKey: ['/api/user'] });
  };

  return {
    refreshSubscriptionStatus
  };
}

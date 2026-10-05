import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { calendlyCalendarAuth, CalendlyCalendarStatus } from '@/services/calendlyCalendarAuth';

/**
 * React hook for Calendly Calendar authentication
 * Provides unified authentication state and methods for both calendar page and flow builder
 */
export function useCalendlyCalendarAuth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAuthenticating, setIsAuthenticating] = useState(false);


  const {
    data: status,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
    error: statusError
  } = useQuery<CalendlyCalendarStatus>({
    queryKey: ['calendly-calendar-status'],
    queryFn: () => calendlyCalendarAuth.checkConnectionStatus(),
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 30000, // 30 seconds
    gcTime: 60000, // 1 minute
  });


  const authenticate = useCallback(async (): Promise<boolean> => {
    if (isAuthenticating) {
      return false;
    }

    setIsAuthenticating(true);

    try {
      const success = await calendlyCalendarAuth.authenticate();

      if (success) {
        toast({
          title: 'Connected Successfully',
          description: 'Your Calendly Calendar has been connected successfully.',
        });


        queryClient.invalidateQueries({ queryKey: ['calendly-calendar-status'] });
        await refetchStatus();

        return true;
      } else {
        toast({
          title: 'Authentication Failed',
          description: 'Failed to connect your Calendly Calendar. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    } catch (error: any) {
      console.error('Calendly Calendar authentication error:', error);
      
      toast({
        title: 'Authentication Error',
        description: error.message || 'An error occurred during authentication.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [toast, queryClient, refetchStatus]);


  const disconnect = useCallback(async (): Promise<boolean> => {
    try {
      const success = await calendlyCalendarAuth.disconnect();

      if (success) {
        toast({
          title: 'Disconnected Successfully',
          description: 'Your Calendly Calendar has been disconnected.',
        });


        queryClient.invalidateQueries({ queryKey: ['calendly-calendar-status'] });
        await refetchStatus();

        return true;
      } else {
        toast({
          title: 'Disconnection Failed',
          description: 'Failed to disconnect your Calendly Calendar. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    } catch (error: any) {
      console.error('Calendly Calendar disconnection error:', error);
      
      toast({
        title: 'Disconnection Error',
        description: error.message || 'An error occurred during disconnection.',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast, queryClient, refetchStatus]);


  const cancelAuthentication = useCallback(() => {
    calendlyCalendarAuth.cancelAuthentication();
    setIsAuthenticating(false);
  }, []);

  return {

    isConnected: status?.connected ?? false,
    connectionMessage: status?.message ?? '',
    isLoadingStatus,
    statusError,


    isAuthenticating: isAuthenticating || calendlyCalendarAuth.isAuthenticating(),


    authenticate,
    disconnect,
    cancelAuthentication,
    refetchStatus,


    status,
  };
}

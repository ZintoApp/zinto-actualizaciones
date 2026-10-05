import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { googleCalendarAuth, GoogleCalendarStatus } from '@/services/googleCalendarAuth';

/**
 * React hook for Google Calendar authentication
 * Provides unified authentication state and methods for both calendar page and flow builder
 */
export function useGoogleCalendarAuth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAuthenticating, setIsAuthenticating] = useState(false);


  const {
    data: status,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
    error: statusError
  } = useQuery<GoogleCalendarStatus>({
    queryKey: ['google-calendar-status'],
    queryFn: () => googleCalendarAuth.checkConnectionStatus(),
    refetchOnWindowFocus: false,
    retry: 2,
  });


  const authenticate = useCallback(async (): Promise<boolean> => {
    if (isAuthenticating) {
      return false;
    }

    setIsAuthenticating(true);

    try {
      const success = await googleCalendarAuth.authenticate();

      if (success) {
        toast({
          title: 'Connected Successfully',
          description: 'Your Google Calendar has been connected successfully.',
        });


        queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
        queryClient.invalidateQueries({ queryKey: ['google-calendar-list'] });
        await refetchStatus();

        return true;
      } else {
        toast({
          title: 'Authentication Failed',
          description: 'Failed to connect your Google Calendar. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    } catch (error: any) {
      console.error('Google Calendar authentication error:', error);
      
      toast({
        title: 'Authentication Error',
        description: error.message || 'An error occurred during authentication.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  }, [isAuthenticating, toast, queryClient, refetchStatus]);


  const disconnect = useCallback(async (): Promise<boolean> => {
    try {
      const success = await googleCalendarAuth.disconnect();

      if (success) {
        toast({
          title: 'Disconnected Successfully',
          description: 'Your Google Calendar has been disconnected.',
        });


        queryClient.invalidateQueries({ queryKey: ['google-calendar-status'] });
        queryClient.invalidateQueries({ queryKey: ['google-calendar-list'] });
        await refetchStatus();

        return true;
      } else {
        toast({
          title: 'Disconnect Failed',
          description: 'Failed to disconnect your Google Calendar.',
          variant: 'destructive',
        });
        return false;
      }
    } catch (error: any) {
      console.error('Google Calendar disconnect error:', error);
      
      toast({
        title: 'Disconnect Error',
        description: error.message || 'An error occurred while disconnecting.',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast, queryClient, refetchStatus]);


  const cancelAuthentication = useCallback(() => {
    googleCalendarAuth.cancelAuthentication();
    setIsAuthenticating(false);
  }, []);

  return {

    isConnected: status?.connected ?? false,
    connectionMessage: status?.message ?? '',
    isLoadingStatus,
    statusError,


    isAuthenticating: isAuthenticating || googleCalendarAuth.isAuthenticating(),


    authenticate,
    disconnect,
    cancelAuthentication,
    refetchStatus,


    status,
  };
}

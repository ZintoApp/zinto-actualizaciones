import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { googleSheetsAuth, GoogleSheetsStatus } from '@/services/googleSheetsAuth';

/**
 * React hook for Google Sheets authentication
 * Provides unified authentication state and methods for Google Sheets integration
 */
export function useGoogleSheetsAuth() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isAuthenticating, setIsAuthenticating] = useState(false);


  const {
    data: status,
    isLoading: isLoadingStatus,
    refetch: refetchStatus,
    error: statusError
  } = useQuery<GoogleSheetsStatus>({
    queryKey: ['google-sheets-status'],
    queryFn: () => googleSheetsAuth.checkConnectionStatus(),
    refetchOnWindowFocus: false,
    retry: 2,
  });


  const authenticate = useCallback(async (): Promise<boolean> => {
    if (isAuthenticating) {
      return false;
    }

    setIsAuthenticating(true);

    try {
      const success = await googleSheetsAuth.authenticate();

      if (success) {
        toast({
          title: 'Connected Successfully',
          description: 'Your Google Sheets has been connected successfully.',
        });


        queryClient.invalidateQueries({ queryKey: ['google-sheets-status'] });
        await refetchStatus();

        return true;
      } else {
        toast({
          title: 'Authentication Failed',
          description: 'Failed to connect your Google Sheets. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    } catch (error: any) {
      console.error('Google Sheets authentication error:', error);
      
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
      const success = await googleSheetsAuth.disconnect();

      if (success) {
        toast({
          title: 'Disconnected Successfully',
          description: 'Your Google Sheets has been disconnected.',
        });


        queryClient.invalidateQueries({ queryKey: ['google-sheets-status'] });
        await refetchStatus();

        return true;
      } else {
        toast({
          title: 'Disconnect Failed',
          description: 'Failed to disconnect your Google Sheets.',
          variant: 'destructive',
        });
        return false;
      }
    } catch (error: any) {
      console.error('Google Sheets disconnect error:', error);
      
      toast({
        title: 'Disconnect Error',
        description: error.message || 'An error occurred while disconnecting.',
        variant: 'destructive',
      });
      return false;
    }
  }, [toast, queryClient, refetchStatus]);


  const cancelAuthentication = useCallback(() => {
    googleSheetsAuth.cancelAuthentication();
    setIsAuthenticating(false);
  }, []);

  return {

    isConnected: status?.connected ?? false,
    connectionMessage: status?.message ?? '',
    isLoadingStatus,
    statusError,


    isAuthenticating: isAuthenticating || googleSheetsAuth.isAuthenticating(),


    authenticate,
    disconnect,
    cancelAuthentication,
    refetchStatus,


    status,
  };
}

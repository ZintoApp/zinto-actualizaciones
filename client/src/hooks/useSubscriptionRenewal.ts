import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

export function useSubscriptionRenewal() {
  const queryClient = useQueryClient();


  const initiateRenewalMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/enhanced-subscription/initiate-renewal', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to initiate subscription renewal');
      }

      return response.json();
    },
    onSuccess: (data) => {

      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else if (data.stripeCheckoutUrl) {
        window.location.href = data.stripeCheckoutUrl;
      } else {
        toast({
          title: 'Error',
          description: 'Payment gateway not configured. Please contact support.',
          variant: 'destructive',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Payment Required',
        description: error.message || 'Please complete payment to renew your subscription',
        variant: 'destructive',
      });
    },
  });

  const enableAutoRenewalMutation = useMutation({
    mutationFn: async (paymentMethodId?: string) => {
      const response = await fetch('/api/enhanced-subscription/enable-renewal', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentMethodId }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to enable auto-renewal');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-status'] });
      toast({
        title: 'Success',
        description: 'Auto-renewal enabled successfully!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to enable auto-renewal',
        variant: 'destructive',
      });
    },
  });

  const disableAutoRenewalMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/enhanced-subscription/disable-renewal', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to disable auto-renewal');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription-status'] });
      toast({
        title: 'Success',
        description: 'Auto-renewal disabled successfully!',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to disable auto-renewal',
        variant: 'destructive',
      });
    },
  });

  return {
    initiateRenewal: initiateRenewalMutation.mutate,
    isInitiatingRenewal: initiateRenewalMutation.isPending,

    renewSubscription: initiateRenewalMutation.mutate,
    isRenewing: initiateRenewalMutation.isPending,
    enableAutoRenewal: enableAutoRenewalMutation.mutate,
    isEnablingAutoRenewal: enableAutoRenewalMutation.isPending,
    disableAutoRenewal: disableAutoRenewalMutation.mutate,
    isDisablingAutoRenewal: disableAutoRenewalMutation.isPending,
  };
}

import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import useSocket from '@/hooks/useSocket';

interface PlanUpdateEvent {
  companyId: number;
  newPlan: string;
  planId: number;
  timestamp: string;
  changeType: 'immediate' | 'proration_immediate' | 'downgrade' | 'payment_upgrade' | 'subscription_activation';
}

export function usePlanUpdates() {
  const { company, user } = useAuth();
  const { toast } = useToast();
  const { onMessage } = useSocket('/ws');

  useEffect(() => {
    if (!company?.id || !user || user.isSuperAdmin) {
      return;
    }


    const unsubscribe = onMessage('plan_updated', (data: PlanUpdateEvent) => {
      try {


        if (data.companyId === company.id) {

          queryClient.invalidateQueries({ queryKey: ['/api/user/with-company'] });
          queryClient.invalidateQueries({ queryKey: ['/api/user/plan-info'] });
          queryClient.invalidateQueries({ queryKey: ['/api/plans'] });
          queryClient.invalidateQueries({ queryKey: ['/api/flows'] });
          queryClient.invalidateQueries({ queryKey: ['subscription-status'] });

          queryClient.invalidateQueries({ queryKey: ['/api/admin/companies'] });

          queryClient.invalidateQueries({
            predicate: (query) => {
              const queryKey = query.queryKey[0]?.toString();
              return Boolean(queryKey?.startsWith('/api/admin/companies/') &&
                            queryKey !== '/api/admin/companies');
            }
          });


          const changeTypeMessages = {
            immediate: 'Your plan has been updated successfully!',
            proration_immediate: 'Your plan upgrade is now active!',
            downgrade: 'Your plan has been downgraded.',
            payment_upgrade: 'Payment successful! Your plan has been upgraded.',
            subscription_activation: 'Your subscription is now active!'
          };

          toast({
            title: "Plan Updated",
            description: changeTypeMessages[data.changeType] || 'Your plan has been updated.',
            duration: 5000,
          });


          setTimeout(() => {
            Promise.allSettled([
              queryClient.refetchQueries({ queryKey: ['/api/user/with-company'] }),
              queryClient.refetchQueries({ queryKey: ['/api/user/plan-info'] }),
              queryClient.refetchQueries({ queryKey: ['subscription-status'] }),
              queryClient.refetchQueries({ queryKey: ['/api/admin/companies'] }),
              queryClient.refetchQueries({
                predicate: (query) => {
                  const queryKey = query.queryKey[0]?.toString();
                  return Boolean(queryKey?.startsWith('/api/admin/companies/') &&
                                queryKey !== '/api/admin/companies');
                }
              })
            ]).catch(error => {
              console.error('Error refreshing plan data after update:', error);
              toast({
                title: "Refresh Error",
                description: "Plan updated but failed to refresh data. Please reload the page.",
                variant: "destructive",
                duration: 8000,
              });
            });
          }, 500);
        }
      } catch (error) {
        console.error('Error handling plan update:', error);
        toast({
          title: "Update Error",
          description: "Failed to process plan update notification.",
          variant: "destructive",
          duration: 5000,
        });
      }
    });

    return unsubscribe;
  }, [company?.id, user, toast, onMessage]);
}

export default usePlanUpdates;

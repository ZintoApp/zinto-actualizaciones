import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../hooks/use-auth';
import { useSubscriptionStatus } from '../../hooks/useSubscriptionStatus.ts';
import { useGeneralSettings } from '../../hooks/use-general-settings';
import { useManualRenewal } from '../../contexts/manual-renewal-context';
import { apiRequest } from '../../lib/queryClient';
import SubscriptionRenewalDialog from './SubscriptionRenewalDialog';

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export default function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { user, company } = useAuth();
  const [showModal, setShowModal] = useState(false);


  const { settings: generalSettings, isLoading: isLoadingSettings } = useGeneralSettings();


  const { isManualRenewalRequested, clearManualRenewalRequest } = useManualRenewal();


  const { data: subscriptionStatus } = useSubscriptionStatus();


  const { data: renewalStatus, isLoading: renewalStatusLoading } = useQuery({
    queryKey: ['/api/plan-renewal/status'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/plan-renewal/status");
      if (!res.ok) throw new Error("Failed to fetch renewal status");
      return res.json();
    },
    enabled: !!user && !!company, // Only run when user and company are authenticated
  });

  const { data: allPlans } = useQuery({
    queryKey: ['/api/plans'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/plans");
      if (!res.ok) throw new Error("Failed to fetch plans");
      return res.json();
    },
    enabled: !!user && !!company, // Only run when user and company are authenticated
  });


  const currentPlan = allPlans?.find((plan: any) => plan.id === company?.planId);

  useEffect(() => {







    if (!subscriptionStatus || !renewalStatus || renewalStatusLoading || isLoadingSettings) {

      setShowModal(false);
      return;
    }


    if (!generalSettings.planRenewalEnabled) {

      setShowModal(false);
      return;
    }

    if (!renewalStatus.expirationStatus.renewalRequired) {

      setShowModal(false);
      return;
    }

    if (!subscriptionStatus.isActive) {
      let shouldShowModal = false;


      if (subscriptionStatus.status === 'expired' ||
          subscriptionStatus.status === 'cancelled' ||
          subscriptionStatus.status === 'past_due') {

        shouldShowModal = isManualRenewalRequested;
      }


      if (subscriptionStatus.status === 'grace_period') {
        const graceDaysRemaining = subscriptionStatus.gracePeriodDaysRemaining || 0;
        shouldShowModal = graceDaysRemaining <= 3;
      }

      setShowModal(shouldShowModal);
    } else if (subscriptionStatus.isActive) {

      const daysUntilExpiry = subscriptionStatus.daysUntilExpiry || 0;
      const shouldShow = daysUntilExpiry <= 7 && daysUntilExpiry > 0;

      setShowModal(shouldShow);
    } else {

      setShowModal(false);
    }
  }, [subscriptionStatus, renewalStatus, renewalStatusLoading, user, generalSettings.planRenewalEnabled, isLoadingSettings, isManualRenewalRequested]);


  useEffect(() => {

    if (!user) return;

    const handleFetchError = (event: any) => {


      if (event.detail?.status === 402 && event.detail?.error === 'SUBSCRIPTION_EXPIRED') {


        if (generalSettings.planRenewalEnabled && isManualRenewalRequested) {
          setShowModal(true);
        }
      }
    };

    window.addEventListener('subscription-expired', handleFetchError);
    return () => window.removeEventListener('subscription-expired', handleFetchError);
  }, [user, generalSettings.planRenewalEnabled, isManualRenewalRequested]);


  useEffect(() => {

    if (!user) return;

    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      if (response.status === 402) {
        try {
          const errorData = await response.clone().json();
          if (errorData.error === 'SUBSCRIPTION_EXPIRED') {


            if (generalSettings.planRenewalEnabled && isManualRenewalRequested) {
              setShowModal(true);
            }
          }
        } catch (e) {

        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [user, generalSettings.planRenewalEnabled, isManualRenewalRequested]);

  const handleCloseModal = () => {
    setShowModal(false);

    clearManualRenewalRequest();
  };

  const getExpirationInfo = () => {
    if (!subscriptionStatus) return {};

    return {
      expirationDate: subscriptionStatus.daysUntilExpiry !== undefined ?
        new Date(Date.now() - subscriptionStatus.daysUntilExpiry * 24 * 60 * 60 * 1000).toISOString() :
        undefined,
      gracePeriodEnd: subscriptionStatus.gracePeriodDaysRemaining && subscriptionStatus.gracePeriodDaysRemaining > 0 ?
        new Date(Date.now() + subscriptionStatus.gracePeriodDaysRemaining * 24 * 60 * 60 * 1000).toISOString() :
        undefined,
      isInGracePeriod: subscriptionStatus.gracePeriodActive || subscriptionStatus.status === 'grace_period',
    };
  };

  return (
    <>
      {children}
      <SubscriptionRenewalDialog
        isOpen={showModal}
        onClose={handleCloseModal}
        companyName={company?.name}
        planName={currentPlan?.name || company?.plan || "Current Plan"}
        planPrice={currentPlan?.price || 29.99}
        currentPlanId={company?.planId || undefined}
        {...getExpirationInfo()}
      />
    </>
  );
}

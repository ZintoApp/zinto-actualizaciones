import React from 'react';
import { usePlanUpdates } from '@/hooks/use-plan-updates';

interface PlanUpdatesProviderProps {
  children: React.ReactNode;
}

export function PlanUpdatesProvider({ children }: PlanUpdatesProviderProps) {

  usePlanUpdates();
  
  return <>{children}</>;
}

export default PlanUpdatesProvider;

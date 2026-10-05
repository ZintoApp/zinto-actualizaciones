import type { ReactNode } from 'react';
import { useCompanyCustomJs } from '@/hooks/use-company-custom-js';

interface CompanyCustomJsProviderProps {
  children: ReactNode;
}

export function CompanyCustomJsProvider({ children }: CompanyCustomJsProviderProps) {
  useCompanyCustomJs();

  return <>{children}</>;
}
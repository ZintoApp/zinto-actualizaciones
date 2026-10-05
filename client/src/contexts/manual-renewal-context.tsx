import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ManualRenewalContextType {
  isManualRenewalRequested: boolean;
  requestManualRenewal: () => void;
  clearManualRenewalRequest: () => void;
}

const ManualRenewalContext = createContext<ManualRenewalContextType | undefined>(undefined);

interface ManualRenewalProviderProps {
  children: ReactNode;
}

export function ManualRenewalProvider({ children }: ManualRenewalProviderProps) {
  const [isManualRenewalRequested, setIsManualRenewalRequested] = useState(false);

  const requestManualRenewal = () => {
    setIsManualRenewalRequested(true);
  };

  const clearManualRenewalRequest = () => {
    setIsManualRenewalRequested(false);
  };

  return (
    <ManualRenewalContext.Provider
      value={{
        isManualRenewalRequested,
        requestManualRenewal,
        clearManualRenewalRequest,
      }}
    >
      {children}
    </ManualRenewalContext.Provider>
  );
}

export function useManualRenewal() {
  const context = useContext(ManualRenewalContext);
  if (context === undefined) {
    throw new Error('useManualRenewal must be used within a ManualRenewalProvider');
  }
  return context;
}

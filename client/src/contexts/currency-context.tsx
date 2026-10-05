import { createContext, ReactNode, useContext, useEffect, useState, useCallback } from "react";
import { useGeneralSettings, GeneralSettings } from "@/hooks/use-general-settings";
import useSocket from "@/hooks/useSocket";
import { formatCurrency as formatCurrencyUtil } from "@/lib/utils";

type CurrencyContextType = {
  currency: string;
  formatCurrency: (amount: number) => string;
  isLoading: boolean;
};

export const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { settings, isLoading: settingsLoading } = useGeneralSettings();
  const { onMessage } = useSocket('/ws');
  const [currency, setCurrency] = useState<string>(settings.defaultCurrency || 'USD');


  useEffect(() => {
    if (settings.defaultCurrency) {
      setCurrency(settings.defaultCurrency);
    }
  }, [settings.defaultCurrency]);


  useEffect(() => {
    if (!onMessage) return;

    const handleSettingsUpdate = (message: any) => {
      if (message.key === 'general_settings') {
        const updatedSettings = message.value as Partial<GeneralSettings>;
        if (updatedSettings.defaultCurrency) {
          setCurrency(updatedSettings.defaultCurrency);
        }
      }
    };

    const cleanup = onMessage('settingsUpdated', handleSettingsUpdate);

    return cleanup;
  }, [onMessage]);

  const formatCurrency = useCallback((amount: number): string => {
    return formatCurrencyUtil(amount, currency);
  }, [currency]);

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        formatCurrency,
        isLoading: settingsLoading,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useCurrency must be used within a CurrencyProvider");
  }
  return context;
}


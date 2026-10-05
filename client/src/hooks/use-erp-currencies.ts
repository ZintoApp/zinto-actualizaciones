import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { formatCurrency } from '@/lib/utils';

export type CurrencyRow = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  exchangeRate: string;
  isBaseCurrency: boolean | null;
  isActive: boolean | null;
  decimalPlaces: number | null;
};

export function useErpCurrencies(options: { enabled?: boolean } = {}) {
  const { company, user } = useAuth();
  const companyId = company?.id ?? user?.companyId;

  const { data: currencies = [], isLoading } = useQuery({
    queryKey: ['/api/erp/currencies', companyId, 'shared'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/erp/currencies');
      const json = await res.json();
      return (json.data ?? []) as CurrencyRow[];
    },
    enabled: !!companyId && options.enabled !== false,
  });

  const availableCurrencyCodes = useMemo(() => {
    const activeCodes = currencies
      .filter((currency) => currency.isActive !== false)
      .map((currency) => currency.code?.trim().toUpperCase())
      .filter((code): code is string => Boolean(code));
    return activeCodes.length > 0 ? activeCodes : ['USD'];
  }, [currencies]);

  const baseCurrencyCode = useMemo(() => {
    const base = currencies.find((currency) => currency.isBaseCurrency);
    const code = base?.code?.trim().toUpperCase();
    return code || availableCurrencyCodes[0] || 'USD';
  }, [currencies, availableCurrencyCodes]);

  const formatMoney = (amount: number, code: string, locale?: string, retainedDecimalPlaces?: number) => formatCurrency(amount, code, {
    locale, decimalPlaces: retainedDecimalPlaces ?? currencies.find(currency => currency.code === code)?.decimalPlaces,
  });
  return { currencies, availableCurrencyCodes, baseCurrencyCode, isLoading, formatMoney };
}

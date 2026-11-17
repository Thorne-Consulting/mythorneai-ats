'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { toast } from '@/components/ui';
import { CURRENCIES } from '@/features/requisitions/job-form';
import { currencyOption, type CurrencyInfo, type RateTable } from './money';

/** GET /api/currencies: the workspace's base, its catalog with the supported flags, and the rate table. */
export interface CurrenciesView {
  base: string;
  conversionEnabled: boolean;
  source: string;
  currencies: CurrencyInfo[];
  rates: RateTable | null;
}

export function useCurrencies() {
  return useQuery({
    queryKey: ['currencies'],
    queryFn: () => api.get<CurrenciesView>('/api/currencies'),
    staleTime: 5 * 60_000,
  });
}

/** The codes a job or offer may use, the base first; the built-in list until the server answers. */
export function useSupportedCurrencyCodes() {
  const query = useCurrencies();
  const data = query.data;
  const codes = data
    ? [
        data.base,
        ...data.currencies.filter((c) => c.supported && c.code !== data.base).map((c) => c.code),
      ]
    : CURRENCIES;
  return { codes, options: codes.map(currencyOption), base: data?.base ?? 'USD' };
}

export function useSaveCurrencies() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { base: string; supported: string[] }) =>
      api.put<CurrenciesView>('/api/currencies', body),
    onSuccess: (data) => {
      queryClient.setQueryData(['currencies'], data);
      toast.success('Currencies saved');
    },
    onError: (error: Error) => toast.error('Could not save', error.message),
  });
}

export function useRefreshRates() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<CurrenciesView>('/api/currencies/refresh'),
    onSuccess: (data) => {
      queryClient.setQueryData(['currencies'], data);
      toast.success('Rates refreshed', data.rates ? `Rates from ${data.rates.date}.` : undefined);
    },
    onError: (error: Error) => toast.error('Could not refresh the rates', error.message),
  });
}

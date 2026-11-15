'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { toast } from '@/components/ui';
import { defaultLayout, normalizeLayout, type WidgetLayout } from './widget-layout';

const KEY = ['dashboard-layout'];

/**
 * The Team tab's cards, saved with the person's account (`/api/dashboard/layout`), so every
 * browser shows the same dashboard. Until they change something, the role's default.
 */
export function useDashboardLayout(role: string) {
  const queryClient = useQueryClient();
  const saved = useQuery({
    queryKey: KEY,
    // 204 (nothing saved yet) reads as null: a query may not resolve to undefined.
    queryFn: async () =>
      (await api.get<Partial<WidgetLayout> | undefined>('/api/dashboard/layout')) ?? null,
    staleTime: Infinity,
  });
  const save = useMutation({
    mutationFn: (layout: WidgetLayout) => api.put('/api/dashboard/layout', layout),
    onMutate: async (layout) => {
      await queryClient.cancelQueries({ queryKey: KEY });
      const before = queryClient.getQueryData(KEY);
      queryClient.setQueryData(KEY, layout);
      return { before };
    },
    onError: (error: Error, _layout, context) => {
      queryClient.setQueryData(KEY, context?.before);
      toast.error('Could not save your dashboard', error.message);
    },
  });
  const stored = saved.data?.order
    ? { order: saved.data.order, hidden: saved.data.hidden ?? [] }
    : defaultLayout(role);
  return {
    layout: normalizeLayout(stored as WidgetLayout, role),
    loading: saved.isPending,
    setLayout: (layout: WidgetLayout) => save.mutate(layout),
  };
}

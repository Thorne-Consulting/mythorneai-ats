'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { toast } from '@/components/ui';
import { queryString, type ReportChart, type ReportInfo, type ReportTable } from './report-data';

export interface Option {
  value: string;
  label: string;
}
export interface ReportOptions {
  jobs: Option[];
  departments: string[];
  sources: string[];
  recruiters: Option[];
}
export interface ReportView {
  id: string;
  name: string;
  paramsJson: string;
  shared: boolean;
  mine: boolean;
  owner: string;
  pinned: boolean;
  emailed: boolean;
  subscriptionId: string | null;
}
export interface OverviewKpi {
  key: string;
  label: string;
  value: string;
  number: number | null;
  previousValue: string | null;
  previous: number | null;
  hint: string;
  report: string;
  lowerIsBetter: boolean;
  /** A rate: the change is shown in points, not as a share of the old value. */
  percent: boolean;
}
export interface ReportOverview {
  period: string;
  comparison: string | null;
  kpis: OverviewKpi[];
  charts: ReportChart[];
}
export interface DrillItem {
  applicationId: string;
  candidateId: string;
  candidate: string;
  job: string;
  jobCode: string;
  stage: string;
  stageType: string;
  stageColor: string | null;
  status: string;
  source: string;
  appliedAt: string;
  hiredAt: string | null;
  reason: string | null;
}
export interface DrillResult {
  criteria: string[];
  total: number;
  items: DrillItem[];
}
export interface Subscription {
  id: string;
  savedViewId: string;
  viewName: string;
  paramsJson: string;
  mine: boolean;
  owner: string;
  recipients: Option[];
  frequency: 'Weekly' | 'Monthly';
  dayOfWeek: number;
  dayOfMonth: number;
  hour: number;
  paused: boolean;
  schedule: string;
  nextSend: string | null;
  lastSent: string | null;
}

export function useReportCatalog() {
  return useQuery({
    queryKey: ['reports'],
    queryFn: () => api.get<ReportInfo[]>('/api/reports'),
    retry: false,
    staleTime: Infinity,
  });
}

export function useReport(key: string, params: Record<string, string>) {
  return useQuery({
    queryKey: ['report', key, params],
    queryFn: () => api.get<ReportTable>(`/api/reports/${key}?${queryString(params)}`),
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useReportOptions() {
  return useQuery({
    queryKey: ['report-options'],
    queryFn: () => api.get<ReportOptions>('/api/reports/options'),
    staleTime: 60_000,
  });
}

export function useOverview(params: Record<string, string>) {
  return useQuery({
    queryKey: ['report-overview', params],
    queryFn: () => api.get<ReportOverview>(`/api/reports/overview?${queryString(params)}`),
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function useDrill(params: Record<string, string> | null) {
  return useQuery({
    queryKey: ['report-drill', params],
    queryFn: () => api.get<DrillResult>(`/api/reports/applications?${queryString(params!)}`),
    enabled: !!params,
  });
}

export function useReportViews() {
  return useQuery({
    queryKey: ['report-views'],
    queryFn: () => api.get<ReportView[]>('/api/reports/views'),
    retry: false,
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['report-subscriptions'],
    queryFn: () => api.get<Subscription[]>('/api/reports/subscriptions'),
  });
}

export function useRecipients(enabled: boolean) {
  return useQuery({
    queryKey: ['report-recipients'],
    queryFn: () => api.get<{ zone: string; people: Option[] }>('/api/reports/recipients'),
    enabled,
    staleTime: 60_000,
  });
}

/** Save, change, pin and delete report views, refreshing every list that shows them. */
export function useViewActions() {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['report-views'] });
    queryClient.invalidateQueries({ queryKey: ['report-subscriptions'] });
  };
  const fail = (what: string) => (error: Error) => toast.error(`Could not ${what}`, error.message);
  return {
    create: useMutation({
      mutationFn: (body: { name: string; paramsJson: string; shared: boolean }) =>
        api.post<{ id: string }>('/api/reports/views', body),
      onSuccess: refresh,
      onError: fail('save the view'),
    }),
    update: useMutation({
      mutationFn: ({
        id,
        ...body
      }: {
        id: string;
        name?: string;
        paramsJson?: string;
        shared?: boolean;
      }) => api.put(`/api/reports/views/${id}`, body),
      onSuccess: refresh,
      onError: fail('change the view'),
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete(`/api/reports/views/${id}`),
      onSuccess: refresh,
      onError: fail('delete the view'),
    }),
    pin: useMutation({
      mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
        pinned
          ? api.put(`/api/reports/views/${id}/pin`, {})
          : api.delete(`/api/reports/views/${id}/pin`),
      onSuccess: refresh,
      onError: fail('change the pin'),
    }),
  };
}

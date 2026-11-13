'use client';

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, LayoutDashboard, Lock, Wand2 } from 'lucide-react';
import { ApiError, api } from '@/api';
import { SectionNav, SidebarLayout, type SectionGroup } from '@/components/layout/SectionLayout';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { ALL_REPORTS, REPORT_GROUPS, queryString } from './report-data';

export interface ReportInfo {
  key: string;
  title: string;
}
export interface SavedReportView {
  id: string;
  name: string;
  paramsJson: string;
}

export function useReportCatalog() {
  return useQuery({
    queryKey: ['reports'],
    queryFn: () => api.get<ReportInfo[]>('/api/reports'),
    retry: false,
  });
}

export function useSavedReportViews() {
  return useQuery({
    queryKey: ['saved-views', 'reports'],
    queryFn: () => api.get<SavedReportView[]>('/api/saved-views?area=reports'),
  });
}

/** Where a saved view opens: its report's route with the saved filters in the URL. */
export function savedViewHref(view: SavedReportView) {
  try {
    const { report, ...filters } = JSON.parse(view.paramsJson) as Record<string, string>;
    const qs = queryString(filters);
    return `/reports/${report ?? ''}${qs ? `?${qs}` : ''}`;
  } catch {
    return '/reports';
  }
}

/** Reports area: grouped second sidebar beside every report, the builder and the overview. */
export function ReportsShell({ children }: { children: ReactNode }) {
  const catalog = useReportCatalog();
  const views = useSavedReportViews();

  if (catalog.error instanceof ApiError && catalog.error.status === 403)
    return (
      <>
        <PageHeader title="Reports" />
        <Card>
          <EmptyState
            icon={Lock}
            title="You don’t have access to reports"
            description="Ask an admin to give your role access to reports."
          />
        </Card>
      </>
    );

  const known = new Set(ALL_REPORTS.map((report) => report.key));
  const other = (catalog.data ?? []).filter((report) => !known.has(report.key));
  const groups: SectionGroup[] = [
    { items: [{ href: '/reports', label: 'Overview', icon: LayoutDashboard, exact: true }] },
    ...REPORT_GROUPS.map((group) => ({
      label: group.label,
      items: group.reports.map((report) => ({
        href: `/reports/${report.key}`,
        label: report.title,
      })),
    })),
    ...(other.length
      ? [
          {
            label: 'Other',
            items: other.map((report) => ({ href: `/reports/${report.key}`, label: report.title })),
          },
        ]
      : []),
    {
      label: 'Custom',
      items: [
        {
          href: '/reports/builder',
          label: 'Report builder',
          icon: Wand2,
          badge: <Badge tone="amber">Preview</Badge>,
        },
      ],
    },
    ...((views.data?.length ?? 0) > 0
      ? [
          {
            label: 'Saved views',
            items: views.data!.map((view) => ({
              href: savedViewHref(view),
              label: view.name,
              icon: Bookmark,
            })),
          },
        ]
      : []),
  ];

  return (
    <SidebarLayout
      nav={
        <div className="print:hidden">
          <SectionNav title="Reports" groups={groups} />
        </div>
      }
      className="print:block"
    >
      {children}
    </SidebarLayout>
  );
}

'use client';

import type { ReactNode } from 'react';
import { Bookmark, LayoutDashboard, Lock, Mail, Users } from 'lucide-react';
import { ApiError } from '@/api';
import { SectionNav, SidebarLayout, type SectionGroup } from '@/components/layout/SectionLayout';
import { Card, EmptyState, PageHeader } from '@/components/ui';
import { GROUP_ORDER, savedViewHref } from './report-data';
import { useReportCatalog, useReportViews } from './queries';

/** Reports area: grouped second sidebar beside every report, the overview and saved views. */
export function ReportsShell({ children }: { children: ReactNode }) {
  const catalog = useReportCatalog();
  const views = useReportViews();

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

  const reports = catalog.data ?? [];
  const mine = (views.data ?? []).filter((view) => view.mine);
  const shared = (views.data ?? []).filter((view) => !view.mine);
  const groups: SectionGroup[] = [
    {
      items: [
        { href: '/reports', label: 'Overview', icon: LayoutDashboard, exact: true },
        { href: '/reports/subscriptions', label: 'Scheduled emails', icon: Mail },
      ],
    },
    ...[
      ...GROUP_ORDER,
      ...new Set(reports.map((report) => report.group).filter((g) => !GROUP_ORDER.includes(g))),
    ]
      .map((group) => ({
        label: group,
        items: reports
          .filter((report) => report.group === group)
          .map((report) => ({
            href: `/reports/${report.key}`,
            label: report.title,
            match: report.key === 'velocity' ? ['/reports/time-in-stage'] : undefined,
          })),
      }))
      .filter((group) => group.items.length > 0),
    ...(mine.length
      ? [
          {
            label: 'Saved views',
            items: mine.map((view) => ({
              href: savedViewHref(view.paramsJson, view.id),
              label: view.name,
              icon: Bookmark,
            })),
          },
        ]
      : []),
    ...(shared.length
      ? [
          {
            label: 'Shared with me',
            items: shared.map((view) => ({
              href: savedViewHref(view.paramsJson, view.id),
              label: view.name,
              icon: Users,
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

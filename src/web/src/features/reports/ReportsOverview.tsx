'use client';

import Link from 'next/link';
import { ArrowRight, Wand2 } from 'lucide-react';
import { Badge, Card, CardHeader, PageHeader, StatCard, StatGrid } from '@/components/ui';
import { NO_FILTERS, REPORT_GROUPS } from './report-data';
import { statLook, useReport } from './ReportView';

// Headline numbers, each read from the first matching stat of an existing report.
const headlines = [
  { key: 'funnel', label: 'Applications' },
  { key: 'time-to-hire', label: 'Average time to hire' },
  { key: 'sources', label: 'Hire rate' },
  { key: 'interviewers', label: 'Scorecards overdue' },
];

function Headline({ index }: { index: number }) {
  const { key, label } = headlines[index];
  const report = useReport(key, NO_FILTERS);
  const stat = report.data?.stats?.find((item) => item.label === label);
  return (
    <StatCard
      href={`/reports/${key}`}
      label={label}
      value={report.isLoading ? '…' : (stat?.value ?? '–')}
      hint={report.data?.title}
      icon={statLook[index].icon}
      tone={statLook[index].tone}
    />
  );
}

/** /reports: headline numbers across all jobs, and every report grouped by what it answers. */
export function ReportsOverview() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Turn recruiting activity into insights that help you hire better."
      />
      <div className="flex flex-col gap-4">
        <StatGrid>
          {headlines.map((item, index) => (
            <Headline key={item.key} index={index} />
          ))}
        </StatGrid>
        <div className="grid gap-4 md:grid-cols-2">
          {REPORT_GROUPS.map((group) => (
            <Card key={group.label}>
              <CardHeader title={group.label} />
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {group.reports.map((report) => (
                  <li key={report.key}>
                    <Link
                      href={`/reports/${report.key}`}
                      className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-base font-medium text-fg">{report.title}</span>
                        <span className="block text-xs text-fg-subtle">{report.blurb}</span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <Card>
            <CardHeader
              title={
                <span className="inline-flex items-center gap-2">
                  Custom <Badge tone="amber">Preview</Badge>
                </span>
              }
            />
            <Link
              href="/reports/builder"
              className="flex items-center gap-3 border-t border-border-subtle px-5 py-3 transition-colors hover:bg-muted"
            >
              <Wand2 className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium text-fg">Report builder</span>
                <span className="block text-xs text-fg-subtle">
                  Chart any measure from the reports above, split the way you need it.
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}

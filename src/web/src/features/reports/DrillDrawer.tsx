'use client';

import Link from 'next/link';
import { Download } from 'lucide-react';
import { StageBadge, StatusBadge } from '@/components/status';
import { Badge, Button, Drawer, EmptyState, SkeletonRows } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { queryString } from './report-data';
import { useDrill } from './queries';

export type DrillRequest = { title: string; params: Record<string, string> };

/** The applications behind a number: what they count, each one linked, and a download of all of them. */
export function DrillDrawer({
  request,
  onClose,
}: {
  request: DrillRequest | null;
  onClose: () => void;
}) {
  const drill = useDrill(request?.params ?? null);
  const data = drill.data;
  const csv = request
    ? `/api/reports/applications?${queryString({ ...request.params, format: 'csv' })}`
    : '';
  return (
    <Drawer
      opened={!!request}
      onClose={onClose}
      size="lg"
      title={request?.title ?? ''}
      description={
        data
          ? `${data.total.toLocaleString('en-US')} ${data.total === 1 ? 'application' : 'applications'}`
          : undefined
      }
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Close
          </Button>
          {!!data?.total && (
            <Button asChild variant="secondary">
              <a href={csv}>
                <Download />
                Export these (CSV)
              </a>
            </Button>
          )}
        </>
      }
    >
      {drill.isLoading ? (
        <SkeletonRows rows={6} />
      ) : drill.error ? (
        <p className="text-sm text-fg-muted">
          This list didn’t load. Close it and try again. {drill.error.message}
        </p>
      ) : data ? (
        <div className="space-y-4">
          {data.criteria.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-subtle">What this counts</p>
              <ul className="flex flex-wrap gap-1.5">
                {data.criteria.map((item) => (
                  <li key={item}>
                    <Badge tone="gray">{item}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.items.length === 0 ? (
            <EmptyState
              title="No applications"
              description="Nothing matches this number now. The data may have changed since the report loaded."
            />
          ) : (
            <ul className="-mx-2 divide-y divide-border-subtle">
              {data.items.map((item) => (
                <li key={item.applicationId}>
                  <Link
                    href={`/applications/${item.applicationId}`}
                    className="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium text-fg">{item.candidate}</span>
                      <span className="block text-xs text-fg-muted">
                        {item.job} · {item.source}
                      </span>
                      {item.reason && (
                        <span className="mt-0.5 block text-xs text-fg-subtle">
                          Reason: {item.reason}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      {item.status === 'Active' ? (
                        <StageBadge
                          stage={item.stage}
                          type={item.stageType}
                          color={item.stageColor}
                          size="sm"
                        />
                      ) : (
                        <StatusBadge status={item.status} size="sm" />
                      )}
                      <span className="text-2xs text-fg-subtle tnum">
                        {item.hiredAt
                          ? `Hired ${formatDate(item.hiredAt)}`
                          : `Applied ${formatDate(item.appliedAt)}`}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {data.total > data.items.length && (
            <p className="text-xs text-fg-subtle">
              Showing the first {data.items.length.toLocaleString('en-US')}. Export these to get all{' '}
              {data.total.toLocaleString('en-US')}.
            </p>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

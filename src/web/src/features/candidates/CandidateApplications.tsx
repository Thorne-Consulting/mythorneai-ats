'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card, CardHeader, CountBadge } from '@/components/ui';
import { StageBadge, StatusBadge } from '@/components/status';
import { formatDate } from '@/lib/format';
import type { CandidateDetail } from '@/types';

/** Where this person is in hiring: one line per application, the whole line a link. */
export function CandidateApplications({
  applications,
}: {
  applications: CandidateDetail['applications'];
}) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            Applications
            {applications.length > 0 && <CountBadge count={applications.length} tone="gray" />}
          </span>
        }
      />
      {applications.length === 0 ? (
        <p className="px-5 pb-5 text-base text-fg-subtle">Not in any job yet.</p>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {applications.map((application) => (
            <li key={application.id}>
              <Link
                href={`/applications/${application.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted focus-visible:bg-accent focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-fg">
                    {application.requisitionTitle}
                  </span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {application.requisitionCode} · applied {formatDate(application.appliedAt)}
                  </span>
                </span>
                {application.status === 'Active' ? (
                  <StageBadge stage={application.stage} />
                ) : (
                  <>
                    <span className="hidden text-sm text-fg-subtle sm:inline">
                      {application.stage}
                    </span>
                    <StatusBadge status={application.status} />
                  </>
                )}
                <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

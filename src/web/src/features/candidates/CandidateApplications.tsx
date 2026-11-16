'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Briefcase, ChevronRight, Plus } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { StageBadge, StatusBadge } from '@/components/status';
import { formatDate, formatRelative } from '@/lib/format';
import type { CandidateDetail } from '@/types';
import { ApplyModal } from './ApplyModal';

/** Where this person is in hiring: one line per application, the whole line a link. */
export function CandidateApplications({
  candidate,
  canApply,
}: {
  candidate: CandidateDetail;
  canApply: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const applications = candidate.applications;
  return (
    <Card>
      <CardHeader
        title="Applications"
        action={
          canApply &&
          applications.length > 0 && (
            <Button variant="link" size="sm" leftIcon={<Plus />} onClick={() => setOpened(true)}>
              Add to a job
            </Button>
          )
        }
      />
      {applications.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState
            compact
            icon={Briefcase}
            title="Not in any job yet"
            description={
              canApply ? 'Add them to a job to start tracking their progress.' : undefined
            }
            action={
              canApply && (
                <Button variant="secondary" leftIcon={<Plus />} onClick={() => setOpened(true)}>
                  Add to a job
                </Button>
              )
            }
          />
        </div>
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
                    {application.requisitionCode} · applied {formatDate(application.appliedAt)} ·
                    last activity {formatRelative(application.lastActivityAt)}
                  </span>
                </span>
                {application.status === 'Active' ? (
                  <StageBadge
                    stage={application.stage}
                    type={application.stageType}
                    color={application.stageColor}
                  />
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="hidden text-sm text-fg-subtle sm:inline">
                      at {application.stage}
                    </span>
                    <StatusBadge status={application.status} />
                  </span>
                )}
                <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ApplyModal
        candidateId={candidate.id}
        candidate={candidate}
        opened={opened}
        onClose={() => setOpened(false)}
      />
    </Card>
  );
}

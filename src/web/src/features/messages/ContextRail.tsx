'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CalendarPlus, UserX, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { StageBadge, StatusBadge } from '@/components/status';
import {
  Button,
  DescriptionList,
  IconButton,
  Select,
  Separator,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { useApplication, useInvalidateApplication } from '@/features/applications/application-data';
import { RejectModal } from '@/features/applications/RejectModal';
import { useRefreshThreads, type ThreadInfo } from './inbox-data';

const when = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));

/**
 * The candidate beside the conversation: stage with a changer, quick actions, the next interview,
 * contact details and their other applications. The thread header already shows name and job.
 */
export function ContextRail({ info, onClose }: { info: ThreadInfo; onClose: () => void }) {
  const id = info.applicationId;
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  const refresh = useRefreshThreads();
  const [rejecting, setRejecting] = useState(false);
  const application = query.data?.application;
  const move = useMutation({
    mutationFn: (stageId: string) =>
      api.patch(`/api/applications/${id}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    onSuccess: () => {
      invalidate();
      refresh(id);
      toast.success('Stage changed');
    },
    onError: (error: Error) => toast.error('Could not move this applicant', error.message),
  });
  const next = application?.interviews
    .filter((i) => i.status === 'Scheduled' && new Date(i.endsAt) > new Date())
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const active = application?.status === 'Active';

  return (
    <aside
      aria-label="Candidate details"
      className="absolute inset-y-0 right-0 z-20 flex w-[min(320px,100%)] flex-col border-l border-border-subtle bg-card shadow-pop @[1100px]:static @[1100px]:z-auto @[1100px]:w-[300px] @[1100px]:shrink-0 @[1100px]:shadow-none"
    >
      <div className="flex h-[61px] shrink-0 items-center justify-between gap-2 border-b border-border-subtle px-4">
        <h2 className="text-base font-semibold text-fg">Details</h2>
        <IconButton label="Hide details" variant="quiet" size="sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {!application ? (
          <SkeletonRows rows={4} />
        ) : (
          <>
            <section className="space-y-3">
              {active ? (
                <Select
                  label="Stage"
                  value={application.stageId}
                  onChange={(value) => value && value !== application.stageId && move.mutate(value)}
                  data={application.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
                  disabled={move.isPending}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge
                    stage={application.stage}
                    type={application.stages.find((x) => x.id === application.stageId)?.type}
                    color={application.stages.find((x) => x.id === application.stageId)?.color}
                  />
                  <StatusBadge status={application.status} />
                </div>
              )}
              {active && (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/applications/${id}/interviews`}>
                      <CalendarPlus aria-hidden />
                      Schedule interview
                    </Link>
                  </Button>
                  <Button
                    variant="danger-quiet"
                    size="sm"
                    leftIcon={<UserX />}
                    onClick={() => setRejecting(true)}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </section>

            {next && (
              <section className="rounded-lg bg-accent p-3.5">
                <p className="text-sm font-semibold text-fg">Next interview</p>
                <p className="mt-1 text-xs text-fg-muted">{next.title}</p>
                <p className="text-xs text-fg-muted">{when(next.startsAt)}</p>
                <Link
                  href={`/applications/${id}/interviews`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-foreground hover:underline"
                >
                  View interview <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </section>
            )}

            <Separator />
            <DescriptionList
              className="gap-y-3"
              items={[
                {
                  label: 'Email',
                  value: (
                    <a
                      href={`mailto:${info.candidateEmail}`}
                      className="text-sm text-accent-foreground hover:underline"
                    >
                      {info.candidateEmail}
                    </a>
                  ),
                },
                ...(application.candidatePhone
                  ? [
                      {
                        label: 'Phone',
                        value: <span className="text-sm">{application.candidatePhone}</span>,
                      },
                    ]
                  : []),
                ...(application.candidateLocation
                  ? [
                      {
                        label: 'Location',
                        value: <span className="text-sm">{application.candidateLocation}</span>,
                      },
                    ]
                  : []),
                { label: 'Source', value: <span className="text-sm">{application.source}</span> },
              ]}
            />

            {info.otherApplications.length > 0 && (
              <>
                <Separator />
                <section>
                  <h3 className="text-xs text-fg-subtle">Other applications</h3>
                  <ul className="mt-2 space-y-2">
                    {info.otherApplications.map((other) => (
                      <li
                        key={other.applicationId}
                        className="flex items-center justify-between gap-2"
                      >
                        <Link
                          href={`/messages?thread=${other.applicationId}`}
                          className="min-w-0 truncate text-sm text-accent-foreground hover:underline"
                        >
                          {other.jobTitle}
                        </Link>
                        {other.status === 'Active' ? (
                          <StageBadge
                            stage={other.stage}
                            type={other.stageType}
                            color={other.stageColor}
                            size="sm"
                          />
                        ) : (
                          <StatusBadge status={other.status} size="sm" />
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            <Link
              href={`/applications/${id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
            >
              Open application <ArrowRight className="size-4" aria-hidden />
            </Link>
          </>
        )}
      </div>
      {application && (
        <RejectModal
          applicationId={id}
          stageId={application.stageId}
          firstName={info.candidateFirstName}
          doNotContact={Boolean(
            (application as { candidateDoNotContact?: boolean }).candidateDoNotContact,
          )}
          opened={rejecting}
          onClose={() => setRejecting(false)}
          onSaved={() => {
            invalidate();
            refresh(id);
          }}
        />
      )}
    </aside>
  );
}

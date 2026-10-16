'use client';

import type { ReactNode } from 'react';
import { Anchor, Box, Button, Group, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconUserOff } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { StatusBadge } from '@/components/ui/Badges';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { DetailHeader } from '@/components/ui/PageHeaders';
import { PageTabs } from '@/components/ui/PageTabs';
import { formatDate, formatRelative } from '@/lib/format';
import type { ApplicationDetailResponse } from '@/types';
import {
  canManageRole,
  LoadError,
  OfflineNotice,
  useApplication,
  useInvalidateApplication,
} from './application-data';
import { useApplicationExtras } from './application-extras';
import { RejectModal } from './RejectModal';

export function ApplicationShell({
  id,
  initialData,
  children,
}: {
  id: string;
  initialData: ApplicationDetailResponse;
  children: ReactNode;
}) {
  const user = useCurrentUser();
  const query = useApplication(id, initialData);
  const { messages } = useApplicationExtras(id);
  const invalidate = useInvalidateApplication(id);
  const [rejectOpened, rejectModal] = useDisclosure();
  const canManage = canManageRole(user.role);
  const stageMutation = useMutation({
    mutationFn: (stageId: string) =>
      api.patch<void>(`/api/applications/${id}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    onSuccess: () => {
      invalidate();
      notifications.show({ color: 'teal', message: 'Applicant moved' });
    },
    // The API refuses a straight move to Hired (409) and explains why; show that, not a generic error.
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not move this applicant',
        message: error.message,
      }),
  });

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (query.fetchStatus === 'paused') return <OfflineNotice onRetry={query.refetch} />;
  if (!query.data) return <LoadingBlock rows={5} />;
  const application = query.data.application;
  const unread = messages.filter((message) => message.fromCandidate && !message.readAt).length;

  return (
    <>
      <DetailHeader
        crumbs={[
          { label: 'Candidates', href: '/candidates' },
          {
            label: application.requisitionTitle,
            href: `/requisitions/${application.requisitionId}`,
          },
        ]}
        title={application.candidateName}
        badges={<StatusBadge status={application.status} />}
        subtitle={[application.candidateTitle, application.candidateLocation]
          .filter(Boolean)
          .join(' · ')}
        actions={
          // Hired is finished; the only way back is "Reverse" on the acceptance panel.
          canManage &&
          application.status !== 'Hired' && (
            <>
              <Select
                aria-label="Current stage"
                value={application.stageId}
                onChange={(value) => value && stageMutation.mutate(value)}
                data={application.stages.map((stage) => ({ value: stage.id, label: stage.name }))}
                w={170}
                allowDeselect={false}
                disabled={stageMutation.isPending}
              />
              <Button
                variant="default"
                c="red.9"
                leftSection={<IconUserOff size={16} />}
                onClick={rejectModal.open}
              >
                Reject
              </Button>
            </>
          )
        }
      />
      <PageTabs
        items={[
          { label: 'Overview', href: `/applications/${id}` },
          {
            label: 'Interviews',
            href: `/applications/${id}/interviews`,
            count: application.interviews.length,
          },
          ...(canManage || messages.length > 0
            ? [
                {
                  label: 'Messages',
                  href: `/applications/${id}/messages`,
                  count: unread || undefined,
                },
              ]
            : []),
          { label: 'Activity', href: `/applications/${id}/activity` },
        ]}
      />
      <div className="record-grid">
        <div style={{ minWidth: 0 }}>{children}</div>
        <aside className="record-rail" aria-label="Applicant details">
          <div className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Applicant</h2>
            </div>
            <dl className="facts">
              <Fact label="Email" value={application.candidateEmail} />
              <Fact label="Phone" value={application.candidatePhone ?? '–'} />
              <Fact label="Location" value={application.candidateLocation ?? '–'} />
              <Fact label="Source" value={application.source} />
              <Fact label="Applied" value={formatDate(application.appliedAt)} />
              <Fact label="Last activity" value={formatRelative(application.lastActivityAt)} />
              {application.dispositionReason && (
                <Fact label="Reason" value={application.dispositionReason} />
              )}
            </dl>
            {application.candidateTags.length > 0 && (
              <Box px={24} pb="md" className="signals" style={{ marginTop: 0 }}>
                {application.candidateTags.map((tag) => (
                  <span key={tag} className="signal">
                    {tag}
                  </span>
                ))}
              </Box>
            )}
            <Group px={24} pb="lg">
              <Anchor component={Link} href={`/candidates/${application.candidateId}`} size="sm">
                Resume and other applications
              </Anchor>
            </Group>
          </div>
        </aside>
      </div>
      <RejectModal
        applicationId={id}
        stageId={application.stageId}
        opened={rejectOpened}
        onClose={rejectModal.close}
        onSaved={invalidate}
      />
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { Avatar, Button, Select } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconUserOff } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { StatusBadge } from '@/components/ui/Badges';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { DetailHeader } from '@/components/ui/PageHeaders';
import { PageTabs } from '@/components/ui/PageTabs';
import { initials } from '@/lib/format';
import type { ApplicationDetailResponse } from '@/types';
import {
  canManageRole,
  LoadError,
  OfflineNotice,
  useApplication,
  useInvalidateApplication,
} from './application-data';
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
  });

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (query.fetchStatus === 'paused') return <OfflineNotice onRetry={query.refetch} />;
  if (!query.data) return <LoadingBlock rows={5} />;
  const application = query.data.application;

  return (
    <>
      <DetailHeader
        backHref={`/requisitions/${application.requisitionId}`}
        backLabel={application.requisitionCode}
        current={application.candidateName}
        avatar={
          <Avatar size={56} radius="xl" color="indigo" variant="light">
            {initials(application.candidateName)}
          </Avatar>
        }
        title={application.candidateName}
        badges={<StatusBadge status={application.status} />}
        subtitle={`${application.candidateTitle ?? 'Applicant'} · ${application.requisitionTitle}`}
        actions={
          canManage && (
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
          { label: 'History', href: `/applications/${id}/history`, count: query.data.audit.length },
        ]}
      />
      {children}
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

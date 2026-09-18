'use client';

import { Select, SimpleGrid } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCalendarEvent, IconMapPin, IconTargetArrow, IconUser } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { StatusBadge } from '@/components/ui/Badges';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { DetailHeader } from '@/components/ui/PageHeaders';
import { PageTabs } from '@/components/ui/PageTabs';
import { formatDate } from '@/lib/format';
import type { BoardData, RequisitionDetail } from '@/types';
import { useBoard, useCanManage, useRequisition } from './requisition-data';
import { RequisitionInfoCard } from './RequisitionInfoCard';

export function RequisitionShell({
  id,
  initialData,
  initialBoard,
  children,
}: {
  id: string;
  initialData: RequisitionDetail;
  initialBoard: BoardData;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const details = useRequisition(id, initialData);
  const board = useBoard(id, initialBoard);
  const canManage = useCanManage(details.data);
  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch<void>(`/api/requisitions/${id}/status`, { status, reason: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      notifications.show({ color: 'teal', message: 'Job status updated' });
    },
  });

  if (!details.data) return <LoadingBlock rows={5} />;
  const requisition = details.data;
  const totalActive =
    board.data?.stages.reduce((sum, stage) => sum + stage.applications.length, 0) ?? 0;

  return (
    <>
      <DetailHeader
        backHref="/requisitions"
        backLabel="Jobs"
        current={requisition.code}
        title={requisition.title}
        badges={<StatusBadge status={requisition.status} />}
        subtitle={`${requisition.code} · ${requisition.department}`}
        actions={
          canManage && (
            <Select
              aria-label="Job status"
              value={requisition.status}
              onChange={(value) => value && statusMutation.mutate(value)}
              data={['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled']}
              w={160}
              allowDeselect={false}
            />
          )
        }
      />

      <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md" mb="xl">
        <RequisitionInfoCard
          icon={IconMapPin}
          label="Location"
          value={requisition.location}
          hint={requisition.workMode}
        />
        <RequisitionInfoCard
          icon={IconTargetArrow}
          label="Openings"
          value={`${requisition.openings} ${requisition.openings === 1 ? 'seat' : 'seats'}`}
          hint={requisition.employmentType}
        />
        <RequisitionInfoCard
          icon={IconUser}
          label="Hiring manager"
          value={requisition.ownerEmail.split('@')[0]}
          hint={requisition.ownerEmail}
        />
        <RequisitionInfoCard
          icon={IconCalendarEvent}
          label="Target start"
          value={formatDate(requisition.targetStartDate)}
          hint={requisition.targetStartDate ? 'Planned start date' : 'Not set'}
        />
      </SimpleGrid>

      <PageTabs
        items={[
          { label: 'Pipeline', href: `/requisitions/${id}`, count: totalActive },
          {
            label: 'Interview kits',
            href: `/requisitions/${id}/kits`,
            count: requisition.interviewKits.length,
          },
          { label: 'Details', href: `/requisitions/${id}/details` },
        ]}
      />
      {children}
    </>
  );
}

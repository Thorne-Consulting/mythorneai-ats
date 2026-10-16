'use client';

import { Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { StatusBadge } from '@/components/ui/Badges';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { DetailHeader } from '@/components/ui/PageHeaders';
import { PageTabs } from '@/components/ui/PageTabs';
import { humanize } from '@/lib/format';
import type { RequisitionDetail } from '@/types';
import { useCanManage, useRequisition } from './requisition-data';
import { RequisitionApproval } from './RequisitionApproval';

// Opening goes through approval when the organization asks for it, so Open is not offered then.
function statusOptions(current: string, approvalRequired?: boolean) {
  if (current === 'PendingApproval') return ['PendingApproval', 'Draft', 'Cancelled'];
  const all = ['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled'];
  return current === 'Draft' && approvalRequired ? all.filter((item) => item !== 'Open') : all;
}

export function RequisitionShell({
  id,
  initialData,
  children,
}: {
  id: string;
  initialData: RequisitionDetail;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const details = useRequisition(id, initialData);
  const canManage = useCanManage(details.data);
  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch<void>(`/api/requisitions/${id}/status`, { status, reason: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      notifications.show({ color: 'teal', message: 'Job status updated' });
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not change the job status',
        message: error.message,
      }),
  });

  const approvalRequired = useQuery({
    queryKey: ['requisition-approval', id],
    queryFn: () => api.get<{ required: boolean }>(`/api/requisitions/${id}/approval`),
    enabled: canManage,
    retry: false,
  }).data?.required;

  if (!details.data) return <LoadingBlock rows={5} />;
  const requisition = details.data;

  return (
    <>
      <DetailHeader
        crumbs={[{ label: 'Jobs', href: '/requisitions' }]}
        title={requisition.title}
        badges={<StatusBadge status={requisition.status} />}
        subtitle={`${requisition.code} · ${requisition.department} · ${requisition.location} (${requisition.workMode})`}
        actions={
          canManage && (
            <Select
              aria-label="Job status"
              value={requisition.status}
              onChange={(value) => value && statusMutation.mutate(value)}
              data={statusOptions(requisition.status, approvalRequired).map((value) => ({
                value,
                label: humanize(value),
              }))}
              w={160}
              allowDeselect={false}
            />
          )
        }
      />

      <RequisitionApproval id={id} status={requisition.status} canManage={canManage} />

      <PageTabs
        items={[
          { label: 'Pipeline', href: `/requisitions/${id}` },
          { label: 'Role', href: `/requisitions/${id}/details` },
          {
            label: 'Interview kits',
            href: `/requisitions/${id}/kits`,
            count: requisition.interviewKits.length,
          },
          ...(canManage ? [{ label: 'Visibility', href: `/requisitions/${id}/visibility` }] : []),
        ]}
      />
      {children}
    </>
  );
}

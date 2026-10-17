'use client';

import { Select } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { IconBriefcase } from '@tabler/icons-react';
import { api } from '@/api';
import { StatusBadge } from '@/components/ui/Badges';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { type Crumb, DetailHeader } from '@/components/ui/PageHeaders';
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
  const pathname = usePathname();
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
  const base = `/requisitions/${id}`;
  const tabs = [
    { label: 'Pipeline', href: base },
    { label: 'Role', href: `${base}/details` },
    { label: 'Interview kits', href: `${base}/kits`, count: requisition.interviewKits.length },
    ...(canManage ? [{ label: 'Settings', href: `${base}/settings` }] : []),
  ];

  // The trail follows the URL: Jobs / this job / the tab / a kit / Edit.
  const crumbs: Crumb[] = [
    { label: 'Jobs', href: '/requisitions', icon: <IconBriefcase size={14} aria-hidden /> },
    { label: requisition.title, href: base },
  ];
  const [tab, kitId, action] = pathname.slice(base.length + 1).split('/');
  const tabCrumb = tabs.find((item) => item.href === `${base}/${tab}`);
  if (tabCrumb) crumbs.push({ label: tabCrumb.label, href: tabCrumb.href });
  if (tab === 'kits' && kitId === 'new') {
    crumbs.push({ label: 'New kit', href: `${base}/kits/new` });
  } else if (tab === 'kits' && kitId) {
    const kit = requisition.interviewKits.find((item) => item.id === kitId);
    crumbs.push({ label: kit?.name ?? 'Kit', href: `${base}/kits/${kitId}` });
    if (action === 'edit') crumbs.push({ label: 'Edit', href: `${base}/kits/${kitId}/edit` });
  }
  crumbs[crumbs.length - 1].current = true;

  return (
    <>
      <DetailHeader
        crumbs={crumbs}
        title={requisition.title}
        // Managers change the status in the control on the right, so the badge would repeat it.
        badges={canManage ? undefined : <StatusBadge status={requisition.status} />}
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

      <PageTabs items={tabs} />
      {children}
    </>
  );
}

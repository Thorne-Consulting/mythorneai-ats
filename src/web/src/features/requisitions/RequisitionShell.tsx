'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChevronDown,
  ClipboardList,
  FileText,
  Globe,
  Kanban,
  LayoutDashboard,
  ListChecks,
  Settings,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHeader,
  SkeletonRows,
  toast,
  type Crumb,
} from '@/components/ui';
import { StatusBadge } from '@/components/status';
import { SectionNav, SidebarLayout, type SectionGroup } from '@/components/layout/SectionLayout';
import { humanize } from '@/lib/format';
import type { RequisitionDetail } from '@/types';
import { statusOptions, useBoard, useCanManage, useRequisition } from './requisition-data';
import { RequisitionApproval } from './RequisitionApproval';

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
  const pathname = usePathname() ?? '';
  const details = useRequisition(id, initialData);
  const board = useBoard(id);
  const canManage = useCanManage(details.data);
  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch<void>(`/api/requisitions/${id}/status`, { status, reason: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success('Job status updated');
    },
    onError: (error: Error) => toast.error('Could not change the job status', error.message),
  });

  const approvalRequired = useQuery({
    queryKey: ['requisition-approval', id],
    queryFn: () => api.get<{ required: boolean }>(`/api/requisitions/${id}/approval`),
    enabled: canManage,
    retry: false,
  }).data?.required;

  if (!details.data)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  const requisition = details.data;
  const base = `/jobs/${id}`;
  const candidates = board.data?.stages.reduce((sum, s) => sum + s.applications.length, 0);
  const groups: SectionGroup[] = [
    {
      items: [
        { label: 'Overview', href: base, icon: LayoutDashboard, exact: true },
        { label: 'Pipeline', href: `${base}/pipeline`, icon: Kanban },
        { label: 'Candidates', href: `${base}/candidates`, icon: Users, count: candidates },
      ],
    },
    {
      label: 'The job',
      items: [
        { label: 'Details', href: `${base}/details`, icon: FileText },
        { label: 'Requirements', href: `${base}/requirements`, icon: ListChecks },
        {
          label: 'Interview kits',
          href: `${base}/kits`,
          icon: ClipboardList,
          count: requisition.interviewKits.length,
        },
        { label: 'Job posting', href: `${base}/posting`, icon: Globe },
      ],
    },
    {
      label: 'People',
      items: [
        { label: 'Hiring team', href: `${base}/team`, icon: UsersRound },
        ...(canManage ? [{ label: 'Settings', href: `${base}/settings`, icon: Settings }] : []),
      ],
    },
  ];
  const sections = groups.flatMap((group) => group.items);

  // The trail follows the URL: Jobs / this job / the section / a kit / Edit.
  const crumbs: Crumb[] = [
    { label: 'Jobs', href: '/jobs' },
    { label: requisition.title, href: base },
  ];
  const [tab, kitId, action] = pathname.slice(base.length + 1).split('/');
  const tabCrumb = tab ? sections.find((item) => item.href === `${base}/${tab}`) : undefined;
  if (tabCrumb) crumbs.push({ label: tabCrumb.label, href: tabCrumb.href });
  if (tab === 'kits' && kitId === 'new') {
    crumbs.push({ label: 'New kit', href: `${base}/kits/new` });
  } else if (tab === 'kits' && kitId) {
    const kit = requisition.interviewKits.find((item) => item.id === kitId);
    crumbs.push({ label: kit?.name ?? 'Kit', href: `${base}/kits/${kitId}` });
    if (action === 'edit') crumbs.push({ label: 'Edit', href: `${base}/kits/${kitId}/edit` });
  }

  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {requisition.title}
            <StatusBadge status={requisition.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" size="sm">
              {requisition.code}
            </Badge>
            {requisition.department} · {requisition.location} · {requisition.workMode}
          </span>
        }
        actions={
          canManage && (
            <>
              <Menu>
                <MenuTrigger asChild>
                  <Button
                    variant="secondary"
                    rightIcon={<ChevronDown />}
                    loading={statusMutation.isPending}
                  >
                    Change status
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {statusOptions(requisition.status, approvalRequired).map((value) => (
                    <MenuItem key={value} onSelect={() => statusMutation.mutate(value)}>
                      {humanize(value)}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <Button asChild>
                <Link href={`/candidates?job=${id}`}>
                  <UserPlus />
                  Find candidates
                </Link>
              </Button>
            </>
          )
        }
      />

      <RequisitionApproval id={id} status={requisition.status} canManage={canManage} />

      <SidebarLayout nav={<SectionNav groups={groups} title="Job" />}>{children}</SidebarLayout>
    </>
  );
}

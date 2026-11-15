'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import {
  CircleCheck,
  Copy,
  CopyPlus,
  ExternalLink,
  MoreHorizontal,
  RotateCcw,
  Send,
  UserPlus,
} from 'lucide-react';
import { api } from '@/api';
import { asJob, useAbility } from '@/lib/ability';
import {
  Badge,
  Button,
  Card,
  IconButton,
  LinkTabs,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  PageHeader,
  SkeletonRows,
  toast,
  type Crumb,
  type LinkTab,
} from '@/components/ui';
import { StatusBadge, statusLabel } from '@/components/status';
import type { RequisitionDetail } from '@/types';
import { daysOpen, primaryAction } from './job-status';
import { useJobStatusChange } from './JobStatusChange';
import { JobSwitcher } from './JobSwitcher';
import { statusOptions, useRequisition } from './requisition-data';
import type { RequisitionWithSettings } from './requirements-types';
import { RequisitionApproval, SubmitForApprovalModal, useJobApproval } from './RequisitionApproval';

/** The /pipeline shortcut opens the last job you looked at; this cookie remembers it. */
const LAST_JOB_COOKIE = 'ats-last-job';

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * A job record: compact header (title, status, the one next action, ••• menu), then underline
 * tabs. Every tab under /jobs/[id] renders inside it.
 */
export function RequisitionShell({
  id,
  initialData,
  children,
}: {
  id: string;
  initialData: RequisitionDetail;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const details = useRequisition(id, initialData);
  const ability = useAbility();
  const canManage = ability.can('update', asJob(details.data ?? {}));
  // Finding people on file (ranking everyone) is for whoever keeps the candidate records.
  const canFind = ability.can('update', 'Candidate');
  const approvalRequired = useJobApproval(id, canManage).data?.required;
  const status = useJobStatusChange();
  const [submitting, setSubmitting] = useState(false);
  const duplicate = useMutation({
    mutationFn: () => api.post<{ id: string }>(`/api/requisitions/${id}/duplicate`),
    onSuccess: ({ id: copyId }) => {
      toast.success('Job duplicated', 'The copy is a draft. Change what you need, then open it.');
      router.push(`/jobs/${copyId}/settings`);
    },
    onError: (error: Error) => toast.error('Could not duplicate the job', error.message),
  });

  useEffect(() => {
    document.cookie = `${LAST_JOB_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
  }, [id]);

  if (!details.data)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  const job = details.data as RequisitionWithSettings;
  const base = `/jobs/${id}`;
  // From the job payload, so the server and the browser render the same number.
  const candidates = job.stages.reduce((sum, stage) => sum + (stage.count ?? 0), 0);
  const tabs: LinkTab[] = [
    { label: 'Overview', href: base, exact: true },
    { label: 'Pipeline', href: `${base}/pipeline`, count: candidates },
    { label: 'Posting', href: `${base}/posting` },
    { label: 'Requirements', href: `${base}/requirements` },
    { label: 'Interview kits', href: `${base}/kits`, count: job.interviewKits.length },
    { label: 'Team', href: `${base}/team` },
    ...(canManage ? [{ label: 'Settings', href: `${base}/settings` }] : []),
  ];

  // Jobs / this job (a switcher that keeps the tab) / and, inside a kit, the kit trail.
  const [tab = '', kitId, action] = pathname.slice(base.length + 1).split('/');
  const crumbs: Crumb[] = [
    { label: 'Jobs', href: '/jobs' },
    { label: <JobSwitcher current={job} tab={tab} /> },
  ];
  if (tab === 'kits' && kitId) {
    crumbs.push({ label: 'Interview kits', href: `${base}/kits` });
    if (kitId === 'new') crumbs.push({ label: 'New kit' });
    else {
      const kit = job.interviewKits.find((item) => item.id === kitId);
      crumbs.push({ label: kit?.name ?? 'Kit', href: `${base}/kits/${kitId}` });
      if (action === 'edit') crumbs.push({ label: 'Edit' });
    }
  }

  const open = daysOpen(job);
  const meta = [
    job.department,
    job.location,
    job.workMode,
    job.status === 'Open' && open !== null ? `Open ${plural(open, 'day')}` : null,
    job.statusReason,
  ].filter(Boolean);
  const statusJob = { id, title: job.title, activeApplications: candidates };
  // While we don't know if opening needs approval, a draft shows no button rather than the wrong one.
  const next =
    canManage && (approvalRequired !== undefined || job.status === 'Open')
      ? primaryAction(job, approvalRequired)
      : null;
  const careersPath = `/careers/${id}`;

  return (
    <>
      <PageHeader
        className="mb-4"
        breadcrumbs={crumbs}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {job.title}
            <StatusBadge status={job.status} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Badge variant="outline" size="sm">
              {job.code}
            </Badge>
            {/* "Open N days" is counted on the server and again in the browser. */}
            <span suppressHydrationWarning>{meta.join(' · ')}</span>
          </span>
        }
        actions={
          <>
            {next === 'find' && canFind && (
              <Button asChild>
                <Link href={`/candidates?find=${id}`}>
                  <UserPlus />
                  Find candidates
                </Link>
              </Button>
            )}
            {next === 'open' && (
              <Button
                leftIcon={<CircleCheck />}
                loading={status.isPending}
                onClick={() => status.request([statusJob], 'Open')}
              >
                Open job
              </Button>
            )}
            {next === 'submit' && (
              <Button leftIcon={<Send />} onClick={() => setSubmitting(true)}>
                Submit for approval
              </Button>
            )}
            {next === 'reopen' && (
              <Button
                variant="secondary"
                leftIcon={<RotateCcw />}
                loading={status.isPending}
                onClick={() => status.request([statusJob], 'Open')}
              >
                Reopen job
              </Button>
            )}
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="More job actions" variant="secondary">
                  <MoreHorizontal />
                </IconButton>
              </MenuTrigger>
              <MenuContent>
                {canManage && (
                  <>
                    <MenuSub>
                      <MenuSubTrigger icon={<CircleCheck />}>Change status</MenuSubTrigger>
                      <MenuSubContent>
                        {statusOptions(job, approvalRequired).map((value) => (
                          <MenuItem key={value} onSelect={() => status.request([statusJob], value)}>
                            {statusLabel(value)}
                          </MenuItem>
                        ))}
                      </MenuSubContent>
                    </MenuSub>
                    <MenuItem icon={<CopyPlus />} onSelect={() => duplicate.mutate()}>
                      Duplicate job
                    </MenuItem>
                    <MenuSeparator />
                  </>
                )}
                {job.status === 'Open' && (
                  <MenuItem
                    icon={<ExternalLink />}
                    onSelect={() => window.open(careersPath, '_blank', 'noopener')}
                  >
                    View on careers site
                  </MenuItem>
                )}
                <MenuItem
                  icon={<Copy />}
                  onSelect={() =>
                    navigator.clipboard
                      .writeText(window.location.origin + careersPath)
                      .then(() => toast.success('Link copied'))
                      .catch(() => toast.error('Could not copy the link'))
                  }
                >
                  Copy link to posting
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      >
        <LinkTabs items={tabs} aria-label="Job sections" />
      </PageHeader>

      <RequisitionApproval id={id} status={job.status} canManage={canManage} />
      {children}

      {status.dialog}
      <SubmitForApprovalModal id={id} opened={submitting} onClose={() => setSubmitting(false)} />
    </>
  );
}

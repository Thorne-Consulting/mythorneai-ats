'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarPlus,
  Copy,
  Layers,
  Mail,
  MailCheck,
  MailX,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useAbility } from '@/lib/ability';
import {
  Alert,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  ConfirmDialog,
  IconButton,
  LinkTabs,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  SkeletonRows,
  Spinner,
  Tooltip,
  toast,
} from '@/components/ui';
import type { CandidateDetail } from '@/types';
import { ApplyModal } from './ApplyModal';
import { DoNotContactModal, useBulkCandidates } from './candidate-actions';
import { CandidateEditDrawer } from './CandidateEditDrawer';
import { CandidateRail } from './CandidateSidebar';
import { CandidateTags } from './CandidateTags';
import { rememberCandidate } from './recent';
import { AddToPoolModal } from './talent-pools';

export type Candidate = CandidateDetail;

const reading = (candidate?: CandidateDetail) =>
  candidate?.attachments.some(
    (attachment) => attachment.parseStatus === 'Pending' || attachment.parseStatus === 'Processing',
  ) ?? false;

/** The candidate record, shared by the layout and every tab (one cache entry). */
export function useCandidate(id: string, initialData?: CandidateDetail) {
  return useQuery({
    queryKey: ['candidate', id],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${id}`),
    initialData,
    // Poll while a resume is being read so the tabs update by themselves.
    refetchInterval: (result) => (reading(result.state.data) ? 2_000 : false),
  });
}

/** Who may do what on the record. The API enforces it; the UI hides what someone cannot do. */
export function useCandidateAccess() {
  const ability = useAbility();
  return {
    canApply: ability.can('create', 'Application'),
    canSchedule: ability.can('schedule', 'Interview'),
    canUpload: ability.can('update', 'Candidate'),
    canEdit: ability.can('update', 'Candidate'),
    canDelete: ability.can('delete', 'Candidate'),
  };
}

/** Opens the Edit details drawer from anywhere on the record (the rail, the bounced alert). */
export const EDIT_DETAILS_EVENT = 'candidate:edit-details';
export const editDetails = () => window.dispatchEvent(new Event(EDIT_DETAILS_EVENT));

/**
 * One person: the identity header with its actions and section tabs above, the tab's content in
 * the main column, and the facts a recruiter looks up while reading in the rail.
 */
export function CandidateShell({
  id,
  initialData,
  children,
}: {
  id: string;
  initialData: CandidateDetail;
  children: ReactNode;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<'job' | 'edit' | 'dnc' | 'delete' | 'pool' | null>(null);
  const { canApply, canSchedule, canUpload, canEdit, canDelete } = useCandidateAccess();
  const query = useCandidate(id, initialData);
  const candidate = query.data;
  const name = candidate ? `${candidate.firstName} ${candidate.lastName}` : '';
  const allowContact = useBulkCandidates();
  const remove = useMutation({
    mutationFn: () => api.delete(`/api/candidates/${id}`),
    onSuccess: () => {
      toast.success(`${name} was deleted`);
      router.push('/candidates');
      router.refresh();
    },
    onError: (error: Error) => toast.error('Could not delete this candidate', error.message),
  });

  useEffect(() => {
    if (candidate) rememberCandidate({ id, name, title: candidate.currentTitle });
    // Once per profile opened, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    const open = () => setDialog('edit');
    window.addEventListener(EDIT_DETAILS_EVENT, open);
    return () => window.removeEventListener(EDIT_DETAILS_EVENT, open);
  }, []);

  if (!candidate)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  const who = [candidate.currentTitle, candidate.location].filter(Boolean).join(' · ');
  // The application to schedule for: the most recently touched active one.
  const current = candidate.applications
    .filter((app) => app.status === 'Active')
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];
  const canEmail =
    !candidate.doNotContact && !candidate.emailBounced && candidate.email !== 'Restricted';
  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/candidates/${id}`);
    toast('Link copied');
  };
  const what = [
    candidate.applications.length &&
      `${candidate.applications.length} ${candidate.applications.length === 1 ? 'application' : 'applications'}`,
    candidate.attachments.length &&
      `${candidate.attachments.length} ${candidate.attachments.length === 1 ? 'file' : 'files'}`,
  ].filter(Boolean);

  return (
    <>
      <header className="mb-5 space-y-4">
        <Breadcrumbs items={[{ label: 'Candidates', href: '/candidates' }, { label: name }]} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span aria-hidden>
              <Avatar name={name} size="xl" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold tracking-[-0.01em] text-fg">{name}</h1>
                {candidate.doNotContact && (
                  <Tooltip label={candidate.doNotContactReason || 'No reason given'}>
                    <Badge tone="red" dot>
                      Do not contact
                    </Badge>
                  </Tooltip>
                )}
                {reading(candidate) && (
                  <Badge tone="blue">
                    <Spinner className="size-3" /> Reading resume
                  </Badge>
                )}
              </div>
              {who && <p className="mt-1 text-base text-fg-muted">{who}</p>}
              <CandidateTags candidateId={id} tags={candidate.tags} canEdit={canEdit} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canEmail && (
              <Button variant="secondary" className="max-sm:hidden" asChild>
                <a href={`mailto:${candidate.email}`}>Email</a>
              </Button>
            )}
            {canSchedule && current && (
              <Button variant="secondary" className="max-sm:hidden" asChild>
                <Link href={`/applications/${current.id}/interviews`}>Schedule interview</Link>
              </Button>
            )}
            {canApply && (
              <Button leftIcon={<Plus />} onClick={() => setDialog('job')}>
                Add to a job
              </Button>
            )}
            <Menu>
              <MenuTrigger asChild>
                <IconButton label="More actions" variant="secondary">
                  <MoreHorizontal />
                </IconButton>
              </MenuTrigger>
              <MenuContent align="end">
                {/* On a phone the secondary buttons live here. */}
                {canEmail && (
                  <MenuItem
                    className="sm:hidden"
                    icon={<Mail />}
                    onSelect={() => window.location.assign(`mailto:${candidate.email}`)}
                  >
                    Email
                  </MenuItem>
                )}
                {canSchedule && current && (
                  <MenuItem
                    className="sm:hidden"
                    icon={<CalendarPlus />}
                    onSelect={() => router.push(`/applications/${current.id}/interviews`)}
                  >
                    Schedule interview
                  </MenuItem>
                )}
                {canEdit && (
                  <MenuItem icon={<Pencil />} onSelect={() => setDialog('edit')}>
                    Edit details
                  </MenuItem>
                )}
                {canEdit && (
                  <MenuItem icon={<Layers />} onSelect={() => setDialog('pool')}>
                    Add to a pool…
                  </MenuItem>
                )}
                {canEdit &&
                  (candidate.doNotContact ? (
                    <MenuItem
                      icon={<MailCheck />}
                      onSelect={() => allowContact.mutate({ ids: [id], action: 'allowContact' })}
                    >
                      Allow contact again
                    </MenuItem>
                  ) : (
                    <MenuItem icon={<MailX />} onSelect={() => setDialog('dnc')}>
                      Mark do not contact…
                    </MenuItem>
                  ))}
                <MenuItem icon={<Copy />} onSelect={copyLink}>
                  Copy link
                </MenuItem>
                {canDelete && (
                  <>
                    <MenuSeparator />
                    <MenuItem danger icon={<Trash2 />} onSelect={() => setDialog('delete')}>
                      Delete candidate…
                    </MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          </div>
        </div>
        <LinkTabs
          aria-label="Candidate sections"
          items={[
            { label: 'Overview', href: `/candidates/${id}`, exact: true },
            { label: 'Resume', href: `/candidates/${id}/resume` },
            {
              label: 'Files',
              href: `/candidates/${id}/files`,
              count: candidate.attachments.length,
            },
          ]}
        />
      </header>

      {candidate.emailBounced && (
        <Alert
          className="mb-5"
          tone="warning"
          icon={MailX}
          title="Email bounced"
          action={
            canEdit && (
              <Button size="sm" variant="secondary" onClick={() => setDialog('edit')}>
                Edit email
              </Button>
            )
          }
        >
          Emails to {candidate.email} bounced, so we stopped sending. Fix the address to start
          again.
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
        <CandidateRail candidate={candidate} canUpload={canUpload} canEdit={canEdit} />
      </div>
      <ApplyModal
        candidateId={candidate.id}
        candidate={candidate}
        opened={dialog === 'job'}
        onClose={() => setDialog(null)}
      />
      {canEdit && (
        <CandidateEditDrawer
          candidate={candidate}
          opened={dialog === 'edit'}
          onClose={() => setDialog(null)}
        />
      )}
      <AddToPoolModal
        target={dialog === 'pool' ? { ids: [id] } : null}
        count={1}
        name={name}
        onClose={() => setDialog(null)}
      />
      <DoNotContactModal
        target={dialog === 'dnc' ? { ids: [id] } : null}
        count={1}
        name={name}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        opened={dialog === 'delete'}
        onClose={() => setDialog(null)}
        onConfirm={() =>
          remove.mutateAsync().then(
            () => undefined,
            () => undefined,
          )
        }
        title={`Delete ${name}?`}
        message={
          what.length
            ? `This deletes ${name} and their ${what.join(' and ')}, with every interview, scorecard, message and offer on them. You cannot undo this.`
            : `This deletes ${name}. You cannot undo this.`
        }
        confirmLabel="Delete for good"
      />
    </>
  );
}

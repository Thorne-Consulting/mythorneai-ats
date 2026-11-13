'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/auth';
import { api } from '@/api';
import { Avatar, Badge, Breadcrumbs, Button, Card, LinkTabs, SkeletonRows } from '@/components/ui';
import { StageBadge } from '@/components/status';
import type { CandidateDetail } from '@/types';
import { ApplyModal } from './ApplyModal';
import { EmailBouncedAlert, type CandidateExtras } from './CandidateCustomFields';
import { CandidateRail } from './CandidateSidebar';
import { rememberCandidate } from './recent';

export type Candidate = CandidateDetail & CandidateExtras;

/** The candidate record, shared by the layout and every tab (one cache entry). */
export function useCandidate(id: string, initialData?: CandidateDetail) {
  return useQuery({
    queryKey: ['candidate', id],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${id}`),
    initialData,
    // Poll while a resume is being read so the tabs update by themselves.
    refetchInterval: (result) =>
      result.state.data?.attachments.some(
        (attachment) =>
          attachment.parseStatus === 'Pending' || attachment.parseStatus === 'Processing',
      )
        ? 2_000
        : false,
  });
}

/** Who may do what on the record. The API enforces it; the UI hides what a role cannot do. */
export function useCandidateAccess() {
  const user = useCurrentUser();
  return {
    canApply: ['Admin', 'Recruiter', 'HiringManager'].includes(user.role),
    canUpload: ['Admin', 'Recruiter'].includes(user.role),
  };
}

/**
 * One person: the identity header and section tabs above, the tab's content in the main column,
 * and the facts a recruiter looks up while reading (contact, next interview, files) in the rail.
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
  const [opened, setOpened] = useState(false);
  const { canApply, canUpload } = useCandidateAccess();
  const query = useCandidate(id, initialData);
  const candidate = query.data as Candidate | undefined;
  const name = candidate ? `${candidate.firstName} ${candidate.lastName}` : '';

  useEffect(() => {
    if (candidate) rememberCandidate({ id, name, title: candidate.currentTitle });
    // Once per profile opened, not on every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!candidate)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  const who = [candidate.currentTitle, candidate.location].filter(Boolean).join(' · ');
  // The application that says where they are now: the most recently touched active one.
  const current = candidate.applications
    .filter((app) => app.status === 'Active')
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt))[0];

  return (
    <>
      <header className="mb-5 space-y-4">
        <Breadcrumbs items={[{ label: 'Candidates', href: '/candidates' }, { label: name }]} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span aria-hidden>
              <Avatar name={name} size="xl" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold tracking-[-0.01em] text-fg">{name}</h1>
                {current && <StageBadge stage={current.stage} />}
                {candidate.doNotContact && (
                  <Badge tone="red" dot>
                    Do not contact
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-base text-fg-muted">
                {who || 'Candidate'}
                {current && (
                  <>
                    {' · '}
                    <Link
                      href={`/applications/${current.id}`}
                      className="text-accent-foreground hover:underline"
                    >
                      {current.requisitionTitle}
                    </Link>
                  </>
                )}
              </p>
              {candidate.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {candidate.tags.map((tag) => (
                    <Badge key={tag} size="sm">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          {canApply && (
            <Button leftIcon={<Plus />} onClick={() => setOpened(true)}>
              Add to a job
            </Button>
          )}
        </div>
        <LinkTabs
          aria-label="Candidate sections"
          items={[
            { label: 'Overview', href: `/candidates/${id}`, exact: true },
            { label: 'Resume', href: `/candidates/${id}/resume` },
            {
              label: 'Applications',
              href: `/candidates/${id}/applications`,
              count: candidate.applications.length,
            },
            {
              label: 'Files',
              href: `/candidates/${id}/files`,
              count: candidate.attachments.length,
            },
          ]}
        />
      </header>

      {candidate.emailBounced && (
        <div className="mb-5">
          <EmailBouncedAlert />
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">{children}</div>
        <CandidateRail candidate={candidate} canUpload={canUpload} />
      </div>
      <ApplyModal candidateId={candidate.id} opened={opened} onClose={() => setOpened(false)} />
    </>
  );
}

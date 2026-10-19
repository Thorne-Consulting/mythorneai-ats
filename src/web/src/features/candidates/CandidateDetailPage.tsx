'use client';

import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/auth';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { DetailHeader } from '@/components/ui/PageHeaders';
import type { CandidateDetail } from '@/types';
import { ApplyModal } from './ApplyModal';
import { CandidateApplications } from './CandidateApplications';
import { EmailBouncedAlert, type CandidateExtras } from './CandidateCustomFields';
import { CandidateRail } from './CandidateSidebar';
import { ResumeDocument } from './ResumeDocument';

/**
 * One person, read top to bottom: who they are, where they are in hiring, then the resume itself.
 * The facts a recruiter looks up while reading (contact, files, dates) sit in the rail beside it.
 */
export function CandidateDetailPage({
  id,
  initialData,
}: {
  id: string;
  initialData: CandidateDetail;
}) {
  const [opened, modal] = useDisclosure();
  const user = useCurrentUser();
  const query = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${id}`),
    initialData,
    refetchInterval: (result) =>
      result.state.data?.attachments.some(
        (attachment) =>
          attachment.parseStatus === 'Pending' || attachment.parseStatus === 'Processing',
      )
        ? 2_000
        : false,
  });
  const canApply = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const canUpload = ['Admin', 'Recruiter'].includes(user.role);
  if (!query.data) return <LoadingBlock rows={5} />;
  const candidate = query.data as CandidateDetail & CandidateExtras;
  const name = `${candidate.firstName} ${candidate.lastName}`;
  const who = [candidate.currentTitle, candidate.location].filter(Boolean).join(' · ');

  return (
    <>
      <DetailHeader
        backHref="/candidates"
        backLabel="Candidates"
        title={name}
        badges={
          candidate.doNotContact && (
            <span className="status-text">
              <span className="status-dot" style={{ background: 'var(--mantine-color-red-6)' }} />
              Do not contact
            </span>
          )
        }
        subtitle={who || 'Candidate'}
        meta={
          candidate.tags.length > 0 && <p className="record-tags">{candidate.tags.join(', ')}</p>
        }
        actions={canApply && <Button onClick={modal.open}>Add to a job</Button>}
      />

      {candidate.emailBounced && (
        <div className="record-notice">
          <EmailBouncedAlert />
        </div>
      )}

      <div className="record-grid">
        <div className="record-main">
          <section className="record-section" aria-labelledby="applications-title">
            <CandidateApplications applications={candidate.applications} />
          </section>
          <section className="record-section" aria-labelledby="resume-title">
            <ResumeDocument candidateId={candidate.id} canReparse={canUpload} />
          </section>
        </div>
        <CandidateRail candidate={candidate} canUpload={canUpload} />
      </div>
      <ApplyModal candidateId={candidate.id} opened={opened} onClose={modal.close} />
    </>
  );
}

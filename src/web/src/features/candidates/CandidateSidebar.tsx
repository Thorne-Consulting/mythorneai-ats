'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, CopyButton, DescriptionList, IconDisc, Modal, toast } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail } from '@/types';
import { CandidateCustomFields } from './CandidateCustomFields';
import { editDetails } from './CandidateShell';
import { PotentialDuplicates } from './PotentialDuplicates';
import { Missing, RailGroup } from './Rail';
import { CandidatePoolsCard } from './talent-pools';

type Attachment = CandidateDetail['attachments'][number];

export const KIND_LABELS: Record<string, string> = {
  Resume: 'Resume',
  CoverLetter: 'Cover letter',
  Portfolio: 'Portfolio or work sample',
  Other: 'Other',
};

/** "Read", "Being read", or what went wrong; other kinds of files are never read. */
export function parseLabel(attachment: Attachment) {
  if ((attachment.kind ?? 'Resume') !== 'Resume') return KIND_LABELS[attachment.kind!] ?? 'File';
  switch (attachment.parseStatus) {
    case 'Parsed':
      return 'Read';
    case 'Pending':
    case 'Processing':
      return 'Being read';
    case 'NeedsOcr':
      return 'Scanned image, no text to read';
    case 'Failed':
      return 'Could not be read';
    default:
      return 'Not read';
  }
}

const linkClass = 'text-accent-foreground hover:underline';

/** Preview a PDF in a dialog; the rail and the Files tab share it. */
export function useFilePreview() {
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);
  const previewModal = (
    <Modal
      opened={preview !== null}
      onClose={() => setPreview(null)}
      title={preview?.name ?? 'Preview'}
      size="xl"
    >
      {preview && (
        <iframe
          title={`Preview ${preview.name}`}
          src={`/api/attachments/${preview.id}?inline=true`}
          className="h-[75vh] w-full rounded-md border-0"
        />
      )}
    </Modal>
  );
  return { setPreview, previewModal };
}

/** Upload a file of a kind, and read a file again as the resume. */
export function useCandidateFiles(candidateId: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
    queryClient.invalidateQueries({ queryKey: ['candidate-resume', candidateId] });
  };
  const upload = useMutation({
    mutationFn: ({ file, kind }: { file: File; kind: string }) => {
      const body = new FormData();
      body.append('file', file);
      body.append('kind', kind);
      return api.form(`/api/candidates/${candidateId}/attachments`, body);
    },
    onSuccess: (_result, { file, kind }) => {
      refresh();
      toast.success(
        `${file.name} uploaded`,
        kind === 'Resume' ? 'We are reading it into the profile.' : undefined,
      );
    },
    onError: (error: Error, { file }) =>
      toast.error(`Could not upload ${file.name}`, error.message),
  });
  const parseResume = useMutation({
    mutationFn: (attachmentId: string) =>
      api.post(`/api/candidates/${candidateId}/attachments/${attachmentId}/parse`),
    onSuccess: () => {
      refresh();
      toast.success('Reading the resume', 'The profile updates when it is done.');
    },
    onError: (error: Error) => toast.error('Could not read the resume', error.message),
  });
  return { upload, parseResume, refresh };
}

function NextInterview({ candidate }: { candidate: CandidateDetail }) {
  const next = candidate.nextInterview;
  const active = candidate.applications.find((app) => app.status === 'Active');
  return (
    <RailGroup title="Next interview">
      {next ? (
        <Link
          href={`/applications/${next.applicationId}/interviews`}
          className="-m-2 flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
        >
          <IconDisc icon={CalendarClock} tone="blue" size="md" />
          <span className="min-w-0">
            <span className="block truncate text-base font-medium text-fg">{next.title}</span>
            <span className="block truncate text-xs text-fg-subtle">
              {formatDateTime(next.startsAt)} · {next.requisitionTitle}
            </span>
          </span>
        </Link>
      ) : (
        <p className="text-sm text-fg-subtle">
          Nothing scheduled
          {active && (
            <>
              {' · '}
              <Link href={`/applications/${active.id}/interviews`} className={linkClass}>
                Schedule
              </Link>
            </>
          )}
        </p>
      )}
    </RailGroup>
  );
}

/**
 * The facts a recruiter looks up while reading the record: how to reach them, the resume file,
 * the next interview and custom details. Skills, jobs and dates live in the main column.
 */
export function CandidateRail({
  candidate,
  canUpload,
  canEdit,
}: {
  candidate: CandidateDetail;
  canUpload: boolean;
  canEdit: boolean;
}) {
  const { setPreview, previewModal } = useFilePreview();
  const restricted = candidate.email === 'Restricted';
  const links = [
    ['LinkedIn', candidate.linkedInUrl],
    ['GitHub', candidate.gitHubUrl],
    ['Portfolio', candidate.portfolioUrl],
  ]
    .map(([label, url]) => [label, safeWebUrl(url ?? undefined)] as const)
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]));
  const resume = candidate.attachments.find((file) => file.id === candidate.resumeAttachmentId);
  const withCopy = (content: ReactNode, value: string, label: string) => (
    <span className="flex min-w-0 items-center gap-1">
      <span className="min-w-0 truncate">{content}</span>
      <CopyButton value={value} label={label} />
    </span>
  );

  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Candidate details">
      <RailGroup
        title="Contact"
        action={
          canEdit && (
            <Button variant="link" size="sm" onClick={editDetails}>
              Edit
            </Button>
          )
        }
      >
        <DescriptionList
          items={[
            {
              label: 'Email',
              value: restricted ? (
                <Missing>Only the hiring team can see this</Missing>
              ) : (
                withCopy(
                  <a href={`mailto:${candidate.email}`} className={linkClass}>
                    {candidate.email}
                  </a>,
                  candidate.email,
                  'Copy email',
                )
              ),
            },
            ...(!restricted
              ? [
                  {
                    label: 'Phone',
                    value: candidate.phone ? (
                      withCopy(
                        <a href={`tel:${candidate.phone}`} className={linkClass}>
                          {candidate.phone}
                        </a>,
                        candidate.phone,
                        'Copy phone',
                      )
                    ) : (
                      <Missing>Not set</Missing>
                    ),
                  },
                ]
              : []),
            ...(links.length
              ? [
                  {
                    label: 'Links',
                    value: (
                      <span className="flex flex-wrap gap-x-3">
                        {links.map(([label, url]) => (
                          <a
                            key={label}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={linkClass}
                          >
                            {label}
                          </a>
                        ))}
                      </span>
                    ),
                  },
                ]
              : []),
            {
              label: 'Resume',
              value: resume ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate">{resume.originalFileName}</span>
                  {resume.contentType === 'application/pdf' ? (
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => setPreview({ id: resume.id, name: resume.originalFileName })}
                    >
                      Preview
                    </Button>
                  ) : (
                    <Button variant="link" size="sm" asChild>
                      <a href={`/api/attachments/${resume.id}`}>Download</a>
                    </Button>
                  )}
                </span>
              ) : (
                <span className="text-fg-subtle">
                  None yet
                  {canUpload && (
                    <>
                      {' · '}
                      <Link href={`/candidates/${candidate.id}/files`} className={linkClass}>
                        Upload
                      </Link>
                    </>
                  )}
                </span>
              ),
            },
            {
              label: 'Source',
              value: candidate.referrer
                ? `${candidate.source}, referred by ${candidate.referrer.name}`
                : candidate.source,
            },
            { label: 'Added', value: formatDate(candidate.createdAt) },
          ]}
        />
      </RailGroup>

      <NextInterview candidate={candidate} />

      {canEdit && <CandidatePoolsCard candidate={candidate} />}

      <CandidateCustomFields candidate={candidate} canEdit={canEdit} />

      {canUpload && <PotentialDuplicates candidateId={candidate.id} />}

      {previewModal}
    </aside>
  );
}

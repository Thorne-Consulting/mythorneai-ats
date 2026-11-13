'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, FileText, Upload } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Badge,
  Button,
  DescriptionList,
  FileButton,
  IconDisc,
  Modal,
  toast,
} from '@/components/ui';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail } from '@/types';
import { CandidateCustomFields, type CandidateExtras } from './CandidateCustomFields';
import { PotentialDuplicates } from './PotentialDuplicates';
import { Missing, RailGroup } from './Rail';

type Attachment = CandidateDetail['attachments'][number];
type UpcomingInterview = {
  id: string;
  applicationId: string;
  title: string;
  startsAt: string;
  requisitionTitle: string;
};

export function parseLabel(attachment: Attachment) {
  switch (attachment.parseStatus) {
    case 'Parsed':
      return 'read';
    case 'Pending':
    case 'Processing':
      return 'being read';
    case 'NeedsOcr':
      return 'scanned, so the text could not be read';
    case 'Failed':
      return 'could not be read';
    default:
      return attachment.scanStatus === 'ValidationOnly'
        ? 'file type checked'
        : attachment.scanStatus;
  }
}

const linkClass = 'text-accent-foreground hover:underline';

/** The next scheduled interview on any of this person's applications, from the calendar feed. */
function NextInterview({ applicationIds }: { applicationIds: string[] }) {
  const interviews = useQuery({
    queryKey: ['interviews', 'upcoming'],
    queryFn: () => {
      const from = new Date();
      // ponytail: looks 180 days ahead; widen if interviews get booked further out.
      const to = new Date(from.getTime() + 180 * 86_400_000);
      return api.get<UpcomingInterview[]>(
        `/api/interviews?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
    },
  });
  const next = interviews.data?.find((item) => applicationIds.includes(item.applicationId));
  if (interviews.isError) return null;
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
          {interviews.isLoading ? 'Checking the calendar…' : 'Nothing scheduled.'}
        </p>
      )}
    </RailGroup>
  );
}

/** Upload, re-read and preview a candidate's documents (the rail and the Files tab share it). */
export function useCandidateFiles(candidateId: string) {
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => api.upload(`/api/candidates/${candidateId}/attachments`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      toast.success('Document uploaded', 'We will read it in a moment.');
    },
    onError: (error: Error) => toast.error('Could not upload the document', error.message),
  });
  const parseResume = useMutation({
    mutationFn: (attachmentId: string) =>
      api.post(`/api/candidates/${candidateId}/attachments/${attachmentId}/parse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-resume', candidateId] });
      toast.success('Reading the resume again');
    },
    onError: (error: Error) => toast.error('Could not read the resume', error.message),
  });
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
  return { upload, parseResume, setPreview, previewModal };
}

/**
 * The facts a recruiter looks up while reading the record: how to reach them, the next
 * interview, skills, custom details, then the files. Nothing here repeats the resume.
 */
export function CandidateRail({
  candidate,
  canUpload,
}: {
  candidate: CandidateDetail & CandidateExtras;
  canUpload: boolean;
}) {
  const { upload, parseResume, setPreview, previewModal } = useCandidateFiles(candidate.id);
  const linkedIn = safeWebUrl(candidate.linkedInUrl);
  const skills = candidate.resumeSkills.slice(0, 12);

  return (
    <aside className="flex min-w-0 flex-col gap-5" aria-label="Candidate details">
      <RailGroup title="Contact details">
        <DescriptionList
          items={[
            {
              label: 'Email',
              value: (
                <a href={`mailto:${candidate.email}`} className={linkClass}>
                  {candidate.email}
                </a>
              ),
            },
            { label: 'Phone', value: candidate.phone ?? <Missing /> },
            ...(linkedIn
              ? [
                  {
                    label: 'LinkedIn',
                    value: (
                      <a
                        href={linkedIn}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={linkClass}
                      >
                        Open profile
                      </a>
                    ),
                  },
                ]
              : []),
            { label: 'Source', value: candidate.source },
            { label: 'Added', value: formatDate(candidate.createdAt) },
            { label: 'Updated', value: formatRelative(candidate.updatedAt) },
            ...(candidate.resumeParsedAt
              ? [{ label: 'Resume read', value: formatRelative(candidate.resumeParsedAt) }]
              : []),
          ]}
        />
      </RailGroup>

      <NextInterview applicationIds={candidate.applications.map((app) => app.id)} />

      {skills.length > 0 && (
        <RailGroup title="Skills">
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <Badge key={skill}>{skill}</Badge>
            ))}
          </div>
        </RailGroup>
      )}

      <CandidateCustomFields candidate={candidate} canEdit={canUpload} />

      <RailGroup
        title="Documents"
        action={
          canUpload && (
            <FileButton
              variant="link"
              size="sm"
              leftIcon={<Upload />}
              accept=".pdf,.doc,.docx"
              onFile={(file) => upload.mutate(file)}
              disabled={upload.isPending}
            >
              {upload.isPending ? 'Uploading…' : 'Upload'}
            </FileButton>
          )
        }
      >
        {candidate.attachments.length === 0 ? (
          <p className="text-sm text-fg-subtle">No resume or documents yet.</p>
        ) : (
          <ul className="space-y-3">
            {candidate.attachments.map((attachment) => (
              <li key={attachment.id} className="flex items-start gap-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-fg">
                    {attachment.originalFileName}
                  </p>
                  <p className="text-xs text-fg-subtle">
                    {Math.ceil(attachment.length / 1024)} KB · {parseLabel(attachment)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-sm">
                    {attachment.contentType === 'application/pdf' && (
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() =>
                          setPreview({ id: attachment.id, name: attachment.originalFileName })
                        }
                      >
                        Preview
                      </Button>
                    )}
                    <Button variant="link" size="sm" asChild>
                      <a href={`/api/attachments/${attachment.id}`}>Download</a>
                    </Button>
                    {canUpload &&
                      (attachment.parseStatus === 'Failed' ||
                        attachment.parseStatus === 'NeedsOcr') && (
                        <Button
                          variant="link"
                          size="sm"
                          disabled={parseResume.isPending}
                          onClick={() => parseResume.mutate(attachment.id)}
                        >
                          Try reading again
                        </Button>
                      )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </RailGroup>

      {canUpload && <PotentialDuplicates candidateId={candidate.id} />}

      {previewModal}
    </aside>
  );
}

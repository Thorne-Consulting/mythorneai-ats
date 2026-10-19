'use client';

import { useState } from 'react';
import { FileButton, Modal } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { formatDate, formatRelative } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail } from '@/types';
import { CandidateCustomFields, type CandidateExtras } from './CandidateCustomFields';
import { PotentialDuplicates } from './PotentialDuplicates';
import { Fact, Missing, RailGroup } from './Rail';

type Attachment = CandidateDetail['attachments'][number];

function parseLabel(attachment: Attachment) {
  switch (attachment.parseStatus) {
    case 'Parsed':
      return 'read';
    case 'Pending':
    case 'Processing':
      return 'being read';
    case 'NeedsOcr':
      return 'needs OCR';
    case 'Failed':
      return 'could not be read';
    default:
      return attachment.scanStatus === 'ValidationOnly' ? 'type checked' : attachment.scanStatus;
  }
}

/** The facts a recruiter looks up while reading the record: how to reach them, the files, the dates. */
export function CandidateRail({
  candidate,
  canUpload,
}: {
  candidate: CandidateDetail & CandidateExtras;
  canUpload: boolean;
}) {
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => api.upload(`/api/candidates/${candidate.id}/attachments`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      notifications.show({ color: 'teal', message: 'Document uploaded and queued for parsing' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const parseResume = useMutation({
    mutationFn: (attachmentId: string) =>
      api.post(`/api/candidates/${candidate.id}/attachments/${attachmentId}/parse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      queryClient.invalidateQueries({ queryKey: ['candidate-resume', candidate.id] });
      notifications.show({ color: 'teal', message: 'Resume parsing queued' });
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not parse resume', message: error.message }),
  });
  const linkedIn = safeWebUrl(candidate.linkedInUrl);

  return (
    <aside className="record-rail candidate-rail" aria-label="Candidate details">
      <RailGroup title="Contact">
        <dl className="facts-grid rail-facts">
          <Fact label="Email">
            <a href={`mailto:${candidate.email}`}>{candidate.email}</a>
          </Fact>
          <Fact label="Phone">{candidate.phone ?? <Missing />}</Fact>
          <Fact label="Location">{candidate.location ?? <Missing />}</Fact>
          {linkedIn && (
            <Fact label="LinkedIn">
              <a href={linkedIn} target="_blank" rel="noopener noreferrer">
                Open profile
              </a>
            </Fact>
          )}
        </dl>
      </RailGroup>

      <CandidateCustomFields candidate={candidate} canEdit={canUpload} />

      <RailGroup
        title="Documents"
        action={
          canUpload && (
            <FileButton onChange={(file) => file && upload.mutate(file)} accept=".pdf,.doc,.docx">
              {(props) => (
                <button
                  type="button"
                  className="text-action"
                  {...props}
                  disabled={upload.isPending}
                >
                  {upload.isPending ? 'Uploading…' : 'Upload'}
                </button>
              )}
            </FileButton>
          )
        }
      >
        {candidate.attachments.length === 0 ? (
          <p className="rail-empty">No resume or documents yet.</p>
        ) : (
          <ul className="rail-files">
            {candidate.attachments.map((attachment) => (
              <li key={attachment.id}>
                <span className="rail-file-name">{attachment.originalFileName}</span>
                <span className="rail-file-meta">
                  {Math.ceil(attachment.length / 1024)} KB · {parseLabel(attachment)}
                </span>
                <span className="text-actions">
                  {attachment.contentType === 'application/pdf' && (
                    <button
                      type="button"
                      className="text-action"
                      onClick={() =>
                        setPreview({ id: attachment.id, name: attachment.originalFileName })
                      }
                    >
                      Preview
                    </button>
                  )}
                  <a className="text-action" href={`/api/attachments/${attachment.id}`}>
                    Download
                  </a>
                  {canUpload &&
                    (attachment.parseStatus === 'Failed' ||
                      attachment.parseStatus === 'NeedsOcr') && (
                      <button
                        type="button"
                        className="text-action"
                        disabled={parseResume.isPending}
                        onClick={() => parseResume.mutate(attachment.id)}
                      >
                        Retry reading
                      </button>
                    )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </RailGroup>

      {canUpload && <PotentialDuplicates candidateId={candidate.id} />}

      <RailGroup title="Record">
        <dl className="facts-grid rail-facts">
          <Fact label="Source">{candidate.source}</Fact>
          <Fact label="Added">{formatDate(candidate.createdAt)}</Fact>
          <Fact label="Updated">{formatRelative(candidate.updatedAt)}</Fact>
          {candidate.resumeParsedAt && (
            <Fact label="Resume read">{formatRelative(candidate.resumeParsedAt)}</Fact>
          )}
        </dl>
      </RailGroup>

      <Modal
        opened={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name}
        size="xl"
        centered
      >
        {preview && (
          <iframe
            title={`Preview ${preview.name}`}
            src={`/api/attachments/${preview.id}?inline=true`}
            style={{ width: '100%', height: '75vh', border: 0 }}
          />
        )}
      </Modal>
    </aside>
  );
}

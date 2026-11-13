'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, FileText, Plus, Upload } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  CellStack,
  DescriptionList,
  EmptyState,
  FileButton,
  SkeletonRows,
} from '@/components/ui';
import { DataTable } from '@/components/data-table/DataTable';
import { StageBadge, StatusBadge } from '@/components/status';
import { formatDate, formatRelative } from '@/lib/format';
import { ApplyModal } from './ApplyModal';
import { CandidateApplications } from './CandidateApplications';
import { parseLabel, useCandidateFiles } from './CandidateSidebar';
import { useCandidate, useCandidateAccess, type Candidate } from './CandidateShell';
import { ResumeDocument } from './ResumeDocument';

/** Tabs read the record the layout already loaded; the skeleton only shows on a cold cache. */
function useRecord(id: string) {
  return useCandidate(id).data as Candidate | undefined;
}
const loading = (
  <Card>
    <SkeletonRows rows={4} />
  </Card>
);

/** Overview: where they are in hiring, and the resume in a few lines. */
export function CandidateOverview({ id }: { id: string }) {
  const candidate = useRecord(id);
  const { canUpload } = useCandidateAccess();
  if (!candidate) return loading;
  const years = candidate.resumeYearsExperience;
  const facts = [
    ...(years != null ? [{ label: 'Experience', value: `${years} years` }] : []),
    ...(candidate.resumeJobTitles.length
      ? [{ label: 'Recent titles', value: candidate.resumeJobTitles.slice(0, 3).join(', ') }]
      : []),
    ...(candidate.resumeEducation.length
      ? [{ label: 'Education', value: candidate.resumeEducation.slice(0, 2).join('; ') }]
      : []),
    ...(candidate.resumeCertifications.length
      ? [{ label: 'Certificates', value: candidate.resumeCertifications.slice(0, 3).join(', ') }]
      : []),
    ...(candidate.resumeLanguages.length
      ? [{ label: 'Languages', value: candidate.resumeLanguages.join(', ') }]
      : []),
  ];
  return (
    <>
      <CandidateApplications applications={candidate.applications} />
      <Card>
        <CardHeader
          title="Resume"
          action={
            candidate.resumeParsedAt && (
              <CardLink href={`/candidates/${id}/resume`}>Read the resume</CardLink>
            )
          }
        />
        <CardBody>
          {!candidate.resumeParsedAt ? (
            <EmptyState
              compact
              icon={FileText}
              title="No resume read yet"
              description={
                canUpload ? 'Upload a resume and we fill in the profile from it.' : undefined
              }
              action={
                canUpload && (
                  <Button variant="secondary" asChild>
                    <Link href={`/candidates/${id}/files`}>Go to files</Link>
                  </Button>
                )
              }
            />
          ) : (
            <>
              {candidate.resumeSummary && (
                <p className="mb-4 text-base text-fg">{candidate.resumeSummary}</p>
              )}
              {facts.length > 0 && <DescriptionList columns={2} items={facts} />}
            </>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/** The resume, typeset in full. */
export function CandidateResumeTab({ id }: { id: string }) {
  const { canUpload } = useCandidateAccess();
  return <ResumeDocument candidateId={id} canReparse={canUpload} />;
}

/** Every application this person has, one row each, the row opens the application. */
export function CandidateApplicationsTab({ id }: { id: string }) {
  const router = useRouter();
  const candidate = useRecord(id);
  const { canApply } = useCandidateAccess();
  const [opened, setOpened] = useState(false);
  if (!candidate) return loading;
  return (
    <Card className="px-4 pt-1">
      <CardHeader className="px-0" title="Applications" />
      <DataTable
        viewKey="candidate-applications"
        exportName={`applications-${candidate.lastName.toLowerCase()}`}
        data={candidate.applications}
        getRowId={(app) => app.id}
        noun="application"
        onRowOpen={(app) => router.push(`/applications/${app.id}`)}
        rowLabel={(app) => `Open ${app.requisitionTitle}`}
        columns={[
          {
            id: 'job',
            header: 'Job',
            hideable: false,
            cell: (app) => (
              <CellStack primary={app.requisitionTitle} secondary={app.requisitionCode} />
            ),
            sortValue: (app) => app.requisitionTitle,
          },
          {
            id: 'stage',
            header: 'Stage',
            cell: (app) =>
              app.status === 'Active' ? (
                <StageBadge stage={app.stage} />
              ) : (
                <span className="flex items-center gap-2">
                  <StatusBadge status={app.status} />
                  <span className="text-sm text-fg-subtle">at {app.stage}</span>
                </span>
              ),
            sortValue: (app) => (app.status === 'Active' ? app.stage : app.status),
          },
          {
            id: 'applied',
            header: 'Applied',
            className: 'whitespace-nowrap tnum',
            cell: (app) => formatDate(app.appliedAt),
            sortValue: (app) => app.appliedAt,
          },
          {
            id: 'activity',
            header: 'Last activity',
            className: 'whitespace-nowrap text-fg-muted',
            cell: (app) => formatRelative(app.lastActivityAt),
            sortValue: (app) => app.lastActivityAt,
          },
        ]}
        empty={
          <EmptyState
            icon={Briefcase}
            title="Not in any job yet"
            description={
              canApply ? 'Add them to a job to start tracking their progress.' : undefined
            }

            action={
              canApply && (
                <Button leftIcon={<Plus />} onClick={() => setOpened(true)}>
                  Add to a job
                </Button>
              )
            }
          />
        }
      />
      <ApplyModal candidateId={id} opened={opened} onClose={() => setOpened(false)} />
    </Card>
  );
}

/** Every document on file: upload, preview, download, and retry reading a resume. */
export function CandidateFilesTab({ id }: { id: string }) {
  const candidate = useRecord(id);
  const { canUpload } = useCandidateAccess();
  const { upload, parseResume, setPreview, previewModal } = useCandidateFiles(id);
  if (!candidate) return loading;
  const uploadButton = canUpload && (
    <FileButton
      variant="secondary"
      leftIcon={<Upload />}
      accept=".pdf,.doc,.docx"
      onFile={(file) => upload.mutate(file)}
      loading={upload.isPending}
    >
      Upload file
    </FileButton>
  );
  return (
    <Card className="px-4 pt-1">
      <CardHeader
        className="px-0"
        title="Files"
        description="We read each resume into the profile. Upload a PDF or Word document."
      />
      <DataTable
        viewKey="candidate-files"
        data={candidate.attachments}
        getRowId={(file) => file.id}
        noun="file"
        toolbar={candidate.attachments.length > 0 && uploadButton}
        columns={[
          {
            id: 'name',
            header: 'File',
            hideable: false,
            className: 'max-w-[320px]',
            cell: (file) => (
              <span className="flex items-center gap-2.5">
                <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                <span className="truncate font-medium text-fg">{file.originalFileName}</span>
              </span>
            ),
            sortValue: (file) => file.originalFileName,
          },
          {
            id: 'size',
            header: 'Size',
            align: 'right',
            className: 'tnum text-fg-muted',
            cell: (file) => `${Math.ceil(file.length / 1024)} KB`,
            sortValue: (file) => file.length,
          },
          {
            id: 'status',
            header: 'Status',
            className: 'text-fg-muted',
            cell: (file) => (
              <span title={file.parseError ?? undefined}>
                {parseLabel(file).replace(/^./, (c) => c.toUpperCase())}
              </span>
            ),
            csv: (file) => parseLabel(file),
          },
          {
            id: 'uploaded',
            header: 'Uploaded',
            className: 'whitespace-nowrap tnum',
            cell: (file) => formatDate(file.uploadedAt),
            sortValue: (file) => file.uploadedAt,
          },
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            label: 'Actions',
            align: 'right',
            hideable: false,
            cell: (file) => (
              <span className="inline-flex flex-wrap justify-end gap-x-3">
                {file.contentType === 'application/pdf' && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setPreview({ id: file.id, name: file.originalFileName })}
                  >
                    Preview
                  </Button>
                )}
                <Button variant="link" size="sm" asChild>
                  <a href={`/api/attachments/${file.id}`}>Download</a>
                </Button>
                {canUpload &&
                  (file.parseStatus === 'Failed' || file.parseStatus === 'NeedsOcr') && (
                    <Button
                      variant="link"
                      size="sm"
                      disabled={parseResume.isPending}
                      onClick={() => parseResume.mutate(file.id)}
                    >
                      Try reading again
                    </Button>
                  )}
              </span>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={FileText}
            title="No resume or documents yet"
            description={canUpload ? 'Upload a resume to fill in the profile.' : undefined}
            action={uploadButton}
          />
        }
      />
      {previewModal}
    </Card>
  );
}

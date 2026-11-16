'use client';

import { useRef, useState, type DragEvent } from 'react';
import { FileText, MoreHorizontal, Upload } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
  Modal,
  Select,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { DataTable } from '@/components/data-table/DataTable';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { CandidateDetail } from '@/types';
import { CandidateActivity } from './CandidateActivity';
import { CandidateApplications } from './CandidateApplications';
import { KIND_LABELS, parseLabel, useCandidateFiles, useFilePreview } from './CandidateSidebar';
import { useCandidate, useCandidateAccess } from './CandidateShell';
import { ResumeDocument } from './ResumeDocument';
import { guessKind } from './file-kinds';

type Attachment = CandidateDetail['attachments'][number];

/** Tabs read the record the layout already loaded; the skeleton only shows on a cold cache. */
function useRecord(id: string) {
  return useCandidate(id).data;
}
const loading = (
  <Card>
    <SkeletonRows rows={4} />
  </Card>
);
const READABLE = '.pdf,.docx';
const ANY_FILE = '.pdf,.doc,.docx';

/** Overview: where they are in hiring, then notes and everything that happened, newest first. */
export function CandidateOverview({ id }: { id: string }) {
  const candidate = useRecord(id);
  const { canApply } = useCandidateAccess();
  if (!candidate) return loading;
  return (
    <>
      <CandidateApplications candidate={candidate} canApply={canApply} />
      <CandidateActivity candidate={candidate} />
    </>
  );
}

function ResumeUploadButton({
  onFile,
  loading,
}: {
  onFile: (file: File) => void;
  loading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={READABLE}
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) onFile(file);
          event.currentTarget.value = '';
        }}
      />
      <Button
        variant="secondary"
        leftIcon={<Upload />}
        loading={loading}
        onClick={() => ref.current?.click()}
      >
        Upload resume
      </Button>
    </>
  );
}

/** The resume, typeset in full. */
export function CandidateResumeTab({ id }: { id: string }) {
  const { canUpload } = useCandidateAccess();
  const { upload } = useCandidateFiles(id);
  return (
    <ResumeDocument
      candidateId={id}
      canReparse={canUpload}
      upload={
        canUpload ? (
          <ResumeUploadButton
            loading={upload.isPending}
            onFile={(file) => upload.mutate({ file, kind: 'Resume' })}
          />
        ) : undefined
      }
    />
  );
}

/** Choose what each new file is before it uploads. Only resumes are read into the profile. */
function UploadDialog({
  files,
  hasResume,
  onClose,
  onUpload,
}: {
  files: File[];
  hasResume: boolean;
  onClose: () => void;
  onUpload: (items: { file: File; kind: string }[]) => void;
}) {
  const [kinds, setKinds] = useState<string[]>([]);
  const [lastFiles, setLastFiles] = useState<File[]>([]);
  if (files !== lastFiles) {
    setLastFiles(files);
    setKinds(files.map((file, index) => guessKind(file.name, hasResume || index > 0)));
  }
  const unreadable = files.some(
    (file, index) => kinds[index] === 'Resume' && !/\.(pdf|docx)$/i.test(file.name),
  );
  return (
    <Modal
      opened={files.length > 0}
      onClose={onClose}
      title={files.length === 1 ? 'Upload a file' : `Upload ${files.length} files`}
      description="Only a resume is read into the profile. Other files are kept as they are."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={unreadable}
            onClick={() => onUpload(files.map((file, index) => ({ file, kind: kinds[index] })))}
          >
            Upload
          </Button>
        </>
      }
    >
      <ul className="flex flex-col gap-3">
        {files.map((file, index) => (
          <li key={`${file.name}-${index}`} className="flex flex-wrap items-center gap-3">
            <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-base text-fg">{file.name}</span>
            <Select
              aria-label={`What ${file.name} is`}
              className="w-56"
              value={kinds[index] ?? 'Other'}
              onChange={(value) =>
                setKinds((current) =>
                  current.map((kind, i) => (i === index ? (value ?? kind) : kind)),
                )
              }
              data={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </li>
        ))}
      </ul>
      {unreadable && (
        <p className="mt-3 text-sm text-destructive">
          We can read resumes in PDF or Word (.docx) files. Save the resume as one of those, or
          upload it as another kind of file.
        </p>
      )}
    </Modal>
  );
}

/** Every document on file: upload by kind, preview, rename, use as the resume, delete. */
export function CandidateFilesTab({ id }: { id: string }) {
  const candidate = useRecord(id);
  const { canUpload } = useCandidateAccess();
  const { upload, parseResume, refresh } = useCandidateFiles(id);
  const { setPreview, previewModal } = useFilePreview();
  const picker = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [renaming, setRenaming] = useState<Attachment | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<Attachment | null>(null);
  const update = useMutation({
    mutationFn: ({ fileId, ...body }: { fileId: string; name?: string; kind?: string }) =>
      api.patch(`/api/attachments/${fileId}`, body),
    onSuccess: () => {
      refresh();
      setRenaming(null);
      toast.success('File updated');
    },
    onError: (error: Error) => toast.error('Could not update the file', error.message),
  });
  const remove = useMutation({
    mutationFn: (fileId: string) => api.delete(`/api/attachments/${fileId}`),
    onSuccess: () => {
      refresh();
      toast.success('File deleted');
    },
    onError: (error: Error) => toast.error('Could not delete the file', error.message),
  });
  if (!candidate) return loading;

  const choose = (files: FileList | null) => files && setPending(Array.from(files).slice(0, 10));
  const drop = canUpload
    ? {
        onDragOver: (event: DragEvent) => {
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: () => setDragging(false),
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files);
        },
      }
    : {};
  const uploadButton = canUpload && (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        accept={ANY_FILE}
        className="hidden"
        onChange={(event) => {
          choose(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <Button
        variant="secondary"
        leftIcon={<Upload />}
        loading={upload.isPending}
        onClick={() => picker.current?.click()}
      >
        Upload files
      </Button>
    </>
  );
  const isResume = (file: Attachment) => file.id === candidate.resumeAttachmentId;
  const readable = (file: Attachment) => /\.(pdf|docx)$/i.test(file.originalFileName);

  return (
    <Card
      className={cn('px-4 pt-1 transition-colors', dragging && 'bg-accent ring-2 ring-primary/40')}
      {...drop}
    >
      <CardHeader
        className="px-0"
        title="Files"
        description={
          canUpload
            ? 'Drop files here, or upload PDF and Word documents up to 10 MB each.'
            : undefined
        }
        action={candidate.attachments.length > 0 && uploadButton}
      />
      <DataTable
        minimal
        data={candidate.attachments}
        getRowId={(file) => file.id}
        noun="file"
        columns={[
          {
            id: 'name',
            header: 'File',
            hideable: false,
            className: 'max-w-[320px]',
            cell: (file) => (
              <span className="flex min-w-0 items-center gap-2.5">
                <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                <span className="truncate font-medium text-fg">{file.originalFileName}</span>
                {isResume(file) && (
                  <Badge tone="green" size="sm">
                    Profile source
                  </Badge>
                )}
              </span>
            ),
          },
          {
            id: 'status',
            header: 'Kind',
            className: 'whitespace-nowrap text-fg-muted',
            cell: (file) => (
              <span title={file.parseError ?? undefined}>
                {(file.kind ?? 'Resume') === 'Resume'
                  ? `Resume · ${parseLabel(file).toLowerCase()}`
                  : parseLabel(file)}
              </span>
            ),
          },
          {
            id: 'size',
            header: 'Size',
            align: 'right',
            className: 'tnum text-fg-muted',
            cell: (file) => `${Math.ceil(file.length / 1024)} KB`,
          },
          {
            id: 'uploaded',
            header: 'Uploaded',
            className: 'whitespace-nowrap tnum text-fg-muted',
            cell: (file) => formatDate(file.uploadedAt),
          },
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            label: 'Actions',
            align: 'right',
            hideable: false,
            cell: (file) => (
              <span className="inline-flex items-center justify-end gap-x-2">
                {file.contentType === 'application/pdf' ? (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setPreview({ id: file.id, name: file.originalFileName })}
                  >
                    Preview
                  </Button>
                ) : (
                  <Button variant="link" size="sm" asChild>
                    <a href={`/api/attachments/${file.id}`}>Download</a>
                  </Button>
                )}
                {canUpload && (
                  <Menu>
                    <MenuTrigger asChild>
                      <IconButton
                        label={`Actions for ${file.originalFileName}`}
                        size="sm"
                        variant="quiet"
                      >
                        <MoreHorizontal />
                      </IconButton>
                    </MenuTrigger>
                    <MenuContent align="end">
                      {file.contentType === 'application/pdf' && (
                        <MenuItem
                          onSelect={() => window.location.assign(`/api/attachments/${file.id}`)}
                        >
                          Download
                        </MenuItem>
                      )}
                      {readable(file) && !isResume(file) && file.parseStatus !== 'Pending' && (
                        <MenuItem onSelect={() => parseResume.mutate(file.id)}>
                          Use as the resume
                        </MenuItem>
                      )}
                      {isResume(file) || file.parseStatus === 'Failed' ? (
                        <MenuItem onSelect={() => parseResume.mutate(file.id)}>
                          Read it again
                        </MenuItem>
                      ) : null}
                      <MenuItem
                        onSelect={() => {
                          setNewName(file.originalFileName.replace(/\.[^.]+$/, ''));
                          setRenaming(file);
                        }}
                      >
                        Rename…
                      </MenuItem>
                      <MenuSub>
                        <MenuSubTrigger>Change kind</MenuSubTrigger>
                        <MenuSubContent>
                          {Object.entries(KIND_LABELS).map(([value, label]) => (
                            <MenuItem
                              key={value}
                              disabled={(file.kind ?? 'Resume') === value}
                              onSelect={() => update.mutate({ fileId: file.id, kind: value })}
                            >
                              {label}
                            </MenuItem>
                          ))}
                        </MenuSubContent>
                      </MenuSub>
                      <MenuSeparator />
                      <MenuItem danger onSelect={() => setDeleting(file)}>
                        Delete…
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                )}
              </span>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={FileText}
            title="No files yet"
            description={canUpload ? 'Drop a resume, cover letter or work sample here.' : undefined}
            action={uploadButton}
          />
        }
      />
      {candidate.attachments.some((file) => file.parseStatus === 'NeedsOcr') && (
        <p className="pb-4 text-sm text-fg-subtle">
          A scanned resume is a picture, so it has no text to read. Upload a copy saved straight
          from Word, or as a PDF with selectable text.
        </p>
      )}
      <UploadDialog
        files={pending}
        hasResume={Boolean(candidate.resumeAttachmentId)}
        onClose={() => setPending([])}
        onUpload={(items) => {
          setPending([]);
          for (const item of items) upload.mutate(item);
        }}
      />
      <Modal
        opened={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename file"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              disabled={!newName.trim()}
              loading={update.isPending}
              onClick={() =>
                renaming && update.mutate({ fileId: renaming.id, name: newName.trim() })
              }
            >
              Save name
            </Button>
          </>
        }
      >
        <Input
          label="File name"
          value={newName}
          onChange={(event) => setNewName(event.currentTarget.value)}
          rightSection={
            <span className="text-sm">{renaming?.originalFileName.match(/\.[^.]+$/)?.[0]}</span>
          }
        />
      </Modal>
      <ConfirmDialog
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id).catch(() => undefined);
        }}
        title={`Delete ${deleting?.originalFileName}?`}
        message={
          deleting && isResume(deleting)
            ? 'The profile we read from it stays until you upload or choose another resume. You cannot undo this.'
            : 'You cannot undo this.'
        }
        confirmLabel="Delete file"
      />
      {previewModal}
    </Card>
  );
}

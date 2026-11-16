'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FilePlus2, FileText, Inbox } from 'lucide-react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  FileDrop,
  Modal,
  Select,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { publicFetch } from '@/features/careers/public-api';
import { formatDate } from '@/lib/format';
import { usePortal } from './PortalProvider';
import {
  DOCUMENT_KINDS,
  documentHref,
  fileSize,
  isClosed,
  type DocumentKind,
  type PortalApplication,
  type SentDetails,
  type SentFile,
} from './portal';

const RULES = 'PDF, Word (DOC or DOCX), PNG or JPEG, up to 10 MB.';
const RESUME_RULES = 'PDF or Word (DOC or DOCX), up to 10 MB.';
const kindLabel = (kind: DocumentKind) =>
  kind === 'Resume'
    ? 'Resume'
    : (DOCUMENT_KINDS.find((k) => k.value === kind)?.label ?? 'Document');

function useSent(id: string) {
  return useQuery({
    queryKey: ['portal-sent', id],
    queryFn: () =>
      publicFetch<SentDetails>(
        `/public/portal/applications/${id}/sent`,
        {},
        'We could not load what you sent.',
      ),
  });
}

function FileRow({ file, label }: { file: SentFile; label: string }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-fg-subtle">
        <FileText className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-fg">{file.fileName}</p>
        <p className="text-xs text-fg-subtle">
          {label} · {formatDate(file.uploadedAt)} · {fileSize(file.length)}
        </p>
      </div>
      <Button asChild variant="quiet" size="sm">
        <a href={documentHref(file.id)} download aria-label={`Download ${file.fileName}`}>
          <Download /> <span className="hidden sm:inline">Download</span>
        </a>
      </Button>
    </li>
  );
}

/**
 * Documents on one application: what the team asked for, the resume sent with it and every file
 * added since. Adding a file tells the team in the conversation.
 */
export function DocumentsCard({ application }: { application: PortalApplication }) {
  const { data, isLoading } = useSent(application.id);
  const [adding, setAdding] = useState<{ requestId?: string; label?: string } | null>(null);
  const open = data?.requests.filter((r) => !r.fulfilledAt) ?? [];
  const canAdd = !isClosed(application);
  return (
    <Card id="documents" className="scroll-mt-6">
      <CardHeader
        title="Documents"
        action={
          canAdd && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<FilePlus2 />}
              onClick={() => setAdding({})}
            >
              Add a document
            </Button>
          )
        }
      />
      <CardBody className="flex flex-col gap-4">
        {isLoading ? (
          <SkeletonRows rows={2} className="p-0" />
        ) : (
          <>
            {canAdd &&
              open.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-tone-amber-dot/40 bg-tone-amber-bg px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-medium text-tone-amber-fg">
                      The team asked for your {r.label.toLowerCase()}
                    </p>
                    {r.note && <p className="mt-0.5 text-sm text-fg-muted">{r.note}</p>}
                  </div>
                  <Button size="sm" onClick={() => setAdding({ requestId: r.id, label: r.label })}>
                    Add {r.label.toLowerCase()}
                  </Button>
                </div>
              ))}
            {data && (data.resume || data.documents.length > 0) ? (
              <ul className="divide-y divide-border-subtle">
                {data.documents.map((file) => (
                  <FileRow key={file.id} file={file} label={kindLabel(file.kind)} />
                ))}
                {data.resume && <FileRow file={data.resume} label="Resume you applied with" />}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-fg-subtle">
                <Inbox className="size-4" aria-hidden />
                {canAdd
                  ? 'No files yet. Add a cover letter, portfolio or updated resume any time.'
                  : 'You did not send any files with this application.'}
              </p>
            )}
          </>
        )}
      </CardBody>
      {adding && (
        <AddDocument
          applicationId={application.id}
          requestId={adding.requestId}
          label={adding.label}
          onClose={() => setAdding(null)}
        />
      )}
    </Card>
  );
}

function AddDocument({
  applicationId,
  requestId,
  label,
  onClose,
}: {
  applicationId: string;
  requestId?: string;
  label?: string;
  onClose: () => void;
}) {
  const { call, reload } = usePortal();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DocumentKind>('CoverLetter');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const resume = !requestId && kind === 'Resume';

  async function send() {
    if (!file) return setError('Choose a file to add.');
    if (file.size > 10 * 1024 * 1024) return setError('Choose a file that is under 10 MB.');
    setBusy(true);
    const body = new FormData();
    body.append('file', file);
    if (requestId) body.append('requestId', requestId);
    else body.append('kind', kind);
    const { ok } = await call(
      `/public/portal/applications/${applicationId}/documents`,
      body,
      'We could not add that file. Check it and try again.',
    );
    setBusy(false);
    if (!ok) return;
    toast.success('Document added', 'The hiring team can see it now.');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['portal-sent', applicationId] }),
      reload(),
    ]);
    onClose();
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={label ? `Add your ${label.toLowerCase()}` : 'Add a document'}
      description="The hiring team sees it with your application, and we let them know in your conversation."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={send} loading={busy} disabled={!file}>
            Add document
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!requestId && (
          <Select
            label="What is it?"
            data={DOCUMENT_KINDS}
            value={kind}
            onChange={(value) => value && setKind(value as DocumentKind)}
          />
        )}
        <div className="flex flex-col gap-1.5">
          <FileDrop
            file={file}
            onFile={(f) => {
              setFile(f);
              setError('');
            }}
            accept={resume ? '.pdf,.doc,.docx' : '.pdf,.doc,.docx,.png,.jpg,.jpeg'}
            hint={resume ? RESUME_RULES : RULES}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}

/** "What you sent": the details and answers from the form, as the team received them. */
export function SentCard({ application }: { application: PortalApplication }) {
  const { data, isLoading } = useSent(application.id);
  const profile = data?.profile;
  const rows: [string, string | null | undefined][] = profile
    ? [
        ['Name', `${profile.firstName} ${profile.lastName}`.trim()],
        ['Email', data.email],
        ['Phone', profile.phone],
        ['Location', profile.location],
        ['LinkedIn', profile.linkedInUrl],
      ]
    : [];
  return (
    <Card>
      <CardHeader
        title="What you sent"
        description={data ? `Sent ${formatDate(data.submittedAt)}` : undefined}
      />
      <CardBody className="flex flex-col gap-5">
        {isLoading ? (
          <SkeletonRows rows={3} className="p-0" />
        ) : (
          <>
            {rows.length > 0 && (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {rows.map(([term, value]) => (
                  <div key={term} className="min-w-0">
                    <dt className="text-xs text-fg-subtle">{term}</dt>
                    <dd className="truncate text-base text-fg">{value || 'Not given'}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div>
              <h3 className="mb-1.5 text-sm font-semibold text-fg">Your answers</h3>
              <RichText
                markdown={data?.answersMarkdown}
                className="text-base text-fg"
                empty={<p className="text-sm text-fg-subtle">This job had no questions.</p>}
              />
            </div>
            <p className="text-sm text-fg-subtle">
              Need to fix something? Update{' '}
              <Link
                href="/candidate-portal/profile"
                className="rounded-sm font-medium text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                your details
              </Link>
              , or add a document above.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

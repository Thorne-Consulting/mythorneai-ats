'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileQuestion, FileCheck2, Plus, X } from 'lucide-react';
import { api } from '@/api';
import {
  Autocomplete,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  IconButton,
  Modal,
  Select,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';
import { useAbility } from '@/lib/ability';
import { formatDate } from '@/lib/format';

type DocumentRequest = {
  id: string;
  label: string;
  kind: string;
  note?: string | null;
  requestedBy: string;
  requestedAt: string;
  fulfilledAt?: string | null;
  attachmentId?: string | null;
  fileName?: string | null;
};

const KINDS = [
  { value: 'Portfolio', label: 'Portfolio or work sample' },
  { value: 'CoverLetter', label: 'Cover letter' },
  { value: 'Resume', label: 'Updated resume' },
  { value: 'Other', label: 'Something else' },
];
const SUGGESTIONS = ['Portfolio', 'Cover letter', 'Work sample', 'References', 'Transcript'];
const kindFor = (label: string) =>
  /portfolio|work sample/i.test(label)
    ? 'Portfolio'
    : /cover/i.test(label)
      ? 'CoverLetter'
      : /resume|cv/i.test(label)
        ? 'Resume'
        : 'Other';

/**
 * The team's side of document requests, for the application record: ask the candidate for a named
 * document (they get an email and a to-do in their portal), see what arrived, take back a request
 * that is still open.
 */
export function DocumentRequestsCard({
  applicationId,
  canEdit: canChangeJob = true,
}: {
  applicationId: string;
  /** False on closed applications or for people who cannot change this job. */
  canEdit?: boolean;
}) {
  const key = ['applications', applicationId, 'document-requests'];
  const queryClient = useQueryClient();
  // Asking for documents belongs to whoever keeps candidate records, on a job they can change.
  const canEdit = useAbility().can('update', 'Candidate') && canChangeJob;
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      api.get<DocumentRequest[]>(`/api/applications/${applicationId}/document-requests`),
  });
  const [asking, setAsking] = useState(false);
  const cancel = useMutation({
    mutationFn: (id: string) =>
      api.delete<DocumentRequest[]>(`/api/applications/${applicationId}/document-requests/${id}`),
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      toast.success('Request taken back');
    },
    onError: (error: Error) => toast.error('We could not take the request back', error.message),
  });
  const requests = query.data ?? [];
  return (
    <Card>
      <CardHeader
        title="Documents asked for"
        action={
          canEdit && (
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Plus />}
              onClick={() => setAsking(true)}
            >
              Ask for a document
            </Button>
          )
        }
      />
      <CardBody>
        {query.isLoading ? (
          <SkeletonRows rows={2} className="p-0" />
        ) : requests.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            Nothing asked for yet. The candidate gets an email and a to-do in their portal.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                {r.fulfilledAt ? (
                  <FileCheck2 className="size-4 shrink-0 text-tone-green-dot" aria-hidden />
                ) : (
                  <FileQuestion className="size-4 shrink-0 text-tone-amber-dot" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-fg">{r.label}</p>
                  <p className="truncate text-xs text-fg-subtle">
                    {r.fulfilledAt && r.attachmentId ? (
                      <>
                        Sent {formatDate(r.fulfilledAt)} ·{' '}
                        <a
                          href={`/api/attachments/${r.attachmentId}?inline=false`}
                          className="text-accent-foreground hover:underline"
                        >
                          {r.fileName ?? 'Download'}
                        </a>
                      </>
                    ) : (
                      `Asked ${formatDate(r.requestedAt)}${r.note ? ` · ${r.note}` : ''}`
                    )}
                  </p>
                </div>
                {!r.fulfilledAt && (
                  <>
                    <Badge tone="amber" size="sm">
                      Waiting
                    </Badge>
                    {canEdit && (
                      <IconButton
                        label={`Take back the request for ${r.label.toLowerCase()}`}
                        variant="quiet"
                        size="sm"
                        disabled={cancel.isPending}
                        onClick={() => cancel.mutate(r.id)}
                      >
                        <X />
                      </IconButton>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
      {asking && (
        <AskForDocument
          applicationId={applicationId}
          onDone={(data) => {
            queryClient.setQueryData(key, data);
            setAsking(false);
          }}
          onClose={() => setAsking(false)}
        />
      )}
    </Card>
  );
}

function AskForDocument({
  applicationId,
  onDone,
  onClose,
}: {
  applicationId: string;
  onDone: (data: DocumentRequest[]) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const ask = useMutation({
    mutationFn: () =>
      api.post<DocumentRequest[]>(`/api/applications/${applicationId}/document-requests`, {
        label: label.trim(),
        kind: kind ?? kindFor(label),
        note: note.trim() || null,
      }),
    onSuccess: (data) => {
      toast.success('Request sent', 'We emailed the candidate a link to add it.');
      onDone(data);
    },
    onError: (error: Error) => toast.error('We could not send the request', error.message),
  });
  return (
    <Modal
      opened
      onClose={onClose}
      title="Ask for a document"
      description="The candidate gets an email with a link, and a to-do in their portal until they add it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={ask.isPending}>
            Cancel
          </Button>
          <Button onClick={() => ask.mutate()} loading={ask.isPending} disabled={!label.trim()}>
            Send request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Autocomplete
          label="What do you need?"
          placeholder="For example Portfolio"
          data={SUGGESTIONS}
          value={label}
          onChange={setLabel}
          required
        />
        <Select label="File it as" data={KINDS} value={kind ?? kindFor(label)} onChange={setKind} />
        <Textarea
          label="Note to the candidate"
          description="Optional. For example which projects to include."
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
      </div>
    </Modal>
  );
}

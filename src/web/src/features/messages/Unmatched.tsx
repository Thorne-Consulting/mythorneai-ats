'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, MailQuestion } from 'lucide-react';
import { api } from '@/api';
import {
  Avatar,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  SearchSelect,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  folderInfo,
  listTime,
  useRefreshThreads,
  useUnmatched,
  type Recipient,
} from './inbox-data';

/** Emails sent to a reply address that we could not tie to a conversation. */
export function UnmatchedList({
  selected,
  onOpen,
  showEmpty,
}: {
  selected: string | null;
  onOpen: (id: string) => void;
  /** Phones show the empty state here; desktop shows it in the reading pane. */
  showEmpty: boolean;
}) {
  const query = useUnmatched(true);
  if (!query.data) return <SkeletonRows rows={4} />;
  if (query.data.length === 0)
    return (
      showEmpty && (
        <EmptyState
          compact
          icon={MailQuestion}
          title={folderInfo.unmatched.empty}
          description={folderInfo.unmatched.emptyHint}
        />
      )
    );
  return (
    <ul>
      {query.data.map((email) => (
        <li key={email.id}>
          <button
            type="button"
            onClick={() => onOpen(email.id)}
            aria-current={email.id === selected || undefined}
            className={cn(
              'flex w-full flex-col gap-0.5 border-b border-l-2 border-border-subtle border-l-transparent px-3.5 py-3 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
              email.id === selected && 'border-l-primary bg-accent hover:bg-accent',
            )}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-fg">
                {email.fromName ?? email.fromAddress}
              </span>
              <span className="shrink-0 text-2xs text-fg-subtle tnum">
                {listTime(email.receivedAt)}
              </span>
            </span>
            <span className="truncate text-xs text-fg">{email.subject || 'No subject'}</span>
            <span className="truncate text-xs text-fg-muted">{email.body}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One unmatched email, with "Add to conversation" and "Discard". */
export function UnmatchedReader({
  id,
  onBack,
  onDone,
}: {
  id: string;
  onBack?: () => void;
  onDone: () => void;
}) {
  const query = useUnmatched(true);
  const refresh = useRefreshThreads();
  const [to, setTo] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const recipients = useQuery({
    queryKey: ['inbox-recipients'],
    queryFn: () => api.get<Recipient[]>('/api/inbox/recipients'),
  });
  const email = query.data?.find((x) => x.id === id);
  const after = (message: string) => {
    query.refetch();
    refresh(to ?? undefined);
    toast.success(message);
    onDone();
  };
  const attach = useMutation({
    mutationFn: () => api.post(`/api/inbox/unmatched/${id}/attach`, { applicationId: to }),
    onSuccess: () => after('Added to the conversation'),
    onError: (error: Error) => toast.error('Could not add the email', error.message),
  });
  const discard = useMutation({
    mutationFn: () => api.delete(`/api/inbox/unmatched/${id}`),
    onSuccess: () => after('Email discarded'),
    onError: (error: Error) => toast.error('Could not discard the email', error.message),
  });
  if (!query.data) return <SkeletonRows rows={4} className="w-full" />;
  if (!email)
    return (
      <EmptyState
        icon={MailQuestion}
        title="This email was already sorted"
        description="Someone added it to a conversation or discarded it."
        className="m-auto"
      />
    );
  return (
    <section aria-label="Unmatched email" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-[61px] items-center gap-2 border-b border-border-subtle px-3 py-2.5 sm:px-4">
        {onBack && (
          <IconButton label="Back to unmatched email" variant="quiet" size="sm" onClick={onBack}>
            <ArrowLeft />
          </IconButton>
        )}
        <Avatar name={email.fromName ?? email.fromAddress} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-fg">
            {email.subject || 'No subject'}
          </h2>
          <p className="truncate text-xs text-fg-muted">
            {email.fromName ? `${email.fromName} · ` : ''}
            {email.fromAddress}
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <p className="text-sm whitespace-pre-wrap text-fg">{email.body}</p>
      </div>
      <div className="space-y-3 border-t border-border-subtle p-3 sm:p-4">
        <SearchSelect
          label="Add to the conversation with"
          placeholder="Choose a candidate and job"
          value={to}
          onChange={setTo}
          data={(recipients.data ?? []).map((r) => ({
            value: r.applicationId,
            label: `${r.candidateName} · ${r.jobTitle}`,
          }))}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="danger-quiet" onClick={() => setDiscarding(true)}>
            Discard
          </Button>
          <Button disabled={!to} loading={attach.isPending} onClick={() => attach.mutate()}>
            Add to conversation
          </Button>
        </div>
      </div>
      <ConfirmDialog
        opened={discarding}
        onClose={() => setDiscarding(false)}
        title="Discard this email?"
        message={`The email from ${email.fromAddress} is deleted for everyone. You can’t undo this.`}
        confirmLabel="Discard email"
        onConfirm={() => discard.mutate()}
      />
    </section>
  );
}

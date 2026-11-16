'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, CheckCircle2, CircleSlash, X } from 'lucide-react';
import { Alert, Badge, Button, Card, SkeletonRows, Textarea } from '@/components/ui';
import { publicFetch, postJson } from '@/features/careers/public-api';
import { formatDateTime } from '@/lib/format';
import { MODE_LABEL, type ApprovalItem, type JobSubject, type OfferSubject } from './approval-data';
import { TYPE_LABEL } from './ApprovalDetail';

type LinkState = 'ready' | 'done' | 'closed' | 'replaced' | 'expired' | 'notYet';
type LinkData = { state: LinkState; decision?: 'Approved' | 'Rejected'; item?: ApprovalItem };

const STATE_TEXT: Record<Exclude<LinkState, 'ready'>, { title: string; body: string }> = {
  done: { title: 'You already answered', body: 'Your answer is saved. Nothing else is needed.' },
  closed: {
    title: 'This request is closed',
    body: 'It was withdrawn, changed, or settled by another approver.',
  },
  replaced: {
    title: 'This link no longer works',
    body: 'The request was given to someone else or taken back.',
  },
  expired: {
    title: 'This link has expired',
    body: 'Links in approval emails work for 7 days. Open your approvals to answer.',
  },
  notYet: {
    title: 'It is not your turn yet',
    body: 'Someone before you still has to answer. We will email you when it is your turn.',
  },
};

/**
 * Where the approve and reject links in approval emails land. Opening the link only shows the
 * request; the decision is saved when the person presses the button, so email scanners that open
 * links decide nothing.
 */
export function ApprovalLinkPage({ token }: { token: string }) {
  const path = `/public/approvals/${encodeURIComponent(token)}`;
  const query = useQuery({
    queryKey: ['approval-link', token],
    queryFn: () => publicFetch<LinkData>(path),
    retry: false,
  });
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const decide = useMutation({
    mutationFn: () =>
      postJson(path, { comment: comment.trim() || null }) as Promise<{ message: string }>,
    onSuccess: (result) => setMessage(result.message),
  });
  const data = query.data;
  const rejecting = data?.decision === 'Rejected';
  const item = data?.item;

  return (
    <div className="flex min-h-dvh items-start justify-center bg-background px-4 py-10 sm:items-center">
      <div className="w-full max-w-[560px]">
        <div className="mb-5 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/mark.png"
            alt=""
            width={28}
            height={28}
            className="size-7 rounded-full"
          />
          <span className="text-base font-semibold text-fg">MyThorneAI</span>
        </div>
        <Card className="p-5 sm:p-6">
          {query.isPending ? (
            <SkeletonRows rows={4} className="px-0" />
          ) : query.isError || !data ? (
            <Alert tone="danger" title="We could not open this request">
              Check your connection and try again.
            </Alert>
          ) : message ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              {rejecting ? (
                <CircleSlash className="size-10 text-destructive" aria-hidden />
              ) : (
                <CheckCircle2 className="size-10 text-tone-green-fg" aria-hidden />
              )}
              <h1 className="text-xl font-semibold text-fg">{message}</h1>
              <Button asChild variant="secondary">
                <Link href="/approvals">Open your approvals</Link>
              </Button>
            </div>
          ) : data.state !== 'ready' || !item ? (
            <div className="flex flex-col gap-4">
              <h1 className="text-xl font-semibold text-fg">
                {STATE_TEXT[data.state === 'ready' ? 'closed' : data.state].title}
              </h1>
              <p className="text-base text-fg-muted">
                {STATE_TEXT[data.state === 'ready' ? 'closed' : data.state].body}
              </p>
              <div>
                <Button asChild variant="secondary">
                  <Link href="/approvals">Open your approvals</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <header className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={item.type === 'Offer' ? 'amber' : 'blue'}>
                    {TYPE_LABEL[item.type]}
                  </Badge>
                  <span className="text-xs text-fg-subtle">
                    Asked by {item.requestedByName} · {formatDateTime(item.createdAt)}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-fg">{item.title}</h1>
                <p className="text-sm text-fg-muted">{item.detail}</p>
              </header>
              <SubjectFacts item={item} />
              {item.note && (
                <blockquote className="rounded-lg bg-muted px-3 py-2.5">
                  <p className="text-xs text-fg-subtle">Note from {item.requestedByName}</p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-fg">{item.note}</p>
                </blockquote>
              )}
              {item.approvers.length > 1 && (
                <p className="text-xs text-fg-subtle">
                  {item.approvers.length} approvers, {MODE_LABEL[item.mode].toLowerCase()}.{' '}
                  {item.approved} approved so far.
                </p>
              )}
              <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
                <Textarea
                  label={rejecting ? 'Why are you rejecting this?' : 'Comment (optional)'}
                  description={rejecting ? 'The person who asked will see your reason.' : undefined}
                  required={rejecting}
                  minRows={3}
                  maxLength={2000}
                  value={comment}
                  onChange={(event) => setComment(event.currentTarget.value)}
                />
                {decide.isError && (
                  <Alert tone="danger" title="Your answer was not saved">
                    {(decide.error as Error).message}
                  </Alert>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={rejecting ? 'danger' : 'primary'}
                    leftIcon={rejecting ? <X /> : <Check />}
                    loading={decide.isPending}
                    disabled={rejecting && !comment.trim()}
                    onClick={() => decide.mutate()}
                  >
                    {rejecting ? 'Reject' : 'Approve'}
                  </Button>
                  <Button asChild variant="quiet">
                    <Link href={`/approvals?open=${item.id}`}>Open in MyThorneAI instead</Link>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function SubjectFacts({ item }: { item: ApprovalItem }) {
  if (item.type !== 'Requisition') {
    const offer = item.subject as OfferSubject;
    return (
      <div className="rounded-lg bg-muted px-4 py-3">
        <p className="mb-1 text-sm font-medium text-fg">{offer.candidateName}</p>
        <ul className="space-y-0.5 text-sm text-fg-muted">
          {offer.terms.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }
  const job = item.subject as JobSubject;
  const facts = [
    ['Team', job.department],
    ['Location', `${job.location} · ${job.workMode}`],
    ['Openings', String(job.openings)],
    ['Hiring manager', job.hiringManager ?? 'Not set'],
    ['Pay', job.salary ?? 'Not set'],
  ];
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg bg-muted px-4 py-3 sm:grid-cols-2">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-fg-subtle">{label}</dt>
          <dd className="text-sm text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarClock,
  Check,
  Download,
  FileSearch,
  FileSignature,
  MessageSquare,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  RadioGroup,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';
import { publicFetch, PublicError } from '@/features/careers/public-api';
import { LetterPaper } from '@/features/offer-letters/LetterPaper';
import { usePortal } from '../PortalProvider';
import { applicationHref, conversationHref } from '../portal';
import { dayText, deadlineText, nameMatches, timeLeft, type PortalOffer } from './offer';

const offerPath = (id: string) => `/public/portal/applications/${id}/offer`;

function useOffer(applicationId: string) {
  return useQuery({
    queryKey: ['portal-offer', applicationId],
    // 204 (no offer yet) comes back as null.
    queryFn: async () =>
      (await publicFetch<PortalOffer | undefined>(
        offerPath(applicationId),
        {},
        'We could not load your offer.',
      )) ?? null,
    retry: (count, error) => !(error instanceof PublicError && error.status === 404) && count < 2,
  });
}

/**
 * /candidate-portal/applications/[id]/offer: the letter and the terms, and the candidate's answer.
 * "Accept offer" asks them to type their full name; it is a clear yes, not a legal signature.
 */
export function OfferPage({ applicationId }: { applicationId: string }) {
  const { portal } = usePortal();
  const query = useOffer(applicationId);
  const zone = portal?.candidate.timeZone;
  const home = { label: 'Home', href: '/candidate-portal/home' };

  if (query.isPending)
    return (
      <>
        <PageHeader breadcrumbs={[home]} title="Your offer" />
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </>
    );
  if (query.isError || !query.data)
    return (
      <>
        <PageHeader breadcrumbs={[home]} title="Your offer" />
        <Card>
          {!query.isError || (query.error instanceof PublicError && query.error.status === 404) ? (
            <EmptyState
              icon={FileSearch}
              title="There is no offer here yet"
              description="When the team sends one, you get an email with a link to it."
              action={
                <Button asChild variant="secondary">
                  <Link href={applicationHref(applicationId)}>See your application</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={FileSearch}
              title="We could not load your offer"
              description={query.error?.message}
              action={<Button onClick={() => query.refetch()}>Try again</Button>}
            />
          )}
        </Card>
      </>
    );

  const offer = query.data;
  const open = offer.status === 'Sent';
  const description = open
    ? offer.expiresAt
      ? `Please answer by ${deadlineText(offer.expiresAt, zone)}.`
      : 'Read it, then let the team know your answer.'
    : undefined;

  return (
    <>
      <PageHeader
        breadcrumbs={[home, { label: offer.jobTitle, href: applicationHref(applicationId) }]}
        title="Your offer"
        description={description}
        actions={
          <Button variant="secondary" leftIcon={<Download />} onClick={() => window.print()}>
            Download PDF
          </Button>
        }
      />
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          <Outcome offer={offer} applicationId={applicationId} zone={zone} />
          {offer.letter ? (
            <LetterPaper
              markdown={offer.letter}
              company={offer.company}
              date={dayText(offer.sentAt, zone)}
              footer={offer.respondedAt ? <AnswerLine offer={offer} zone={zone} /> : undefined}
            />
          ) : (
            <Card className="print-region">
              <CardHeader
                title={`${offer.jobTitle}${offer.company ? ` at ${offer.company}` : ''}`}
              />
              <CardBody className="space-y-5">
                {offer.terms.length > 0 ? (
                  <DescriptionList columns={2} items={offer.terms} />
                ) : (
                  <p className="text-base text-fg-muted">
                    The team will go through the details with you. Message them with any questions.
                  </p>
                )}
                <AnswerLine offer={offer} zone={zone} />
              </CardBody>
            </Card>
          )}
        </div>
        <aside className="space-y-5 lg:sticky lg:top-6" aria-label="Your answer">
          {open && (
            <Answer
              offer={offer}
              applicationId={applicationId}
              onAnswered={() => query.refetch()}
            />
          )}
          <Link
            href={conversationHref(applicationId)}
            className="flex items-center gap-3 rounded-xl border border-border-subtle bg-card px-4 py-3 text-base text-fg transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <MessageSquare className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <span className="min-w-0 flex-1">
              Questions?
              <span className="block text-sm text-fg-muted">Message the hiring team</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          </Link>
        </aside>
      </div>
    </>
  );
}

/** Under the letter: who accepted it and when, or that it was declined. Prints with the letter. */
function AnswerLine({ offer, zone }: { offer: PortalOffer; zone?: string | null }) {
  if (!offer.respondedAt) return null;
  if (offer.status === 'Accepted')
    return (
      <p className="text-sm text-fg-muted">
        Accepted {offer.respondedName ? `by ${offer.respondedName} ` : ''}on{' '}
        {dayText(offer.respondedAt, zone)}.
      </p>
    );
  if (offer.status === 'Declined')
    return <p className="text-sm text-fg-muted">Declined on {dayText(offer.respondedAt, zone)}.</p>;
  return null;
}

/** What happened, once the offer is no longer open. */
function Outcome({
  offer,
  applicationId,
  zone,
}: {
  offer: PortalOffer;
  applicationId: string;
  zone?: string | null;
}) {
  const message = (
    <Button asChild size="sm" variant="secondary">
      <Link href={conversationHref(applicationId)}>Message the team</Link>
    </Button>
  );
  switch (offer.status) {
    case 'Accepted':
      return (
        <Alert tone="success" title="You accepted this offer" className="print:hidden">
          Welcome to the team. They will be in touch about your first day.
        </Alert>
      );
    case 'Declined':
      return (
        <Alert tone="info" title="You declined this offer" className="print:hidden">
          {offer.declineReason ? `Your reason: ${offer.declineReason}. ` : ''}Thank you for letting
          the team know.
        </Alert>
      );
    case 'Expired':
      return (
        <Alert
          tone="warning"
          title="This offer has closed"
          action={message}
          className="print:hidden"
        >
          It closed on {offer.expiresAt ? deadlineText(offer.expiresAt, zone) : 'its last day'}{' '}
          before it was answered. If you are still interested, message the team.
        </Alert>
      );
    case 'Withdrawn':
      return (
        <Alert
          tone="warning"
          title="The team withdrew this offer"
          action={message}
          className="print:hidden"
        >
          Message the team if you have questions.
        </Alert>
      );
    default:
      return null;
  }
}

function Answer({
  offer,
  applicationId,
  onAnswered,
}: {
  offer: PortalOffer;
  applicationId: string;
  onAnswered: () => void;
}) {
  const { call, reload } = usePortal();
  const [dialog, setDialog] = useState<'accept' | 'decline' | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const left = offer.expiresAt ? timeLeft(offer.expiresAt) : null;
  const firstName = offer.candidateName.split(' ')[0];

  async function send(action: 'accept' | 'decline') {
    setBusy(true);
    const { ok } = await call(
      `${offerPath(applicationId)}/${action}`,
      action === 'accept' ? { fullName: name } : { reason, note: note.trim() || null },
      action === 'accept'
        ? 'We could not accept the offer. Please try again.'
        : 'We could not send your answer. Please try again.',
    );
    setBusy(false);
    if (!ok) {
      onAnswered();
      return;
    }
    setDialog(null);
    toast.success(
      action === 'accept' ? 'Offer accepted' : 'Answer sent',
      action === 'accept'
        ? 'The team has been told. Congratulations.'
        : 'The team has been told. Thank you for your time.',
    );
    onAnswered();
    reload();
  }

  return (
    <Card className="print:hidden">
      <CardHeader
        title="Your answer"
        action={
          left && (
            <Badge tone="amber" icon={<CalendarClock />}>
              {left}
            </Badge>
          )
        }
      />
      <CardBody>
        <div className="flex flex-col gap-2">
          <Button leftIcon={<Check />} onClick={() => setDialog('accept')}>
            Accept offer
          </Button>
          <Button variant="secondary" onClick={() => setDialog('decline')}>
            Decline offer
          </Button>
        </div>
      </CardBody>

      <Modal
        opened={dialog === 'accept'}
        onClose={() => setDialog(null)}
        title="Accept this offer?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              leftIcon={<FileSignature />}
              loading={busy}
              disabled={!nameMatches(name, offer.candidateName)}
              onClick={() => send('accept')}
            >
              Accept offer
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (nameMatches(name, offer.candidateName)) send('accept');
          }}
        >
          <p className="text-base text-fg-muted">
            You are saying yes to the {offer.jobTitle} role
            {offer.company ? ` at ${offer.company}` : ''}, on the terms in the letter.
          </p>
          <Input
            label="Type your full name to confirm"
            description={`As we have it: ${offer.candidateName}`}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <p className="text-xs text-fg-subtle">
            This tells the team your answer. It is not a signature on a contract.
          </p>
        </form>
      </Modal>

      <Modal
        opened={dialog === 'decline'}
        onClose={() => setDialog(null)}
        title="Decline this offer?"
        description={`Thanks for telling us, ${firstName}. It helps the team to know why.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!reason}
              onClick={() => send('decline')}
            >
              Decline offer
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <fieldset className="space-y-3">
            <legend className="mb-3 text-sm font-medium text-fg">The main reason</legend>
            <RadioGroup
              aria-label="The main reason"
              value={reason}
              onValueChange={setReason}
              options={offer.declineReasons.map((r) => ({ value: r.key, label: r.label }))}
            />
          </fieldset>
          <Textarea
            label="Anything else you want to tell the team"
            description="Optional."
            minRows={3}
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        </div>
      </Modal>
    </Card>
  );
}

/**
 * For the application page: a short card that opens the offer, shown once the team has sent one.
 * Renders nothing when there is no offer.
 */
export function OfferLinkCard({ applicationId }: { applicationId: string }) {
  const query = useOffer(applicationId);
  const offer = query.data;
  if (!offer) return null;
  const text = {
    Sent: 'Read your offer letter and give the team your answer.',
    Accepted: 'You accepted this offer. Open it to read or save the letter.',
    Declined: 'You declined this offer.',
    Expired: 'This offer closed before it was answered.',
    Withdrawn: 'The team withdrew this offer.',
  }[offer.status];
  return (
    <Link
      href={`${applicationHref(applicationId)}/offer`}
      className="flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-card transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tone-amber-bg text-tone-amber-fg">
        <FileSignature className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-md font-semibold text-fg">
          {offer.status === 'Sent' ? 'You have an offer' : 'Your offer'}
        </span>
        <span className="block text-sm text-fg-muted">{text}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
    </Link>
  );
}

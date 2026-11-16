'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleDashed,
  MailCheck,
  Monitor,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';
import { api } from '@/api';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { RichText } from '@/components/rich-text';
import {
  Alert,
  Badge,
  Button,
  Card,
  CellStack,
  ConfirmDialog,
  CopyButton,
  DescriptionList,
  Drawer,
  EmptyState,
  FilterSelect,
  RadioGroup,
  SearchInput,
  SegmentedControl,
  SkeletonRows,
  toast,
  type BadgeProps,
} from '@/components/ui';
import { SettingsLoading, SettingsSection } from '@/features/admin/settings-shared';
import { EmailFrame } from '@/features/templates/editor-tools';
import type { TemplatePreview } from '@/features/templates/templates-data';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';

// ---- Sending ---------------------------------------------------------------------------------

interface EmailStatus {
  ready: boolean;
  from?: string | null;
  address?: string | null;
  domain?: string | null;
  tracking: boolean;
  replyDomain?: string | null;
  webhookUrl?: string | null;
  managed: boolean;
  senderNameFormat: string;
  formats: { value: string; example: string }[];
}

/** One line of the setup list: what it is, whether it is done, and what to do when it is not. */
function SetupRow({
  done,
  title,
  children,
}: {
  done: boolean;
  title: string;
  children: ReactNode;
}) {
  const Icon = done ? CircleCheck : CircleDashed;
  return (
    <li className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <Icon
        className={
          done
            ? 'mt-0.5 size-5 shrink-0 text-tone-green-dot'
            : 'mt-0.5 size-5 shrink-0 text-fg-subtle'
        }
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-medium text-fg">
          {title}
          <Badge tone={done ? 'green' : 'gray'} size="sm">
            {done ? 'Ready' : 'Not set up'}
          </Badge>
        </p>
        <div className="mt-1 text-sm text-fg-muted">{children}</div>
      </div>
    </li>
  );
}

/** A setting name the person passes on to whoever runs the server. */
const Setting = ({ name }: { name: string }) => (
  <code className="rounded bg-muted px-1 py-0.5 text-xs text-fg">{name}</code>
);

/** Settings, Email: is sending set up, and how a person's emails are named. */
export function EmailSendingSettings() {
  const queryClient = useQueryClient();
  const status = useQuery({
    queryKey: ['email-status'],
    queryFn: () => api.get<EmailStatus>('/api/admin/email/status'),
  });
  const sender = useMutation({
    mutationFn: (senderNameFormat: string) =>
      api.put('/api/admin/email/sender', { senderNameFormat }),
    onMutate: (senderNameFormat) => {
      const before = queryClient.getQueryData<EmailStatus>(['email-status']);
      if (before) queryClient.setQueryData(['email-status'], { ...before, senderNameFormat });
      return before;
    },
    onSuccess: () => toast.success('Sender name saved'),
    onError: (error: Error, _, before) => {
      queryClient.setQueryData(['email-status'], before);
      toast.error('Could not save the sender name', error.message);
    },
  });
  if (!status.data) return <SettingsLoading rows={5} />;
  const s = status.data;
  const ask = 'Ask whoever runs MyThorneAI for you to';
  return (
    <>
      {!s.managed && (
        <SettingsSection
          id="sending"
          title="Setup"
          action={
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<RefreshCw />}
              loading={status.isFetching}
              onClick={() => status.refetch()}
            >
              Check again
            </Button>
          }
        >
          <ul className="divide-y divide-border-subtle">
            <SetupRow done={s.ready} title="Emails to candidates">
              {s.ready ? (
                <>Emails go out from {s.from}.</>
              ) : (
                <>
                  Nothing is sent yet. {ask} add <Setting name="RESEND_API_KEY" /> and{' '}
                  <Setting name="RESEND_FROM" />, for example{' '}
                  <Setting name='"Acme hiring <jobs@acme.com>"' />.
                </>
              )}
            </SetupRow>
            {s.domain && (
              <SetupRow done={s.ready} title={`Your domain, ${s.domain}`}>
                In Resend, add {s.domain} and copy its records (SPF and DKIM) into your domain’s
                settings. Resend shows when it is verified. Until then, emails may land in spam.
              </SetupRow>
            )}
            <SetupRow done={s.tracking} title="Delivery and bounces">
              {s.tracking ? (
                'You see when emails are delivered or opened, and we stop emailing addresses that bounce.'
              ) : (
                <>
                  In Resend, add a webhook to{' '}
                  {s.webhookUrl ? (
                    <span className="inline-flex items-center gap-1 align-middle">
                      <Setting name={s.webhookUrl} />
                      <CopyButton value={s.webhookUrl} label="Copy the webhook address" />
                    </span>
                  ) : (
                    <>
                      <Setting name="/public/webhooks/resend" /> on this app’s address
                    </>
                  )}
                  . {ask} add its signing secret as <Setting name="RESEND_WEBHOOK_SECRET" />.
                </>
              )}
            </SetupRow>
            <SetupRow done={!!s.replyDomain} title="Replies by email">
              {s.replyDomain ? (
                <>
                  Candidates can reply to your emails. Replies arrive at {s.replyDomain} and show in
                  the conversation.
                </>
              ) : (
                <>
                  Candidates reply in their portal for now. To let them reply by email, add a domain
                  such as reply.{s.domain ?? 'yourcompany.com'} in Resend, with its MX record
                  pointing to Resend. Then ask whoever runs MyThorneAI for you to set it as{' '}
                  <Setting name="RESEND_INBOUND_DOMAIN" />.
                </>
              )}
            </SetupRow>
          </ul>
        </SettingsSection>
      )}
      <SettingsSection
        id="sender"
        title="Sender name"
        description="The name candidates see on emails your team writes, such as messages and bulk emails."
      >
        <RadioGroup
          aria-label="Sender name"
          value={s.senderNameFormat}
          onValueChange={(value) => sender.mutate(value)}
          options={s.formats.map((format) => ({
            value: format.value,
            label: format.example,
            description:
              format.value === 'CompanyTeam'
                ? 'The same name for everyone on your team.'
                : 'The first name of the person who wrote it, then your company.',
          }))}
        />
      </SettingsSection>
      <EmailLayoutPreview />
    </>
  );
}

const SAMPLE_EMAIL = {
  subject: 'Your {{jobTitle}} application at {{company}}',
  body: 'Hi {{firstName}},\n\nThanks for applying to the **{{jobTitle}}** role. We read your application and would like to talk.\n\nPick a time that suits you here: {{portalLink}}\n\n{{company}} hiring team',
};

/** The branded wrapper every email to candidates uses, around a sample message. */
function EmailLayoutPreview() {
  const [phone, setPhone] = useState(false);
  const preview = useQuery({
    queryKey: ['email-layout-preview'],
    queryFn: () => api.post<TemplatePreview>('/api/templates/preview', SAMPLE_EMAIL),
  });
  return (
    <SettingsSection
      id="layout"
      title="How emails look"
      description={
        <>
          Every email to candidates uses this layout, shown here with sample details. The icon and
          brand colour come from{' '}
          <Link href="/settings/careers" className="text-accent-foreground hover:underline">
            Careers site
          </Link>
          .
        </>
      }
      action={
        <SegmentedControl
          size="sm"
          aria-label="Preview width"
          value={phone ? 'phone' : 'desktop'}
          onValueChange={(value) => setPhone(value === 'phone')}
          items={[
            { value: 'desktop', label: 'Desktop', icon: <Monitor /> },
            { value: 'phone', label: 'Phone', icon: <Smartphone /> },
          ]}
        />
      }
    >
      {preview.data ? (
        <EmailFrame html={preview.data.html} title="Sample email" phone={phone} />
      ) : preview.isError ? (
        <Alert tone="danger">The preview didn’t load. Reload the page to try again.</Alert>
      ) : (
        <SkeletonRows rows={4} />
      )}
    </SettingsSection>
  );
}

// ---- Sent emails ------------------------------------------------------------------------------

export type EmailStatusText =
  'Scheduled' | 'Sending' | 'Retrying' | 'Sent' | 'Delivered' | 'Opened' | 'Bounced' | 'Failed';

interface LogRow {
  id: string;
  recipient: string;
  subject: string;
  templateKey?: string | null;
  kind: string;
  status: EmailStatusText;
  createdAt: string;
  sentAt?: string | null;
  scheduledFor: string;
  lastError?: string | null;
  applicationId?: string | null;
  candidateName?: string | null;
  /** False for a team email about the candidate, such as an interviewer update. */
  toCandidate?: boolean;
  jobTitle?: string | null;
}

/** The person's name when the email went to them; otherwise the address. */
const toName = (row: LogRow) => (row.toCandidate && row.candidateName) || row.recipient;

/** "Interview booked · Designer", or "About Ivy Chen · Designer" for a team email. */
const aboutLine = (row: LogRow) =>
  [
    row.kind,
    !row.toCandidate && row.candidateName ? `about ${row.candidateName}` : null,
    row.jobTitle,
  ]
    .filter(Boolean)
    .join(' · ');

interface LogDetail extends LogRow {
  body?: string | null;
  hidden: boolean;
  fromName?: string | null;
  replyTo?: string | null;
  attempts: number;
  deliveryUpdatedAt?: string | null;
  files: number;
  inlineFileName?: string | null;
}

const TONES: Record<EmailStatusText, BadgeProps['tone']> = {
  Scheduled: 'amber',
  Sending: 'amber',
  Retrying: 'amber',
  Sent: 'green',
  Delivered: 'green',
  Opened: 'green',
  Bounced: 'red',
  Failed: 'red',
};

export const EmailStatusBadge = ({ status }: { status: EmailStatusText }) => (
  <Badge dot tone={TONES[status]} size="sm">
    {status}
  </Badge>
);

/** The time that matters for each state: when it will go, or when it went. */
const when = (row: LogRow) =>
  row.status === 'Scheduled'
    ? `Sends ${formatDateTime(row.scheduledFor)}`
    : formatDateTime(row.sentAt ?? row.createdAt);

const FILTERS = [
  { value: 'failed', label: 'Failed' },
  { value: 'bounced', label: 'Bounced' },
  { value: 'scheduled', label: 'Scheduled' },
];

/** Settings, Email, Sent emails: every email we sent or will send, with retry and cancel. */
export function SentEmailLog() {
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const [openId, setOpenId] = useState<string | null>(null);
  const log = useInfiniteQuery({
    queryKey: ['email-log', status, q],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (q) params.set('q', q);
      if (pageParam) params.set('before', pageParam);
      return api.get<{ items: LogRow[]; next?: string | null }>(
        `/api/admin/email/log?${params.toString()}`,
      );
    },
    getNextPageParam: (page) => page.next ?? null,
  });
  const rows = log.data?.pages.flatMap((page) => page.items) ?? [];
  const columns: Column<LogRow>[] = [
    {
      id: 'to',
      header: 'To',
      hideable: false,
      cell: (row) => (
        <CellStack
          primary={toName(row)}
          secondary={toName(row) !== row.recipient ? row.recipient : undefined}
        />
      ),
      sortValue: toName,
    },
    {
      id: 'email',
      header: 'Email',
      cell: (row) => (
        <CellStack
          primary={<span className="line-clamp-1">{row.subject}</span>}
          secondary={aboutLine(row)}
        />
      ),
      sortValue: (row) => row.subject,
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => <EmailStatusBadge status={row.status} />,
      sortValue: (row) => row.status,
    },
    {
      id: 'when',
      header: 'When',
      cell: (row) => <span className="text-sm whitespace-nowrap text-fg-muted">{when(row)}</span>,
      sortValue: (row) => new Date(row.sentAt ?? row.createdAt),
    },
  ];
  return (
    <Card className="px-4 pt-1">
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(row) => row.id}
        viewKey="email-log"
        exportable={false}
        pageSize={500}
        loading={log.isLoading}
        noun="email"
        onRowOpen={(row) => setOpenId(row.id)}
        rowLabel={(row) => `Open the email to ${row.recipient}`}
        resetPageKey={`${status}-${q}`}
        toolbar={
          <>
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search address or subject"
              className="w-full sm:w-72"
            />
            <FilterSelect
              aria-label="Status"
              allLabel="All emails"
              value={status}
              onChange={setStatus}
              data={FILTERS}
              className="w-40"
            />
          </>
        }
        card={(row) => (
          <div className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 truncate font-medium text-fg">{toName(row)}</p>
              <EmailStatusBadge status={row.status} />
            </div>
            <p className="line-clamp-2 text-sm text-fg-muted">{row.subject}</p>
            <p className="text-xs text-fg-subtle">{when(row)}</p>
          </div>
        )}
        empty={
          <EmptyState
            icon={MailCheck}
            title={status || q ? 'No emails match' : 'No emails yet'}
            description={
              status || q
                ? 'Try another status or search.'
                : 'Emails show here as soon as your team or MyThorneAI sends one.'
            }
            compact
          />
        }
      />
      {log.hasNextPage && (
        <div className="flex justify-center border-t border-border-subtle py-3">
          <Button
            variant="secondary"
            size="sm"
            loading={log.isFetchingNextPage}
            onClick={() => log.fetchNextPage()}
          >
            Show older emails
          </Button>
        </div>
      )}
      <EmailDrawer id={openId} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function EmailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['email-log', 'one', id],
    queryFn: () => api.get<LogDetail>(`/api/admin/email/log/${id}`),
    enabled: !!id,
  });
  const done = (message: string) => {
    toast.success(message);
    queryClient.invalidateQueries({ queryKey: ['email-log'] });
  };
  const retry = useMutation({
    mutationFn: () => api.post(`/api/admin/email/log/${id}/retry`),
    onSuccess: () => done('The email is on its way again'),
    onError: (error: Error) => toast.error('Could not send it again', error.message),
  });
  const cancel = useMutation({
    mutationFn: () => api.delete(`/api/admin/email/log/${id}`),
    onSuccess: () => {
      done('Scheduled email cancelled');
      onClose();
    },
    onError: (error: Error) => toast.error('Could not cancel it', error.message),
  });
  const email = detail.data;
  const isMessage = email?.templateKey === 'message';
  return (
    <Drawer
      opened={!!id}
      onClose={onClose}
      size="lg"
      title={email?.subject ?? 'Email'}
      description={email ? `${email.kind} to ${email.recipient}` : undefined}
      footer={
        email && (
          <>
            {email.applicationId && (
              <Button asChild variant="secondary" className="mr-auto">
                <Link href={`/messages?thread=${email.applicationId}`}>Open conversation</Link>
              </Button>
            )}
            {email.status === 'Scheduled' && !isMessage && (
              <Button
                variant="danger-quiet"
                leftIcon={<X />}
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancel email
              </Button>
            )}
            {email.status === 'Failed' && (
              <Button
                leftIcon={<RotateCcw />}
                loading={retry.isPending}
                onClick={() => retry.mutate()}
              >
                Send again
              </Button>
            )}
          </>
        )
      }
    >
      {!email ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <EmailStatusBadge status={email.status} />
            <span className="text-sm text-fg-subtle">{when(email)}</span>
          </div>
          {email.lastError && (
            <Alert tone="danger" title="Why it was not sent">
              {email.lastError}
            </Alert>
          )}
          {email.status === 'Scheduled' && isMessage && (
            <Alert tone="info">
              This is a message in a conversation. To cancel it, open the conversation.
            </Alert>
          )}
          <DescriptionList
            columns={2}
            items={[
              { label: 'To', value: email.recipient },
              { label: 'From', value: email.fromName ?? 'Your sending address' },
              ...(email.replyTo ? [{ label: 'Replies go to', value: email.replyTo }] : []),
              ...(email.files
                ? [
                    {
                      label: 'Files',
                      value: email.inlineFileName
                        ? email.files === 1
                          ? 'Calendar invitation'
                          : `${email.files} files, with a calendar invitation`
                        : email.files === 1
                          ? '1 file'
                          : `${email.files} files`,
                    },
                  ]
                : []),
              ...(email.attempts > 1 ? [{ label: 'Tries', value: String(email.attempts) }] : []),
            ]}
          />
          <section aria-label="What the email says">
            {email.hidden ? (
              <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-fg-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                This email has a sign-in code or link, so its text is not shown here.
              </p>
            ) : (
              <div className="rounded-xl border border-border-subtle px-4 py-3">
                <RichText markdown={email.body} className="text-sm" />
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

// ---- Blocked addresses ------------------------------------------------------------------------

interface BlockedRow {
  candidateId: string;
  email: string;
  name: string;
  reason: string;
  blockedAt?: string | null;
}

/** Settings, Email, Blocked addresses: people we stopped emailing because their email bounced. */
export function BlockedAddresses() {
  const queryClient = useQueryClient();
  const [allowing, setAllowing] = useState<BlockedRow | null>(null);
  const blocked = useQuery({
    queryKey: ['email-blocked'],
    queryFn: () => api.get<BlockedRow[]>('/api/admin/email/blocked'),
  });
  const allow = useMutation({
    mutationFn: (row: BlockedRow) =>
      api.delete(`/api/admin/email/blocked/${encodeURIComponent(row.email)}`),
    onSuccess: (_, row) => {
      toast.success(`We will email ${row.email} again`);
      queryClient.invalidateQueries({ queryKey: ['email-blocked'] });
    },
    onError: (error: Error) => toast.error('Could not allow the address', error.message),
  });
  const columns: Column<BlockedRow>[] = [
    {
      id: 'person',
      header: 'Person',
      hideable: false,
      cell: (row) => (
        <CellStack
          primary={
            <Link
              href={`/candidates/${row.candidateId}`}
              className="hover:text-accent-foreground hover:underline"
            >
              {row.name}
            </Link>
          }
          secondary={row.email}
        />
      ),
      sortValue: (row) => row.name,
    },
    { id: 'reason', header: 'Why', cell: (row) => row.reason, sortValue: (row) => row.reason },
    {
      id: 'when',
      header: 'Since',
      cell: (row) =>
        row.blockedAt ? (
          <span className="text-sm text-fg-muted">{formatRelative(row.blockedAt)}</span>
        ) : (
          <span className="text-sm text-fg-subtle">Not known</span>
        ),
      sortValue: (row) => (row.blockedAt ? new Date(row.blockedAt) : null),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      hideable: false,
      align: 'right',
      cell: (row) => (
        <Button variant="secondary" size="sm" onClick={() => setAllowing(row)}>
          Allow again
        </Button>
      ),
    },
  ];
  return (
    <Card className="px-4 pt-1">
      <DataTable
        data={blocked.data ?? []}
        columns={columns}
        getRowId={(row) => row.email}
        loading={blocked.isLoading}
        minimal
        noun="address"
        card={(row) => (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{row.name}</p>
              <p className="truncate text-sm text-fg-muted">{row.email}</p>
              <p className="mt-1 text-xs text-fg-subtle">{row.reason}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => setAllowing(row)}>
              Allow again
            </Button>
          </div>
        )}
        empty={
          <EmptyState
            icon={MailCheck}
            title="No blocked addresses"
            description="When an email bounces, we stop emailing that address and list it here."
            compact
          />
        }
      />
      <ConfirmDialog
        opened={!!allowing}
        onClose={() => setAllowing(null)}
        title={`Email ${allowing?.email ?? 'this address'} again?`}
        message="Only do this when you know the address works now, for example after the person fixed their mailbox. If an email bounces again, the address is blocked again."
        confirmLabel="Allow again"
        confirmVariant="primary"
        onConfirm={async () => {
          if (allowing) await allow.mutateAsync(allowing).catch(() => undefined);
        }}
      />
    </Card>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Percent,
  Send,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CellStack,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  FilterSelect,
  MenuItem,
  PageHeader,
  ProgressRow,
  RowActions,
  SearchInput,
  SkeletonRows,
  StatCard,
  StatGrid,
  Tabs,
  toast,
} from '@/components/ui';
import { BarChart } from '@/components/ui/chart';
import { StatusBadge } from '@/components/status';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { PreviewTitle } from '../preview-ui';
import { questionsOf, resultOf, type Assessment, type Invite } from '../sample-assessments';
import { isAutoScored, questionTypeLabels, scoreBuckets } from './scoring';
import { InviteModal } from './InviteModal';
import { formatWhen, statusLabel, useAssessments } from './store';

export type DetailTab = 'overview' | 'questions' | 'invited' | 'results';
const tabs: DetailTab[] = ['overview', 'questions', 'invited', 'results'];

export function AssessmentDetail({ id, initialTab }: { id: string; initialTab?: string }) {
  const router = useRouter();
  const { assessments, invites, ready, updateAssessment, addInvites } = useAssessments();
  const [tab, setTab] = useState<DetailTab>(
    tabs.includes(initialTab as DetailTab) ? (initialTab as DetailTab) : 'overview',
  );
  const [inviting, setInviting] = useState(false);
  const a = assessments.find((x) => x.id === id);
  const own = useMemo(() => invites.filter((i) => i.assessmentId === id), [invites, id]);

  if (!ready)
    return (
      <>
        <PageHeader
          breadcrumbs={[{ label: 'Assessments', href: '/assessments' }, { label: 'Loading' }]}
          title={<PreviewTitle>Assessment</PreviewTitle>}
        />
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      </>
    );
  if (!a) return <NotFound />;

  const completed = own.filter((i) => i.status === 'Completed');
  const switchTab = (v: string) => {
    setTab(v as DetailTab);
    window.history.replaceState(null, '', v === 'overview' ? `/assessments/${id}` : `?tab=${v}`);
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Assessments', href: '/assessments' }, { label: a.name }]}
        title={
          <PreviewTitle>
            {a.name}
            <StatusBadge status={statusLabel[a.status]} />
          </PreviewTitle>
        }
        description={`${a.type} · ${a.department} · ${a.minutes} min`}
        actions={
          <>
            <Button
              variant="secondary"
              leftIcon={<Pencil />}
              onClick={() => router.push(`/assessments/${id}/edit`)}
            >
              Edit
            </Button>
            {a.status === 'active' ? (
              <Button leftIcon={<UserPlus />} onClick={() => setInviting(true)}>
                Invite candidates
              </Button>
            ) : a.status === 'draft' ? (
              <Button
                leftIcon={<Send />}
                onClick={() => {
                  updateAssessment(id, { status: 'active' });
                  toast.success('Assessment published', a.name);
                }}
              >
                Publish
              </Button>
            ) : null}
          </>
        }
      >
        <Tabs
          aria-label="Assessment sections"
          value={tab}
          onValueChange={switchTab}
          items={[
            { value: 'overview', label: 'Overview' },
            { value: 'questions', label: 'Questions', count: questionsOf(a).length },
            { value: 'invited', label: 'Invited', count: own.length },
            { value: 'results', label: 'Results', count: completed.length },
          ]}
        />
      </PageHeader>

      {tab === 'overview' && <Overview a={a} own={own} />}
      {tab === 'questions' && <Questions a={a} />}
      {tab === 'invited' && (
        <Invited
          a={a}
          own={own}
          onInviteMore={a.status === 'active' ? () => setInviting(true) : undefined}
        />
      )}
      {tab === 'results' && <Results a={a} completed={completed} />}

      <InviteModal
        opened={inviting}
        initialAssessment={id}
        assessments={[a]}
        existingEmails={own.map((i) => i.email.toLowerCase())}
        onClose={() => setInviting(false)}
        onInvite={(aid, emails) => {
          addInvites(aid, emails);
          toast.success(
            `${emails.length} ${emails.length === 1 ? 'candidate' : 'candidates'} invited`,
            a.name,
          );
          switchTab('invited');
        }}
      />
    </>
  );
}

function NotFound() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Assessments', href: '/assessments' }, { label: 'Not found' }]}
        title={<PreviewTitle>Assessment not found</PreviewTitle>}
      />
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="This assessment does not exist in this browser"
          description="Preview data lives in your browser, so links from someone else will not open here."
          action={
            <Link
              href="/assessments"
              className="text-sm font-medium text-accent-foreground hover:underline"
            >
              Back to assessments
            </Link>
          }
        />
      </Card>
    </>
  );
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function Overview({ a, own }: { a: Assessment; own: Invite[] }) {
  const qs = questionsOf(a);
  const decided = own.filter((i) => i.decision);
  const scores = own
    .filter((i) => i.status === 'Completed')
    .map((i) => resultOf(a, i).percent)
    .filter((p): p is number => p !== null);
  const count = (s: string) => own.filter((i) => i.status === s).length;
  const proctoring = [
    a.settings.webcam && 'Webcam',
    a.settings.tabSwitch && 'Tab switches',
    a.settings.fullscreen && 'Full screen',
    a.settings.blockPaste && 'No pasting',
  ].filter(Boolean);
  return (
    <>
      <StatGrid className="mb-5">
        <StatCard icon={Users} label="Invited" value={own.length} />
        <StatCard
          icon={CheckCircle2}
          tone="green"
          label="Completed"
          value={count('Completed')}
          hint={`${pct(count('Completed'), own.length)}% of invited`}
        />
        <StatCard
          icon={Percent}
          tone="violet"
          label="Pass rate"
          value={
            decided.length
              ? `${pct(decided.filter((i) => i.decision === 'Passed').length, decided.length)}%`
              : '—'
          }
          hint={`${decided.length} decided`}
        />
        <StatCard
          icon={BarChart3}
          tone="amber"
          label="Average score"
          value={
            scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : '—'
          }
          hint={`Pass mark ${a.passMark}`}
        />
      </StatGrid>
      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Details" />
            <div className="px-5 pb-5">
              <DescriptionList
                columns={3}
                items={[
                  { label: 'Type', value: a.type },
                  { label: 'Department', value: a.department },
                  {
                    label: 'Duration',
                    value: `${a.minutes} min${a.settings.timed ? ', timed' : ''}`,
                  },
                  { label: 'Pass mark', value: `${a.passMark}%` },
                  { label: 'Questions', value: `${qs.length} in ${a.sections.length} sections` },
                  { label: 'Total points', value: qs.reduce((s, q) => s + q.points, 0) },
                  { label: 'Attempts', value: a.settings.attempts },
                  { label: 'Invites expire after', value: `${a.settings.expiryDays} days` },
                  { label: 'Proctoring', value: proctoring.length ? proctoring.join(', ') : 'Off' },
                ]}
              />
            </div>
          </Card>
          <Card>
            <CardHeader title="Instructions for candidates" />
            <p className="px-5 pb-5 text-base whitespace-pre-wrap text-fg-muted">
              {a.instructions || 'No instructions yet.'}
            </p>
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Where candidates are" />
          <div className="space-y-4 px-5 pb-5">
            {(
              [
                ['Completed', count('Completed'), 'green'],
                ['In progress', count('InProgress'), 'primary'],
                ['Not started', count('NotStarted'), 'gray'],
                ['Expired', count('Expired'), 'red'],
              ] as const
            ).map(([label, value, tone]) => (
              <ProgressRow
                key={label}
                label={label}
                value={value}
                max={own.length || 1}
                tone={tone}
                display={`${value} (${pct(value, own.length)}%)`}
              />
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function Questions({ a }: { a: Assessment }) {
  const qs = questionsOf(a);
  if (!qs.length)
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="No questions yet"
          description="Add sections and questions in the builder before you publish."
          action={
            <Link
              href={`/assessments/${a.id}/edit`}
              className="text-sm font-medium text-accent-foreground hover:underline"
            >
              Open the builder
            </Link>
          }
        />
      </Card>
    );
  let n = 0;
  return (
    <div className="flex flex-col gap-5">
      {a.sections.map((s) => (
        <Card key={s.id}>
          <CardHeader
            title={s.title || 'Untitled section'}
            description={`${s.questions.length} questions · ${s.questions.reduce((t, q) => t + q.points, 0)} points`}
          />
          <ol className="divide-y divide-border-subtle border-t border-border-subtle">
            {s.questions.map((q) => (
              <li key={q.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold text-fg-subtle tnum">{++n}.</span>
                  <p className="min-w-0 flex-1 text-base text-fg">{q.prompt}</p>
                  <Badge size="sm">{questionTypeLabels[q.type]}</Badge>
                  <Badge size="sm" tone="blue">
                    {q.points} pts
                  </Badge>
                </div>
                {isAutoScored(q) && (
                  <ul className="mt-2 ml-6 space-y-1">
                    {q.options.map((o) => (
                      <li key={o.id} className="flex items-center gap-2 text-sm">
                        {o.correct ? (
                          <CheckCircle2
                            className="size-4 text-tone-green-fg"
                            aria-label="Correct"
                          />
                        ) : (
                          <span className="size-4" aria-hidden />
                        )}
                        <span className={o.correct ? 'font-medium text-fg' : 'text-fg-muted'}>
                          {o.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {q.type === 'code' && (
                  <pre className="mt-2 ml-6 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-fg">
                    <span className="mb-1 block text-2xs text-fg-subtle">{q.language}</span>
                    {q.starterCode || '// no starter code'}
                  </pre>
                )}
                {q.type === 'file' && (
                  <p className="mt-1 ml-6 text-xs text-fg-subtle">
                    Accepts {q.accept || 'any file'}
                  </p>
                )}
                {q.rubric && (
                  <p className="mt-2 ml-6 text-xs text-fg-muted">
                    <span className="font-medium text-fg">Rubric: </span>
                    {q.rubric}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}

const statusOptions = [
  { value: 'NotStarted', label: 'Not started' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Expired', label: 'Expired' },
];

function Invited({
  a,
  own,
  onInviteMore,
}: {
  a: Assessment;
  own: Invite[];
  onInviteMore?: () => void;
}) {
  const router = useRouter();
  const { setInvites } = useAssessments();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [revoking, setRevoking] = useState<string[] | null>(null);
  const q = search.trim().toLowerCase();
  const rows = own.filter(
    (i) =>
      (!status || i.status === status) &&
      (!q || `${i.candidate} ${i.email}`.toLowerCase().includes(q)),
  );
  const remind = (ids: string[]) => {
    const n = own.filter((i) => ids.includes(i.id) && i.status !== 'Completed').length;
    toast.success(
      n ? `Reminder sent to ${n} ${n === 1 ? 'candidate' : 'candidates'}` : 'Nobody to remind',
      n ? 'Sample only: no email is sent.' : 'Completed candidates are skipped.',
    );
  };
  const columns: Column<Invite>[] = [
    {
      id: 'candidate',
      header: 'Candidate',
      hideable: false,
      sortValue: (i) => i.candidate,
      csv: (i) => `${i.candidate} <${i.email}>`,
      cell: (i) => (
        <CellStack
          primary={
            i.status === 'Completed' ? (
              <Link href={`/assessments/${a.id}/results/${i.id}`} className="hover:underline">
                {i.candidate}
              </Link>
            ) : (
              i.candidate
            )
          }
          secondary={i.email}
        />
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (i) => i.status,
      cell: (i) => <StatusBadge status={i.status} />,
    },
    {
      id: 'invited',
      header: 'Invited',
      sortValue: (i) => i.invitedOn,
      cell: (i) => (
        <span className="whitespace-nowrap text-fg-muted">{formatWhen(i.invitedOn)}</span>
      ),
    },
    {
      id: 'submitted',
      header: 'Submitted',
      sortValue: (i) => i.submittedOn,
      cell: (i) => (
        <span className="whitespace-nowrap text-fg-muted">{formatWhen(i.submittedOn)}</span>
      ),
    },
    {
      id: 'score',
      header: 'Score',
      align: 'right',
      sortValue: (i) => (i.status === 'Completed' ? resultOf(a, i).percent : null),
      cell: (i) => <Score a={a} i={i} />,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      hideable: false,
      cell: (i) => (
        <RowActions label={`Actions for ${i.candidate}`}>
          {i.status === 'Completed' ? (
            <MenuItem onSelect={() => router.push(`/assessments/${a.id}/results/${i.id}`)}>
              Review submission
            </MenuItem>
          ) : (
            <MenuItem onSelect={() => remind([i.id])}>Send reminder</MenuItem>
          )}
          <MenuItem danger onSelect={() => setRevoking([i.id])}>
            Revoke invitation
          </MenuItem>
        </RowActions>
      ),
    },
  ];
  return (
    <Card className="px-5 pb-2">
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(i) => i.id}
        viewKey="assessment-invites"
        exportName={`${a.name} invites`}
        noun="candidate"
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        rowLabel={(i) => i.candidate}
        bulkActions={
          <>
            <Button size="sm" variant="secondary" onClick={() => remind(selected)}>
              Send reminder
            </Button>
            <Button size="sm" variant="danger-quiet" onClick={() => setRevoking(selected)}>
              Revoke
            </Button>
          </>
        }
        toolbar={
          <>
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search candidates"
              className="w-full sm:w-64"
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              data={statusOptions}
              allLabel="All statuses"
            />
            {onInviteMore && (
              <Button variant="secondary" leftIcon={<UserPlus />} onClick={onInviteMore}>
                Invite more
              </Button>
            )}
          </>
        }
        empty={
          <EmptyState
            compact
            icon={Users}
            title={q || status ? 'No matches' : 'Nobody invited yet'}
            description={
              q || status
                ? 'Try another name or status.'
                : 'Invite candidates by email to send them this assessment.'
            }
            action={
              onInviteMore &&
              !q &&
              !status && (
                <Button size="sm" leftIcon={<UserPlus />} onClick={onInviteMore}>
                  Invite candidates
                </Button>
              )
            }
          />
        }
      />
      <ConfirmDialog
        opened={!!revoking}
        onClose={() => setRevoking(null)}
        title={`Revoke ${revoking?.length === 1 ? 'this invitation' : `${revoking?.length} invitations`}?`}
        message="Their link stops working and any submitted answers are removed from this assessment."
        confirmLabel="Revoke"
        onConfirm={() => {
          const ids = revoking ?? [];
          setInvites((list) => list.filter((i) => !ids.includes(i.id)));
          setSelected((s) => s.filter((id) => !ids.includes(id)));
          toast.success(`${ids.length} ${ids.length === 1 ? 'invitation' : 'invitations'} revoked`);
        }}
      />
    </Card>
  );
}

function Score({ a, i }: { a: Assessment; i: Invite }) {
  if (i.status !== 'Completed') return <span className="text-fg-subtle">—</span>;
  const r = resultOf(a, i);
  if (r.percent === null) return <span className="text-fg-muted">In review</span>;
  return <span className="font-semibold tnum">{r.percent}</span>;
}

function Results({ a, completed }: { a: Assessment; completed: Invite[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<string | null>(null);
  const scored = completed
    .map((i) => resultOf(a, i).percent)
    .filter((p): p is number => p !== null);
  const sorted = [...scored].sort((x, y) => x - y);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const q = search.trim().toLowerCase();
  const rows = completed.filter(
    (i) =>
      (!decision || (i.decision ?? 'Review') === decision) &&
      (!q || i.candidate.toLowerCase().includes(q)),
  );
  const columns: Column<Invite>[] = [
    {
      id: 'candidate',
      header: 'Candidate',
      hideable: false,
      sortValue: (i) => i.candidate,
      cell: (i) => <CellStack primary={i.candidate} secondary={i.email} />,
    },
    {
      id: 'submitted',
      header: 'Submitted',
      sortValue: (i) => i.submittedOn,
      cell: (i) => (
        <span className="whitespace-nowrap text-fg-muted">{formatWhen(i.submittedOn)}</span>
      ),
    },
    {
      id: 'score',
      header: 'Score',
      align: 'right',
      sortValue: (i) => resultOf(a, i).percent,
      cell: (i) => <Score a={a} i={i} />,
    },
    {
      id: 'decision',
      header: 'Result',
      sortValue: (i) => i.decision ?? 'Review',
      cell: (i) => <StatusBadge status={i.decision ?? 'Review'} />,
    },
    {
      id: 'reviewer',
      header: 'Reviewer',
      sortValue: (i) => i.reviewer,
      cell: (i) => <span className="text-fg-muted">{i.reviewer ?? '—'}</span>,
    },
  ];
  if (!completed.length)
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="No submissions yet"
          description="Results appear here as soon as an invited candidate submits."
        />
      </Card>
    );
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader
          title="Score distribution"
          description={`${scored.length} scored · median ${median ?? '—'} · pass mark ${a.passMark}`}
        />
        <div className="px-5 pb-5">
          <BarChart
            data={scoreBuckets(scored)}
            dataKey="range"
            series={[{ key: 'candidates', label: 'Candidates' }]}
          />
        </div>
      </Card>
      <Card className="px-5 pb-2">
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(i) => i.id}
          viewKey="assessment-results"
          exportName={`${a.name} results`}
          noun="result"
          onRowOpen={(i) => router.push(`/assessments/${a.id}/results/${i.id}`)}
          rowLabel={(i) => `Review ${i.candidate}`}
          toolbar={
            <>
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Search candidates"
                className="w-full sm:w-64"
              />
              <FilterSelect
                value={decision}
                onChange={setDecision}
                data={[
                  { value: 'Review', label: 'Needs review' },
                  { value: 'Passed', label: 'Passed' },
                  { value: 'Failed', label: 'Failed' },
                ]}
                allLabel="All results"
              />
            </>
          }
          empty={
            <EmptyState
              compact
              icon={Users}
              title="No matches"
              description="Try another name or result."
            />
          }
        />
      </Card>
    </div>
  );
}

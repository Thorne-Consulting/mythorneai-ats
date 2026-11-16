'use client';

import { safeWebUrl } from '@/lib/safe-url';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Gauge,
  Pencil,
  Percent,
  Send,
  Users,
} from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CellStack,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  FilterSelect,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
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
import { RichText } from '@/components/rich-text';
import { formatDate } from '@/lib/format';
import {
  displayName,
  resultHref,
  useAnalysis,
  useAssessment,
  useInvites,
  useRefreshAssessments,
  type AssessmentDetail as Detail,
  type InviteRow,
} from './api';
import { reminderText, useInviteActions } from './invite-actions';
import { inviteState, InviteStatusBadge, QuestionView, ScoreCell } from './parts';
import {
  allQuestions,
  bucketOf,
  plural,
  promptLine,
  questionTypeLabels,
  scoreBuckets,
} from './scoring';

type DetailTab = 'overview' | 'questions' | 'invited' | 'results';
const tabs: DetailTab[] = ['overview', 'questions', 'invited', 'results'];

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

export function AssessmentDetail({ id, initialTab }: { id: string; initialTab?: string }) {
  const router = useRouter();
  const query = useAssessment(id);
  const invites = useInvites(id);
  const refresh = useRefreshAssessments();
  const [tab, setTab] = useState<DetailTab>(
    tabs.includes(initialTab as DetailTab) ? (initialTab as DetailTab) : 'overview',
  );
  const [publishing, setPublishing] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const crumbs = [
    { label: 'Assessments', href: '/assessments' },
    { label: query.data?.name ?? 'Assessment' },
  ];
  if (query.isError)
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title="Assessment not found" />
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="We could not find this assessment"
            description="It may have been removed. Go back to the library to pick another one."
            action={
              <Button asChild variant="secondary">
                <Link href="/assessments">Back to assessments</Link>
              </Button>
            }
          />
        </Card>
      </>
    );
  if (!query.data)
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title="Assessment" />
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      </>
    );

  const a = query.data;
  const rows = invites.data ?? [];
  const live = rows.filter((r) => !r.replaced);
  const results = live.filter((r) => r.status === 'Submitted');
  const shown = a.published ?? a.content;
  const switchTab = (v: string) => {
    setTab(v as DetailTab);
    window.history.replaceState(null, '', v === 'overview' ? `/assessments/${id}` : `?tab=${v}`);
  };

  async function post(path: string, success: string) {
    try {
      await api.post(path);
      toast.success(success, a.name);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function duplicate() {
    try {
      const { id: copy } = await api.post<{ id: string }>(`/api/assessments/${id}/duplicate`);
      toast.success('Copied to drafts', a.name);
      refresh();
      router.push(`/assessments/${copy}/edit`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  const open = a.counts.notStarted + a.counts.inProgress;

  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {a.name}
            <StatusBadge status={a.status} />
          </span>
        }
        description={[
          a.department,
          a.kind === 'External' ? `External test by ${a.providerName ?? 'another provider'}` : null,
          a.version
            ? `Version ${a.version.number}, published ${formatDate(a.version.publishedAt)}`
            : 'Not published yet',
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          a.canEdit && (
            <>
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary">More</Button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={duplicate}>Duplicate</MenuItem>
                  {a.status === 'Archived' ? (
                    <MenuItem
                      onSelect={() => post(`/api/assessments/${id}/restore`, 'Restored to drafts')}
                    >
                      Restore
                    </MenuItem>
                  ) : (
                    <MenuItem
                      onSelect={() =>
                        open > 0
                          ? setArchiving(true)
                          : post(`/api/assessments/${id}/archive`, 'Assessment archived')
                      }
                    >
                      Archive
                    </MenuItem>
                  )}
                </MenuContent>
              </Menu>
              <Button
                variant={a.status === 'Draft' ? 'secondary' : 'primary'}
                leftIcon={<Pencil />}
                onClick={() => router.push(`/assessments/${id}/edit`)}
              >
                Edit
              </Button>
              {a.status !== 'Active' && (
                <Button
                  leftIcon={<Send />}
                  loading={publishing}
                  onClick={async () => {
                    if (a.problems.length) return router.push(`/assessments/${id}/edit`);
                    setPublishing(true);
                    await post(`/api/assessments/${id}/publish`, 'Assessment published');
                    setPublishing(false);
                  }}
                >
                  Publish
                </Button>
              )}
            </>
          )
        }
      >
        <Tabs
          aria-label="Assessment sections"
          value={tab}
          onValueChange={switchTab}
          items={[
            { value: 'overview', label: 'Overview' },
            ...(a.kind === 'Native'
              ? [{ value: 'questions', label: 'Questions', count: allQuestions(shown).length }]
              : []),
            { value: 'invited', label: 'Invited', count: live.length },
            { value: 'results', label: 'Results', count: results.length },
          ]}
        />
      </PageHeader>

      {a.hasUnpublishedChanges && a.canEdit && (
        <Alert
          tone="info"
          className="mb-5"
          title="You have changes that are not published"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setReverting(true)}>
                Discard changes
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  a.problems.length
                    ? router.push(`/assessments/${id}/edit`)
                    : post(`/api/assessments/${id}/publish`, 'Changes published')
                }
              >
                Publish changes
              </Button>
            </div>
          }
        >
          Applicants still get version {a.version?.number}. Publishing makes version{' '}
          {(a.version?.number ?? 0) + 1}.
        </Alert>
      )}
      {a.status === 'Archived' && (
        <Alert tone="neutral" className="mb-5">
          Archived. Open links keep working until they expire, but nobody new can be sent this
          assessment.
        </Alert>
      )}

      {tab === 'overview' && <Overview a={a} rows={live} />}
      {tab === 'questions' && <Questions a={a} />}
      {tab === 'invited' && <Invited a={a} rows={rows} loading={invites.isPending} />}
      {tab === 'results' && <Results a={a} rows={results} />}

      <ConfirmDialog
        opened={reverting}
        onClose={() => setReverting(false)}
        title="Discard the unpublished changes?"
        message={`The draft goes back to version ${a.version?.number}, the one applicants get today.`}
        confirmLabel="Discard changes"
        onConfirm={() => post(`/api/assessments/${id}/revert`, 'Changes discarded')}
      />
      <ConfirmDialog
        opened={archiving}
        onClose={() => setArchiving(false)}
        title="Archive this assessment?"
        message={`${plural(open, 'applicant has', 'applicants have')} an open link. Those links keep working until they expire, but nobody new can be sent this assessment.`}
        confirmLabel="Archive"
        confirmVariant="primary"
        onConfirm={() => post(`/api/assessments/${id}/archive`, 'Assessment archived')}
      />
    </>
  );
}

function Overview({ a, rows }: { a: Detail; rows: InviteRow[] }) {
  const c = a.published ?? a.content;
  const qs = allQuestions(c);
  const decided = a.counts.passed + a.counts.failed;
  const scores = rows.map((r) => r.percent).filter((p): p is number => p !== null);
  const total = rows.length;
  const checks = [
    c.tabSwitch && 'Tab switches',
    c.fullscreen && 'Full screen',
    c.blockPaste && 'Pasting turned off',
  ].filter(Boolean);
  return (
    <>
      <StatGrid className="mb-5">
        <StatCard
          icon={Users}
          label="Invited"
          value={total}
          hint={
            a.counts.notStarted + a.counts.inProgress
              ? `${a.counts.notStarted + a.counts.inProgress} still open`
              : undefined
          }
        />
        <StatCard
          icon={CheckCircle2}
          tone="green"
          label="Completed"
          value={a.counts.submitted}
          hint={total ? `${pct(a.counts.submitted, total)}% of those invited` : undefined}
        />
        <StatCard
          icon={Percent}
          tone="violet"
          label="Pass rate"
          value={decided ? `${pct(a.counts.passed, decided)}%` : 'None yet'}
          hint={decided ? `Of ${plural(decided, 'decision')}` : undefined}
        />
        <StatCard
          icon={Gauge}
          tone="amber"
          label="Average score"
          value={
            scores.length
              ? `${Math.round(scores.reduce((s, x) => s + x, 0) / scores.length)}%`
              : 'None yet'
          }
          hint={a.kind === 'Native' ? `Pass mark ${c.passMark}%` : undefined}
        />
      </StatGrid>
      {a.olderVersionResults > 0 && (
        <Alert tone="neutral" className="mb-5">
          {plural(a.olderVersionResults, 'result')} came from older versions. Each is scored against
          the version that person took.
        </Alert>
      )}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DescriptionList
                columns={2}
                items={[
                  ...(a.kind === 'Native'
                    ? [
                        {
                          label: 'Time',
                          value: c.timed ? `${c.minutes} minutes, with a timer` : 'No time limit',
                        },
                        {
                          label: 'Questions',
                          value: `${plural(qs.length, 'question')} in ${plural(c.sections.length, 'section')}, ${plural(
                            qs.reduce((s, q) => s + q.points, 0),
                            'point',
                          )}`,
                        },
                        { label: 'Checks', value: checks.length ? checks.join(', ') : 'Off' },
                        {
                          label: 'Order',
                          value:
                            c.shuffleQuestions && c.shuffleOptions
                              ? 'Questions and answers shuffled'
                              : c.shuffleQuestions
                                ? 'Questions shuffled'
                                : c.shuffleOptions
                                  ? 'Answers shuffled'
                                  : 'As written',
                        },
                      ]
                    : [
                        { label: 'Provider', value: a.providerName ?? 'Not set' },
                        {
                          label: 'Link',
                          // The server only saves https links; this keeps a bad stored value inert too.
                          value: safeWebUrl(a.externalUrl?.replace(/\{\{\w+\}\}/g, '')) ? (
                            <a
                              href={safeWebUrl(a.externalUrl!.replace(/\{\{\w+\}\}/g, ''))}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 break-all text-accent-foreground hover:underline"
                            >
                              {a.externalUrl}{' '}
                              <ExternalLink className="size-3.5 shrink-0" aria-hidden />
                            </a>
                          ) : (
                            (a.externalUrl ?? 'Not set')
                          ),
                        },
                      ]),
                  { label: 'Links stay open', value: plural(a.expiryDays, 'day') },
                  {
                    label: 'Reminder',
                    value: a.remindAfterDays
                      ? `After ${plural(a.remindAfterDays, 'day')}, if not finished`
                      : 'Off',
                  },
                  {
                    label: 'Grading',
                    value: a.blindReview ? 'Without names until the decision' : 'With names',
                  },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Instructions for applicants" />
            <CardBody>
              <RichText
                markdown={c.instructions}
                className="text-base text-fg-muted"
                empty={<p className="text-base text-fg-subtle">No instructions yet.</p>}
              />
            </CardBody>
          </Card>
        </div>
        <Card>
          <CardHeader title="Where applicants are" />
          <CardBody className="space-y-4">
            {(
              [
                ['To review', a.counts.toReview, 'amber'],
                ['Decided', decided, 'green'],
                ['In progress', a.counts.inProgress, 'primary'],
                ['Not started', a.counts.notStarted, 'gray'],
                ['Expired', a.counts.expired, 'red'],
              ] as const
            ).map(([label, value, tone]) => (
              <ProgressRow
                key={label}
                label={label}
                value={value}
                max={total || 1}
                tone={tone}
                display={`${value}`}
              />
            ))}
            {total === 0 && (
              <p className="text-sm text-fg-subtle">
                Send it from an applicant&apos;s page or from the pipeline.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Questions({ a }: { a: Detail }) {
  const c = a.published ?? a.content;
  const qs = allQuestions(c);
  if (!qs.length)
    return (
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="No questions yet"
          description="Add sections and questions in the builder, then publish."
          action={
            a.canEdit && (
              <Button asChild variant="secondary">
                <Link href={`/assessments/${a.id}/edit`}>Open the builder</Link>
              </Button>
            )
          }
        />
      </Card>
    );
  let n = 0;
  return (
    <div className="flex flex-col gap-5">
      {a.hasUnpublishedChanges && (
        <p className="text-sm text-fg-muted">
          These are the published questions. Your unpublished changes are in the builder.
        </p>
      )}
      {c.sections.map((s) => (
        <Card key={s.id}>
          <CardHeader
            title={s.title || 'Untitled section'}
            description={`${plural(s.questions.length, 'question')} · ${plural(
              s.questions.reduce((t, q) => t + q.points, 0),
              'point',
            )}`}
          />
          <ol className="divide-y divide-border-subtle border-t border-border-subtle">
            {s.questions.map((q) => (
              <li key={q.id} className="px-5 py-5">
                <QuestionView q={q} number={++n} />
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}

const statusFilter = [
  { value: 'NotStarted', label: 'Not started' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'Submitted', label: 'Finished' },
  { value: 'Expired', label: 'Expired' },
];

function Invited({ a, rows, loading }: { a: Detail; rows: InviteRow[]; loading: boolean }) {
  const actions = useInviteActions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!status || r.status === status) &&
      (!q || `${r.candidate} ${r.email} ${r.job}`.toLowerCase().includes(q)),
  );
  const columns: Column<InviteRow>[] = [
    {
      id: 'candidate',
      header: 'Applicant',
      hideable: false,
      sortValue: (r) => r.candidate,
      csv: (r) => `${r.candidate} <${r.email}>`,
      cell: (r) => (
        <CellStack
          primary={
            // Blind rows for people who do not manage the job arrive with no identity or link.
            r.email ? (
              <Link href={`/applications/${r.applicationId}`} className="hover:underline">
                {r.candidate}
              </Link>
            ) : (
              displayName(r)
            )
          }
          secondary={
            r.email ? (r.attempt > 1 ? `Attempt ${r.attempt} · ${r.email}` : r.email) : undefined
          }
        />
      ),
    },
    {
      id: 'job',
      header: 'Job',
      sortValue: (r) => r.job,
      cell: (r) => <span className="text-fg-muted">{r.job}</span>,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (r) => inviteState(r).label,
      csv: (r) => inviteState(r).label,
      cell: (r) => <InviteStatusBadge row={r} />,
    },
    {
      id: 'due',
      header: 'Due',
      sortValue: (r) => r.expiresAt,
      cell: (r) => (
        <CellStack
          primary={
            <span className="font-normal whitespace-nowrap text-fg-muted">
              {r.submittedAt ? `Finished ${formatDate(r.submittedAt)}` : formatDate(r.expiresAt)}
            </span>
          }
          secondary={!r.submittedAt ? reminderText(r) : null}
        />
      ),
    },
    {
      id: 'score',
      header: 'Score',
      align: 'right',
      sortValue: (r) => r.percent,
      cell: (r) => <ScoreCell row={r} />,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      hideable: false,
      sticky: true,
      cell: (r) =>
        actions.hasMenu(r) && (
          <RowActions label={`Actions for ${r.candidate}`}>{actions.menu(r)}</RowActions>
        ),
    },
  ];
  return (
    <Card className="px-5 pb-2">
      <DataTable
        data={shown}
        columns={columns}
        getRowId={(r) => r.id}
        viewKey="assessment-invites"
        exportName={`${a.name} invites`}
        noun="applicant"
        loading={loading}
        selectable={rows.some((r) => r.canManage)}
        selected={selected}
        onSelectedChange={setSelected}
        rowLabel={(r) => r.candidate}
        bulkActions={
          <Button
            size="sm"
            variant="secondary"
            onClick={() => actions.remind(rows.filter((r) => selected.includes(r.id)))}
          >
            Send reminder
          </Button>
        }
        toolbar={
          <>
            <SearchInput
              value={search}
              onValueChange={setSearch}
              placeholder="Search applicants"
              className="w-full sm:w-64"
            />
            <FilterSelect
              value={status}
              onChange={setStatus}
              data={statusFilter}
              allLabel="All statuses"
            />
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
                : a.status === 'Active'
                  ? 'Send it from an applicant’s page, or select people in the pipeline and choose Send assessment.'
                  : 'Publish it first, then send it from an applicant’s page or the pipeline.'
            }
          />
        }
      />
      {actions.dialogs}
    </Card>
  );
}

function Results({ a, rows }: { a: Detail; rows: InviteRow[] }) {
  const router = useRouter();
  const analysis = useAnalysis(a.id);
  const [search, setSearch] = useState('');
  const [decision, setDecision] = useState<string | null>(null);
  const passMark = (a.published ?? a.content).passMark;
  const percents = rows.map((r) => r.percent).filter((p): p is number => p !== null);
  const sorted = [...percents].sort((x, y) => x - y);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      (!decision || (r.decision ?? 'Review') === decision) &&
      (!q || `${displayName(r)} ${r.job}`.toLowerCase().includes(q)),
  );
  if (!rows.length)
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="No results yet"
          description="Results show up here when an applicant finishes."
        />
      </Card>
    );
  const columns: Column<InviteRow>[] = [
    {
      id: 'candidate',
      header: 'Applicant',
      hideable: false,
      sortValue: (r) => displayName(r),
      cell: (r) => <CellStack primary={displayName(r)} secondary={r.job} />,
    },
    {
      id: 'submitted',
      header: 'Finished',
      sortValue: (r) => r.submittedAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-fg-muted">
          {formatDate(r.submittedAt ?? undefined)}
          {r.autoSubmitted && <span className="block text-2xs text-fg-subtle">Time ran out</span>}
        </span>
      ),
    },
    {
      id: 'score',
      header: 'Score',
      align: 'right',
      sortValue: (r) => r.percent,
      cell: (r) => <ScoreCell row={r} />,
    },
    {
      id: 'decision',
      header: 'Result',
      sortValue: (r) => r.decision ?? 'Review',
      csv: (r) => inviteState(r).label,
      cell: (r) => <InviteStatusBadge row={r} />,
    },
    {
      id: 'checks',
      header: 'Checks',
      sortValue: (r) => r.flags,
      cell: (r) =>
        r.flags ? (
          <Badge size="sm">{plural(r.flags, 'event')}</Badge>
        ) : (
          <span className="text-fg-subtle">None</span>
        ),
    },
    {
      id: 'reviewer',
      header: 'Decided by',
      sortValue: (r) => r.decidedBy,
      cell: (r) => <span className="text-fg-muted">{r.decidedBy ?? 'Not yet'}</span>,
    },
    {
      id: 'version',
      header: 'Version',
      defaultHidden: true,
      sortValue: (r) => r.versionNumber,
      cell: (r) => <span className="tnum">{r.versionNumber}</span>,
    },
  ];
  const data = analysis.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Score spread"
            description={
              percents.length
                ? `${plural(percents.length, 'scored result')}, middle score ${median}%`
                : 'Scores show once answers are graded.'
            }
          />
          <CardBody>
            <BarChart
              data={scoreBuckets(percents)}
              dataKey="range"
              series={[{ key: 'candidates', label: 'Applicants' }]}
              legend={false}
              references={
                a.kind === 'Native'
                  ? [{ x: bucketOf(passMark), label: `Pass mark ${passMark}%` }]
                  : undefined
              }
            />
          </CardBody>
        </Card>
        {a.kind === 'Native' && (
          <Card>
            <CardHeader
              title="Question analysis"
              description={
                data?.versionNumber
                  ? `Version ${data.versionNumber}. Questions almost nobody or almost everybody gets right are flagged.`
                  : undefined
              }
            />
            {!data ? (
              <CardBody>
                <SkeletonRows rows={4} />
              </CardBody>
            ) : (
              <ol className="max-h-[320px] divide-y divide-border-subtle overflow-y-auto border-t border-border-subtle">
                {data.questions.map((qa) => {
                  const flag =
                    qa.correctRate !== null &&
                    (qa.correctRate < 20 || qa.correctRate > 95) &&
                    (data.total ?? 0) >= 3;
                  return (
                    <li key={qa.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="w-6 shrink-0 text-sm font-semibold text-fg-subtle tnum">
                        {qa.number}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{promptLine(qa.prompt)}</p>
                        <p className="text-2xs text-fg-subtle">
                          {questionTypeLabels[qa.type]}
                          {qa.topHalfRate !== null && ` · top half ${qa.topHalfRate}% right`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-fg tnum">
                          {qa.correctRate !== null
                            ? `${qa.correctRate}% right`
                            : qa.averagePoints !== null
                              ? `${qa.averagePoints} of ${qa.points}`
                              : 'Not scored'}
                        </p>
                        {flag && (
                          <Badge size="sm" tone="amber">
                            {qa.correctRate! < 20 ? 'Check: very hard' : 'Check: very easy'}
                          </Badge>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        )}
      </div>
      <Card className="px-5 pb-2">
        <DataTable
          data={shown}
          columns={columns}
          getRowId={(r) => r.id}
          viewKey="assessment-results"
          exportName={`${a.name} results`}
          noun="result"
          onRowOpen={(r) => router.push(resultHref(a.id, r.id))}
          rowLabel={(r) => `Open result for ${displayName(r)}`}
          toolbar={
            <>
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Search applicants"
                className="w-full sm:w-64"
              />
              <FilterSelect
                value={decision}
                onChange={setDecision}
                data={[
                  { value: 'Review', label: 'To review' },
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

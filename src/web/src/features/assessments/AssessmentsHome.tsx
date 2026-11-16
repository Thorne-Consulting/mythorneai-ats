'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  FileCode2,
  Hourglass,
  Percent,
  Plus,
  Sparkles,
} from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CellStack,
  ConfirmDialog,
  EmptyState,
  FilterSelect,
  MenuItem,
  PageHeader,
  RowActions,
  SearchInput,
  SkeletonRows,
  StatCard,
  StatGrid,
  Tabs,
  toast,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { useAbility } from '@/lib/ability';
import { formatDate, formatRelative } from '@/lib/format';
import {
  displayName,
  resultHref,
  useLibrary,
  useRefreshAssessments,
  useToReview,
  type AssessmentStatus,
  type InviteRow,
  type LibraryRow,
} from './api';
import { ScoreCell } from './parts';
import { plural } from './scoring';
import { starterTemplates } from './templates';

type TabValue = 'review' | 'Active' | 'Draft' | 'Archived';
const tabValues: TabValue[] = ['review', 'Active', 'Draft', 'Archived'];

/** /assessments: the grading queue first, then the library by status. */
export function AssessmentsHome() {
  const router = useRouter();
  const params = useSearchParams();
  const canEdit = useAbility().can('manage', 'Assessment');
  const library = useLibrary();
  const queue = useToReview();
  const refresh = useRefreshAssessments();
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<LibraryRow | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const rows = library.data ?? [];
  const review = queue.data ?? [];
  const requested = params.get('tab') as TabValue | null;
  const tab: TabValue =
    requested && tabValues.includes(requested)
      ? requested
      : review.length > 0
        ? 'review'
        : 'Active';
  const setTab = (value: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', value);
    router.replace(url.pathname + url.search, { scroll: false });
  };
  const count = (s: AssessmentStatus) => rows.filter((r) => r.status === s).length;

  const departments = useMemo(
    () => [...new Set(rows.map((r) => r.department).filter((d): d is string => !!d))].sort(),
    [rows],
  );
  const q = search.trim().toLowerCase();
  const shown = rows.filter(
    (r) =>
      r.status === tab &&
      (!department || r.department === department) &&
      (!q || `${r.name} ${r.department ?? ''} ${r.providerName ?? ''}`.toLowerCase().includes(q)),
  );
  const reviewShown = review.filter(
    (r) => !q || `${displayName(r)} ${r.assessmentName} ${r.job}`.toLowerCase().includes(q),
  );

  // Headline numbers across the library (only the applications you can see).
  const completed = rows.reduce((n, r) => n + r.completed, 0);
  const invited = rows.reduce((n, r) => n + r.invited, 0);
  const open = rows.reduce((n, r) => n + r.open, 0);
  const decided = rows.filter((r) => r.passRate !== null);
  const oldest = review[0]?.submittedAt;

  async function act(path: string, success: string, name: string) {
    try {
      await api.post(path);
      toast.success(success, name);
      await refresh();
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function duplicate(row: LibraryRow) {
    try {
      const { id } = await api.post<{ id: string }>(`/api/assessments/${row.id}/duplicate`);
      toast.success('Copied to drafts', row.name);
      refresh();
      router.push(`/assessments/${id}/edit`);
    } catch (error) {
      toast.error((error as Error).message);
    }
  }
  async function startFrom(key: string) {
    const template = starterTemplates.find((t) => t.key === key)!;
    setCreating(key);
    try {
      const { id } = await api.post<{ id: string }>('/api/assessments', template.form());
      refresh();
      router.push(`/assessments/${id}/edit`);
    } catch (error) {
      toast.error((error as Error).message);
      setCreating(null);
    }
  }

  const libraryColumns: Column<LibraryRow>[] = [
    {
      id: 'name',
      header: 'Assessment',
      hideable: false,
      sortValue: (r) => r.name,
      cell: (r) => (
        <CellStack
          primary={
            <Link href={`/assessments/${r.id}`} className="hover:underline">
              {r.name}
            </Link>
          }
          secondary={r.department ?? 'No department'}
        />
      ),
    },
    {
      id: 'length',
      header: 'Questions',
      sortValue: (r) => r.questions,
      csv: (r) => (r.kind === 'External' ? `External: ${r.providerName ?? ''}` : r.questions),
      cell: (r) =>
        r.kind === 'External' ? (
          <span className="inline-flex items-center gap-1.5 text-fg-muted">
            <ExternalLink className="size-3.5" aria-hidden />
            {r.providerName ?? 'External'}
          </span>
        ) : (
          <span className="whitespace-nowrap text-fg-muted tnum">
            {plural(r.questions, 'question')} · {r.timed ? `${r.minutes} min` : 'No time limit'}
          </span>
        ),
    },
    {
      id: 'invited',
      header: 'Invited',
      align: 'right',
      sortValue: (r) => r.invited,
      cell: (r) => <span className="tnum">{r.invited}</span>,
    },
    {
      id: 'completed',
      header: 'Completed',
      align: 'right',
      sortValue: (r) => r.completed,
      cell: (r) => (
        <span className="tnum">
          {r.completed}
          {r.toReview > 0 && (
            <Badge tone="amber" size="sm" className="ml-2">
              {r.toReview} to review
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: 'pass',
      header: 'Pass rate',
      align: 'right',
      sortValue: (r) => r.passRate,
      cell: (r) =>
        r.passRate === null ? (
          <span className="text-fg-subtle">None yet</span>
        ) : (
          <span className="font-medium tnum">{r.passRate}%</span>
        ),
    },
    {
      id: 'activity',
      header: 'Last activity',
      sortValue: (r) => r.lastActivityAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-fg-muted">{formatRelative(r.lastActivityAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      hideable: false,
      sticky: true,
      cell: (r) =>
        canEdit && (
          <RowActions label={`Actions for ${r.name}`}>
            <MenuItem onSelect={() => router.push(`/assessments/${r.id}/edit`)}>Edit</MenuItem>
            <MenuItem onSelect={() => duplicate(r)}>Duplicate</MenuItem>
            {r.status === 'Archived' ? (
              <MenuItem
                onSelect={() =>
                  act(`/api/assessments/${r.id}/restore`, 'Restored to drafts', r.name)
                }
              >
                Restore
              </MenuItem>
            ) : (
              <MenuItem
                onSelect={() =>
                  r.open > 0
                    ? setArchiving(r)
                    : act(`/api/assessments/${r.id}/archive`, 'Assessment archived', r.name)
                }
              >
                Archive
              </MenuItem>
            )}
          </RowActions>
        ),
    },
  ];

  const reviewColumns: Column<InviteRow>[] = [
    {
      id: 'candidate',
      header: 'Applicant',
      hideable: false,
      sortValue: (r) => displayName(r),
      cell: (r) => (
        <CellStack
          primary={
            <Link href={resultHref(r.assessmentId, r.id)} className="hover:underline">
              {displayName(r)}
            </Link>
          }
          secondary={r.job}
        />
      ),
    },
    {
      id: 'assessment',
      header: 'Assessment',
      sortValue: (r) => r.assessmentName,
      cell: (r) => <span className="text-fg-muted">{r.assessmentName}</span>,
    },
    {
      id: 'submitted',
      header: 'Submitted',
      sortValue: (r) => r.submittedAt,
      cell: (r) => (
        <span className="whitespace-nowrap text-fg-muted">
          {formatDate(r.submittedAt ?? undefined)}
        </span>
      ),
    },
    {
      id: 'score',
      header: 'Score so far',
      sortValue: (r) => (r.max ? r.earned / r.max : null),
      cell: (r) => <ScoreCell row={r} />,
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
      id: 'grade',
      header: <span className="sr-only">Grade</span>,
      label: 'Grade',
      hideable: false,
      align: 'right',
      cell: (r) => (
        <Button asChild size="sm" variant="secondary">
          <Link href={resultHref(r.assessmentId, r.id)}>Grade</Link>
        </Button>
      ),
    },
  ];

  const loading = library.isPending || queue.isPending;
  const empty = !loading && rows.length === 0;

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Build skills tests, send them to applicants, and grade their answers."
        actions={
          canEdit && (
            <Button leftIcon={<Plus />} onClick={() => router.push('/assessments/new')}>
              Create assessment
            </Button>
          )
        }
      />

      {loading ? (
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      ) : empty ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title="No assessments yet"
            description={
              canEdit
                ? 'Start from one of these, or build your own from scratch.'
                : 'A recruiter builds them. Ask yours to set one up.'
            }
          />
          {canEdit && (
            <div className="mx-auto grid max-w-2xl gap-3 px-5 pb-8 sm:grid-cols-2">
              {starterTemplates.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  disabled={!!creating}
                  onClick={() => startFrom(t.key)}
                  className="flex flex-col items-start gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-2 text-base font-semibold text-fg">
                    {t.key === 'frontend' ? (
                      <FileCode2 className="size-4 text-accent-foreground" aria-hidden />
                    ) : (
                      <Sparkles className="size-4 text-accent-foreground" aria-hidden />
                    )}
                    {t.title}
                  </span>
                  <span className="text-xs text-fg-subtle">{t.summary}</span>
                  <span className="mt-2 text-sm font-medium text-accent-foreground">
                    {creating === t.key ? 'Opening…' : 'Use this'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <>
          <StatGrid className="mb-5">
            <StatCard
              icon={ClipboardCheck}
              tone="amber"
              label="To review"
              value={review.length}
              hint={oldest ? `Oldest from ${formatDate(oldest)}` : 'Nothing waiting'}
            />
            <StatCard
              icon={Hourglass}
              label="Waiting on applicants"
              value={open}
              hint="Not started or not finished"
            />
            <StatCard
              icon={CheckCircle2}
              tone="green"
              label="Completed"
              value={completed}
              hint={
                invited
                  ? `${Math.round((completed / invited) * 100)}% of ${invited} sent`
                  : undefined
              }
            />
            <StatCard
              icon={Percent}
              tone="violet"
              label="Pass rate"
              value={
                decided.length
                  ? `${Math.round(decided.reduce((n, r) => n + (r.passRate ?? 0), 0) / decided.length)}%`
                  : 'None yet'
              }
              hint={
                decided.length ? `Average of ${plural(decided.length, 'assessment')}` : undefined
              }
            />
          </StatGrid>

          <Card className="px-5 pt-1 pb-2">
            <Tabs
              aria-label="Assessments"
              value={tab}
              onValueChange={setTab}
              items={[
                { value: 'review', label: 'To review', count: review.length },
                { value: 'Active', label: 'Active', count: count('Active') },
                { value: 'Draft', label: 'Drafts', count: count('Draft') },
                { value: 'Archived', label: 'Archived', count: count('Archived') },
              ]}
            />
            {tab === 'review' ? (
              <DataTable
                key="review"
                data={reviewShown}
                columns={reviewColumns}
                getRowId={(r) => r.id}
                viewKey="assessments-review"
                card={(r) => (
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium text-fg">{displayName(r)}</p>
                      <p className="truncate text-xs text-fg-subtle">
                        {r.assessmentName} · {r.job}
                      </p>
                      <p className="mt-1 text-sm text-fg-muted tnum">
                        <ScoreCell row={r} />
                      </p>
                    </div>
                    <Button asChild size="sm" variant="secondary">
                      <Link href={resultHref(r.assessmentId, r.id)}>Grade</Link>
                    </Button>
                  </div>
                )}
                exportName="Assessments to review"
                noun="result"
                onRowOpen={(r) => router.push(resultHref(r.assessmentId, r.id))}
                rowLabel={(r) => `Grade ${displayName(r)}`}
                toolbar={
                  <SearchInput
                    value={search}
                    onValueChange={setSearch}
                    placeholder="Search applicants or assessments"
                    className="w-full sm:w-72"
                  />
                }
                empty={
                  <EmptyState
                    compact
                    icon={CheckCircle2}
                    title={q ? 'No matches' : 'All caught up'}
                    description={
                      q ? 'Try another name.' : 'Finished assessments show up here for grading.'
                    }
                  />
                }
              />
            ) : (
              <DataTable
                key="library"
                data={shown}
                columns={libraryColumns}
                getRowId={(r) => r.id}
                viewKey="assessments-library"
                card={(r) => (
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-fg">{r.name}</p>
                    <p className="truncate text-xs text-fg-subtle">
                      {[
                        r.department,
                        r.kind === 'External'
                          ? (r.providerName ?? 'External')
                          : plural(r.questions, 'question'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-fg-muted tnum">
                      {r.invited} invited · {r.completed} completed
                      {r.passRate !== null && ` · ${r.passRate}% pass`}
                      {r.toReview > 0 && (
                        <Badge tone="amber" size="sm">
                          {r.toReview} to review
                        </Badge>
                      )}
                    </p>
                  </div>
                )}
                exportName="Assessments"
                noun="assessment"
                onRowOpen={(r) => router.push(`/assessments/${r.id}`)}
                rowLabel={(r) => `Open ${r.name}`}
                toolbar={
                  <>
                    <SearchInput
                      value={search}
                      onValueChange={setSearch}
                      placeholder="Search assessments"
                      className="w-full sm:w-64"
                    />
                    {departments.length > 1 && (
                      <FilterSelect
                        value={department}
                        onChange={setDepartment}
                        data={departments}
                        allLabel="All departments"
                      />
                    )}
                  </>
                }
                empty={
                  <EmptyState
                    compact
                    icon={ClipboardList}
                    title={
                      q || department
                        ? 'No matches'
                        : tab === 'Draft'
                          ? 'No drafts'
                          : tab === 'Archived'
                            ? 'Nothing archived'
                            : 'No active assessments'
                    }
                    description={
                      q || department
                        ? 'Try another name or department.'
                        : tab === 'Archived'
                          ? 'Archived assessments wait here until you restore them.'
                          : 'Publish an assessment to send it to applicants.'
                    }
                    action={
                      canEdit &&
                      !q &&
                      !department &&
                      tab !== 'Archived' && (
                        <Button
                          size="sm"
                          leftIcon={<Plus />}
                          onClick={() => router.push('/assessments/new')}
                        >
                          Create assessment
                        </Button>
                      )
                    }
                  />
                }
              />
            )}
          </Card>
        </>
      )}

      <ConfirmDialog
        opened={!!archiving}
        onClose={() => setArchiving(null)}
        title="Archive this assessment?"
        message={`${plural(archiving?.open ?? 0, 'applicant has', 'applicants have')} an open link. Those links keep working until they expire, but nobody new can be sent this assessment.`}
        confirmLabel="Archive"
        confirmVariant="primary"
        onConfirm={async () => {
          if (archiving)
            await act(
              `/api/assessments/${archiving.id}/archive`,
              'Assessment archived',
              archiving.name,
            );
        }}
      />
    </>
  );
}

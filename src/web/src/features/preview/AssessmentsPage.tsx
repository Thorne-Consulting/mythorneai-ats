'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Plus,
  Send,
  UserPlus,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CellStack,
  EmptyState,
  IconDisc,
  MenuItem,
  ProgressRow,
  PageHeader,
  RowActions,
  SkeletonRows,
  StatCard,
  StatGrid,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  toast,
} from '@/components/ui';
import { StatusBadge } from '@/components/status';
import { rowLinkProps } from '@/lib/row-link-props';
import { PreviewAlert, PreviewTitle } from './preview-ui';
import {
  questionsOf,
  resultOf,
  type Assessment,
  type AssessmentStatus,
} from './sample-assessments';
import { InviteModal } from './assessments/InviteModal';
import { formatWhen, iconFor, useAssessments } from './assessments/store';

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

export function AssessmentsPage() {
  const router = useRouter();
  const { assessments, invites, ready, setAssessments, updateAssessment, addInvites } =
    useAssessments();
  const [tab, setTab] = useState<AssessmentStatus>('active');
  const [showAll, setShowAll] = useState(false);
  const [inviting, setInviting] = useState<string | null | false>(false);

  const byId = new Map(assessments.map((a) => [a.id, a]));
  const byStatus = (s: AssessmentStatus) => assessments.filter((a) => a.status === s);
  const active = byStatus('active');
  const activeIds = new Set(active.map((a) => a.id));
  const activeInvites = invites.filter((i) => activeIds.has(i.assessmentId));
  const count = (s: string) => activeInvites.filter((i) => i.status === s).length;
  const completion = {
    completed: count('Completed'),
    inProgress: count('InProgress'),
    notStarted: count('NotStarted'),
  };
  const invitedTotal = completion.completed + completion.inProgress + completion.notStarted;
  const toReview = invites
    .filter((i) => i.status === 'Completed' && !i.decision && byId.has(i.assessmentId))
    .sort((a, b) => (b.submittedOn ?? '').localeCompare(a.submittedOn ?? ''));
  const toRemind = activeInvites.filter((i) => i.status === 'InProgress').slice(0, 3);
  const recent = invites
    .filter((i) => i.status === 'Completed' && byId.has(i.assessmentId))
    .sort((a, b) => (b.submittedOn ?? '').localeCompare(a.submittedOn ?? ''))
    .slice(0, 6);
  const shown = byStatus(tab);
  const visible = showAll ? shown : shown.slice(0, 4);
  const resultHref = (assessmentId: string, inviteId: string) =>
    `/assessments/${assessmentId}/results/${inviteId}`;

  const moveTo = (a: Assessment, status: AssessmentStatus, message: string) => {
    updateAssessment(a.id, { status });
    toast.success(message, a.name);
  };

  return (
    <>
      <PageHeader
        title={<PreviewTitle>Assessments</PreviewTitle>}
        description="Evaluate skills fairly and make confident, evidence-based hiring decisions."
        actions={
          <>
            <Button variant="secondary" leftIcon={<UserPlus />} onClick={() => setInviting(null)}>
              Invite candidates
            </Button>
            <Button leftIcon={<Plus />} onClick={() => router.push('/assessments/new')}>
              Create assessment
            </Button>
          </>
        }
      />
      <PreviewAlert>
        This screen runs on sample data until the backend exists. Your changes are kept in this
        browser only.
      </PreviewAlert>

      {!ready ? (
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      ) : (
        <>
          <StatGrid className="mb-5">
            <StatCard
              icon={FileText}
              label="Active assessments"
              value={active.length}
              hint={`Across ${new Set(active.map((a) => a.department)).size} departments`}
            />
            <StatCard
              icon={Send}
              tone="violet"
              label="Candidates invited"
              value={invitedTotal}
              hint="To active assessments"
            />
            <StatCard
              icon={CheckCircle2}
              tone="green"
              label="Completed"
              value={completion.completed}
              hint={`${pct(completion.completed, invitedTotal)}% completion rate`}
            />
            <StatCard
              icon={ClipboardCheck}
              tone="amber"
              label="Pending review"
              value={toReview.length}
              hint="Waiting on a reviewer"
            />
          </StatGrid>

          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="flex min-w-0 flex-col gap-5">
              <Card>
                <CardHeader
                  title="Assessment library"
                  action={
                    shown.length > 4 && (
                      <Button
                        variant="link"
                        size="sm"
                        rightIcon={<ArrowRight />}
                        onClick={() => setShowAll((v) => !v)}
                      >
                        {showAll ? 'Show fewer' : `View all ${shown.length}`}
                      </Button>
                    )
                  }
                />
                <div className="px-5 pb-5">
                  <Tabs
                    aria-label="Assessment status"
                    value={tab}
                    onValueChange={(v) => {
                      setTab(v as AssessmentStatus);
                      setShowAll(false);
                    }}
                    items={[
                      { value: 'active', label: 'Active', count: active.length },
                      { value: 'draft', label: 'Drafts', count: byStatus('draft').length },
                      { value: 'archived', label: 'Archived', count: byStatus('archived').length },
                    ]}
                    className="mb-4"
                  />
                  {visible.length === 0 ? (
                    <EmptyState
                      compact
                      icon={ClipboardList}
                      title={
                        tab === 'draft'
                          ? 'No drafts'
                          : tab === 'archived'
                            ? 'Nothing archived'
                            : 'No active assessments'
                      }
                      description="Create an assessment to start inviting candidates."
                      action={
                        <Button
                          size="sm"
                          leftIcon={<Plus />}
                          onClick={() => router.push('/assessments/new')}
                        >
                          Create assessment
                        </Button>
                      }
                    />
                  ) : (
                    <div className="grid gap-3 md:grid-cols-2">
                      {visible.map((a) => {
                        const own = invites.filter((i) => i.assessmentId === a.id);
                        const decided = own.filter((i) => i.decision);
                        return (
                          <AssessmentCard
                            key={a.id}
                            assessment={a}
                            invited={own.length}
                            passRate={
                              decided.length
                                ? pct(
                                    decided.filter((i) => i.decision === 'Passed').length,
                                    decided.length,
                                  )
                                : null
                            }
                            actions={
                              <RowActions label={`Actions for ${a.name}`}>
                                <MenuItem onSelect={() => router.push(`/assessments/${a.id}`)}>
                                  View details
                                </MenuItem>
                                <MenuItem onSelect={() => router.push(`/assessments/${a.id}/edit`)}>
                                  Edit
                                </MenuItem>
                                {a.status === 'active' && (
                                  <MenuItem onSelect={() => setInviting(a.id)}>
                                    Invite candidates
                                  </MenuItem>
                                )}
                                {a.status === 'draft' && (
                                  <MenuItem
                                    onSelect={() => moveTo(a, 'active', 'Assessment published')}
                                  >
                                    Publish
                                  </MenuItem>
                                )}
                                <MenuItem
                                  onSelect={() => {
                                    setAssessments((list) => [
                                      {
                                        ...a,
                                        id: crypto.randomUUID(),
                                        name: `${a.name} (copy)`,
                                        status: 'draft',
                                      },
                                      ...list,
                                    ]);
                                    toast.success('Copied to drafts', a.name);
                                  }}
                                >
                                  Duplicate
                                </MenuItem>
                                {a.status === 'archived' ? (
                                  <MenuItem
                                    onSelect={() => moveTo(a, 'draft', 'Restored to drafts')}
                                  >
                                    Restore
                                  </MenuItem>
                                ) : (
                                  <MenuItem
                                    danger
                                    onSelect={() => moveTo(a, 'archived', 'Assessment archived')}
                                  >
                                    Archive
                                  </MenuItem>
                                )}
                              </RowActions>
                            }
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>

              <Card>
                <CardHeader title="Recent results" />
                <div className="px-5 pb-4">
                  {recent.length === 0 ? (
                    <EmptyState
                      compact
                      icon={ClipboardCheck}
                      title="No results yet"
                      description="Submissions show up here once invited candidates finish."
                    />
                  ) : (
                    <Table>
                      <THead>
                        <tr>
                          <TH>Candidate</TH>
                          <TH>Score</TH>
                          <TH>Submitted</TH>
                          <TH>Result</TH>
                        </tr>
                      </THead>
                      <TBody>
                        {recent.map((r) => {
                          const a = byId.get(r.assessmentId)!;
                          const score = resultOf(a, r);
                          return (
                            <TR
                              key={r.id}
                              interactive
                              {...rowLinkProps(`Review ${r.candidate}, ${a.name}`, () =>
                                router.push(resultHref(a.id, r.id)),
                              )}
                            >
                              <TD>
                                <CellStack primary={r.candidate} secondary={a.name} />
                              </TD>
                              <TD className="whitespace-nowrap">
                                {score.percent === null ? (
                                  <span className="text-fg-muted">In review</span>
                                ) : (
                                  <span className="font-semibold tnum">{score.percent} / 100</span>
                                )}
                              </TD>
                              <TD className="whitespace-nowrap text-fg-muted">
                                {formatWhen(r.submittedOn)}
                              </TD>
                              <TD>
                                <StatusBadge status={r.decision ?? 'Review'} />
                              </TD>
                            </TR>
                          );
                        })}
                      </TBody>
                    </Table>
                  )}
                </div>
              </Card>
            </div>

            <div className="flex min-w-0 flex-col gap-5">
              <Card>
                <CardHeader
                  title="Needs your attention"
                  action={
                    <span className="text-sm font-medium text-accent-foreground tnum">
                      {toReview.length + toRemind.length} pending
                    </span>
                  }
                />
                {toReview.length + toRemind.length === 0 ? (
                  <EmptyState
                    compact
                    icon={CheckCircle2}
                    title="All caught up"
                    description="New submissions show up here."
                  />
                ) : (
                  <ul className="px-5 pb-2">
                    {[...toReview.slice(0, 5), ...toRemind].map((item) => {
                      const a = byId.get(item.assessmentId);
                      const review = item.status === 'Completed';
                      return (
                        <li
                          key={item.id}
                          className="border-b border-border-subtle py-3 last:border-b-0"
                        >
                          <p className="text-base font-medium text-fg">{item.candidate}</p>
                          <p className="text-xs text-fg-subtle">{a?.name}</p>
                          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs text-fg-muted">
                              {review
                                ? `Submitted ${formatWhen(item.submittedOn)}`
                                : 'Started, not submitted'}
                            </span>
                            {review ? (
                              <Link
                                href={resultHref(item.assessmentId, item.id)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-accent-foreground hover:underline"
                              >
                                Review submission <ArrowRight className="size-3.5" aria-hidden />
                              </Link>
                            ) : (
                              <Button
                                variant="link"
                                size="xs"
                                rightIcon={<ArrowRight />}
                                onClick={() =>
                                  toast.success('Reminder sent', `${item.candidate} · ${a?.name}`)
                                }
                              >
                                Send reminder
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader title="Completion overview" />
                <div className="space-y-4 px-5 pb-5">
                  {(
                    [
                      ['Completed', completion.completed, 'green'],
                      ['In progress', completion.inProgress, 'primary'],
                      ['Not started', completion.notStarted, 'gray'],
                    ] as const
                  ).map(([label, value, tone]) => (
                    <ProgressRow
                      key={label}
                      label={label}
                      value={value}
                      max={invitedTotal}
                      tone={tone}
                      display={`${value} (${pct(value, invitedTotal)}%)`}
                    />
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      <InviteModal
        opened={inviting !== false}
        initialAssessment={inviting || null}
        assessments={active}
        onClose={() => setInviting(false)}
        onInvite={(id, emails) => {
          addInvites(id, emails);
          toast.success(
            `${emails.length} ${emails.length === 1 ? 'candidate' : 'candidates'} invited`,
            byId.get(id)?.name,
          );
        }}
      />
    </>
  );
}

function AssessmentCard({
  assessment: a,
  invited,
  passRate,
  actions,
}: {
  assessment: Assessment;
  invited: number;
  passRate: number | null;
  actions: ReactNode;
}) {
  const items = questionsOf(a).length;
  return (
    <div className="flex flex-col rounded-lg border border-border-subtle p-4">
      <div className="flex items-start gap-3">
        <IconDisc icon={iconFor(a)} tone={a.tone} size="md" className="rounded-lg" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/assessments/${a.id}`}
            className="block truncate text-base font-semibold text-fg hover:underline"
          >
            {a.name}
          </Link>
          <p className="truncate text-xs text-fg-subtle">
            {a.type} · {a.department}
          </p>
        </div>
        {actions}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3.5" aria-hidden />
          {a.minutes} min
        </span>
        <span>
          {items} {items === 1 ? 'question' : 'questions'}
        </span>
        {a.status === 'active' && <span className="text-tone-green-fg">Active</span>}
        {a.status === 'draft' && <Badge size="sm">Draft</Badge>}
        {a.status === 'archived' && <Badge size="sm">Archived</Badge>}
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-fg-muted tnum">
          {invited} invited{passRate !== null && ` · ${passRate}% pass rate`}
        </span>
        <Link
          href={`/assessments/${a.id}`}
          aria-label={`View details for ${a.name}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-accent-foreground hover:underline"
        >
          View details <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, History, RotateCcw, Square } from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CellStack,
  ConfirmDialog,
  Drawer,
  EmptyState,
  NumberInput,
  RadioGroup,
  FilterSelect,
  SkeletonRows,
  Switch,
  toast,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { StepIcon } from '@/components/workflow/StepNode';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { defOf } from './catalog';
import { toneOf } from './StepFlowNode';
import {
  runLabel,
  runTone,
  workflowKeys,
  type Lookups,
  type RunDetail,
  type RunRow,
  type Version,
  type WorkflowDetail,
} from './workflow-api';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'InProgress', label: 'In progress' },
  { value: 'Failed', label: 'Failed' },
  { value: 'Completed', label: 'Finished' },
  { value: 'Cancelled', label: 'Stopped' },
];

/** Every run of the workflow, failed first, with each step's log in a drawer. */
export function RunsTab({
  workflowId,
  initialFilter,
  initialRun,
}: {
  workflowId: string;
  initialFilter?: string;
  /** A run to open straight away, from an activity history link. */
  initialRun?: string;
}) {
  const [filter, setFilter] = useState(initialFilter ?? 'all');
  const [open, setOpen] = useState<string | null>(initialRun ?? null);
  const status = filter === 'all' ? null : filter;
  const runs = useQuery({
    queryKey: workflowKeys.runs(workflowId, status),
    queryFn: () =>
      api.get<RunRow[]>(`/api/workflows/${workflowId}/runs${status ? `?status=${status}` : ''}`),
    refetchInterval: 15_000,
  });
  const columns: Column<RunRow>[] = [
    {
      id: 'candidate',
      header: 'Candidate',
      hideable: false,
      sortValue: (r) => r.candidateName,
      cell: (r) => <CellStack primary={r.candidateName} secondary={r.jobTitle} />,
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => (
        <Badge tone={runTone[r.status]} dot>
          {runLabel[r.status]}
        </Badge>
      ),
    },
    {
      id: 'step',
      header: 'Where it is',
      cell: (r) =>
        r.status === 'Failed' || (r.lastError && r.status !== 'Completed') ? (
          <span
            className={cn(
              'line-clamp-2 max-w-96 text-sm',
              r.status === 'Failed' ? 'text-tone-red-fg' : 'text-fg-muted',
            )}
          >
            {r.lastError}
          </span>
        ) : (
          <span className="text-sm text-fg-muted">
            {r.status === 'Completed' ? 'Finished' : r.currentStep}
            {r.status === 'Waiting' && !r.nextRunAt && ' · waiting for an answer'}
            {r.status === 'Waiting' && r.nextRunAt && ` · goes on ${formatDateTime(r.nextRunAt)}`}
            {r.status === 'Running' &&
              r.attempts > 0 &&
              r.nextRunAt &&
              ` · trying again ${formatDateTime(r.nextRunAt)}`}
          </span>
        ),
    },
    {
      id: 'started',
      header: 'Started',
      sortValue: (r) => new Date(r.startedAt),
      csv: (r) => r.startedAt,
      cell: (r) => <span className="text-fg-muted">{formatRelative(r.startedAt)}</span>,
    },
    {
      id: 'version',
      header: 'Version',
      align: 'right',
      defaultHidden: true,
      sortValue: (r) => r.versionNumber,
      cell: (r) => <span className="tnum text-fg-muted">{r.versionNumber}</span>,
    },
  ];
  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <Card className="px-5 pb-2">
        <DataTable
          data={runs.data ?? []}
          columns={columns}
          getRowId={(r) => r.id}
          viewKey="workflow-runs"
          noun="run"
          loading={runs.isLoading}
          onRowOpen={(r) => setOpen(r.id)}
          rowLabel={(r) => `Open the run for ${r.candidateName}`}
          exportName="workflow-runs"
          toolbar={
            <FilterSelect
              value={filter === 'all' ? null : filter}
              onChange={(x) => setFilter(x ?? 'all')}
              data={FILTERS.slice(1)}
              allLabel="All runs"
            />
          }
          empty={
            <EmptyState
              icon={History}
              title={filter === 'all' ? 'No runs yet' : 'No runs here'}
              description={
                filter === 'all'
                  ? 'Each time the workflow starts for an application, the run shows here with what every step did.'
                  : 'Pick All to see every run.'
              }
            />
          }
        />
      </Card>
      <RunDrawer runId={open} onClose={() => setOpen(null)} />
    </div>
  );
}

export function RunDrawer({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const run = useQuery({
    queryKey: workflowKeys.run(runId ?? ''),
    queryFn: () => api.get<RunDetail>(`/api/workflow-runs/${runId}`),
    enabled: !!runId,
  });
  const [stopping, setStopping] = useState(false);
  const act = useMutation({
    mutationFn: (action: 'retry' | 'cancel') => api.post(`/api/workflow-runs/${runId}/${action}`),
    onSuccess: (_, action) => {
      toast.success(action === 'retry' ? 'Trying again now' : 'Run stopped');
      queryClient.invalidateQueries({ queryKey: ['workflows'] });
      queryClient.invalidateQueries({ queryKey: workflowKeys.run(runId ?? '') });
    },
    onError: (error: Error) => toast.error('That didn’t work', error.message),
  });
  const r = run.data;
  const live = r && (r.status === 'Running' || r.status === 'Waiting' || r.status === 'Failed');
  return (
    <Drawer
      opened={!!runId}
      onClose={onClose}
      size="lg"
      title={r ? r.candidateName : 'Run'}
      description={
        r
          ? `${r.jobTitle} · started ${formatDateTime(r.startedAt)} · version ${r.versionNumber}`
          : undefined
      }
      footer={
        r && (
          <>
            <Button variant="secondary" leftIcon={<ExternalLink />} asChild>
              <Link href={`/applications/${r.applicationId}`}>Open application</Link>
            </Button>
            {live && (
              <Button
                variant="danger-quiet"
                leftIcon={<Square />}
                onClick={() => setStopping(true)}
              >
                Stop run
              </Button>
            )}
            {r.status === 'Failed' && (
              <Button
                leftIcon={<RotateCcw />}
                loading={act.isPending}
                onClick={() => act.mutate('retry')}
              >
                Try again
              </Button>
            )}
          </>
        )
      }
    >
      {!r ? (
        <SkeletonRows rows={5} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={runTone[r.status]} dot>
              {runLabel[r.status]}
            </Badge>
            {r.nextRunAt && (r.status === 'Waiting' || r.attempts > 0) && (
              <span className="text-sm text-fg-muted">
                {r.status === 'Waiting' ? 'Goes on' : 'Tries again'} {formatDateTime(r.nextRunAt)}
              </span>
            )}
          </div>
          {r.lastError && (
            <Alert
              tone={
                r.status === 'Failed' ? 'danger' : r.status === 'Cancelled' ? 'info' : 'warning'
              }
            >
              {r.lastError}
              {r.status === 'Failed' &&
                ' Fix the cause, then try again. Steps that already ran are not repeated.'}
            </Alert>
          )}
          <ol className="relative space-y-3 before:absolute before:top-4 before:bottom-4 before:left-[17px] before:w-px before:bg-border">
            {r.steps.map((s) => {
              const def = defOf(s.kind);
              return (
                <li key={s.id} className="relative flex gap-3">
                  <StepIcon
                    icon={def.icon}
                    tone={toneOf(def.group)}
                    className="relative z-10 size-9 ring-4 ring-card"
                  />
                  <div className="min-w-0 flex-1 rounded-lg border border-border-subtle p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium text-fg">{s.title}</p>
                      <span className="flex items-center gap-2 text-2xs text-fg-subtle">
                        {s.branch && <Badge size="sm">{s.branch}</Badge>}
                        <StepStatus status={s.status} />
                        {formatDateTime(s.finishedAt ?? s.startedAt)}
                      </span>
                    </div>
                    {s.output && <p className="mt-1 text-sm text-fg-muted">{s.output}</p>}
                    {s.error && (
                      <p className="mt-1 flex gap-1.5 text-sm text-tone-red-fg">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        {s.error}
                        {s.attempts > 1 && ` (tried ${s.attempts} times)`}
                      </p>
                    )}
                    {s.emails?.map((e) => (
                      <div
                        key={e.id}
                        className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs"
                      >
                        <span className="min-w-0 truncate text-fg">
                          {e.recipient}: “{e.subject}”
                        </span>
                        <Badge size="sm" tone={emailTone(e.status)}>
                          {emailLabel(e.status)}
                        </Badge>
                      </div>
                    ))}
                    {s.webhook && (
                      <p className="mt-2 text-xs text-fg-muted">
                        The other app answered{' '}
                        {s.webhook.lastStatusCode
                          ? `with ${s.webhook.lastStatusCode}`
                          : 'nothing yet'}{' '}
                        ·{' '}
                        {s.webhook.status === 'Succeeded'
                          ? 'delivered'
                          : s.webhook.status.toLowerCase()}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      <ConfirmDialog
        opened={stopping}
        onClose={() => setStopping(false)}
        title="Stop this run?"
        message="The steps left are not done for this application. Steps that already ran stay done."
        confirmLabel="Stop run"
        onConfirm={() => act.mutate('cancel')}
      />
    </Drawer>
  );
}

function StepStatus({ status }: { status: string }) {
  const tone = { Done: 'green', Skipped: 'gray', Waiting: 'violet', Failed: 'red' } as const;
  const label = { Done: 'Done', Skipped: 'Skipped', Waiting: 'Waiting', Failed: 'Failed' } as const;
  return (
    <Badge size="sm" tone={tone[status as keyof typeof tone] ?? 'gray'}>
      {label[status as keyof typeof label] ?? status}
    </Badge>
  );
}

const emailLabel = (status: string | null) =>
  ({
    Pending: 'Queued',
    Processing: 'Sending',
    Succeeded: 'Sent',
    Failed: 'Not sent',
    sent: 'Sent',
    delivered: 'Delivered',
    opened: 'Opened',
    bounced: 'Bounced',
    failed: 'Not sent',
    suppressed: 'Blocked',
  })[status ?? ''] ?? 'Queued';
const emailTone = (status: string | null) =>
  ['Failed', 'bounced', 'failed', 'suppressed'].includes(status ?? '')
    ? 'red'
    : ['delivered', 'opened', 'Succeeded', 'sent'].includes(status ?? '')
      ? 'green'
      : 'gray';

/** Published versions, newest first. Loading one makes it the draft. */
export function VersionsTab({
  workflow,
  onLoad,
}: {
  workflow: WorkflowDetail;
  onLoad: (versionId: string) => void;
}) {
  const versions = useQuery({
    queryKey: workflowKeys.versions(workflow.id),
    queryFn: () => api.get<Version[]>(`/api/workflows/${workflow.id}/versions`),
  });
  const [loading, setLoading] = useState<Version | null>(null);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 p-4 sm:p-6">
      {workflow.hasUnpublishedChanges && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-dashed p-4">
          <div>
            <p className="font-medium text-fg">Draft</p>
            <p className="text-sm text-fg-muted">
              Changes you have not published. Runs keep using the published version until you
              publish.
            </p>
          </div>
          <Badge tone="amber">Not published</Badge>
        </Card>
      )}
      {versions.isLoading && <SkeletonRows rows={3} />}
      {versions.data?.length === 0 && (
        <Card>
          <EmptyState
            icon={History}
            title="Nothing published yet"
            description="Publish the workflow to make version 1. Every publish keeps a copy you can go back to."
          />
        </Card>
      )}
      {versions.data?.map((v) => (
        <Card key={v.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium text-fg">
              Version {v.number}
              {v.isCurrent && (
                <Badge tone="green" size="sm">
                  Running now
                </Badge>
              )}
            </p>
            <p className="text-sm text-fg-subtle">
              {v.publishedBy} · {formatDateTime(v.publishedAt)} · {v.steps}{' '}
              {v.steps === 1 ? 'step' : 'steps'}
            </p>
            <p className="mt-1.5 text-sm text-fg-muted">{v.summary}</p>
            {v.note && <p className="mt-1 text-sm text-fg italic">“{v.note}”</p>}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setLoading(v)}>
            Load as draft
          </Button>
        </Card>
      ))}
      <ConfirmDialog
        opened={!!loading}
        onClose={() => setLoading(null)}
        title={`Load version ${loading?.number} as the draft?`}
        message="It replaces the draft you are editing. Runs don’t change until you publish."
        confirmLabel="Load as draft"
        confirmVariant="primary"
        onConfirm={() => {
          if (loading) onLoad(loading.id);
        }}
      />
    </div>
  );
}

/** Entry rules. They apply at once, without publishing. */
export function SettingsTab({
  workflow,
  lookups,
  onSave,
  saving,
}: {
  workflow: WorkflowDetail;
  lookups: Lookups | undefined;
  onSave: (patch: Partial<WorkflowDetail>) => void;
  saving: boolean;
}) {
  const quiet = lookups?.quietHours;
  const hour = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4 sm:p-6">
      <Card className="space-y-6 p-5">
        <div>
          <h2 className="text-lg font-semibold text-fg">Who goes through it</h2>
          <p className="mt-1 text-sm text-fg-muted">
            These rules apply straight away. You don’t need to publish.
          </p>
        </div>
        <RadioGroup
          aria-label="How often one application can go through it"
          value={workflow.runsOncePerApplication ? 'once' : 'every'}
          onValueChange={(x) => onSave({ runsOncePerApplication: x === 'once' })}
          options={[
            {
              value: 'once',
              label: 'Once per application',
              description: 'Someone who already went through it never starts again.',
            },
            {
              value: 'every',
              label: 'Every time it starts',
              description: 'For example, every time they move into the stage again.',
            },
          ]}
        />
        {!workflow.runsOncePerApplication && (
          <NumberInput
            label="Most times for one application"
            description="Leave empty for no limit."
            className="max-w-60"
            min={1}
            max={100}
            value={workflow.maxRunsPerApplication ?? ''}
            onValueChange={(n) =>
              onSave({
                maxRunsPerApplication: n === '' ? 0 : Math.round(n),
              } as Partial<WorkflowDetail>)
            }
          />
        )}
        <div className="divide-y divide-border-subtle border-t border-border-subtle [&>*]:py-4">
          <Switch
            labelPosition="left"
            label="Stop when the application closes"
            description="A run ends as soon as the candidate is rejected, withdraws or is hired. Runs started by a rejection still finish."
            checked={workflow.stopWhenClosed}
            disabled={saving}
            onCheckedChange={(on) => onSave({ stopWhenClosed: on })}
          />
          <Switch
            labelPosition="left"
            label="Respect quiet hours"
            description={
              quiet
                ? `Emails and alerts wait until ${hour(quiet.end)} when they fall between ${hour(quiet.start)} and ${hour(quiet.end)} (${quiet.timeZone}).`
                : 'Your workspace has no quiet hours, so this changes nothing today. Set them in Reminders and alerts.'
            }
            checked={workflow.respectQuietHours}
            disabled={saving}
            onCheckedChange={(on) => onSave({ respectQuietHours: on })}
          />
        </div>
      </Card>
      {workflow.builtInKey === 'stage-assessment' ? (
        <Alert tone="info">
          This is a built-in workflow. You can change it or pause it, but not delete it.
        </Alert>
      ) : (
        workflow.builtInKey && (
          <Alert tone="info">
            This is a built-in reminder. You can change it or pause it, but not delete it. Its day
            count and limit are also on the{' '}
            <Link href="/settings/alerts" className="font-medium text-accent-foreground underline">
              Reminders and alerts
            </Link>{' '}
            page.
          </Alert>
        )
      )}
    </div>
  );
}

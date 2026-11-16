'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus, Workflow as WorkflowIcon } from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CellStack,
  ConfirmDialog,
  EmptyState,
  FilterSelect,
  Input,
  MenuItem,
  MenuSeparator,
  Modal,
  RowActions,
  SearchInput,
  Switch,
  toast,
  toneDot,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { StepIcon } from '@/components/workflow/StepNode';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { defOf } from './catalog';
import { toneOf } from './StepFlowNode';
import { TEMPLATES, type Template } from './templates';
import {
  runLabel,
  runTone,
  statusTone,
  useLookups,
  useWorkflowList,
  workflowKeys,
  type WorkflowRow,
} from './workflow-api';

const STATUS_LABEL = {
  Draft: 'Not published',
  Active: 'On',
  Paused: 'Paused',
  Archived: 'Archived',
} as const;

export function WorkflowList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const list = useWorkflowList();
  const lookups = useLookups().data;
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<WorkflowRow | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: workflowKeys.list });

  const open = (w: WorkflowRow) => router.push(`/settings/workflows/${w.id}`);
  const toggle = useMutation({
    mutationFn: ({ w, on }: { w: WorkflowRow; on: boolean }) =>
      api.post(`/api/workflows/${w.id}/${on ? 'resume' : 'pause'}`),
    // Optimistic: the switch moves at once and goes back if the change is refused.
    onMutate: ({ w, on }) => {
      queryClient.setQueryData<WorkflowRow[]>(workflowKeys.list, (rows) =>
        rows?.map((r) => (r.id === w.id ? { ...r, status: on ? 'Active' : 'Paused' } : r)),
      );
    },
    onSuccess: (_, { w, on }) => toast.success(on ? 'Workflow is on' : 'Workflow paused', w.name),
    onError: (error: Error, { w }) => {
      toast.error(`Could not change “${w.name}”`, error.message, {
        action: { label: 'Open', onClick: () => open(w) },
      });
    },
    onSettled: refresh,
  });
  const duplicate = useMutation({
    mutationFn: (w: WorkflowRow) =>
      api.post<{ id: string; name: string }>(`/api/workflows/${w.id}/duplicate`),
    onSuccess: (copy) => {
      toast.success('Workflow copied', copy.name);
      refresh();
    },
    onError: (error: Error) => toast.error('Could not copy it', error.message),
  });
  const restore = useMutation({
    mutationFn: (w: WorkflowRow) => api.post(`/api/workflows/${w.id}/restore`),
    onSuccess: () => {
      toast.success('Workflow restored', 'It is paused until you turn it on.');
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (w: WorkflowRow) => api.delete<{ archived: boolean }>(`/api/workflows/${w.id}`),
    onSuccess: (r, w) => {
      toast.success(r.archived ? 'Workflow archived' : 'Workflow deleted', w.name);
      refresh();
    },
    onError: (error: Error) => toast.error('Could not delete it', error.message),
  });

  const all = list.data ?? [];
  const builtIn = all.filter((w) => w.builtInKey);
  const q = query.trim().toLowerCase();
  const rows = all.filter(
    (w) =>
      !w.builtInKey &&
      (status ? w.status === status : w.status !== 'Archived') &&
      (!q || w.name.toLowerCase().includes(q)),
  );

  const columns: Column<WorkflowRow>[] = [
    {
      id: 'name',
      header: 'Workflow',
      hideable: false,
      sortValue: (w) => w.name,
      cell: (w) => (
        <CellStack
          primary={w.name}
          secondary={
            w.trigger
              ? defOf(w.trigger.kind).summary(w.trigger.values, lookups)
              : 'No starting step yet'
          }
          className="max-w-96"
        />
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (w) => w.status,
      csv: (w) => STATUS_LABEL[w.status],
      cell: (w) => <StatusCell w={w} onToggle={(on) => toggle.mutate({ w, on })} />,
    },
    {
      id: 'lastRun',
      header: 'Last run',
      sortValue: (w) => (w.lastRunAt ? new Date(w.lastRunAt) : null),
      csv: (w) => w.lastRunAt,
      cell: (w) =>
        w.lastRunAt && w.lastRunStatus ? (
          <span
            className="inline-flex items-center gap-2 text-fg-muted"
            title={runLabel[w.lastRunStatus]}
          >
            <span
              aria-hidden
              className={cn('size-2 rounded-full', toneDot(runTone[w.lastRunStatus]))}
            />
            {formatRelative(w.lastRunAt)}
            <span className="sr-only">, {runLabel[w.lastRunStatus]}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">Never</span>
        ),
    },
    {
      id: 'runs',
      header: 'Runs in 30 days',
      align: 'right',
      sortValue: (w) => w.runs30,
      cell: (w) => <span className="tnum">{w.runs30}</span>,
    },
    {
      id: 'failed',
      header: 'Failed',
      align: 'right',
      sortValue: (w) => w.failed,
      cell: (w) =>
        w.failed > 0 ? (
          <Link
            href={`/settings/workflows/${w.id}?tab=runs&status=Failed`}
            onClick={(e) => e.stopPropagation()}
            className="tnum font-medium text-tone-red-fg hover:underline"
          >
            {w.failed}
          </Link>
        ) : (
          <span className="tnum text-fg-subtle">0</span>
        ),
    },
    {
      id: 'owner',
      header: 'Owner',
      sortValue: (w) => w.owner,
      defaultHidden: true,
      cell: (w) => <span className="text-fg-muted">{w.owner}</span>,
    },
    {
      id: 'edited',
      header: 'Edited',
      sortValue: (w) => new Date(w.updatedAt),
      csv: (w) => w.updatedAt,
      cell: (w) => (
        <CellStack
          primary={<span className="font-normal text-fg-muted">{formatRelative(w.updatedAt)}</span>}
          secondary={w.updatedBy ?? undefined}
        />
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      label: 'Actions',
      hideable: false,
      align: 'right',
      // Menu clicks bubble through the portal to the row; stop them so the row doesn't open.
      cell: (w) => (
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <RowActions label={`Actions for ${w.name}`}>
            <MenuItem onSelect={() => open(w)}>Open</MenuItem>
            <MenuItem onSelect={() => router.push(`/settings/workflows/${w.id}?tab=runs`)}>
              See runs
            </MenuItem>
            <MenuItem onSelect={() => duplicate.mutate(w)}>Make a copy</MenuItem>
            {w.status === 'Archived' ? (
              <MenuItem onSelect={() => restore.mutate(w)}>Restore</MenuItem>
            ) : (
              <>
                <MenuSeparator />
                <MenuItem danger onSelect={() => setDeleting(w)}>
                  {w.runs30 > 0 || w.lastRunAt ? 'Archive' : 'Delete'}
                </MenuItem>
              </>
            )}
          </RowActions>
        </span>
      ),
    },
  ];

  const hasRuns = !!deleting?.lastRunAt;
  return (
    <>
      <SettingsHeader
        actions={
          <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
            Create workflow
          </Button>
        }
      />
      <Card className="px-5 pb-2">
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(w) => w.id}
          viewKey="workflows"
          noun="workflow"
          loading={list.isLoading}
          onRowOpen={open}
          rowLabel={(w) => `Open ${w.name}`}
          exportName="workflows"
          toolbar={
            <>
              <SearchInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search workflows"
                className="w-full sm:w-64"
              />
              <FilterSelect
                value={status}
                onChange={setStatus}
                data={[
                  { value: 'Active', label: 'On' },
                  { value: 'Paused', label: 'Paused' },
                  { value: 'Draft', label: 'Not published' },
                  { value: 'Archived', label: 'Archived' },
                ]}
                allLabel="All statuses"
              />
            </>
          }
          empty={
            <EmptyState
              icon={WorkflowIcon}
              title={
                all.some((w) => !w.builtInKey)
                  ? 'No workflows match'
                  : 'No workflows of your own yet'
              }
              description={
                all.some((w) => !w.builtInKey)
                  ? 'Try another search or status.'
                  : 'Start from a template to automate a hiring task you do often.'
              }
              action={
                all.some((w) => !w.builtInKey) ? undefined : (
                  <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
                    Create workflow
                  </Button>
                )
              }
            />
          }
        />
      </Card>

      {builtIn.length > 0 && (
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-fg">Built-in workflows</h2>
              <p className="mt-1 text-sm text-fg-muted">
                Reminders and steps we set up for you. Turn them on or off, or change them. They
                can’t be deleted.
              </p>
            </div>
            <Button variant="link" size="sm" asChild>
              <Link href="/settings/alerts">Change days and limits</Link>
            </Button>
          </div>
          <ul className="mt-3 divide-y divide-border-subtle">
            {builtIn.map((w) => {
              const def = w.trigger ? defOf(w.trigger.kind) : null;
              return (
                <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
                  {def && <StepIcon icon={def.icon} tone={toneOf(def.group)} />}
                  <Link
                    href={`/settings/workflows/${w.id}`}
                    className="group min-w-0 flex-1 basis-60"
                  >
                    <span className="block font-medium text-fg group-hover:underline">
                      {w.name}
                    </span>
                    <span className="block truncate text-sm text-fg-subtle">
                      {def && w.trigger ? def.summary(w.trigger.values, lookups) : ''}
                      {` · ${w.runs30} ${w.runs30 === 1 ? 'run' : 'runs'} in 30 days`}
                      {w.failed > 0 && ` · ${w.failed} failed`}
                    </span>
                  </Link>
                  <StatusCell w={w} onToggle={(on) => toggle.mutate({ w, on })} />
                  <ArrowRight className="size-4 text-fg-subtle max-sm:hidden" aria-hidden />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <CreateWorkflowModal opened={creating} onClose={() => setCreating(false)} />
      <ConfirmDialog
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title={hasRuns ? 'Archive this workflow?' : 'Delete this workflow?'}
        message={
          deleting &&
          (hasRuns
            ? `“${deleting.name}” stops, and runs in progress are stopped. Its run history is kept, and you can restore it later.`
            : `“${deleting.name}” has never run. It and its versions are removed for good.`)
        }
        confirmLabel={hasRuns ? 'Archive workflow' : 'Delete workflow'}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting);
        }}
      />
    </>
  );
}

function StatusCell({ w, onToggle }: { w: WorkflowRow; onToggle: (on: boolean) => void }) {
  if (w.status === 'Draft' || w.status === 'Archived')
    return (
      <Badge tone={statusTone[w.status]} dot>
        {STATUS_LABEL[w.status]}
      </Badge>
    );
  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Switch
        checked={w.status === 'Active'}
        onCheckedChange={onToggle}
        label={STATUS_LABEL[w.status]}
        aria-label={`${w.status === 'Active' ? 'Pause' : 'Turn on'} ${w.name}`}
      />
    </span>
  );
}

function CreateWorkflowModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const router = useRouter();
  const [template, setTemplate] = useState<Template>(TEMPLATES[0]);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const finalName = name.trim() || (template.id === 'blank' ? '' : template.name);
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/api/workflows', { name: finalName, graph: template.build() }),
    onSuccess: ({ id }) => router.push(`/settings/workflows/${id}`),
    onError: (error: Error) => toast.error('Could not create it', error.message),
  });
  const submit = () => {
    setTouched(true);
    if (finalName) create.mutate();
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title="Create workflow"
      description="Pick a starting point. You can change every step afterwards, and nothing runs until you publish."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={create.isPending} onClick={submit}>
            Create and open
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div role="radiogroup" aria-label="Starting point" className="grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => {
            const on = t.id === template.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTemplate(t)}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  on ? 'border-primary bg-accent' : 'border-border hover:border-primary/50',
                  t.id === 'blank' && 'border-dashed',
                )}
              >
                <span className="flex items-center gap-1">
                  {t.preview.length ? (
                    t.preview.map((kind, i) => {
                      const def = defOf(kind);
                      return (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span aria-hidden className="h-px w-2 bg-border" />}
                          <StepIcon
                            icon={def.icon}
                            tone={toneOf(def.group)}
                            className="size-6 [&_svg]:size-3.5"
                          />
                        </span>
                      );
                    })
                  ) : (
                    <span className="flex size-6 items-center justify-center rounded-md border border-dashed border-border text-fg-subtle">
                      <Plus className="size-3.5" aria-hidden />
                    </span>
                  )}
                </span>
                <span className="text-base font-semibold text-fg">{t.name}</span>
                <span className="text-sm text-fg-muted">{t.description}</span>
              </button>
            );
          })}
        </div>
        <Input
          label="Name"
          placeholder={template.id === 'blank' ? 'For example, Reference check' : template.name}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          error={touched && !finalName ? 'Give the workflow a name.' : undefined}
          maxLength={160}
        />
      </form>
    </Modal>
  );
}

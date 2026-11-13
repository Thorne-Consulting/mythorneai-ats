'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Workflow as WorkflowIcon } from 'lucide-react';
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
  RadioGroup,
  RowActions,
  SearchInput,
  toast,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { formatRelative } from '@/lib/format';
import { PreviewAlert } from '../preview-ui';
import { defOf, titleOf } from './catalog';
import { validate } from './graph';
import {
  TEMPLATES,
  createWorkflow,
  statusTone,
  toGraph,
  uid,
  useWorkflows,
  type TemplateName,
  type Workflow,
} from './sample-workflows';

export function WorkflowList() {
  const router = useRouter();
  const { workflows, ready, update } = useWorkflows();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Workflow | null>(null);

  const open = (w: Workflow) => router.push(`/admin/workflows/${w.id}`);
  const patch = (id: string, change: Partial<Workflow>) =>
    update((all) => all.map((w) => (w.id === id ? { ...w, ...change } : w)));
  const setActive = (w: Workflow, on: boolean) => {
    if (on) {
      const problems = validate(toGraph(w.nodes), w.edges);
      if (problems.length) {
        toast.error(`“${w.name}” can’t be activated`, problems[0].message);
        return;
      }
    }
    patch(w.id, { status: on ? 'Active' : 'Paused' });
    toast.success(on ? 'Workflow activated' : 'Workflow paused', w.name);
  };
  const duplicate = (w: Workflow) => {
    const copy: Workflow = {
      ...structuredClone(w),
      id: uid(),
      name: `${w.name} (copy)`,
      status: 'Draft',
      runsThisWeek: 0,
      updatedAt: new Date().toISOString(),
      versions: [],
    };
    update((all) => [copy, ...all]);
    toast.success('Workflow duplicated', copy.name);
  };

  const q = query.trim().toLowerCase();
  const rows = workflows.filter(
    (w) => (!status || w.status === status) && (!q || w.name.toLowerCase().includes(q)),
  );

  const triggerOf = (w: Workflow) => w.nodes.find((n) => defOf(n.data.kind).group === 'Triggers');
  const columns: Column<Workflow>[] = [
    {
      id: 'name',
      header: 'Workflow',
      hideable: false,
      sortValue: (w) => w.name,
      cell: (w) => (
        <CellStack
          primary={w.name}
          secondary={`${w.nodes.length} ${w.nodes.length === 1 ? 'step' : 'steps'}`}
        />
      ),
    },
    {
      id: 'trigger',
      header: 'Starts when',
      sortValue: (w) => (triggerOf(w) ? titleOf(triggerOf(w)!.data) : ''),
      cell: (w) => {
        const t = triggerOf(w);
        if (!t) return <span className="text-fg-subtle">Not set</span>;
        return (
          <CellStack
            primary={titleOf(t.data)}
            secondary={defOf(t.data.kind).summary(t.data.values)}
            className="max-w-72"
          />
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (w) => w.status,
      cell: (w) => (
        <Badge tone={statusTone[w.status]} dot>
          {w.status}
        </Badge>
      ),
    },
    {
      id: 'edited',
      header: 'Last edited',
      sortValue: (w) => new Date(w.updatedAt),
      csv: (w) => w.updatedAt,
      cell: (w) => <span className="text-fg-muted">{formatRelative(w.updatedAt)}</span>,
    },
    {
      id: 'runs',
      header: 'Runs this week',
      align: 'right',
      sortValue: (w) => w.runsThisWeek,
      cell: (w) => <span className="tnum">{w.runsThisWeek}</span>,
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
            <MenuItem onSelect={() => duplicate(w)}>Duplicate</MenuItem>
            {w.status === 'Active' ? (
              <MenuItem onSelect={() => setActive(w, false)}>Pause</MenuItem>
            ) : (
              <MenuItem onSelect={() => setActive(w, true)}>Activate</MenuItem>
            )}
            <MenuSeparator />
            <MenuItem danger onSelect={() => setDeleting(w)}>
              Delete
            </MenuItem>
          </RowActions>
        </span>
      ),
    },
  ];

  return (
    <>
      {/* Title and Preview badge come from the Settings shell. */}
      <div className="-mt-1 mb-4 flex justify-end">
        <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
          Create workflow
        </Button>
      </div>
      <PreviewAlert>
        This is a preview. Workflows are saved only in this browser, and nothing is sent to
        candidates.
      </PreviewAlert>
      <Card className="px-5 pb-2">
        <DataTable
          data={rows}
          columns={columns}
          getRowId={(w) => w.id}
          viewKey="preview-workflows"
          noun="workflow"
          loading={!ready}
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
                data={['Active', 'Paused', 'Draft']}
                allLabel="All statuses"
              />
            </>
          }
          empty={
            <EmptyState
              icon={WorkflowIcon}
              title={workflows.length ? 'No workflows match' : 'No workflows yet'}
              description={
                workflows.length
                  ? 'Try another search or status.'
                  : 'Start from a template to automate a hiring task you do often.'
              }
              action={
                workflows.length ? undefined : (
                  <Button leftIcon={<Plus />} onClick={() => setCreating(true)}>
                    Create workflow
                  </Button>
                )
              }
            />
          }
        />
      </Card>

      <CreateWorkflowModal
        opened={creating}
        onClose={() => setCreating(false)}
        onCreate={(name, template) => {
          const w = createWorkflow(name, template);
          update((all) => [w, ...all]);
          router.push(`/admin/workflows/${w.id}`);
        }}
      />
      <ConfirmDialog
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete workflow?"
        message={
          deleting && (
            <>
              “{deleting.name}” and its saved versions will be removed from this browser. This can’t
              be undone.
            </>
          )
        }
        confirmLabel="Delete workflow"
        onConfirm={() => {
          if (!deleting) return;
          update((all) => all.filter((w) => w.id !== deleting.id));
          toast.success('Workflow deleted', deleting.name);
        }}
      />
    </>
  );
}

function CreateWorkflowModal({
  opened,
  onClose,
  onCreate,
}: {
  opened: boolean;
  onClose: () => void;
  onCreate: (name: string, template: TemplateName) => void;
}) {
  const [template, setTemplate] = useState<TemplateName>('Interview acceptance');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const finalName = name.trim() || (template === 'Blank' ? '' : template);
  const submit = () => {
    setTouched(true);
    if (!finalName) return;
    onCreate(finalName, template);
    setName('');
    setTouched(false);
  };
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create workflow"
      description="Pick a starting point. You can change every step afterwards."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Create and open</Button>
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
        <Input
          label="Name"
          placeholder={template === 'Blank' ? 'For example, Reference check' : template}
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          error={touched && !finalName ? 'Give the workflow a name.' : undefined}
          autoFocus
        />
        <fieldset>
          <legend className="mb-2.5 text-sm font-medium text-fg">Template</legend>
          <RadioGroup
            aria-label="Template"
            value={template}
            onValueChange={(v) => setTemplate(v as TemplateName)}
            options={(Object.keys(TEMPLATES) as TemplateName[]).map((t) => ({
              value: t,
              label: t,
              description: TEMPLATES[t].description,
            }))}
          />
        </fieldset>
      </form>
    </Modal>
  );
}

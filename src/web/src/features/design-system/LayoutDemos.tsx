'use client';

import { useState } from 'react';
import { BarChart3, Briefcase, FileText, Settings, Users } from 'lucide-react';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { SavedViews } from '@/components/data-table/SavedViews';
import { SectionNav, SidebarLayout } from '@/components/layout/SectionLayout';
import {
  Button,
  Card,
  CellStack,
  Input,
  SearchInput,
  SplitView,
  Textarea,
  Wizard,
} from '@/components/ui';
import { JobPostingView } from '@/components/careers/JobPostingView';
import { StatusBadge } from '@/components/status';

type Job = {
  id: string;
  title: string;
  dept: string;
  location: string;
  applicants: number;
  status: string;
  updated: string;
};

const jobs: Job[] = Array.from({ length: 32 }, (_, i) => ({
  id: `JOB-${100 + i}`,
  title: ['Software Engineer', 'Product Manager', 'UX Designer', 'Data Analyst', 'Recruiter'][
    i % 5
  ],
  dept: ['Engineering', 'Product', 'Design', 'Analytics', 'People'][i % 5],
  location: ['Manila, PH', 'Remote', 'Cebu, PH'][i % 3],
  applicants: (i * 37) % 90,
  status: ['Open', 'Draft', 'OnHold', 'Closed'][i % 4],
  updated: new Date(2026, 9, 1 + (i % 28)).toISOString(),
}));

const columns: Column<Job>[] = [
  {
    id: 'title',
    header: 'Job title',
    hideable: false,
    cell: (j) => <CellStack primary={j.title} secondary={`${j.dept} · ${j.id}`} />,
    sortValue: (j) => j.title,
  },
  { id: 'location', header: 'Location', cell: (j) => j.location, sortValue: (j) => j.location },
  {
    id: 'applicants',
    header: 'Applicants',
    align: 'right',
    cell: (j) => <span className="tnum">{j.applicants}</span>,
    sortValue: (j) => j.applicants,
  },
  {
    id: 'status',
    header: 'Status',
    cell: (j) => <StatusBadge status={j.status} />,
    sortValue: (j) => j.status,
  },
  {
    id: 'updated',
    header: 'Updated',
    defaultHidden: true,
    cell: (j) => new Date(j.updated).toLocaleDateString(),
    sortValue: (j) => new Date(j.updated),
  },
];

type Filter = { status: string | null; q: string };

/** Gallery demos for the layout building blocks (second sidebar, data table, split view, wizard). */
export function LayoutDemos() {
  const [filter, setFilter] = useState<Filter>({ status: null, q: '' });
  const [viewId, setViewId] = useState<string | null>('all');
  const [selected, setSelected] = useState<string[]>([]);
  const [open, setOpen] = useState<Job | null>(null);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('Software Engineer');
  const [desc, setDesc] = useState(
    'Build the hiring tools our teams use every day.\n\nYou will own features end to end.',
  );
  const rows = jobs.filter(
    (j) =>
      (!filter.status || j.status === filter.status) &&
      j.title.toLowerCase().includes(filter.q.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2.5 text-xs text-fg-muted">
          SidebarLayout + SectionNav (second-level navigation; a select below lg)
        </p>
        <Card className="p-5">
          <SidebarLayout
            nav={
              <SectionNav
                title="Settings"
                groups={[
                  {
                    label: 'Workspace',
                    items: [
                      { href: '/design', label: 'General', icon: Settings, exact: true },
                      { href: '/design/portal', label: 'Candidate portal', icon: FileText },
                    ],
                  },
                  {
                    label: 'People & access',
                    items: [
                      { href: '/design/members', label: 'Members', icon: Users, count: 10 },
                      { href: '/design/roles', label: 'Roles & permissions', icon: Briefcase },
                    ],
                  },
                  {
                    label: 'Insights',
                    items: [{ href: '/design/reports', label: 'Reports', icon: BarChart3 }],
                  },
                ]}
              />
            }
          >
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-fg-subtle">
              Section content
            </div>
          </SidebarLayout>
        </Card>
      </div>

      <div>
        <p className="mb-2.5 text-xs text-fg-muted">
          SavedViews + DataTable (columns, density, sort, export, selection) + SplitView preview
        </p>
        <Card className="px-4 pt-3">
          <SavedViews<Filter>
            storageKey="design-jobs"
            activeId={viewId}
            current={filter}
            onApply={(v) => {
              setFilter(v.state);
              setViewId(v.id);
            }}
            builtIn={[
              { id: 'all', name: 'All jobs', state: { status: null, q: '' }, builtIn: true },
              { id: 'open', name: 'Open', state: { status: 'Open', q: '' }, builtIn: true },
              { id: 'drafts', name: 'Drafts', state: { status: 'Draft', q: '' }, builtIn: true },
            ]}
          />
          <SplitView
            storageKey="design-jobs"
            sideOpen={!!open}
            main={
              <DataTable
                data={rows}
                columns={columns}
                getRowId={(j) => j.id}
                viewKey="design-jobs"
                noun="job"
                pageSize={8}
                selectable
                selected={selected}
                onSelectedChange={setSelected}
                bulkActions={
                  <Button size="sm" variant="secondary">
                    Change status
                  </Button>
                }
                onRowOpen={setOpen}
                rowLabel={(j) => `Preview ${j.title}`}
                toolbar={
                  <SearchInput
                    value={filter.q}
                    onValueChange={(q) => setFilter((f) => ({ ...f, q }))}
                    placeholder="Search jobs"
                    className="w-64"
                  />
                }
              />
            }
            side={
              open && (
                <Card className="mt-3 space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <CellStack primary={open.title} secondary={`${open.dept} · ${open.location}`} />
                    <Button size="sm" variant="quiet" onClick={() => setOpen(null)}>
                      Close
                    </Button>
                  </div>
                  <StatusBadge status={open.status} />
                  <p className="text-sm text-fg-muted">
                    {open.applicants} applicants. Drag the divider to resize this panel.
                  </p>
                </Card>
              )
            }
          />
        </Card>
      </div>

      <div>
        <p className="mb-2.5 text-xs text-fg-muted">
          Wizard (multi-step form with a live preview in the aside)
        </p>
        <Wizard
          steps={[
            {
              id: 'basics',
              title: 'Basics',
              description: 'Title and team',
              valid: title.trim().length > 2,
            },
            { id: 'description', title: 'Description', description: 'What the role is' },
            { id: 'review', title: 'Review', description: 'Check and publish' },
          ]}
          current={step}
          onStepChange={setStep}
          onFinish={() => setStep(0)}
          finishLabel="Create job"
          aside={
            <Card className="p-5">
              <p className="mb-3 text-xs font-medium tracking-wide text-fg-subtle uppercase">
                Posting preview
              </p>
              <JobPostingView
                job={{
                  title,
                  department: 'Engineering',
                  location: 'Manila, PH',
                  workMode: 'Hybrid',
                  employmentType: 'FullTime',
                  description: desc,
                }}
              />
            </Card>
          }
        >
          {step === 0 && (
            <Input
              inset
              label="Job title"
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              error={title.trim().length > 2 ? undefined : 'Enter a title'}
            />
          )}
          {step === 1 && (
            <Textarea
              label="Description"
              value={desc}
              onChange={(e) => setDesc(e.currentTarget.value)}
            />
          )}
          {step === 2 && (
            <p className="text-sm text-fg-muted">
              Everything looks good. Creating the job saves it as a draft.
            </p>
          )}
        </Wizard>
      </div>
    </div>
  );
}

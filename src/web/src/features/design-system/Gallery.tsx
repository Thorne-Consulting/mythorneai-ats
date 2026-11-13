'use client';

import { useState, type ReactNode } from 'react';
import {
  Bell,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Download,
  FilePenLine,
  GitBranch,
  Mail,
  Moon,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  Trophy,
  UserPlus,
  Users,
  Video,
  XCircle,
} from 'lucide-react';
import {
  Accordion,
  AccordionItem,
  Alert,
  Autocomplete,
  Avatar,
  AvatarGroup,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardLink,
  CellStack,
  Checkbox,
  Code,
  ConfirmDialog,
  CopyButton,
  CountBadge,
  DescriptionList,
  Drawer,
  EmptyState,
  Eyebrow,
  FileDrop,
  FilterSelect,
  IconButton,
  Input,
  Kbd,
  LinkTabs,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Modal,
  MultiSelect,
  NumberInput,
  PageHeader,
  Pagination,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  ProgressRow,
  RadioGroup,
  Rating,
  RowActions,
  SearchInput,
  SearchSelect,
  SegmentedControl,
  Select,
  SelectionBar,
  SkeletonRows,
  Spinner,
  StatCard,
  StatGrid,
  Steps,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Tabs,
  TagsInput,
  Textarea,
  Timeline,
  Tooltip,
  toast,
  type Tone,
} from '@/components/ui';
import { DonutChart, FunnelBars, LineChart } from '@/components/ui/chart';
import { Board, BoardColumn } from '@/components/pipeline/BoardColumn';
import { CandidateCard } from '@/components/pipeline/CandidateCard';
import { WeekCalendar, weekOf } from '@/components/calendar/WeekCalendar';
import { ChatBubble, ConversationRow, DayDivider } from '@/components/messages/Chat';
import { WorkflowArrow, WorkflowNode } from '@/components/workflow/WorkflowNode';
import { setTheme, useTheme } from '@/lib/theme';
import { stageTone, StatusBadge } from '@/components/status';
import { cn } from '@/lib/cn';
import { LayoutDemos } from './LayoutDemos';

const sections = [
  ['foundations', 'Foundations'],
  ['buttons', 'Buttons'],
  ['fields', 'Fields'],
  ['selection', 'Selection'],
  ['navigation', 'Navigation'],
  ['menus', 'Menus & disclosure'],
  ['overlays', 'Overlays'],
  ['feedback', 'Feedback'],
  ['data', 'Data display'],
  ['tables', 'Tables'],
  ['charts', 'Charts'],
  ['patterns', 'Product patterns'],
  ['layouts', 'Layouts & flows'],
  ['ux', 'UX concept'],
] as const;

function Section({
  id,
  n,
  title,
  description,
  children,
}: {
  id: string;
  n: number;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-bold text-fg">
        {String(n).padStart(2, '0')}&nbsp;&nbsp;/&nbsp;&nbsp;{title.toUpperCase()}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">{description}</p>
      <div className="mt-6 space-y-8">{children}</div>
    </section>
  );
}

function Demo({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div>
      <p className="mb-2.5 text-xs text-fg-muted">{label}</p>
      <div className={cn('flex flex-wrap items-center gap-3', className)}>{children}</div>
    </div>
  );
}

const swatches: [string, string, string][] = [
  ['Primary', '--primary', 'Actions, links, focus'],
  ['Chrome', '--chrome', 'Header and sidebar'],
  ['Foreground', '--foreground', 'Body text'],
  ['Muted text', '--fg-muted', 'Secondary text'],
  ['Subtle text', '--fg-subtle', 'Meta, placeholders'],
  ['Border', '--border', 'Lines, outlines'],
  ['Canvas', '--background', 'Page background'],
  ['Card', '--card', 'Surfaces'],
  ['Well', '--well', 'Board columns'],
  ['Accent', '--accent', 'Hover, selected'],
  ['Brand', '--brand', 'Post a Job only'],
  ['Destructive', '--destructive', 'Delete, reject'],
];
const tones: Tone[] = ['blue', 'violet', 'green', 'amber', 'red', 'gray'];

export function Gallery() {
  const theme = useTheme();
  const [text, setText] = useState('Jerick');
  const [search, setSearch] = useState('');
  const [num, setNum] = useState<number | ''>(3);
  const [sel, setSel] = useState<string | null>('Engineering');
  const [dept, setDept] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>(['React', 'TypeScript']);
  const [tags, setTags] = useState<string[]>(['remote-ok']);
  const [auto, setAuto] = useState('');
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState<string | null>('email');
  const [sw, setSw] = useState(true);
  const [tab, setTab] = useState('all');
  const [seg, setSeg] = useState('week');
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>(['JOB-024']);
  const [rating, setRating] = useState(4);
  const [file, setFile] = useState<File | null>(null);
  const [node, setNode] = useState(3);
  const [notes, setNotes] = useState('');

  const jobs = [
    [
      'JOB-024',
      'Software Engineer',
      'Engineering',
      'Manila, PH',
      'Hybrid',
      84,
      18,
      'Jerick Santos',
      'Oct 10, 2026',
      'Open',
    ],
    [
      'JOB-023',
      'Product Manager',
      'Product',
      'Remote',
      'Full-time',
      62,
      12,
      'Anna Garcia',
      'Oct 08, 2026',
      'Open',
    ],
    [
      'JOB-022',
      'UX Designer',
      'Design',
      'Makati, PH',
      'Hybrid',
      56,
      9,
      'Sarah Lim',
      'Oct 06, 2026',
      'Open',
    ],
    [
      'JOB-018',
      'Customer Success Manager',
      'Customer Success',
      'Cebu, PH',
      'Hybrid',
      37,
      5,
      'Sarah Lim',
      'Sep 28, 2026',
      'OnHold',
    ],
  ] as const;
  const days = weekOf(new Date());
  const at = (day: number, h: number, m = 0) =>
    new Date(days[day].getFullYear(), days[day].getMonth(), days[day].getDate(), h, m);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-4 bg-chrome px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/mark.png" alt="" className="size-9 rounded-full" />
        <p className="text-sm text-nav-foreground">
          MyThorneAI ATS <span className="mx-1">/</span>{' '}
          <span className="text-white">UI Library</span>
        </p>
        <div className="ml-auto">
          <SegmentedControl
            aria-label="Theme"
            size="sm"
            value={theme}
            onValueChange={(v) => setTheme(v as 'light' | 'dark' | 'system')}
            items={[
              { value: 'light', label: 'Light', icon: <Sun /> },
              { value: 'dark', label: 'Dark', icon: <Moon /> },
              { value: 'system', label: 'System' },
            ]}
          />
        </div>
      </header>
      <div className="mx-auto flex max-w-[1400px] gap-8 px-6 py-8">
        <nav aria-label="Sections" className="sticky top-24 hidden h-fit w-48 shrink-0 lg:block">
          <ul className="space-y-0.5 text-sm">
            {sections.map(([id, label]) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="block rounded-md px-3 py-1.5 text-fg-muted hover:bg-accent hover:text-fg"
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 flex-1 space-y-6">
          <PageHeader
            breadcrumbs={[{ label: 'MyThorneAI ATS' }, { label: 'UI Library' }]}
            title="Component Collection"
            description="Every building block in src/components/ui and the composites built on them. Toggle the theme to check dark mode."
          />

          <Section
            id="foundations"
            n={1}
            title="Foundations"
            description="Palette tokens, Roboto type scale, radii and elevation. Use tokens, never raw hex."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {swatches.map(([name, v, use]) => (
                <div key={v} className="flex items-center gap-3">
                  <span
                    className="size-10 shrink-0 rounded-md border border-border"
                    style={{ background: `var(${v})` }}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{name}</span>
                    <Code className="text-2xs">{v}</Code>
                    <span className="block text-2xs text-fg-subtle">{use}</span>
                  </span>
                </div>
              ))}
            </div>
            <Demo label="Status tones (soft background · text · dot)">
              {tones.map((t) => (
                <Badge key={t} tone={t} dot>
                  {t}
                </Badge>
              ))}
            </Demo>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs text-fg-muted">Type scale (Roboto)</p>
                <p className="text-3xl font-bold text-fg">28 · Page title</p>
                <p className="text-lg font-semibold text-fg">18 · Card title</p>
                <p className="text-md font-medium text-fg">16 · Section / nav</p>
                <p className="text-base text-fg">14 · Body and controls</p>
                <p className="text-sm text-fg-muted">13 · Table cells, secondary</p>
                <p className="text-xs text-fg-subtle">12 · Labels, badges, meta</p>
                <p className="text-2xs text-fg-subtle">11 · Supporting text</p>
              </div>
              <div className="space-y-3">
                <p className="text-xs text-fg-muted">
                  Radii · 7 controls · 11 menus · 13 cards · 16 panels
                </p>
                <div className="flex gap-3">
                  {['rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full'].map(
                    (r) => (
                      <span
                        key={r}
                        className={cn(
                          'flex size-14 items-center justify-center border border-border bg-muted text-2xs text-fg-subtle',
                          r,
                        )}
                      >
                        {r.replace('rounded-', '')}
                      </span>
                    ),
                  )}
                </div>
                <p className="pt-2 text-xs text-fg-muted">Elevation · card · pop</p>
                <div className="flex gap-4">
                  <span className="flex h-14 w-28 items-center justify-center rounded-xl bg-card text-xs text-fg-subtle shadow-card">
                    shadow-card
                  </span>
                  <span className="flex h-14 w-28 items-center justify-center rounded-xl bg-popover text-xs text-fg-subtle shadow-pop">
                    shadow-pop
                  </span>
                </div>
              </div>
            </div>
          </Section>

          <Section
            id="buttons"
            n={2}
            title="Buttons"
            description="Primary, secondary, brand, quiet, soft, danger and link. Default, hover, disabled and loading. 38px · 7px radius."
          >
            <Demo label="Variants">
              <Button leftIcon={<Plus />}>Create job</Button>
              <Button variant="secondary" leftIcon={<Download />}>
                Export jobs
              </Button>
              <Button variant="brand" leftIcon={<Briefcase />}>
                Post a job
              </Button>
              <Button variant="quiet" leftIcon={<Plus />}>
                Add filter
              </Button>
              <Button variant="soft">Draft with AI</Button>
              <Button variant="danger">Reject applicant</Button>
              <Button variant="danger-quiet">Remove access</Button>
              <Button variant="link">View details</Button>
            </Demo>
            <Demo label="Disabled and loading">
              <Button disabled leftIcon={<Plus />}>
                Create job
              </Button>
              <Button variant="secondary" disabled leftIcon={<Download />}>
                Export jobs
              </Button>
              <Button variant="brand" disabled leftIcon={<Briefcase />}>
                Post a job
              </Button>
              <Button loading>Saving</Button>
            </Demo>
            <Demo label="Sizes xs · sm · md · lg">
              <Button size="xs">Extra small</Button>
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Demo>
            <Demo label="Icon-only (label is required for screen readers)">
              <IconButton label="More actions">
                <span className="text-lg leading-none">•••</span>
              </IconButton>
              <IconButton label="Video call" variant="quiet">
                <Video />
              </IconButton>
              <IconButton label="Filters" variant="soft">
                <SlidersHorizontal />
              </IconButton>
              <IconButton label="Disabled" disabled>
                <Bell />
              </IconButton>
            </Demo>
          </Section>

          <Section
            id="fields"
            n={3}
            title="Fields"
            description="Text, search, number, textarea and file. Labels inside the box (inset, Figma default) or above. Focus, error and disabled states."
          >
            <div className="grid gap-5 md:grid-cols-3">
              <Input
                inset
                label="First name"
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
              />
              <Input
                inset
                label="Email"
                type="email"
                placeholder="name@company.com"
                error="Enter a valid email"
              />
              <Input inset label="First name" value="Jerick" disabled readOnly />
              <Input
                label="Job title"
                placeholder="e.g. Software Engineer"
                description="Shown on the careers page."
                required
              />
              <NumberInput label="Openings" value={num} onValueChange={setNum} min={1} />
              <Input label="Target start" type="date" />
            </div>
            <Demo label="Search (38px, 7px radius)">
              <SearchInput
                value={search}
                onValueChange={setSearch}
                placeholder="Search by job title or ID"
                className="w-72"
              />
              <SearchInput
                value=""
                onValueChange={() => {}}
                placeholder="Disabled"
                disabled
                className="w-72"
              />
            </Demo>
            <div className="grid gap-5 md:grid-cols-2">
              <Textarea
                label="Interview notes"
                placeholder="What stood out?"
                value={notes}
                onChange={(e) => setNotes(e.currentTarget.value)}
                description="Grows as you type."
              />
              <div className="space-y-1.5">
                <p className="text-sm font-medium text-fg">Resume</p>
                <FileDrop file={file} onFile={setFile} accept=".pdf,.doc,.docx" />
              </div>
            </div>
          </Section>

          <Section
            id="selection"
            n={4}
            title="Selection"
            description="Select, filter select, multi-select, tags, autocomplete, checkbox, radio, switch, segmented control and rating."
          >
            <div className="grid gap-5 md:grid-cols-3">
              <Select
                inset
                label="Department"
                value={sel}
                onChange={setSel}
                data={['Engineering', 'Product', 'Design', 'Marketing']}
              />
              <Select
                label="Hiring manager"
                value={null}
                onChange={() => {}}
                placeholder="Choose a person"
                clearable
                data={[
                  { value: 'a', label: 'Anna Garcia', group: 'Product' },
                  { value: 'j', label: 'Jerick Santos', group: 'Engineering' },
                ]}
              />
              <Autocomplete
                label="Location"
                value={auto}
                onChange={setAuto}
                data={['Manila, PH', 'Makati, PH', 'Cebu, PH', 'Remote']}
                placeholder="Start typing"
              />
              <MultiSelect
                label="Skills"
                value={multi}
                onChange={setMulti}
                data={['React', 'TypeScript', 'Node.js', 'Python', 'AWS', 'PostgreSQL']}
                placeholder="Pick skills"
              />
              <TagsInput
                label="Tags"
                value={tags}
                onChange={setTags}
                placeholder="Type and press Enter"
              />
              <SearchSelect
                label="Candidate"
                value={sel}
                onChange={setSel}
                data={['Engineering', 'Product', 'Design', 'Marketing'].map((d) => ({
                  value: d,
                  label: `${d} lead`,
                }))}
                placeholder="Search candidates"
              />
            </div>
            <Demo label="Toolbar filter selects">
              <FilterSelect
                value={dept}
                onChange={setDept}
                allLabel="All departments"
                data={['Engineering', 'Product', 'Design']}
              />
              <FilterSelect
                value={null}
                onChange={() => {}}
                allLabel="All locations"
                data={['Manila, PH', 'Remote']}
              />
              <Button variant="secondary" leftIcon={<SlidersHorizontal />}>
                More filters
              </Button>
            </Demo>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-3">
                <Checkbox
                  checked={check}
                  onCheckedChange={setCheck}
                  label="Send confirmation email"
                  description="The candidate gets the invite."
                />
                <Checkbox
                  checked="indeterminate"
                  onCheckedChange={() => {}}
                  label="Indeterminate"
                />
                <Checkbox checked={false} onCheckedChange={() => {}} label="Disabled" disabled />
              </div>
              <RadioGroup
                value={radio}
                onValueChange={setRadio}
                aria-label="Reply channel"
                options={[
                  { value: 'email', label: 'Reply via email' },
                  { value: 'portal', label: 'Candidate portal' },
                  { value: 'sms', label: 'SMS', disabled: true },
                ]}
              />
              <div className="space-y-3">
                <Switch
                  checked={sw}
                  onCheckedChange={setSw}
                  label="Run once per candidate"
                  description="Prevent duplicate emails."
                />
                <Switch checked={false} onCheckedChange={() => {}} label="Off" />
                <Switch checked={true} onCheckedChange={() => {}} label="Disabled" disabled />
              </div>
            </div>
            <Demo label="Segmented control · rating">
              <SegmentedControl
                aria-label="Calendar view"
                value={seg}
                onValueChange={setSeg}
                items={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
              />
              <Rating value={rating} onChange={setRating} />
              <Rating value={3} readOnly size="sm" />
            </Demo>
          </Section>

          <Section
            id="navigation"
            n={5}
            title="Navigation"
            description="Tabs with counts, route tabs, settings pills, breadcrumbs, steps and pagination. The sidebar lives in the app shell."
          >
            <Tabs
              value={tab}
              onValueChange={setTab}
              aria-label="Job filter"
              items={[
                { value: 'all', label: 'All jobs', count: 18 },
                { value: 'open', label: 'Open', count: 12 },
                { value: 'drafts', label: 'Drafts', count: 4 },
                { value: 'closed', label: 'Closed', count: 2 },
              ]}
            />
            <LinkTabs
              variant="pills"
              items={[
                { href: '/design', label: 'Members' },
                { href: '/design/x', label: 'Roles & permissions' },
                { href: '/design/y', label: 'Invitations', count: 6 },
                { href: '/design/z', label: 'Access requests', count: 3 },
              ]}
            />
            <Breadcrumbs
              items={[
                { label: 'Settings', href: '#' },
                { label: 'Roles & permissions', href: '#' },
                { label: 'Workspace members' },
              ]}
            />
            <Steps steps={['Details', 'Requirements', 'Pipeline', 'Review']} current={1} />
            <Pagination page={page} pageSize={7} total={18} onPageChange={setPage} noun="jobs" />
          </Section>

          <Section
            id="menus"
            n={6}
            title="Menus & disclosure"
            description="Context menus with icons, danger and disabled items. Accordions for details, settings groups and workflow config."
          >
            <Demo label="Menu (click)">
              <Menu>
                <MenuTrigger asChild>
                  <Button variant="secondary">Candidate actions</Button>
                </MenuTrigger>
                <MenuContent align="start">
                  <MenuLabel>Karen Dela Cruz</MenuLabel>
                  <MenuItem icon={<UserPlus />}>View candidate</MenuItem>
                  <MenuItem icon={<CalendarDays />}>Schedule interview</MenuItem>
                  <MenuItem icon={<Download />}>Export profile</MenuItem>
                  <MenuItem icon={<FilePenLine />} disabled>
                    Edit (no access)
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem icon={<CheckCircle2 />} danger>
                    Close job
                  </MenuItem>
                </MenuContent>
              </Menu>
              <RowActions>
                <MenuItem icon={<UserPlus />}>View candidate</MenuItem>
                <MenuItem icon={<XCircle />} danger>
                  Reject
                </MenuItem>
              </RowActions>
            </Demo>
            <Accordion type="multiple" defaultValue={['b']}>
              <AccordionItem value="a" title="Candidate information">
                Review the candidate’s profile, contact details, application history and hiring
                stage before scheduling the next step.
              </AccordionItem>
              <AccordionItem value="b" title="Candidate information" description="Expanded variant">
                Review the candidate’s profile, contact details, application history and hiring
                stage before scheduling the next step.
              </AccordionItem>
            </Accordion>
          </Section>

          <Section
            id="overlays"
            n={7}
            title="Overlays"
            description="Modal, drawer, confirm, popover, tooltip and toasts."
          >
            <Demo label="Open one">
              <Button variant="secondary" onClick={() => setModal(true)}>
                Modal
              </Button>
              <Button variant="secondary" onClick={() => setDrawer(true)}>
                Drawer
              </Button>
              <Button variant="danger" onClick={() => setConfirm(true)}>
                Confirm dialog
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="secondary">Popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <p className="text-base font-semibold text-fg">Next interview</p>
                  <p className="mt-1 text-sm text-fg-muted">
                    Technical interview · Fri, Oct 16 · 10:00–11:00 AM
                  </p>
                </PopoverContent>
              </Popover>
              <Tooltip label="Tooltips explain icon-only controls">
                <Button variant="quiet">Hover me</Button>
              </Tooltip>
            </Demo>
            <Demo label="Toasts">
              <Button
                variant="secondary"
                onClick={() => toast.success('Candidate moved', 'Karen is now in Interview.')}
              >
                Success
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  toast.error('Could not move the job', 'Opening a job needs approval first.')
                }
              >
                Error
              </Button>
              <Button variant="secondary" onClick={() => toast.warning('Calendar not connected')}>
                Warning
              </Button>
              <Button variant="secondary" onClick={() => toast('Sync started')}>
                Info
              </Button>
            </Demo>
            <Modal
              opened={modal}
              onClose={() => setModal(false)}
              title="Reject applicant"
              description="This decision is recorded in the audit history."
              footer={
                <>
                  <Button variant="secondary" onClick={() => setModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" onClick={() => setModal(false)}>
                    Reject applicant
                  </Button>
                </>
              }
            >
              <div className="space-y-4">
                <Select
                  label="Disposition reason"
                  value={null}
                  onChange={() => {}}
                  data={['Skills mismatch', 'Experience mismatch', 'Withdrew']}
                />
                <Alert tone="warning">Use job-related reasons only.</Alert>
              </div>
            </Modal>
            <Drawer
              opened={drawer}
              onClose={() => setDrawer(false)}
              title="Schedule interview"
              description="Karen Dela Cruz · Software Engineer"
              footer={<Button onClick={() => setDrawer(false)}>Schedule</Button>}
            >
              <div className="space-y-4">
                <Input inset label="Title" defaultValue="Technical interview" />
                <Input inset label="Starts" type="datetime-local" />
                <MultiSelect
                  label="Interviewers"
                  value={['Anna Garcia']}
                  onChange={() => {}}
                  data={['Anna Garcia', 'Mark Rivera', 'Sarah Lim']}
                />
              </div>
            </Drawer>
            <ConfirmDialog
              opened={confirm}
              onClose={() => setConfirm(false)}
              onConfirm={() => new Promise((r) => setTimeout(r, 800))}
              title="Remove access?"
              message="Maegan will lose access to the workspace immediately."
              confirmLabel="Remove access"
            />
          </Section>

          <Section
            id="feedback"
            n={8}
            title="Feedback"
            description="Banners, progress, loading and empty states."
          >
            <div className="space-y-3">
              <Alert
                tone="info"
                title="Owner permissions are locked"
                action={<Badge tone="amber">1 unsaved change</Badge>}
              >
                The Owner always has full workspace access. Transfer ownership from the owner’s
                member profile.
              </Alert>
              <Alert tone="success" title="All stages connected">
                A rejected decision stops the workflow.
              </Alert>
              <Alert tone="warning">
                Use job-related reasons only. This decision is recorded in the audit history.
              </Alert>
              <Alert tone="danger" title="Calendar sync failed" onDismiss={() => {}}>
                Reconnect Google Calendar to keep interviews in sync.
              </Alert>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <ProgressRow
                  label="Completed"
                  value={96}
                  max={124}
                  display="96 (77%)"
                  tone="green"
                />
                <ProgressRow label="In progress" value={16} max={124} display="16 (13%)" />
                <ProgressRow
                  label="Not started"
                  value={12}
                  max={124}
                  display="12 (10%)"
                  tone="gray"
                />
                <Progress value={62} size="sm" />
              </div>
              <Card>
                <SkeletonRows rows={3} />
              </Card>
            </div>
            <Demo label="Spinner">
              <Spinner />
              <Spinner className="size-6 text-primary" />
            </Demo>
            <Card>
              <EmptyState
                icon={Briefcase}
                title="No jobs yet"
                description="Create your first job to start collecting applications."
                action={<Button leftIcon={<Plus />}>Create job</Button>}
              />
            </Card>
          </Section>

          <Section
            id="data"
            n={9}
            title="Data display"
            description="Stat cards, status badges, avatars, timelines and description lists."
          >
            <StatGrid>
              <StatCard
                icon={Briefcase}
                label="Open Jobs"
                value={12}
                hint="3 published this month"
                href="#"
              />
              <StatCard
                icon={Users}
                tone="violet"
                label="Total Applications"
                value={482}
                hint="+64 in the last 7 days"
              />
              <StatCard
                icon={CalendarCheck}
                tone="green"
                label="Interviews Scheduled"
                value={36}
                trend={{ direction: 'up', text: '18.4% vs previous period' }}
              />
              <StatCard
                icon={Trophy}
                tone="amber"
                label="Hires"
                value={8}
                trend={{ direction: 'down', text: '6 days faster', good: true }}
              />
            </StatGrid>
            <Demo label="Stage and status badges (one source of truth: components/status)">
              {['Applied', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected'].map((s) => (
                <Badge key={s} tone={stageTone(s)} dot>
                  {s}
                </Badge>
              ))}
              {['Open', 'OnHold', 'Draft', 'PendingApproval', 'Closed', 'Filled'].map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
              <Badge tone="blue" variant="outline">
                Owner
              </Badge>
              <Badge tone="green" variant="solid">
                Enforced
              </Badge>
              <CountBadge count={6} />
            </Demo>
            <Demo label="Avatars">
              <Avatar name="Karen Dela Cruz" size="sm" />
              <Avatar name="Maricar Kumu" />
              <Avatar name="Jerick Dayoha" tone="solid" size="lg" />
              <Avatar name="Paolo Mendoza" size="xl" />
              <AvatarGroup
                names={[
                  'Anna Garcia',
                  'Mark Rivera',
                  'Sarah Lim',
                  'Jerick Santos',
                  'Paolo Mendoza',
                ]}
              />
            </Demo>
            <div className="grid gap-6 md:grid-cols-2">
              <Timeline
                items={[
                  {
                    id: '1',
                    title: 'Moved to Interview',
                    meta: 'Anna Garcia · 2 hours ago',
                    tone: 'blue',
                  },
                  {
                    id: '2',
                    title: 'Scorecard submitted',
                    meta: 'Mark Rivera · Yesterday',
                    icon: <CheckCircle2 />,
                    body: 'Strong yes. Clear system design thinking.',
                  },
                  { id: '3', title: 'Applied via LinkedIn', meta: 'Oct 14, 2026', tone: 'gray' },
                ]}
              />
              <DescriptionList
                columns={2}
                items={[
                  { label: 'Email', value: 'karendelacruz@gmail.com' },
                  { label: 'Phone', value: '+63 917 234 5678' },
                  { label: 'Location', value: 'Manila, Philippines' },
                  { label: 'Source', value: 'LinkedIn' },
                ]}
              />
            </div>
            <Demo label="Misc">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
              <Code>{'{{job.title}}'}</Code>
              <Eyebrow>Candidate journey</Eyebrow>
              <CopyButton value="careers@mythorne.ai" />
            </Demo>
          </Section>

          <Section
            id="tables"
            n={10}
            title="Tables"
            description="Jobs data table with selection, row states, status badges, row actions and pagination."
          >
            <Card className="px-4">
              <div className="flex flex-wrap items-center gap-2 py-3">
                <SearchInput
                  value={search}
                  onValueChange={setSearch}
                  placeholder="Search by job title or ID"
                  className="w-72"
                />
                <div className="ml-auto flex gap-2">
                  <FilterSelect
                    value={null}
                    onChange={() => {}}
                    allLabel="All departments"
                    data={['Engineering']}
                  />
                  <Button variant="secondary" leftIcon={<SlidersHorizontal />}>
                    More filters
                  </Button>
                </div>
              </div>
              <SelectionBar count={selected.length} noun="job" onClear={() => setSelected([])}>
                <Button size="sm" variant="secondary">
                  Change owner
                </Button>
                <Button size="sm" variant="danger-quiet">
                  Close jobs
                </Button>
              </SelectionBar>
              <Table>
                <THead>
                  <tr>
                    <TH className="w-10">
                      <Checkbox
                        aria-label="Select all"
                        checked={
                          selected.length === jobs.length
                            ? true
                            : selected.length
                              ? 'indeterminate'
                              : false
                        }
                        onCheckedChange={(c) => setSelected(c ? jobs.map((j) => j[0]) : [])}
                      />
                    </TH>
                    <TH>Job title</TH>
                    <TH>Location</TH>
                    <TH>Applicants</TH>
                    <TH>In pipeline</TH>
                    <TH>Hiring manager</TH>
                    <TH>Published</TH>
                    <TH>Status</TH>
                    <TH align="right">Actions</TH>
                  </tr>
                </THead>
                <TBody>
                  {jobs.map((j) => (
                    <TR key={j[0]} interactive selected={selected.includes(j[0])}>
                      <TD>
                        <Checkbox
                          aria-label={`Select ${j[1]}`}
                          checked={selected.includes(j[0])}
                          onCheckedChange={(c) =>
                            setSelected((s) => (c ? [...s, j[0]] : s.filter((x) => x !== j[0])))
                          }
                        />
                      </TD>
                      <TD>
                        <CellStack primary={j[1]} secondary={`${j[2]} · ${j[0]}`} />
                      </TD>
                      <TD>
                        <CellStack primary={j[3]} secondary={j[4]} />
                      </TD>
                      <TD className="font-medium text-accent-foreground tnum">{j[5]}</TD>
                      <TD className="tnum">{j[6]}</TD>
                      <TD>{j[7]}</TD>
                      <TD>{j[8]}</TD>
                      <TD>
                        <StatusBadge status={j[9]} />
                      </TD>
                      <TD align="right">
                        <RowActions>
                          <MenuItem icon={<FilePenLine />}>Edit job</MenuItem>
                          <MenuItem icon={<XCircle />} danger>
                            Close job
                          </MenuItem>
                        </RowActions>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              <Pagination page={page} pageSize={7} total={18} onPageChange={setPage} noun="jobs" />
            </Card>
          </Section>

          <Section
            id="charts"
            n={11}
            title="Charts"
            description="Recharts wrappers that read colour from tokens. Import from components/ui/chart."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader
                  title="Hiring Activity"
                  action={<span className="text-sm text-accent-foreground">Last 30 days</span>}
                />
                <CardBody>
                  <LineChart
                    dataKey="day"
                    series={[
                      { key: 'applications', label: 'Applications' },
                      { key: 'interviews', label: 'Interviews' },
                      { key: 'hires', label: 'Hires' },
                    ]}
                    data={['Sep 15', 'Sep 21', 'Sep 27', 'Oct 03', 'Oct 09', 'Oct 15'].map(
                      (day, i) => ({
                        day,
                        applications: [50, 58, 62, 104, 92, 120][i],
                        interviews: [10, 12, 13, 20, 17, 24][i],
                        hires: [1, 1, 2, 3, 2, 4][i],
                      }),
                    )}
                  />
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Candidate Sources" />
                <CardBody>
                  <DonutChart
                    centerValue={482}
                    centerLabel="Candidates"
                    data={[
                      { name: 'LinkedIn', value: 38 },
                      { name: 'Company Website', value: 22, color: 'var(--chart-5)' },
                      { name: 'Indeed', value: 18, color: 'var(--chart-2)' },
                      { name: 'Referrals', value: 12, color: 'var(--chart-4)' },
                      { name: 'Other', value: 10, color: 'var(--chart-6)' },
                    ]}
                  />
                </CardBody>
              </Card>
              <Card className="lg:col-span-2">
                <CardHeader
                  title="Hiring Funnel"
                  action={<CardLink href="#">View pipeline</CardLink>}
                />
                <CardBody>
                  <FunnelBars
                    footer="1.7% overall application-to-hire conversion"
                    data={[
                      { name: 'Applied', value: 482 },
                      { name: 'Screening', value: 278, color: 'var(--chart-2)' },
                      { name: 'Interview', value: 96, color: 'var(--chart-5)' },
                      { name: 'Offer', value: 28, color: 'var(--chart-4)' },
                      { name: 'Hired', value: 8, color: 'var(--chart-3)' },
                    ]}
                  />
                </CardBody>
              </Card>
            </div>
          </Section>

          <Section
            id="patterns"
            n={12}
            title="Product patterns"
            description="Composites in components/pipeline, calendar, messages and workflow. Pages assemble these."
          >
            <Demo label="Pipeline board (drag a card between columns)">
              <DemoBoard />
            </Demo>
            <Demo label="Week calendar" className="block">
              <Card className="p-4">
                <WeekCalendar
                  days={days}
                  events={[
                    {
                      id: '1',
                      start: at(0, 9),
                      end: at(0, 10),
                      title: 'Nicole Reyes',
                      subtitle: 'Phone screen',
                      tone: 'violet',
                    },
                    {
                      id: '2',
                      start: at(1, 10),
                      end: at(1, 11),
                      title: 'Andrea Santos',
                      subtitle: 'Phone screen',
                      tone: 'violet',
                    },
                    {
                      id: '3',
                      start: at(2, 9),
                      end: at(2, 10),
                      title: 'Paolo Mendoza',
                      subtitle: 'Technical interview',
                    },
                    {
                      id: '4',
                      start: at(3, 10),
                      end: at(3, 11),
                      title: 'Carl Rabanero',
                      subtitle: 'Technical interview',
                    },
                    {
                      id: '5',
                      start: at(0, 15),
                      end: at(0, 16),
                      title: 'Sofia Ramos',
                      subtitle: 'Final interview',
                      tone: 'green',
                    },
                    {
                      id: '6',
                      start: at(4, 13),
                      end: at(4, 14),
                      title: 'Jayl Remando',
                      subtitle: 'Hiring manager',
                      tone: 'violet',
                    },
                  ]}
                />
              </Card>
            </Demo>
            <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <Card className="overflow-hidden">
                <ConversationRow
                  name="Karen Dela Cruz"
                  subtitle="Software Engineer"
                  preview="Thank you! Looking forward to it."
                  time="9:42 AM"
                  selected
                />
                <ConversationRow
                  name="Jayl Remando"
                  subtitle="Marketing Specialist"
                  preview="Happy to share more details."
                  time="Oct 13"
                  unread
                />
              </Card>
              <Card className="space-y-3 p-5">
                <DayDivider>Today, October 15, 2026</DayDivider>
                <ChatBubble direction="out" time="9:30 AM" delivered>
                  Hi Karen, we would love to schedule your technical interview for Friday at 10 AM.
                </ChatBubble>
                <ChatBubble direction="in" time="9:42 AM">
                  Thank you! Looking forward to it.
                </ChatBubble>
              </Card>
            </div>
            <Demo
              label="Workflow stages (click to select)"
              className="flex-nowrap overflow-x-auto pb-2"
            >
              {[
                {
                  icon: CalendarCheck,
                  kind: 'Trigger',
                  title: 'When interviewed',
                  description: 'Candidate enters Interviewed',
                  meta: 'Any interview type',
                },
                {
                  icon: GitBranch,
                  kind: 'Condition',
                  title: 'Accepted',
                  description: 'Hiring decision is Accepted',
                  meta: 'Continue only when matched',
                },
                {
                  icon: CheckCircle2,
                  kind: 'Approval',
                  title: 'Confirmation',
                  description: 'Recruiter confirms the decision',
                  meta: 'Wait for manual confirmation',
                },
                {
                  icon: Mail,
                  kind: 'Action',
                  title: 'Send email',
                  description: 'Send the acceptance email',
                  meta: 'To candidate · Send immediately',
                },
              ].map((n, i, all) => (
                <div key={n.kind} className="flex items-center">
                  <div className="w-56">
                    <WorkflowNode {...n} selected={node === i} onClick={() => setNode(i)} />
                  </div>
                  {i < all.length - 1 && <WorkflowArrow />}
                </div>
              ))}
            </Demo>
          </Section>

          <Section
            id="layouts"
            n={13}
            title="Layouts & flows"
            description="Second sidebar, full data table with saved views, split view and wizard. See docs/ui-depth-plan.md for where each is used."
          >
            <LayoutDemos />
          </Section>

          <Section
            id="ux"
            n={14}
            title="UX concept"
            description="How screens are put together. The same rules live in src/web/CLAUDE.md."
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[
                [
                  'Shell',
                  'Navy header + sidebar frame every signed-in page. Content sits on the pale canvas panel, rounded at the top-left. One yellow brand button in the whole app: Post a Job.',
                ],
                [
                  'Page anatomy',
                  'PageHeader (breadcrumbs, 28px title, one-line purpose, actions right) → StatGrid of 4 → the main Card. Secondary action left of primary.',
                ],
                [
                  'List pages',
                  'Card containing Tabs with counts, a toolbar (search left, filter selects right), the Table, and Pagination. Bulk actions appear in a SelectionBar.',
                ],
                [
                  'Record pages',
                  'Header with identity and stage, then a two-column body: the record on the left, a details rail on the right (contact, next interview, quick actions).',
                ],
                [
                  'Boards',
                  'Pipeline and job status boards use BoardColumn + CandidateCard. Dragging updates instantly and rolls back with a toast if the server refuses.',
                ],
                [
                  'Settings',
                  'Breadcrumbs, underline tabs for areas, pill tabs for sub-pages, cards and accordions for groups. Destructive actions confirm first.',
                ],
                [
                  'Colour = meaning',
                  'Blue interview / action, violet screening, green open / hired / success, amber offer / on hold / warning, red reject / danger, grey applied / neutral.',
                ],
                [
                  'Feedback',
                  'Toasts for results of an action. Alerts for state that persists. Empty states always say what to do next and offer the action.',
                ],
                [
                  'Preview screens',
                  'Screens without a backend (Assessments, Messages inbox, Workflows, SSO, Access requests) run on sample data and show a Preview badge.',
                ],
              ].map(([title, body]) => (
                <div key={title} className="rounded-lg border border-border p-4">
                  <p className="text-base font-semibold text-fg">{title}</p>
                  <p className="mt-1 text-sm text-fg-muted">{body}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function DemoBoard() {
  const [cards, setCards] = useState([
    {
      id: '1',
      name: 'Paolo Mendoza',
      source: 'LinkedIn',
      detail: 'React · TypeScript · Node.js',
      stage: 'Applied',
      time: '1 day',
    },
    {
      id: '2',
      name: 'Nicole Reyes',
      source: 'Company website',
      detail: 'Python · AWS · PostgreSQL',
      stage: 'Applied',
      time: '1 day',
    },
    {
      id: '3',
      name: 'Andrea Santos',
      source: 'Referral',
      detail: 'Phone screen · Today, 4:00 PM',
      stage: 'Screening',
      time: '2 days',
    },
    {
      id: '4',
      name: 'Karen Dela Cruz',
      source: 'LinkedIn',
      detail: 'Technical · Tomorrow, 10:00 AM',
      stage: 'Interview',
      time: '4 days',
    },
    {
      id: '5',
      name: 'Luis Navarro',
      source: 'Referral',
      detail: 'Offer sent · ₱95,000 / month',
      stage: 'Offer',
      time: '2 days',
    },
    {
      id: '6',
      name: 'Isabel Aquino',
      source: 'Referral',
      detail: 'Starts Nov 02, 2026',
      stage: 'Hired',
      time: 'Today',
    },
  ]);
  const [drag, setDrag] = useState<string | null>(null);
  return (
    <Board className="w-full">
      {['Applied', 'Screening', 'Interview', 'Offer', 'Hired'].map((stage) => {
        const items = cards.filter((c) => c.stage === stage);
        return (
          <BoardColumn
            key={stage}
            title={stage}
            count={items.length}
            tone={stageTone(stage)}
            onDropItem={(id) =>
              setCards((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c)))
            }
            footer={
              <button className="text-accent-foreground hover:underline">
                View more candidates
              </button>
            }
          >
            {items.map((c) => (
              <CandidateCard
                key={c.id}
                name={c.name}
                subtitle={c.source}
                detail={c.detail}
                timeInStage={c.time}
                owner="Jerick Santos"
                draggable
                dragging={drag === c.id}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', c.id);
                  setDrag(c.id);
                }}
                onDragEnd={() => setDrag(null)}
              />
            ))}
          </BoardColumn>
        );
      })}
    </Board>
  );
}

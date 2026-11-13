'use client';

// Help is a real page, not a preview; it lives here because it has no data of its own.
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  Briefcase,
  CalendarPlus,
  ClipboardCheck,
  Command,
  LayoutDashboard,
  LineChart,
  Palette,
  SearchX,
  Stamp,
  UserPlus,
  Wand2,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { ShortcutList } from '@/components/layout/CommandSearch';
import {
  Button,
  Card,
  CardHeader,
  CardLink,
  EmptyState,
  IconDisc,
  PageHeader,
  SearchInput,
  Tabs,
} from '@/components/ui';

const categories = ['Getting around', 'Jobs', 'Candidates', 'Interviews', 'Reports'] as const;
type Category = (typeof categories)[number];

const guides: {
  category: Category;
  icon: LucideIcon;
  title: string;
  steps: string[];
  href: string;
  link: string;
}[] = [
  {
    category: 'Getting around',
    icon: Command,
    title: 'Search or run a command',
    steps: [
      'Press / or ⌘K anywhere.',
      'Type a name, email or job title to find it, or type what you want to do, like “create job” or “dark mode”.',
      'Use the arrow keys and Enter, or click a result.',
    ],
    href: '/',
    link: 'Back to the dashboard',
  },
  {
    category: 'Getting around',
    icon: LayoutDashboard,
    title: 'Customize your dashboard',
    steps: [
      'My work shows only what is assigned to you or waiting on you.',
      'On Team, click Customize to show, hide and reorder the cards.',
      'Your layout is kept in this browser; Reset to default brings back your role’s layout.',
    ],
    href: '/',
    link: 'Open the dashboard',
  },
  {
    category: 'Getting around',
    icon: Bell,
    title: 'Keep on top of notifications',
    steps: [
      'Notifications lists approvals, feedback you owe, candidate replies and stalled applications.',
      'Filter by type, open an item to act on it, or mark it done.',
      'Done items move to the Done list and come back if something new happens.',
    ],
    href: '/notifications',
    link: 'Open notifications',
  },
  {
    category: 'Jobs',
    icon: Briefcase,
    title: 'Post a job',
    steps: [
      'Click Post a Job in the header.',
      'Fill in the title, department, location and description.',
      'Submit it. If your workspace uses approvals, it opens once approved.',
    ],
    href: '/jobs/new',
    link: 'Post a job',
  },
  {
    category: 'Jobs',
    icon: Stamp,
    title: 'Approve a job or an offer',
    steps: [
      'Requests waiting on you show in Waiting on you and in Notifications.',
      'Open the request, read the details and the note from the requester.',
      'Approve or reject it. Your decision is recorded on the job or the offer.',
    ],
    href: '/approvals',
    link: 'Open approvals',
  },
  {
    category: 'Candidates',
    icon: UserPlus,
    title: 'Add a candidate',
    steps: [
      'Open Candidates and click Add candidate, or import from a resume or a CSV file.',
      'Fill in their details and save. Their profile opens under Candidates.',
    ],
    href: '/candidates',
    link: 'Open candidates',
  },
  {
    category: 'Candidates',
    icon: Workflow,
    title: 'Move a candidate',
    steps: [
      'Open Pipeline and pick the job.',
      'Drag the candidate card to the next stage, or open the candidate and use Move stage.',
      'Rejecting asks for a reason, so every decision is recorded.',
    ],
    href: '/pipeline',
    link: 'Open pipeline',
  },
  {
    category: 'Interviews',
    icon: CalendarPlus,
    title: 'Schedule an interview',
    steps: [
      'Open the candidate and choose Schedule interview.',
      'Pick the interview type, the interviewers and a time.',
      'Everyone on the panel sees it under Interviews.',
    ],
    href: '/candidates',
    link: 'Open candidates',
  },
  {
    category: 'Interviews',
    icon: ClipboardCheck,
    title: 'Submit a scorecard',
    steps: [
      'Open Interviews and find the interview you ran.',
      'Rate each criterion, add notes and give your recommendation.',
      'Submit scorecard. It locks after submitting, so the panel compares fair, independent views.',
    ],
    href: '/interviews',
    link: 'Open interviews',
  },
  {
    category: 'Reports',
    icon: LineChart,
    title: 'Read and share a report',
    steps: [
      'Open Reports and pick one from the sidebar: pipeline, speed, sources or team.',
      'Filter by job, source and dates. Save the filters you use often as a saved view.',
      'Export the table as CSV, or Download PDF to print or share it.',
    ],
    href: '/reports',
    link: 'Open reports',
  },
  {
    category: 'Reports',
    icon: Wand2,
    title: 'Build a custom report',
    steps: [
      'Open Reports → Report builder.',
      'Choose the data, what to split it by and what to measure, then a chart type.',
      'Save view keeps it in this browser so you can reopen it in one click.',
    ],
    href: '/reports/builder',
    link: 'Open the builder',
  },
];

export function HelpPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | Category>('all');
  const q = query.trim().toLowerCase();
  const matching = guides.filter(
    (g) => !q || [g.title, ...g.steps].some((text) => text.toLowerCase().includes(q)),
  );
  const visible = category === 'all' ? matching : matching.filter((g) => g.category === category);

  return (
    <>
      <PageHeader
        title="Help"
        description="Short how-tos for the things you do most, and every keyboard shortcut."
      >
        <div className="flex flex-col gap-3">
          <SearchInput
            aria-label="Search help"
            placeholder="Search help, e.g. “scorecard” or “export”"
            className="max-w-md"
            value={query}
            onValueChange={setQuery}
          />
          <Tabs
            aria-label="Help topics"
            variant="pills"
            value={category}
            onValueChange={(value) => setCategory(value as typeof category)}
            items={[
              { value: 'all', label: 'All', count: matching.length },
              ...categories.map((value) => ({
                value,
                label: value,
                count: matching.filter((g) => g.category === value).length,
              })),
            ]}
          />
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {visible.length === 0 ? (
          <Card>
            <EmptyState
              icon={SearchX}
              title="No how-to matches that"
              description="Try another word, or look through every topic."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setCategory('all');
                  }}
                >
                  Show all topics
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid content-start gap-5 md:grid-cols-2">
            {visible.map((g) => (
              <Card key={g.title} className="flex flex-col p-5">
                <div className="flex items-center gap-3">
                  <IconDisc icon={g.icon} size="md" />
                  <div className="min-w-0">
                    <p className="text-2xs font-medium tracking-[0.06em] text-fg-subtle uppercase">
                      {g.category}
                    </p>
                    <h2 className="text-lg font-semibold text-fg">{g.title}</h2>
                  </div>
                </div>
                <ol className="mt-4 flex-1 list-decimal space-y-2 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
                  {g.steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="mt-4">
                  <CardLink href={g.href}>{g.link}</CardLink>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-5">
          <Card className="flex items-center gap-4 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/thorney.png"
              alt="Thorney, the MyThorneAI mascot"
              className="h-24 w-auto shrink-0"
            />
            <div>
              <p className="text-base font-semibold text-fg">Hi, I&apos;m Thorney</p>
              <p className="mt-1 text-sm text-fg-muted">
                Click me in the sidebar any time for quick tips.
              </p>
            </div>
          </Card>

          <Card id="shortcuts">
            <CardHeader
              title="Keyboard shortcuts"
              description="Press ? anywhere to see these. Use Ctrl instead of ⌘ on Windows and Linux."
            />
            <ShortcutList className="px-5 pb-2" />
          </Card>

          {process.env.NODE_ENV === 'development' && (
            <Link href="/design" className="group">
              <Card className="flex items-center gap-3 p-5 transition-colors group-hover:bg-muted">
                <IconDisc icon={Palette} tone="violet" size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-fg">Design system</span>
                  <span className="block text-xs text-fg-subtle">
                    Every component in light and dark. Development only.
                  </span>
                </span>
                <ArrowRight className="size-4 text-fg-subtle" aria-hidden />
              </Card>
            </Link>
          )}
        </div>
      </div>
    </>
  );
}

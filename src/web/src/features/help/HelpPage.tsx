'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, ExternalLink, LifeBuoy, Mail, Palette, SearchX, Sparkles } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { ShortcutList } from '@/components/layout/CommandSearch';
import {
  Accordion,
  AccordionItem,
  Button,
  Card,
  CardHeader,
  CardLink,
  EmptyState,
  IconDisc,
  PageHeader,
  SearchInput,
} from '@/components/ui';
import { useAbility, type AppAbility } from '@/lib/ability';

type Guide = {
  key: string;
  task: string;
  title: string;
  steps: string[];
  href: string;
  link: string;
  /** Shown only to people who can do it. */
  allowed?: (ability: AppAbility) => boolean;
};

const GUIDES: Guide[] = [
  {
    key: 'feedback',
    task: 'Interviews',
    title: 'Submit a scorecard',
    steps: [
      'Open Interviews and find the interview you ran.',
      'Rate each area, add notes and say whether you would hire.',
      'Click Submit scorecard. It locks after that, so every interviewer’s view stays independent.',
      'Other people’s feedback opens to you once yours is in.',
    ],
    href: '/interviews',
    link: 'Open interviews',
  },
  {
    key: 'calendar',
    task: 'Interviews',
    title: 'Connect your calendar',
    steps: [
      'Open Settings, then Calendar and hours.',
      'Connect your Google or Microsoft calendar. We only read when you are busy.',
      'Set your working hours and time zone, so interviews are booked when you are free.',
    ],
    href: '/settings/availability',
    link: 'Open calendar and hours',
  },
  {
    key: 'schedule',
    task: 'Interviews',
    title: 'Schedule an interview',
    steps: [
      'Open the candidate and choose Schedule interview.',
      'Pick the interview type, the interviewers and a time.',
      'Everyone on the panel sees it under Interviews.',
    ],
    href: '/interviews',
    link: 'Open interviews',
    allowed: (a) => a.can('schedule', 'Interview'),
  },
  {
    key: 'post-job',
    task: 'Jobs',
    title: 'Post a job',
    steps: [
      'Click Post a Job in the header.',
      'Fill in the title, department, location and description.',
      'Submit it. If your company needs approval first, the job opens once it’s approved.',
    ],
    href: '/jobs/new',
    link: 'Post a job',
    allowed: (a) => a.can('create', 'Job'),
  },
  {
    key: 'approve',
    task: 'Jobs',
    title: 'Approve a job or an offer',
    steps: [
      'Requests waiting on you show in Waiting on you and in Notifications.',
      'Open the request. Read the details and the note from the person who asked.',
      'Approve or reject it. We save your decision on the job or the offer.',
    ],
    href: '/approvals',
    link: 'Open approvals',
    allowed: (a) => a.can('read', 'Job'),
  },
  {
    key: 'add-candidate',
    task: 'Candidates',
    title: 'Add a candidate',
    steps: [
      'Open Candidates and click Add candidate. You can also add people from a resume or a spreadsheet (CSV).',
      'Fill in their details and save. Their profile opens under Candidates.',
    ],
    href: '/candidates',
    link: 'Open candidates',
    allowed: (a) => a.can('create', 'Candidate'),
  },
  {
    key: 'move',
    task: 'Candidates',
    title: 'Move a candidate',
    steps: [
      'Open the job and go to its Pipeline tab.',
      'Drag the candidate card to the next stage, or open the candidate and use Move stage.',
      'Rejecting asks for a reason, so every decision is recorded.',
    ],
    href: '/jobs',
    link: 'Open jobs',
    allowed: (a) => a.can('update', 'Job'),
  },
  {
    key: 'search',
    task: 'Getting around',
    title: 'Search or run a command',
    steps: [
      'Press / or ⌘K anywhere.',
      'Type a name, email or job title to find it, or type what you want to do, like “create job” or “dark mode”.',
      'Use the arrow keys and Enter, or click a result.',
    ],
    href: '/',
    link: 'Open the dashboard',
  },
  {
    key: 'notifications',
    task: 'Getting around',
    title: 'Keep on top of notifications',
    steps: [
      'Notifications lists approvals, feedback you owe, candidate replies and applications with no recent activity.',
      'Filter by type, open an item to act on it, or mark it as done.',
    ],
    href: '/notifications',
    link: 'Open notifications',
  },
  {
    key: 'dashboard',
    task: 'Getting around',
    title: 'Customize your dashboard',
    steps: [
      'My work shows only what is assigned to you or waiting on you.',
      'On Team, click Customize to show, hide and reorder the cards.',
    ],
    href: '/',
    link: 'Open the dashboard',
    allowed: (a) => a.can('read', 'Job'),
  },
  {
    key: 'report',
    task: 'Reports',
    title: 'Read and share a report',
    steps: [
      'Open Reports and pick one from the side: pipeline, speed, sources or team.',
      'Filter by job, source and dates. Save the filters you use often as a saved view.',
      'Download the table as a spreadsheet (CSV), or as a PDF to print or share.',
    ],
    href: '/reports',
    link: 'Open reports',
    allowed: (a) => a.can('read', 'Report'),
  },
  {
    key: 'report-view',
    task: 'Reports',
    title: 'Save a report your way',
    steps: [
      'Open any report. Choose the dates and filters, and pick what to break it down by.',
      'Choose Save view and give it a name. Share it with your team if you like.',
      'From the view’s menu, pin it to the reports overview or have it emailed every week or month.',
    ],
    href: '/reports',
    link: 'Open reports',
    allowed: (a) => a.can('read', 'Report'),
  },
  {
    key: 'role',
    task: 'Your team',
    title: 'Make a role of your own',
    steps: [
      'Open Settings, then Roles. Choose Duplicate on the role closest to what you need.',
      'Name it, then pick which jobs it works on and what else it can do.',
      'Save, then give it to people under Members or when you invite them.',
    ],
    href: '/settings/roles',
    link: 'Open roles',
    allowed: (a) => a.can('manage', 'Member'),
  },
];

/** The guides this person can use, grouped by task. Interviews lead for people who don't run jobs. */
function guidesFor(ability: AppAbility, query: string) {
  const q = query.trim().toLowerCase();
  const order = ability.can('read', 'Job')
    ? ['Getting around', 'Jobs', 'Candidates', 'Interviews', 'Reports', 'Your team']
    : ['Interviews', 'Getting around', 'Candidates', 'Reports'];
  const guides = GUIDES.filter(
    (g) =>
      (!g.allowed || g.allowed(ability)) &&
      (!q || [g.title, g.task, ...g.steps].some((text) => text.toLowerCase().includes(q))),
  );
  return order
    .map((task) => ({ task, guides: guides.filter((g) => g.task === task) }))
    .filter((group) => group.guides.length > 0);
}

export function HelpPage() {
  const user = useCurrentUser();
  const ability = useAbility();
  const params = useSearchParams();
  const [query, setQuery] = useState('');
  const groups = guidesFor(ability, query);
  // ?guide=feedback opens that guide, for links from elsewhere (the welcome, emails).
  const [open, setOpen] = useState<string[]>(() => {
    const asked = params?.get('guide');
    return asked ? [asked] : [groups[0]?.guides[0]?.key].filter((k): k is string => !!k);
  });

  return (
    <>
      <PageHeader
        title="Help"
        description="Short how-tos for what you can do here, and every keyboard shortcut."
      >
        <SearchInput
          aria-label="Search help"
          placeholder="Search help, for example “scorecard”"
          className="max-w-md"
          value={query}
          onValueChange={setQuery}
        />
      </PageHeader>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={SearchX}
              title="No how-to matches that"
              description="Try another word, or ask support below."
              action={
                <Button variant="secondary" onClick={() => setQuery('')}>
                  Show every how-to
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="flex min-w-0 flex-col gap-6">
            {groups.map((group) => (
              <section key={group.task} aria-labelledby={`help-${group.task}`}>
                <h2
                  id={`help-${group.task}`}
                  className="mb-2 text-xs font-semibold tracking-[0.06em] text-fg-subtle uppercase"
                >
                  {group.task}
                </h2>
                <Accordion
                  type="multiple"
                  value={query ? group.guides.map((g) => g.key) : open}
                  onValueChange={setOpen}
                  className="space-y-2"
                >
                  {group.guides.map((g) => (
                    <AccordionItem key={g.key} value={g.key} title={g.title}>
                      <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-muted marker:text-fg-subtle">
                        {g.steps.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ol>
                      <div className="mt-4">
                        <CardLink href={g.href}>{g.link}</CardLink>
                      </div>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-5">
          {user.supportEmail && (
            <Card className="p-5">
              <div className="flex items-start gap-3">
                <IconDisc icon={LifeBuoy} size="md" />
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-fg">Still stuck?</h2>
                  <p className="mt-1 text-sm text-fg-subtle">
                    Write to us, and a person on our team replies by email.
                  </p>
                </div>
              </div>
              <Button asChild variant="secondary" fullWidth leftIcon={<Mail />} className="mt-4">
                <a
                  href={`mailto:${user.supportEmail}?subject=${encodeURIComponent(`Help with MyThorneAI (${user.organizationName ?? 'workspace'})`)}`}
                >
                  Contact support
                </a>
              </Button>
              <p className="mt-2 text-center text-xs text-fg-subtle">{user.supportEmail}</p>
            </Card>
          )}

          {user.changelogUrl && (
            <a href={user.changelogUrl} target="_blank" rel="noopener noreferrer" className="group">
              <Card className="flex items-center gap-3 p-5 transition-colors group-hover:bg-muted">
                <IconDisc icon={Sparkles} tone="violet" size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-fg">What’s new</span>
                  <span className="block text-xs text-fg-subtle">
                    Recent changes to MyThorneAI.
                  </span>
                </span>
                <ExternalLink className="size-4 text-fg-subtle" aria-hidden />
              </Card>
            </a>
          )}

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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { Button, Modal } from '@/components/ui';
import { describeAbility, useAbility, type AppAbility } from '@/lib/ability';
import { useSavePreferences } from './preferences';

type Step = { title: string; detail: string; href: string };

/** Three first steps that fit what this person can do here. */
function stepsFor(ability: AppAbility, scorecardsDue: number): Step[] {
  const calendar: Step = {
    title: 'Connect your calendar',
    detail: 'We check it before booking you, and add interviews to it.',
    href: '/settings/availability',
  };
  if (ability.can('manage', 'all'))
    return [
      {
        title: 'Invite your team',
        detail: 'Add recruiters, hiring managers and interviewers.',
        href: '/settings/members',
      },
      {
        title: 'Check your hiring pipelines',
        detail: 'The stages every new job starts with.',
        href: '/settings/pipelines',
      },
      {
        title: 'Post a job',
        detail: 'Write it, then open it for applications.',
        href: '/jobs/new',
      },
    ];
  if (ability.can('create', 'Candidate'))
    return [
      {
        title: 'Post a job',
        detail: 'Write it, then open it for applications.',
        href: '/jobs/new',
      },
      {
        title: 'Add candidates',
        detail: 'One at a time, or many from a spreadsheet (CSV).',
        href: '/candidates',
      },
      calendar,
    ];
  if (ability.can('create', 'Job'))
    return [
      { title: 'Open your jobs', detail: 'See who applied and where they are.', href: '/jobs' },
      {
        title: 'Check what waits on you',
        detail: 'Jobs and offers that need your sign-off.',
        href: '/approvals',
      },
      calendar,
    ];
  return [
    {
      title: 'See your interviews',
      detail: 'Each one has the questions to ask and the candidate’s resume.',
      href: '/interviews',
    },
    {
      title:
        scorecardsDue > 0
          ? `Write your ${scorecardsDue} ${scorecardsDue === 1 ? 'scorecard' : 'scorecards'}`
          : 'Learn how feedback works',
      detail: 'Score after each interview. Others’ feedback opens once you submit yours.',
      href: scorecardsDue > 0 ? '/interviews' : '/help?guide=feedback',
    },
    calendar,
  ];
}

/** The first time an invited person signs in: what they can do here and three next steps. */
export function WelcomeDialog() {
  const user = useCurrentUser();
  const ability = useAbility();
  const save = useSavePreferences();
  const [open, setOpen] = useState(true);
  const due = useQuery({
    queryKey: ['my-scorecards', 'due'],
    queryFn: () => api.get<{ counts?: { due: number } }>('/api/me/scorecards?status=due'),
  });
  const close = () => {
    setOpen(false);
    save.mutate({ welcome: false });
  };
  const firstName = user.displayName.split(' ')[0];
  return (
    <Modal
      opened={open}
      onClose={close}
      size="md"
      title={`Welcome to ${user.organizationName ?? 'MyThorneAI'}, ${firstName}`}
      description="Here is what you can do, and where to start."
      footer={<Button onClick={close}>Get started</Button>}
    >
      <ul className="space-y-1.5">
        {describeAbility(ability).map((line) => (
          <li key={line} className="flex gap-2 text-base text-fg-muted">
            <Check className="mt-0.5 size-4 shrink-0 text-tone-green-fg" aria-hidden />
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-5 mb-2 text-xs font-semibold tracking-[0.06em] text-fg-subtle uppercase">
        Next steps
      </p>
      <ol className="divide-y divide-border-subtle rounded-xl border border-border">
        {stepsFor(ability, due.data?.counts?.due ?? 0).map((step, index) => (
          <li key={step.title}>
            <Link
              href={step.href}
              onClick={close}
              className="group flex items-center gap-3 px-4 py-3 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground tnum">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium text-fg">{step.title}</span>
                <span className="block text-sm text-fg-subtle">{step.detail}</span>
              </span>
              <ArrowRight
                className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ol>
    </Modal>
  );
}

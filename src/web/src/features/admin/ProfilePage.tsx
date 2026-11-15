'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarCheck, CalendarX, Check, ChevronRight, Globe } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { Avatar, Badge, Card, CardHeader, Input, toast } from '@/components/ui';
import { changesEveryOpenJob, describeAbility, useAbility } from '@/lib/ability';
import { cn } from '@/lib/cn';
import type { User } from '@/types';
import { SettingsHeader } from './SettingsShell';
import { SettingsSection, useDraft } from './settings-shared';

type Tone = NonNullable<User['avatarTone']>;
const TONES: { value: Tone; label: string }[] = [
  { value: 'blue', label: 'Blue' },
  { value: 'violet', label: 'Violet' },
  { value: 'green', label: 'Green' },
  { value: 'amber', label: 'Amber' },
  { value: 'red', label: 'Red' },
  { value: 'gray', label: 'Gray' },
];

const PROVIDERS: Record<string, string> = { google: 'Google', microsoft: 'Microsoft' };

export function ProfilePage() {
  return (
    <>
      <SettingsHeader />
      <div className="flex max-w-3xl flex-col gap-5">
        <IdentitySection />
        <AccessCard />
        <TimeCard />
      </div>
    </>
  );
}

/** Name and avatar colour: the two things about yourself you can change here. */
function IdentitySection() {
  const user = useCurrentUser();
  const router = useRouter();
  const { draft, set, dirty, reset } = useDraft({
    displayName: user.displayName,
    avatarTone: user.avatarTone ?? null,
  });
  const noName = !draft.displayName.trim();
  const save = useMutation({
    mutationFn: () =>
      api.put('/api/me', {
        displayName: draft.displayName.trim(),
        avatarTone: draft.avatarTone ?? '',
      }),
    onSuccess: () => {
      toast.success('Profile saved');
      router.refresh();
    },
    onError: (error: Error) => toast.error('Your profile wasn’t saved', error.message),
  });
  return (
    <SettingsSection
      id="profile"
      title="Name and picture"
      dirty={dirty && !noName}
      saving={save.isPending}
      onSave={() => save.mutate()}
      onDiscard={reset}
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <Avatar
          name={draft.displayName || user.displayName}
          tone={draft.avatarTone ?? undefined}
          size="2xl"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <Input
            label="Your name"
            description="Teammates and candidates see this name."
            value={draft.displayName}
            onChange={(event) => set({ displayName: event.currentTarget.value })}
            error={noName ? 'Write your name.' : undefined}
          />
          <fieldset>
            <legend className="text-sm font-medium text-fg">Picture colour</legend>
            <div
              role="radiogroup"
              aria-label="Picture colour"
              className="mt-2 flex flex-wrap gap-2"
            >
              {TONES.map((tone) => {
                const on = draft.avatarTone === tone.value;
                return (
                  <button
                    key={tone.value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={tone.label}
                    onClick={() => set({ avatarTone: tone.value })}
                    className={cn(
                      'relative rounded-full p-0.5 ring-offset-2 ring-offset-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      on && 'ring-2 ring-primary',
                    )}
                  >
                    <Avatar
                      name={draft.displayName || user.displayName}
                      tone={tone.value}
                      size="sm"
                    />
                    {on && (
                      <Check
                        className="absolute -right-0.5 -bottom-0.5 size-3.5 rounded-full bg-primary p-0.5 text-primary-foreground"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <p className="text-sm text-fg-subtle">
            You sign in as <span className="font-medium text-fg-muted">{user.email}</span>. Ask an
            admin if this address should change.
          </p>
        </div>
      </div>
    </SettingsSection>
  );
}

/** Role, teams and the plain list of what that lets you do. Admins change these under Members. */
function AccessCard() {
  const user = useCurrentUser();
  const ability = useAbility();
  const teams = user.departments ?? [];
  const scope =
    ability.can('manage', 'all') || !ability.can('read', 'Job')
      ? null
      : teams.length > 0
        ? `Jobs in ${teams.join(', ')}, and jobs you are on`
        : changesEveryOpenJob(ability)
          ? 'Every job that isn’t confidential'
          : 'The jobs you are on';
  return (
    <Card>
      <CardHeader
        title="Your access"
        description={
          ability.can('manage', 'Member') ? undefined : 'An admin can change your role and teams.'
        }
        action={<Badge tone="blue">{user.roleName}</Badge>}
      />
      <div className="border-t border-border-subtle px-5 py-5">
        {scope && (
          <p className="mb-4 text-base text-fg">
            <span className="text-fg-subtle">Jobs you see: </span>
            {scope}
          </p>
        )}
        <ul className="space-y-1.5">
          {describeAbility(ability).map((line) => (
            <li key={line} className="flex gap-2 text-base text-fg-muted">
              <Check className="mt-0.5 size-4 shrink-0 text-tone-green-fg" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

interface CalendarConnection {
  connected: boolean;
  provider?: string;
  accountEmail?: string | null;
}

/** Time zone and calendar, both managed on Calendar and hours. */
function TimeCard() {
  const user = useCurrentUser();
  const calendar = useQuery({
    queryKey: ['calendar-connection'],
    queryFn: () => api.get<CalendarConnection>('/api/calendar/connection'),
  });
  const zone = user.timeZone ?? user.organizationTimeZone ?? 'UTC';
  const connected = calendar.data?.connected;
  return (
    <Card>
      <CardHeader title="Time zone and calendar" />
      <Link
        href="/settings/availability"
        className="group flex items-center gap-4 border-t border-border-subtle px-5 py-4 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:gap-8">
          <span className="flex items-center gap-2 text-base text-fg">
            <Globe className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            {zone.replaceAll('_', ' ')}
            {!user.timeZone && <span className="text-fg-subtle">(the workspace’s)</span>}
          </span>
          <span className="flex items-center gap-2 text-base text-fg">
            {connected ? (
              <CalendarCheck className="size-4 shrink-0 text-tone-green-fg" aria-hidden />
            ) : (
              <CalendarX className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            )}
            {calendar.isPending
              ? 'Checking your calendar…'
              : connected
                ? `${PROVIDERS[(calendar.data?.provider ?? '').toLowerCase()] ?? 'Calendar'} connected${calendar.data?.accountEmail ? ` (${calendar.data.accountEmail})` : ''}`
                : 'No calendar connected'}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-medium text-accent-foreground">
          Calendar and hours
          <ChevronRight
            className="size-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </Link>
    </Card>
  );
}

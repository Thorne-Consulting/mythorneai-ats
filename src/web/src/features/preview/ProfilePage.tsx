'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  DescriptionList,
  PageHeader,
  Separator,
  Switch,
} from '@/components/ui';
import { useCurrentUser } from '@/auth';
import { humanize } from '@/lib/format';
import { PreviewAlert, PreviewTitle } from './preview-ui';

const notifications = [
  {
    key: 'applied',
    label: 'New applicants',
    description: 'Email me when someone applies to a job I own.',
  },
  {
    key: 'interviews',
    label: 'Interview reminders',
    description: 'A reminder an hour before each interview I am on.',
  },
  {
    key: 'scorecards',
    label: 'Scorecards due',
    description: 'Nudge me when a scorecard is still open the next day.',
  },
  { key: 'mentions', label: 'Mentions', description: 'When a teammate mentions me in a note.' },
  {
    key: 'digest',
    label: 'Weekly summary',
    description: 'A Monday email with my open jobs and pipeline.',
  },
] as const;

type NotificationKey = (typeof notifications)[number]['key'];

export function ProfilePage() {
  const user = useCurrentUser();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'My settings', href: '/settings/profile' }, { label: 'Profile' }]}
        title="My profile"
        description="Your account details. Your workspace admin manages them."
      />
      <Card className="max-w-3xl">
        <CardHeader title="Account" description="Managed by your workspace admin." />
        <div className="px-5 pb-5">
          <div className="flex items-center gap-4">
            <Avatar name={user.displayName} size="xl" />
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-fg">{user.displayName}</p>
              <p className="truncate text-sm text-fg-subtle">{user.email}</p>
            </div>
          </div>
          <Separator className="my-4" />
          <DescriptionList
            columns={2}
            items={[
              { label: 'Role', value: <Badge tone="blue">{humanize(user.role)}</Badge> },
              { label: 'Department', value: user.department || '—' },
              { label: 'Workspace', value: user.organizationName || '—' },
              { label: 'Email', value: user.email },
            ]}
          />
          <p className="mt-4 text-sm text-fg-subtle">
            Theme and table settings are under{' '}
            <Link href="/settings/preferences" className="text-accent-foreground hover:underline">
              Preferences
            </Link>
            .
          </p>
        </div>
      </Card>
    </>
  );
}

export function NotificationPrefsPage() {
  const [prefs, setPrefs] = useState<Record<NotificationKey, boolean>>({
    applied: true,
    interviews: true,
    scorecards: true,
    mentions: true,
    digest: false,
  });
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'My settings', href: '/settings/profile' },
          { label: 'Notifications' },
        ]}
        title={<PreviewTitle>Notifications</PreviewTitle>}
        description="Choose what reaches your inbox."
      />
      <PreviewAlert>
        Notification preferences run on sample data until the backend exists. Changes last until you
        leave the page.
      </PreviewAlert>
      <Card className="max-w-3xl">
        <CardHeader title="Email me about" />
        <div className="divide-y divide-border-subtle px-5 pb-2">
          {notifications.map((n) => (
            <Switch
              key={n.key}
              labelPosition="left"
              label={n.label}
              description={n.description}
              checked={prefs[n.key]}
              onCheckedChange={(on) => setPrefs((p) => ({ ...p, [n.key]: on }))}
              className="py-3"
            />
          ))}
        </div>
      </Card>
    </>
  );
}

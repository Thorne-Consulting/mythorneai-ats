'use client';

import { useState, type ReactNode } from 'react';
import { Bell, Monitor, Moon, Settings, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { SectionNav, SidebarLayout, type SectionGroup } from '@/components/layout/SectionLayout';
import {
  Badge,
  Button,
  ConfirmDialog,
  PageHeader,
  SegmentedControl,
  Select,
  toast,
} from '@/components/ui';
import { useLocalStorageState } from '@/lib/hooks';
import { setTheme, useTheme, type ThemePref } from '@/lib/theme';
import { isAdmin } from './admin-data';
import { SettingsSection } from './settings-shared';

/** Per-browser preference keys. Shared code may read these (e.g. the shell for the start page). */
export const PREF_KEYS = {
  density: 'ats-pref:density',
  startPage: 'ats-pref:start-page',
} as const;

const START_PAGES = [
  { value: '/', label: 'Dashboard' },
  { value: '/jobs', label: 'Jobs' },
  { value: '/candidates', label: 'Candidates' },
  { value: '/pipeline', label: 'Pipeline' },
  { value: '/interviews', label: 'Interviews' },
  { value: '/approvals', label: 'Approvals' },
];

/** /settings/*: the signed-in person's own settings beside a second sidebar. */
export function MySettingsShell({ children }: { children: ReactNode }) {
  const user = useCurrentUser();
  const groups: SectionGroup[] = [
    {
      label: 'Me',
      items: [
        { href: '/settings/profile', label: 'Profile', icon: UserRound },
        {
          href: '/settings/notifications',
          label: 'Notifications',
          icon: Bell,
          badge: <Badge tone="amber">Preview</Badge>,
        },
        { href: '/settings/preferences', label: 'Preferences', icon: SlidersHorizontal },
      ],
    },
    ...(isAdmin(user.role)
      ? [
          {
            label: 'Workspace',
            items: [{ href: '/admin', label: 'Workspace settings', icon: Settings }],
          },
        ]
      : []),
  ];
  return (
    <SidebarLayout nav={<SectionNav title="My settings" groups={groups} />}>
      {children}
    </SidebarLayout>
  );
}

/** Everything in table storage: column choice, density and sort (ats-table:*), saved views (ats-views:*). */
function tableKeys() {
  try {
    return Object.keys(localStorage).filter(
      (key) => key.startsWith('ats-table:') || key.startsWith('ats-views:'),
    );
  } catch {
    return [];
  }
}

/** Sets density on every table this browser has already remembered. */
function applyDensity(density: 'comfortable' | 'compact') {
  for (const key of tableKeys().filter((k) => k.startsWith('ats-table:'))) {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? '{}');
      localStorage.setItem(key, JSON.stringify({ ...value, density }));
    } catch {}
  }
}

export function PreferencesPage() {
  const theme = useTheme();
  const [density, setDensity] = useLocalStorageState<'comfortable' | 'compact'>(
    PREF_KEYS.density,
    'comfortable',
  );
  const [startPage, setStartPage] = useLocalStorageState(PREF_KEYS.startPage, '/');
  const [resetting, setResetting] = useState(false);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'My settings', href: '/settings/profile' },
          { label: 'Preferences' },
        ]}
        title="Preferences"
        description="How MyThorneAI looks and works for you. We save these in this browser only."
      />
      <div className="flex max-w-3xl flex-col gap-5">
        <SettingsSection id="theme" title="Theme">
          <SegmentedControl
            aria-label="Theme"
            value={theme}
            onValueChange={(v) => setTheme(v as ThemePref)}
            items={[
              { value: 'light', label: 'Light', icon: <Sun /> },
              { value: 'dark', label: 'Dark', icon: <Moon /> },
              { value: 'system', label: 'System', icon: <Monitor /> },
            ]}
          />
        </SettingsSection>

        <SettingsSection
          id="density"
          title="Table density"
          description="Compact fits more rows on screen. This changes every table you have opened. You can still change one table from its own menu."
        >
          <SegmentedControl
            aria-label="Table density"
            value={density}
            onValueChange={(v) => {
              const next = v as 'comfortable' | 'compact';
              setDensity(next);
              applyDensity(next);
              toast.success(
                next === 'compact' ? 'Tables set to compact' : 'Tables set to comfortable',
              );
            }}
            items={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </SettingsSection>

        <SettingsSection
          id="start-page"
          title="Start page"
          description="Where you land when you open MyThorneAI."
        >
          <Select
            inset
            label="Open on"
            className="max-w-xs"
            data={START_PAGES}
            value={startPage}
            onChange={(value) => setStartPage(value ?? '/')}
          />
        </SettingsSection>

        <SettingsSection
          id="table-views"
          title="Table views"
          description="Hidden columns, sort orders and saved views on lists such as Jobs and Candidates."
          action={
            <Button variant="secondary" onClick={() => setResetting(true)}>
              Reset table views
            </Button>
          }
        >
          <p className="text-sm text-fg-muted">
            Resetting only changes this browser. Your jobs, candidates and other data stay the same.
          </p>
        </SettingsSection>
      </div>
      <ConfirmDialog
        opened={resetting}
        onClose={() => setResetting(false)}
        title="Reset all table views?"
        message="Hidden columns, sort orders and saved views in this browser go back to the standard setup. This can’t be undone."
        confirmLabel="Reset table views"
        onConfirm={() => {
          const keys = tableKeys();
          for (const key of keys) {
            try {
              localStorage.removeItem(key);
            } catch {}
          }
          toast.success(
            keys.length ? 'Table views reset' : 'Nothing to reset',
            'Reload a list to see the standard columns.',
          );
        }}
      />
    </>
  );
}

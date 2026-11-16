'use client';

import { useState, type ReactNode } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { Button, Card, ConfirmDialog, SegmentedControl, Select, toast } from '@/components/ui';
import { useAbility } from '@/lib/ability';
import { setTheme, useTheme, type ThemePref } from '@/lib/theme';
import type { UserPreferences } from '@/types';
import { startPagesFor, useSavePreferences } from './preferences';
import { SettingsHeader } from './SettingsShell';

const DATE_FORMATS = [
  { value: 'auto', label: 'Your browser’s language' },
  { value: 'month', label: 'Nov 13, 2026' },
  { value: 'day', label: '13 Nov 2026' },
  { value: 'iso', label: '2026-11-13' },
];

/** Table layouts this browser remembers: column choice, density and sort (ats-table:*), saved filters (ats-views:*). */
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

/** One labelled row of the preferences card: words on the left, the control on the right. */
function Row({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-base font-medium text-fg">{label}</p>
        {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function PreferencesPage() {
  const user = useCurrentUser();
  const ability = useAbility();
  const theme = useTheme();
  const prefs = user.preferences ?? {};
  const save = useSavePreferences();
  const [resetting, setResetting] = useState(false);
  const saveOne = (patch: UserPreferences, message: string) =>
    save.mutate(patch, { onSuccess: () => toast.success(message) });
  const startPages = startPagesFor(ability);

  return (
    <>
      <SettingsHeader description="How MyThorneAI looks and works for you, on every computer you sign in on." />
      <Card className="max-w-3xl divide-y divide-border-subtle">
        <Row label="Theme">
          <SegmentedControl
            aria-label="Theme"
            value={theme}
            onValueChange={(v) => {
              setTheme(v as ThemePref);
              save.mutate({ theme: v as ThemePref });
            }}
            items={[
              { value: 'light', label: 'Light', icon: <Sun /> },
              { value: 'dark', label: 'Dark', icon: <Moon /> },
              { value: 'system', label: 'System', icon: <Monitor /> },
            ]}
          />
        </Row>
        <Row label="Table density" description="Compact fits more rows on screen.">
          <SegmentedControl
            aria-label="Table density"
            value={prefs.density ?? 'comfortable'}
            onValueChange={(v) => {
              const density = v as 'comfortable' | 'compact';
              applyDensity(density);
              saveOne(
                { density },
                density === 'compact' ? 'Tables set to compact' : 'Tables set to comfortable',
              );
            }}
            items={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />
        </Row>
        <Row label="Dates" description="How dates read across MyThorneAI.">
          <Select
            aria-label="Date format"
            className="w-56"
            data={DATE_FORMATS}
            value={prefs.dateFormat ?? 'auto'}
            onChange={(value) =>
              saveOne(
                { dateFormat: (value ?? 'auto') as UserPreferences['dateFormat'] },
                'Date format saved',
              )
            }
          />
        </Row>
        <Row label="Start page" description="Where you land when you open MyThorneAI.">
          <Select
            aria-label="Start page"
            className="w-56"
            data={startPages.map(({ value, label }) => ({ value, label }))}
            value={startPages.some((p) => p.value === prefs.startPage) ? prefs.startPage! : '/'}
            onChange={(value) => saveOne({ startPage: value ?? '/' }, 'Start page saved')}
          />
        </Row>
        <Row
          label="Table layout"
          description="Hidden columns, sort orders and saved filters on lists in this browser."
        >
          <Button variant="secondary" onClick={() => setResetting(true)}>
            Reset table layout
          </Button>
        </Row>
      </Card>
      <ConfirmDialog
        opened={resetting}
        onClose={() => setResetting(false)}
        title="Reset table layout in this browser?"
        message="Every list goes back to its standard columns, sort order and density, and filters saved in this browser are removed. Views saved to your account, such as saved candidate searches, stay. Your jobs, candidates and other data stay the same."
        confirmLabel="Reset table layout"
        onConfirm={() => {
          const keys = tableKeys();
          for (const key of keys) {
            try {
              localStorage.removeItem(key);
            } catch {}
          }
          toast.success(
            keys.length ? 'Table layout reset' : 'Nothing to reset',
            'Reload a list to see the standard columns.',
          );
        }}
      />
    </>
  );
}

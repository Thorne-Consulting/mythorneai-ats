'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '@/api';
import { NumberInput, SkeletonRows, Switch, toast } from '@/components/ui';
import { SettingsSection, useDraft } from '@/features/admin/settings-shared';
import { workflowKeys, type Reminder } from './workflow-api';

const DAYS_LABEL: Record<string, string> = {
  'booking-reminder': 'Remind after (days)',
  'scorecard-reminder': 'Days after the interview',
  'stale-candidate': 'Days with no activity',
};

/**
 * The simple front for the built-in reminder workflows: on or off, after how many days, and how
 * many times. The graph is one click away, for people who want to change the emails or add steps.
 */
export function ReminderSettings() {
  const queryClient = useQueryClient();
  const reminders = useQuery({
    queryKey: workflowKeys.reminders,
    queryFn: () => api.get<Reminder[]>('/api/workflows/reminders'),
  });
  const source = Object.fromEntries(
    (reminders.data ?? []).map((r) => [
      r.key,
      { enabled: r.enabled, days: r.days, maxReminders: r.maxReminders },
    ]),
  );
  const { draft, set, dirty, reset } = useDraft(source);
  const save = useMutation({
    mutationFn: async () => {
      for (const r of reminders.data ?? [])
        if (JSON.stringify(draft[r.key]) !== JSON.stringify(source[r.key]))
          await api.put(`/api/workflows/reminders/${r.key}`, draft[r.key]);
    },
    onSuccess: () => toast.success('Reminders saved'),
    onError: (error: Error) => toast.error('Could not save the reminders', error.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workflowKeys.reminders });
      queryClient.invalidateQueries({ queryKey: workflowKeys.list });
      queryClient.invalidateQueries({ queryKey: ['organization'] });
    },
  });
  const num = (value: number | '', fallback: number) =>
    value === '' ? fallback : Math.round(value);

  return (
    <SettingsSection
      id="reminders"
      title="Reminders"
      description="Each reminder repeats after the same number of days, up to its limit."
      dirty={dirty}
      saving={save.isPending}
      onSave={() => save.mutate()}
      onDiscard={reset}
    >
      {reminders.isLoading ? (
        <SkeletonRows rows={3} />
      ) : (
        <ul className="divide-y divide-border-subtle [&>li]:py-5 [&>li:first-child]:pt-0 [&>li:last-child]:pb-0">
          {(reminders.data ?? []).map((r) => {
            const d = draft[r.key] ?? source[r.key];
            if (!d) return null;
            const update = (patch: Partial<typeof d>) => set({ [r.key]: { ...d, ...patch } });
            return (
              <li
                key={r.key}
                className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
              >
                <div className="min-w-0">
                  <Switch
                    checked={d.enabled}
                    onCheckedChange={(on) => update({ enabled: on })}
                    label={r.name}
                    description={`${r.description} ${r.runs30 === 0 ? 'None sent' : `${r.runs30} sent`} in the last 30 days.`}
                  />
                  {r.workflowId && (
                    <Link
                      href={`/settings/workflows/${r.workflowId}`}
                      className="mt-2 ml-12 inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
                    >
                      Change the emails and steps
                      <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 max-lg:ml-12 lg:w-80">
                  {d.days === null ? (
                    <p className="self-center text-xs text-fg-subtle">
                      Each assessment sets its own number of days.
                    </p>
                  ) : (
                    <NumberInput
                      inset
                      label={DAYS_LABEL[r.key] ?? 'After (days)'}
                      min={1}
                      max={60}
                      step={1}
                      disabled={!d.enabled}
                      value={d.days}
                      onValueChange={(value) => update({ days: num(value, r.days ?? 3) })}
                    />
                  )}
                  <NumberInput
                    inset
                    label="Most reminders"
                    min={1}
                    max={10}
                    step={1}
                    disabled={!d.enabled}
                    value={d.maxReminders}
                    onValueChange={(value) => update({ maxReminders: num(value, r.maxReminders) })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}

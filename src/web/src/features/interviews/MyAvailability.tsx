'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CalendarDays, Plus, X } from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  IconButton,
  IconDisc,
  Input,
  SearchSelect,
  Select,
  Switch,
  toast,
} from '@/components/ui';
import { SettingsLoading, SettingsSection, useDraft } from '@/features/admin/settings-shared';
import { browserZone, zoneName } from './interview-state';

type Hours = Record<string, string[][]>;
type Availability = {
  timeZone: string | null;
  organizationTimeZone: string;
  usesDefaultHours: boolean;
  hours: Hours;
  bufferMinutes: number;
  maxInterviewsPerDay: number | null;
  maxInterviewsPerWeek: number | null;
  calendar: { provider: string; accountEmail?: string | null; connectedAt: string } | null;
};

// Monday first, the way people read a work week. Keys are the server's weekday numbers.
const WEEK = [
  ['1', 'Monday'],
  ['2', 'Tuesday'],
  ['3', 'Wednesday'],
  ['4', 'Thursday'],
  ['5', 'Friday'],
  ['6', 'Saturday'],
  ['0', 'Sunday'],
] as const;

const CALLBACK: Record<string, [tone: 'success' | 'danger', text: string]> = {
  connected: ['success', 'Calendar connected'],
  declined: [
    'danger',
    'You did not give permission, so the calendar is not connected. Try again when you are ready.',
  ],
  incomplete: ['danger', 'The sign-in did not finish. Try connecting again.'],
  expired: ['danger', 'That took too long, so the link expired. Try connecting again.'],
  failed: [
    'danger',
    'We could not connect your calendar. Try again, or ask an admin if it keeps happening.',
  ],
};

let zones: { value: string; label: string; keywords: string }[] | null = null;

/** Every zone this browser knows, built once: naming 400 zones is slow to repeat on each keystroke. */
function zoneOptions() {
  if (zones) return zones;
  let ids: string[];
  try {
    ids = Intl.supportedValuesOf('timeZone');
  } catch {
    ids = [browserZone()];
  }
  zones = ids.map((zone) => ({
    value: zone,
    label: zone.replaceAll('_', ' '),
    keywords: `${zone} ${zoneName(zone)}`,
  }));
  return zones;
}

/**
 * /settings/availability: your calendar connection, time zone, weekly hours, buffer and limits.
 * The scheduler only suggests times inside these.
 */
export function MyAvailability() {
  const query = useQuery({
    queryKey: ['my-availability'],
    queryFn: () => api.get<Availability>('/api/me/availability'),
  });
  if (!query.data) return <SettingsLoading rows={4} />;
  return (
    <div className="space-y-5">
      <CalendarConnection data={query.data} />
      <HoursForm data={query.data} />
    </div>
  );
}

function CalendarConnection({ data }: { data: Availability }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const status = useSearchParams().get('calendar');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  // The sign-in with Google or Microsoft comes back here with ?calendar=<outcome>.
  useEffect(() => {
    if (!status) return;
    const [tone, text] = CALLBACK[status] ?? CALLBACK.failed;
    if (tone === 'success') toast.success(text);
    else setProblem(text);
    router.replace(pathname, { scroll: false });
  }, [status, pathname, router]);
  const connect = useMutation({
    mutationFn: (provider: 'Google' | 'Microsoft') =>
      api.get<{ authorizationUrl: string }>(`/api/calendar/connect/${provider}`),
    onSuccess: (result) => window.location.assign(result.authorizationUrl),
    onError: (error: Error) => setProblem(error.message),
  });
  const disconnect = useMutation({
    mutationFn: () => api.delete('/api/calendar/connection'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-availability'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-connection'] });
      toast.success('Calendar disconnected');
    },
    onError: (error: Error) => toast.error('Could not disconnect the calendar', error.message),
  });
  const calendar = data.calendar;
  return (
    <Card>
      <CardHeader
        title="Your calendar"
        description={
          calendar
            ? undefined
            : 'Interviews go on it, with a meeting link, and nobody books you when you are busy.'
        }
      />
      <div className="space-y-4 border-t border-border-subtle px-5 py-5">
        {problem && (
          <Alert tone="danger" onDismiss={() => setProblem(null)}>
            {problem}
          </Alert>
        )}
        {calendar ? (
          <div className="flex flex-wrap items-center gap-4">
            <IconDisc icon={CalendarCheck} tone="green" size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium text-fg">
                {calendar.provider === 'Google' ? 'Google Calendar' : 'Microsoft Outlook'}
              </p>
              {calendar.accountEmail && (
                <p className="truncate text-sm text-fg-subtle">{calendar.accountEmail}</p>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              loading={connect.isPending}
              onClick={() =>
                connect.mutate(calendar.provider === 'Google' ? 'Google' : 'Microsoft')
              }
            >
              Reconnect
            </Button>
            <Button variant="danger-quiet" size="sm" onClick={() => setConfirm(true)}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <IconDisc icon={CalendarDays} tone="gray" size="md" />
            <Button
              variant="secondary"
              loading={connect.isPending && connect.variables === 'Google'}
              onClick={() => connect.mutate('Google')}
            >
              Connect Google Calendar
            </Button>
            <Button
              variant="secondary"
              loading={connect.isPending && connect.variables === 'Microsoft'}
              onClick={() => connect.mutate('Microsoft')}
            >
              Connect Microsoft Outlook
            </Button>
          </div>
        )}
      </div>
      <ConfirmDialog
        opened={confirm}
        onClose={() => setConfirm(false)}
        title="Disconnect your calendar?"
        confirmLabel="Disconnect"
        message="Your booked interviews stay booked. New ones will not check your calendar for busy times, and invites you organized can no longer be updated."
        onConfirm={() =>
          disconnect.mutateAsync().then(
            () => undefined,
            () => undefined,
          )
        }
      />
    </Card>
  );
}

function HoursForm({ data }: { data: Availability }) {
  const queryClient = useQueryClient();
  const source = useMemo(
    () => ({
      timeZone: data.timeZone,
      hours: data.hours,
      bufferMinutes: data.bufferMinutes,
      maxInterviewsPerDay: data.maxInterviewsPerDay,
      maxInterviewsPerWeek: data.maxInterviewsPerWeek,
    }),
    [data],
  );
  const { draft, set, dirty, reset } = useDraft(source);
  const detected = browserZone();
  const save = useMutation({
    mutationFn: () => api.put('/api/me/availability', draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-availability'] });
      queryClient.invalidateQueries({ queryKey: ['people'] });
      toast.success('Availability saved');
    },
    onError: (error: Error) => toast.error('Could not save your availability', error.message),
  });
  const setDay = (day: string, ranges: string[][]) =>
    set({ hours: { ...draft.hours, [day]: ranges } });
  const invalid = Object.values(draft.hours).some((ranges) =>
    ranges.some(([start, end]) => !start || !end || end <= start),
  );
  return (
    <SettingsSection
      id="hours"
      title="When you can interview"
      description="The scheduler only suggests times inside your hours, in your time zone."
      dirty={dirty}
      saving={save.isPending}
      onSave={() =>
        invalid
          ? toast.error('Check your hours', 'Each range needs an end after its start.')
          : save.mutate()
      }
      onDiscard={reset}
    >
      <div className="space-y-6">
        <div className="max-w-md space-y-1.5">
          <SearchSelect
            label="Time zone"
            description={
              draft.timeZone
                ? undefined
                : `Not set, so your workspace’s zone is used: ${zoneName(data.organizationTimeZone)}.`
            }
            value={draft.timeZone}
            onChange={(value) => set({ timeZone: value })}
            data={zoneOptions()}
          />
          {draft.timeZone !== detected && (
            <Button variant="link" size="sm" onClick={() => set({ timeZone: detected })}>
              Use this device’s zone: {detected.replaceAll('_', ' ')}
            </Button>
          )}
        </div>

        <fieldset>
          <legend className="text-sm font-medium text-fg">Weekly hours</legend>
          {data.usesDefaultHours && !dirty && (
            <p className="mt-0.5 text-sm text-fg-subtle">
              You have not set your hours, so 9 AM to 5 PM, Monday to Friday, is used.
            </p>
          )}
          <ul className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {WEEK.map(([day, name]) => {
              const ranges = draft.hours[day] ?? [];
              const on = ranges.length > 0;
              return (
                <li key={day} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
                  <div className="flex w-36 items-center pt-2">
                    <Switch
                      checked={on}
                      onCheckedChange={(checked) =>
                        setDay(day, checked ? [['09:00', '17:00']] : [])
                      }
                      label={name}
                    />
                  </div>
                  {on ? (
                    <div className="min-w-0 flex-1 space-y-2">
                      {ranges.map(([start, end], index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2">
                          <Input
                            type="time"
                            size="sm"
                            aria-label={`${name} start`}
                            className="w-32"
                            value={start}
                            onChange={(event) =>
                              setDay(
                                day,
                                ranges.map((range, i) =>
                                  i === index ? [event.currentTarget.value, range[1]] : range,
                                ),
                              )
                            }
                          />
                          <span className="text-sm text-fg-subtle">to</span>
                          <Input
                            type="time"
                            size="sm"
                            aria-label={`${name} end`}
                            className="w-32"
                            value={end === '24:00' ? '23:59' : end}
                            error={
                              end && start && end <= start ? 'Ends before it starts' : undefined
                            }
                            onChange={(event) =>
                              setDay(
                                day,
                                ranges.map((range, i) =>
                                  i === index ? [range[0], event.currentTarget.value] : range,
                                ),
                              )
                            }
                          />
                          {ranges.length > 1 && (
                            <IconButton
                              label={`Remove this ${name} range`}
                              size="sm"
                              variant="quiet"
                              onClick={() =>
                                setDay(
                                  day,
                                  ranges.filter((_, i) => i !== index),
                                )
                              }
                            >
                              <X />
                            </IconButton>
                          )}
                          {index === ranges.length - 1 && (
                            <IconButton
                              label={`Add another ${name} range`}
                              size="sm"
                              variant="quiet"
                              onClick={() => setDay(day, [...ranges, nextRange(ranges)])}
                            >
                              <Plus />
                            </IconButton>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="pt-2 text-sm text-fg-subtle">Not available</p>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Break around interviews"
            value={String(draft.bufferMinutes)}
            onChange={(value) => set({ bufferMinutes: Number(value ?? 0) })}
            data={[0, 5, 10, 15, 30, 60].map((value) => ({
              value: String(value),
              label: value === 0 ? 'No break' : `${value} minutes before and after`,
            }))}
          />
          <Select
            label="Most interviews a day"
            value={draft.maxInterviewsPerDay == null ? 'none' : String(draft.maxInterviewsPerDay)}
            onChange={(value) =>
              set({ maxInterviewsPerDay: !value || value === 'none' ? null : Number(value) })
            }
            data={[
              { value: 'none', label: 'No limit' },
              ...[1, 2, 3, 4, 5, 6, 8].map((value) => ({
                value: String(value),
                label: String(value),
              })),
            ]}
          />
          <Select
            label="Most interviews a week"
            value={draft.maxInterviewsPerWeek == null ? 'none' : String(draft.maxInterviewsPerWeek)}
            onChange={(value) =>
              set({ maxInterviewsPerWeek: !value || value === 'none' ? null : Number(value) })
            }
            data={[
              { value: 'none', label: 'No limit' },
              ...[3, 5, 8, 10, 15, 20, 30].map((value) => ({
                value: String(value),
                label: String(value),
              })),
            ]}
          />
        </div>
      </div>
    </SettingsSection>
  );
}

/** A new range an hour after the last one ends, inside the day. */
function nextRange(ranges: string[][]) {
  const last = ranges[ranges.length - 1]?.[1] ?? '12:00';
  const [h] = last.split(':').map(Number);
  const start = Math.min(h + 1, 22);
  return [`${String(start).padStart(2, '0')}:00`, `${String(start + 1).padStart(2, '0')}:00`];
}

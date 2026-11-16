'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Button,
  ConfirmDialog,
  Modal,
  MultiSelect,
  SegmentedControl,
  Select,
  SkeletonRows,
  Switch,
  toast,
} from '@/components/ui';
import { useRecipients, useSubscriptions, type Subscription } from './queries';

const DAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '0', label: 'Sunday' },
];
const ordinal = (n: number) =>
  `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const DATES = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `The ${ordinal(i + 1)}`,
}));
const HOURS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${h % 12 === 0 ? 12 : h % 12}:00 ${h < 12 ? 'AM' : 'PM'}`,
}));

export type ScheduleTarget = { id: string; name: string; subscriptionId: string | null };

/** "Email on a schedule" for a saved view: how often, when, and who gets it. */
export function ScheduleModal({
  view,
  onClose,
}: {
  view: ScheduleTarget | null;
  onClose: () => void;
}) {
  const subscriptions = useSubscriptions();
  const recipients = useRecipients(!!view);
  const existing = subscriptions.data?.find((s) => s.id === view?.subscriptionId);
  const ready = !!view && !subscriptions.isLoading && !!recipients.data;
  return (
    <Modal
      opened={!!view}
      onClose={onClose}
      title="Email on a schedule"
      description={
        view
          ? `Send “${view.name}” by email. Each person sees only the jobs they can open.`
          : undefined
      }
      size="sm"
    >
      {ready ? (
        <ScheduleForm
          key={existing?.id ?? view.id}
          viewId={view.id}
          existing={existing}
          people={recipients.data!.people}
          zone={recipients.data!.zone}
          onDone={onClose}
        />
      ) : (
        <SkeletonRows rows={4} />
      )}
    </Modal>
  );
}

function ScheduleForm({
  viewId,
  existing,
  people,
  zone,
  onDone,
}: {
  viewId: string;
  existing?: Subscription;
  people: { value: string; label: string }[];
  zone: string;
  onDone: () => void;
}) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [frequency, setFrequency] = useState<'Weekly' | 'Monthly'>(existing?.frequency ?? 'Weekly');
  const [dayOfWeek, setDayOfWeek] = useState(String(existing?.dayOfWeek ?? 1));
  const [dayOfMonth, setDayOfMonth] = useState(String(existing?.dayOfMonth ?? 1));
  const [hour, setHour] = useState(String(existing?.hour ?? 8));
  const [to, setTo] = useState<string[]>(
    existing?.recipients.map((r) => r.value) ?? [me.email.toLowerCase()],
  );
  const [paused, setPaused] = useState(existing?.paused ?? false);
  const [confirmStop, setConfirmStop] = useState(false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['report-subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['report-views'] });
  };
  const body = {
    savedViewId: viewId,
    recipients: to,
    frequency,
    dayOfWeek: Number(dayOfWeek),
    dayOfMonth: Number(dayOfMonth),
    hour: Number(hour),
    paused,
  };
  const save = useMutation({
    mutationFn: () =>
      existing
        ? api.put(`/api/reports/subscriptions/${existing.id}`, body)
        : api.post('/api/reports/subscriptions', body),
    onSuccess: () => {
      refresh();
      toast.success(paused ? 'Schedule saved and paused' : 'Scheduled email saved');
      onDone();
    },
    onError: (error: Error) => toast.error('Could not save the schedule', error.message),
  });
  const stop = useMutation({
    mutationFn: () => api.delete(`/api/reports/subscriptions/${existing!.id}`),
    onSuccess: () => {
      refresh();
      toast.success('Scheduled email stopped');
      onDone();
    },
    onError: (error: Error) => toast.error('Could not stop the email', error.message),
  });
  // Someone picked earlier may have lost report access; keep them visible so the list is honest.
  const options = [
    ...people,
    ...to
      .filter((email) => !people.some((p) => p.value === email))
      .map((email) => ({ value: email, label: email })),
  ];

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <p className="mb-1.5 text-sm font-medium text-fg">How often</p>
        <SegmentedControl
          aria-label="How often"
          value={frequency}
          onValueChange={(value) => setFrequency(value as 'Weekly' | 'Monthly')}
          items={[
            { value: 'Weekly', label: 'Every week' },
            { value: 'Monthly', label: 'Every month' },
          ]}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {frequency === 'Weekly' ? (
          <Select
            label="Day"
            value={dayOfWeek}
            onChange={(value) => setDayOfWeek(value ?? '1')}
            data={DAYS}
          />
        ) : (
          <Select
            label="Day of the month"
            value={dayOfMonth}
            onChange={(value) => setDayOfMonth(value ?? '1')}
            data={DATES}
          />
        )}
        <Select
          label="Time"
          value={hour}
          onChange={(value) => setHour(value ?? '8')}
          data={HOURS}
        />
      </div>
      <p className="-mt-2 text-xs text-fg-subtle">
        Times are in {zone}, your organization’s time zone.
      </p>
      <MultiSelect
        label="Send to"
        description="Only people who can see reports are listed."
        value={to}
        onChange={setTo}
        data={options}
        placeholder="Choose people"
      />
      {existing && (
        <Switch
          checked={paused}
          onCheckedChange={setPaused}
          label="Pause this email"
          description="Nothing is sent while it’s paused. Turn this off to start again."
        />
      )}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
        {existing && (
          <Button
            type="button"
            variant="danger-quiet"
            className="mr-auto"
            onClick={() => setConfirmStop(true)}
          >
            Stop this email
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={to.length === 0}>
          Save schedule
        </Button>
      </div>
      <ConfirmDialog
        opened={confirmStop}
        onClose={() => setConfirmStop(false)}
        onConfirm={async () => {
          await stop.mutateAsync();
        }}
        title="Stop this email?"
        message="Nobody on the list will get it again. The saved view stays. You can set up a new schedule at any time."
        confirmLabel="Stop email"
      />
    </form>
  );
}

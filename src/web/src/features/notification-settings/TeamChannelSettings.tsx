'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Badge, Button, Checkbox, Input, toast } from '@/components/ui';
import { SettingsLoading, SettingsSection, useDraft } from '@/features/admin/settings-shared';
import { formatRelative } from '@/lib/format';

/** GET /api/admin/team-channel */
interface TeamChannel {
  url?: string | null;
  format?: 'slack' | 'teams' | 'other' | null;
  kinds: string[];
  events: { key: string; label: string }[];
  last?: {
    status: string;
    createdAt: string;
    completedAt?: string | null;
    lastStatusCode?: number | null;
    lastError?: string | null;
  } | null;
}

const FORMAT_LABEL = { slack: 'Slack', teams: 'Microsoft Teams', other: 'Plain text' } as const;

/** "Last post 5 minutes ago" or what went wrong, from the channel's latest delivery. */
export function lastPostText(last: TeamChannel['last']) {
  if (!last) return null;
  if (last.status === 'Succeeded')
    return { ok: true, text: `Last post ${formatRelative(last.completedAt ?? last.createdAt)}` };
  if (last.status === 'Failed')
    return {
      ok: false,
      text: `The last post failed${last.lastStatusCode ? ` (${last.lastStatusCode})` : ''}. Check the address, or make a new one in Slack or Teams.`,
    };
  return { ok: true, text: 'A post is on its way.' };
}

/**
 * Settings, Reminders and alerts: the team's Slack or Teams channel. Choose which events post
 * there; each post links back to the record. Teams addresses get an Adaptive Card.
 */
export function TeamChannelSettings() {
  const queryClient = useQueryClient();
  const channel = useQuery({
    queryKey: ['team-channel'],
    queryFn: () => api.get<TeamChannel>('/api/admin/team-channel'),
  });
  const { draft, set, dirty, reset } = useDraft({
    url: channel.data?.url ?? '',
    kinds: channel.data?.kinds ?? [],
  });
  const save = useMutation({
    mutationFn: () =>
      api.put<TeamChannel>('/api/admin/team-channel', {
        url: draft.url.trim(),
        kinds: draft.kinds,
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(['team-channel'], data);
      toast.success(data.url ? 'Team notifications saved' : 'Team notifications turned off');
    },
    onError: (error: Error) => toast.error('Could not save', error.message),
  });
  const test = useMutation({
    mutationFn: () => api.post('/api/admin/team-channel/test'),
    onSuccess: () => {
      toast.success('Test message sent', 'It should show up in the channel in a few seconds.');
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['team-channel'] }), 4000);
    },
    onError: (error: Error) => toast.error('Could not send the test message', error.message),
  });
  if (!channel.data) return <SettingsLoading rows={4} />;
  const url = draft.url.trim();
  const invalid = url.length > 0 && !url.startsWith('https://');
  const saved = !!channel.data.url;
  const last = lastPostText(channel.data.last);
  const toggle = (key: string, on: boolean) =>
    set({ kinds: on ? [...draft.kinds, key] : draft.kinds.filter((k) => k !== key) });

  return (
    <SettingsSection
      id="notifications"
      title="Slack or Teams channel"
      description="Posts a short message with a link back to the record. Posts never include resumes or scorecard notes."
      dirty={dirty && !invalid}
      saving={save.isPending}
      onSave={() => save.mutate()}
      onDiscard={reset}
    >
      <div className="flex max-w-2xl flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Input
            inset
            label="Channel address (incoming webhook)"
            description="In Slack, add an incoming webhook to the channel. In Teams, add the Workflows app's webhook. Paste its address here, or leave it empty to turn this off."
            placeholder="https://hooks.slack.com/services/…"
            value={draft.url}
            onChange={(event) => set({ url: event.currentTarget.value })}
            error={
              invalid
                ? 'Use the address Slack or Teams gave you. It starts with https://.'
                : undefined
            }
          />
          {saved && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {channel.data.format && (
                <Badge tone="gray" size="sm">
                  {FORMAT_LABEL[channel.data.format]}
                </Badge>
              )}
              {last && (
                <span className={last.ok ? 'text-sm text-fg-muted' : 'text-sm text-tone-red-fg'}>
                  {last.text}
                </span>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="ml-auto"
                disabled={dirty}
                loading={test.isPending}
                onClick={() => test.mutate()}
              >
                Send a test message
              </Button>
            </div>
          )}
        </div>
        <fieldset className="flex flex-col gap-3" disabled={!url}>
          <legend className="mb-3 text-sm font-medium text-fg">What posts to the channel</legend>
          {channel.data.events.map((event) => (
            <Checkbox
              key={event.key}
              label={event.label}
              checked={draft.kinds.includes(event.key)}
              onCheckedChange={(on) => toggle(event.key, on === true)}
              disabled={!url}
            />
          ))}
          <p className="text-xs text-fg-subtle">
            Approval requests always post. Workflows, including the built-in reminders, post when
            one of their steps says to.
          </p>
        </fieldset>
      </div>
    </SettingsSection>
  );
}

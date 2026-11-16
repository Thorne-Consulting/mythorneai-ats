'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Card, Checkbox, SkeletonRows, toast } from '@/components/ui';
import { SettingsHeader } from '@/features/admin/SettingsShell';

interface Preference {
  key: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  digest: boolean;
}

type Channel = 'inApp' | 'email' | 'digest';

const CHANNELS: { key: Channel; label: string; short: string }[] = [
  { key: 'inApp', label: 'In the app', short: 'In the app' },
  { key: 'email', label: 'Email right away', short: 'Email' },
  { key: 'digest', label: 'In the daily summary', short: 'Daily summary' },
];

const QUERY = ['notification-preferences'];

/** My settings › Notifications: for each kind of event, where I hear about it. Saves on each click. */
export function NotificationSettingsPage() {
  const client = useQueryClient();
  const prefs = useQuery({
    queryKey: QUERY,
    queryFn: () => api.get<Preference[]>('/api/me/notification-preferences'),
  });
  const save = useMutation({
    mutationFn: (next: Preference) =>
      api.put('/api/me/notification-preferences', {
        kind: next.key,
        inApp: next.inApp,
        email: next.email,
        digest: next.digest,
      }),
    // Show the change at once; put it back if the save fails.
    onMutate: async (next) => {
      await client.cancelQueries({ queryKey: QUERY });
      const before = client.getQueryData<Preference[]>(QUERY);
      client.setQueryData<Preference[]>(QUERY, (list) =>
        list?.map((p) => (p.key === next.key ? next : p)),
      );
      return { before };
    },
    onError: (error: Error, _next, context) => {
      client.setQueryData(QUERY, context?.before);
      toast.error('Your change wasn’t saved', error.message);
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: QUERY });
      client.invalidateQueries({ queryKey: ['notification-count'] });
      client.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  return (
    <>
      <SettingsHeader description="Choose where you hear about each kind of event. The daily summary arrives once a day, when quiet hours end." />
      <Card className="max-w-4xl overflow-hidden">
        <div
          aria-hidden
          className="hidden grid-cols-[1fr_repeat(3,112px)] items-end gap-2 border-b border-border-subtle bg-muted px-5 py-2.5 text-xs font-semibold text-fg-subtle md:grid"
        >
          <span>Event</span>
          {CHANNELS.map((c) => (
            <span key={c.key} className="text-center">
              {c.label}
            </span>
          ))}
        </div>
        {!prefs.data ? (
          <SkeletonRows rows={6} className="p-5" />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {prefs.data.map((pref) => (
              <li
                key={pref.key}
                className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_repeat(3,112px)] md:items-center md:gap-2"
              >
                <div className="min-w-0">
                  <p className="text-base font-medium text-fg">{pref.label}</p>
                  <p className="mt-0.5 text-sm text-fg-subtle">{pref.description}</p>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 md:contents">
                  {CHANNELS.map((channel) => (
                    <div key={channel.key} className="flex md:justify-center">
                      <Checkbox
                        checked={pref[channel.key]}
                        onCheckedChange={(on) =>
                          save.mutate({ ...pref, [channel.key]: on === true })
                        }
                        aria-label={`${pref.label}: ${channel.label}`}
                        label={<span className="md:sr-only">{channel.short}</span>}
                      />
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Badge,
  Card,
  CellStack,
  ConfirmDialog,
  EmptyState,
  MenuItem,
  PageHeader,
  RowActions,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  toast,
} from '@/components/ui';
import { savedViewHref } from './report-data';
import { useSubscriptions, type Subscription } from './queries';
import { ScheduleModal, type ScheduleTarget } from './ScheduleModal';

const names = (people: { label: string }[]) =>
  people.length <= 2
    ? people.map((p) => p.label).join(' and ')
    : `${people
        .slice(0, 2)
        .map((p) => p.label)
        .join(', ')} and ${people.length - 2} more`;

/** /reports/subscriptions: every scheduled report email you set up or receive, with pause and stop. */
export function SubscriptionsPage() {
  const subscriptions = useSubscriptions();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ScheduleTarget | null>(null);
  const [leaving, setLeaving] = useState<Subscription | null>(null);
  const [stopping, setStopping] = useState<Subscription | null>(null);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['report-subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['report-views'] });
  };
  const pause = useMutation({
    mutationFn: (s: Subscription) =>
      api.put(`/api/reports/subscriptions/${s.id}`, {
        savedViewId: s.savedViewId,
        recipients: s.recipients.map((r) => r.value),
        frequency: s.frequency,
        dayOfWeek: s.dayOfWeek,
        dayOfMonth: s.dayOfMonth,
        hour: s.hour,
        paused: !s.paused,
      }),
    onSuccess: (_, s) => {
      refresh();
      toast.success(s.paused ? 'Email turned back on' : 'Email paused');
    },
    onError: (error: Error) => toast.error('Could not change the email', error.message),
  });
  const list = subscriptions.data ?? [];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Scheduled emails' }]}
        title="Scheduled emails"
        description="Reports that arrive by email. Each person gets the numbers for the jobs they can see."
      />
      <Card>
        {subscriptions.isLoading ? (
          <SkeletonRows rows={3} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="No scheduled emails"
            description="Save a view of any report, then choose “Email on a schedule” from the view’s menu."
          />
        ) : (
          <div className="overflow-x-auto px-4 pb-2">
            <Table>
              <THead>
                <TR>
                  <TH>View</TH>
                  <TH>When</TH>
                  <TH>Sent to</TH>
                  <TH>Next email</TH>
                  <TH className="w-10">
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {list.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <CellStack
                        primary={
                          <Link
                            href={savedViewHref(s.paramsJson, s.savedViewId)}
                            className="hover:underline"
                          >
                            {s.viewName}
                          </Link>
                        }
                        secondary={s.mine ? 'You set this up' : `Set up by ${s.owner}`}
                      />
                    </TD>
                    <TD className="min-w-48 first-letter:uppercase">{s.schedule}</TD>
                    <TD className="min-w-40">{names(s.recipients)}</TD>
                    <TD className="min-w-48">
                      {s.paused ? (
                        <Badge tone="amber">Paused</Badge>
                      ) : (
                        <span className="text-sm text-fg">{s.nextSend}</span>
                      )}
                    </TD>
                    <TD>
                      <RowActions label={`Actions for ${s.viewName}`}>
                        {s.mine ? (
                          <>
                            <MenuItem
                              icon={<Pencil />}
                              onSelect={() =>
                                setEditing({
                                  id: s.savedViewId,
                                  name: s.viewName,
                                  subscriptionId: s.id,
                                })
                              }
                            >
                              Change schedule
                            </MenuItem>
                            <MenuItem
                              icon={s.paused ? <Play /> : <Pause />}
                              onSelect={() => pause.mutate(s)}
                            >
                              {s.paused ? 'Turn back on' : 'Pause'}
                            </MenuItem>
                            <MenuItem danger icon={<Trash2 />} onSelect={() => setStopping(s)}>
                              Stop this email
                            </MenuItem>
                          </>
                        ) : (
                          <MenuItem danger icon={<Trash2 />} onSelect={() => setLeaving(s)}>
                            Stop sending it to me
                          </MenuItem>
                        )}
                      </RowActions>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
      <ScheduleModal view={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        opened={!!leaving}
        onClose={() => setLeaving(null)}
        onConfirm={async () => {
          await api.post(`/api/reports/subscriptions/${leaving!.id}/unsubscribe`);
          refresh();
          toast.success('You won’t get this email any more');
        }}
        title="Stop getting this email?"
        message={`${leaving?.owner ?? 'The owner'} can add you again later. Everyone else on the list keeps getting it.`}
        confirmLabel="Stop sending it to me"
      />
      <ConfirmDialog
        opened={!!stopping}
        onClose={() => setStopping(null)}
        onConfirm={async () => {
          await api.delete(`/api/reports/subscriptions/${stopping!.id}`);
          refresh();
          toast.success('Scheduled email stopped');
        }}
        title="Stop this email?"
        message="Nobody on the list will get it again. The saved view stays."
        confirmLabel="Stop email"
      />
    </>
  );
}

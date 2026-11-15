'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { Archive, MessageSquareText, Pencil, Plus, RotateCcw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Button,
  Card,
  CardHeader,
  Input,
  MenuItem,
  RowActions,
  SkeletonRows,
  SortableList,
  toast,
} from '@/components/ui';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import {
  REASON_GROUPS,
  useRejectionReasons,
  type ReasonKind,
  type RejectionReason,
} from './rejection-reasons-data';

const used = (count: number) =>
  count === 0
    ? 'Not used yet'
    : `Used for ${count} ${count === 1 ? 'application' : 'applications'}`;

/**
 * Settings › Rejection reasons. Two lists, "We decided" and "They decided", in the order the reject
 * dialog shows them. Renaming a reason renames it on every application closed with it.
 */
export function RejectionReasonsSettings() {
  const query = useRejectionReasons(true);
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['rejection-reasons'] });
  const reasons = query.data ?? [];

  const order = useMutation({
    mutationFn: (ids: string[]) => api.put('/api/rejection-reasons/order', { ids }),
    onError: (error: Error) => {
      toast.error('Could not save the new order', error.message);
      refresh();
    },
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api.post(`/api/rejection-reasons/${id}/${archived ? 'archive' : 'restore'}`),
    onSuccess: (_, { archived }) => {
      refresh();
      toast.success(archived ? 'Reason archived' : 'Reason restored');
    },
    onError: (error: Error) => toast.error('Could not change this reason', error.message),
  });

  const reorder = (kind: ReasonKind, next: RejectionReason[]) => {
    const active = (k: ReasonKind) =>
      k === kind ? next : reasons.filter((r) => r.kind === k && !r.archived);
    const all = [
      ...active('Rejected'),
      ...active('Withdrawn'),
      ...reasons.filter((r) => r.archived),
    ];
    queryClient.setQueryData<RejectionReason[]>(['rejection-reasons', true], all);
    order.mutate(all.map((r) => r.id));
  };

  const archived = reasons.filter((r) => r.archived);
  return (
    <>
      <SettingsHeader />
      {query.isPending ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : (
        <div className="space-y-5">
          {REASON_GROUPS.map((group) => (
            <Card key={group.kind}>
              <CardHeader
                title={group.title}
                description={
                  group.kind === 'Rejected'
                    ? 'Closes the application as Rejected. The candidate can get the rejection email.'
                    : 'Closes the application as Withdrawn. The candidate is not emailed.'
                }
              />
              <div className="border-t border-border-subtle">
                <SortableList
                  id={`reasons-${group.kind}`}
                  items={reasons.filter((r) => r.kind === group.kind && !r.archived)}
                  getKey={(r) => r.id}
                  getLabel={(r) => r.label}
                  onReorder={(next) => reorder(group.kind, next)}
                  className="gap-0 divide-y divide-border-subtle"
                  itemClassName="rounded-none border-x-0 border-t-0 last:border-b-0"
                  renderItem={(reason, handle) => (
                    <ReasonRow
                      reason={reason}
                      handle={handle}
                      onSaved={refresh}
                      onArchive={() => archive.mutate({ id: reason.id, archived: true })}
                    />
                  )}
                />
                <AddReason kind={group.kind} onAdded={refresh} />
              </div>
            </Card>
          ))}
          {archived.length > 0 && (
            <Card>
              <CardHeader
                title="Archived"
                description="Not offered when you reject someone. Applications closed with them keep the reason."
              />
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {archived.map((reason) => (
                  <li key={reason.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base text-fg-muted">{reason.label}</p>
                      <p className="text-xs text-fg-subtle">
                        {REASON_GROUPS.find((g) => g.kind === reason.kind)?.title} ·{' '}
                        {used(reason.used)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      leftIcon={<RotateCcw />}
                      onClick={() => archive.mutate({ id: reason.id, archived: false })}
                    >
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

function ReasonRow({
  reason,
  handle,
  onSaved,
  onArchive,
}: {
  reason: RejectionReason;
  handle: ReactNode;
  onSaved: () => void;
  onArchive: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(reason.label);
  const rename = useMutation({
    mutationFn: () => api.put(`/api/rejection-reasons/${reason.id}`, { label }),
    onSuccess: () => {
      setEditing(false);
      onSaved();
      toast.success('Reason renamed');
    },
    onError: (error: Error) => toast.error('Could not rename this reason', error.message),
  });
  const note = useMutation({
    mutationFn: () =>
      api.put(`/api/rejection-reasons/${reason.id}`, {
        label: reason.label,
        needsNote: !reason.needsNote,
      }),
    onSuccess: () => {
      onSaved();
      toast.success(reason.needsNote ? 'A note is now optional' : 'A note is now required');
    },
    onError: (error: Error) => toast.error('Could not change this reason', error.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (label.trim() === reason.label) setEditing(false);
    else if (label.trim()) rename.mutate();
  };
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
      {handle}
      {editing ? (
        <form onSubmit={submit} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-48">
            <Input
              aria-label="Reason"
              autoFocus
              value={label}
              onChange={(event) => setLabel(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Escape' && setEditing(false)}
            />
          </div>
          <Button type="submit" size="sm" loading={rename.isPending}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="quiet"
            onClick={() => {
              setLabel(reason.label);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      ) : (
        <>
          <div className="min-w-0 flex-1 py-0.5">
            <p className="truncate text-base text-fg">{reason.label}</p>
            <p className="text-xs text-fg-subtle">
              {used(reason.used)}
              {reason.needsNote && ' · Asks for a note'}
            </p>
          </div>
          <RowActions label={`Actions for ${reason.label}`}>
            <MenuItem icon={<Pencil />} onSelect={() => setEditing(true)}>
              Rename
            </MenuItem>
            <MenuItem icon={<MessageSquareText />} onSelect={() => note.mutate()}>
              {reason.needsNote ? 'Make the note optional' : 'Ask for a note'}
            </MenuItem>
            <MenuItem icon={<Archive />} onSelect={onArchive}>
              Archive
            </MenuItem>
          </RowActions>
        </>
      )}
    </div>
  );
}

function AddReason({ kind, onAdded }: { kind: ReasonKind; onAdded: () => void }) {
  const [label, setLabel] = useState('');
  const add = useMutation({
    mutationFn: () => api.post('/api/rejection-reasons', { label, kind }),
    onSuccess: () => {
      setLabel('');
      onAdded();
      toast.success('Reason added');
    },
    onError: (error: Error) => toast.error('Could not add this reason', error.message),
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (label.trim()) add.mutate();
      }}
      className="flex flex-wrap items-center gap-2 border-t border-border-subtle px-5 py-3"
    >
      <div className="min-w-0 flex-1 basis-56">
        <Input
          aria-label="New reason"
          placeholder="Add a reason"
          value={label}
          onChange={(event) => setLabel(event.currentTarget.value)}
        />
      </div>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        leftIcon={<Plus />}
        loading={add.isPending}
        disabled={!label.trim()}
      >
        Add reason
      </Button>
    </form>
  );
}

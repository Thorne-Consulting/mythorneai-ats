'use client';

import { useState } from 'react';
import {
  Bookmark,
  Lock,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Share2,
  Trash2,
  Users,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';

export type SavedView<S> = {
  id: string;
  name: string;
  state: S;
  builtIn?: boolean;
  /** How many rows the view shows, next to its name. */
  count?: number;
  shared?: boolean;
  mine?: boolean;
  pinned?: boolean;
  ownerName?: string;
};

type ServerView = {
  id: string;
  name: string;
  paramsJson: string;
  shared: boolean;
  mine: boolean;
  ownerName: string;
  pinned: boolean;
};

const read = <S,>(json: string): S | null => {
  try {
    return (JSON.parse(json) as { state?: S }).state ?? null;
  } catch {
    return null;
  }
};

/**
 * A row of named filter presets. Built-in views come from the page; people save the current
 * filters as their own view (kept on the server under `storageKey`), share it with the team, pin,
 * rename and delete it, and save changes back to it.
 */
export function SavedViews<S>({
  storageKey,
  builtIn,
  current,
  activeId,
  onApply,
}: {
  /** The list's name on the server, for example "jobs". */
  storageKey: string;
  builtIn: SavedView<S>[];
  current: S;
  activeId: string | null;
  onApply: (view: SavedView<S>) => void;
}) {
  const queryClient = useQueryClient();
  const key = ['saved-views', storageKey];
  const server = useQuery({
    queryKey: key,
    queryFn: () => api.get<ServerView[]>(`/api/saved-views?area=${storageKey}`),
  });
  const saved: SavedView<S>[] = (server.data ?? []).flatMap((view) => {
    const state = read<S>(view.paramsJson);
    return state ? [{ ...view, state }] : [];
  });
  const views = [...builtIn, ...saved];
  const active = saved.find((view) => view.id === activeId);
  const changed =
    Boolean(active?.mine) && JSON.stringify(active!.state) !== JSON.stringify(current);

  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<SavedView<S> | null>(null);
  const [deleting, setDeleting] = useState<SavedView<S> | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const fail = (error: Error) => toast.error('Could not change the view', error.message);
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/api/saved-views', {
        area: storageKey,
        name: name.trim(),
        shared,
        paramsJson: JSON.stringify({ state: current }),
      }),
    onSuccess: ({ id }) => {
      refresh();
      onApply({ id, name: name.trim(), state: current, mine: true, shared });
      setName('');
      setShared(false);
      setOpen(false);
      toast.success('View saved');
    },
    onError: fail,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name?: string;
      shared?: boolean;
      paramsJson?: string;
    }) => api.put(`/api/saved-views/${id}`, body),
    onSuccess: (_, body) => {
      refresh();
      setRenaming(null);
      toast.success(
        body.name
          ? 'View renamed'
          : body.shared === true
            ? 'Shared with the team'
            : body.shared === false
              ? 'Only you see this view now'
              : 'View saved',
      );
    },
    onError: fail,
  });
  const pin = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on ? api.put(`/api/saved-views/${id}/pin`, {}) : api.delete(`/api/saved-views/${id}/pin`),
    onSuccess: refresh,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/saved-views/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('View deleted');
      setDeleting(null);
    },
    onError: fail,
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views.map((v) => (
        <span key={v.id} className="group relative">
          <button
            type="button"
            onClick={() => onApply(v)}
            aria-pressed={v.id === activeId}
            title={v.shared && !v.mine ? `Shared by ${v.ownerName}` : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm text-fg-muted transition-colors hover:bg-secondary hover:text-fg',
              v.id === activeId && 'border-primary/40 bg-accent font-medium text-accent-foreground',
              !v.builtIn && 'pr-8',
            )}
          >
            {!v.builtIn &&
              (v.pinned ? (
                <Pin className="size-3.5" aria-hidden />
              ) : v.shared ? (
                <Users className="size-3.5" aria-hidden />
              ) : (
                <Bookmark className="size-3.5" aria-hidden />
              ))}
            {v.name}
            {v.count !== undefined && (
              <span className="text-xs text-fg-subtle tnum">{v.count}</span>
            )}
          </button>
          {!v.builtIn && (
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions for the view ${v.name}`}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-full p-0.5 text-fg-subtle hover:bg-secondary hover:text-fg"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </MenuTrigger>
              <MenuContent align="start">
                <MenuItem
                  icon={v.pinned ? <PinOff /> : <Pin />}
                  onSelect={() => pin.mutate({ id: v.id, on: !v.pinned })}
                >
                  {v.pinned ? 'Unpin' : 'Pin to the front'}
                </MenuItem>
                {v.mine && (
                  <>
                    <MenuItem icon={<Pencil />} onSelect={() => setRenaming(v)}>
                      Rename…
                    </MenuItem>
                    <MenuItem
                      icon={v.shared ? <Lock /> : <Share2 />}
                      onSelect={() => update.mutate({ id: v.id, shared: !v.shared })}
                    >
                      {v.shared ? 'Make private' : 'Share with the team'}
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(v)}>
                      Delete…
                    </MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          )}
        </span>
      ))}
      {changed && active && (
        <Button
          variant="secondary"
          size="sm"
          loading={update.isPending}
          onClick={() =>
            update.mutate({ id: active.id, paramsJson: JSON.stringify({ state: current }) })
          }
        >
          Save changes
        </Button>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="quiet" size="sm" leftIcon={<Plus />}>
            Save view
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
            className="space-y-3"
          >
            <Input
              label="View name"
              placeholder="For example, senior engineers in review"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              autoFocus
            />
            <Checkbox label="Share with the team" checked={shared} onCheckedChange={setShared} />
            <Button type="submit" fullWidth disabled={!name.trim()} loading={create.isPending}>
              Save view
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Modal
        opened={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Rename view"
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const text = new FormData(e.currentTarget).get('name')?.toString().trim();
            if (renaming && text) update.mutate({ id: renaming.id, name: text });
          }}
          className="space-y-4"
        >
          <Input label="Name" name="name" defaultValue={renaming?.name} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={update.isPending}>
              Rename
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting)
            await remove.mutateAsync(deleting.id).then(
              () => undefined,
              () => undefined,
            );
        }}
        title={`Delete the view “${deleting?.name ?? ''}”?`}
        message={
          deleting?.shared
            ? 'It goes for the whole team. Nothing else changes.'
            : 'This removes the saved filters only. Nothing else changes.'
        }
        confirmLabel="Delete view"
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bookmark,
  Link2,
  Lock,
  Mail,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
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
import {
  BUILT_IN_VIEWS,
  NO_FILTERS,
  parseView,
  queryString,
  sameFilters,
  savedViewHref,
  viewParams,
  type Filters,
} from './report-data';
import { useReportViews, useViewActions, type ReportView } from './queries';
import { ScheduleModal, type ScheduleTarget } from './ScheduleModal';

const chip = (on: boolean) =>
  cn(
    'inline-flex h-8 items-center gap-1.5 border border-border bg-card px-3 text-sm text-fg-muted transition-colors hover:bg-secondary hover:text-fg',
    on &&
      'border-primary/40 bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
  );

/** Ready-made and saved views of this report, as chips under the header. One click applies one. */
export function SavedViewsBar({
  report,
  filters,
  viewId,
}: {
  report: string;
  filters: Filters;
  viewId: string | null;
}) {
  const router = useRouter();
  const views = useReportViews();
  const actions = useViewActions();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [renaming, setRenaming] = useState<ReportView | null>(null);
  const [newName, setNewName] = useState('');
  const [deleting, setDeleting] = useState<ReportView | null>(null);
  const [scheduling, setScheduling] = useState<ScheduleTarget | null>(null);

  const builtIn = BUILT_IN_VIEWS.filter((view) => view.report === report);
  const saved = (views.data ?? []).filter((view) => parseView(view.paramsJson)?.report === report);
  const active = saved.find((view) => view.id === viewId);
  const changed = active && !sameFilters(parseView(active.paramsJson)!.filters, filters);
  const open = (href: string) => router.push(href, { scroll: false });

  const copy = async (view: ReportView) => {
    try {
      await navigator.clipboard.writeText(
        new URL(savedViewHref(view.paramsJson, view.id), window.location.origin).toString(),
      );
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link', 'Copy it from the address bar instead.');
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 print:hidden">
      <span className="mr-1 text-sm text-fg-subtle">Views</span>
      {builtIn.map((view) => {
        const preset = { ...NO_FILTERS, ...view.filters };
        const on = !viewId && sameFilters(filters, preset);
        return (
          <button
            key={view.id}
            type="button"
            aria-pressed={on}
            onClick={() =>
              open(on ? `/reports/${report}` : `/reports/${report}?${queryString(preset)}`)
            }
            className={cn(chip(on), 'rounded-full')}
          >
            {view.name}
          </button>
        );
      })}
      {saved.map((view) => {
        const on = view.id === viewId;
        return (
          <span key={view.id} className="inline-flex">
            <button
              type="button"
              aria-pressed={on}
              title={view.mine ? undefined : `Shared by ${view.owner}`}
              onClick={() =>
                open(on ? `/reports/${report}` : savedViewHref(view.paramsJson, view.id))
              }
              className={cn(chip(on), 'rounded-l-full border-r-0 pr-2')}
            >
              {view.shared ? (
                <Users className="size-3.5" aria-hidden />
              ) : (
                <Bookmark className="size-3.5" aria-hidden />
              )}
              {view.name}
              {view.pinned && <Pin className="size-3" aria-label="Pinned" />}
            </button>
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Options for ${view.name}`}
                  className={cn(chip(on), 'rounded-r-full px-2')}
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </MenuTrigger>
              <MenuContent align="start">
                {view.mine && (
                  <MenuItem
                    icon={<Pencil />}
                    onSelect={() => {
                      setNewName(view.name);
                      setRenaming(view);
                    }}
                  >
                    Rename
                  </MenuItem>
                )}
                {view.mine && (
                  <MenuItem
                    icon={view.shared ? <Lock /> : <Users />}
                    onSelect={() =>
                      actions.update.mutate(
                        { id: view.id, shared: !view.shared },
                        {
                          onSuccess: () =>
                            toast.success(
                              view.shared
                                ? 'Only you can see this view now'
                                : 'Everyone who can see reports can now use this view',
                            ),
                        },
                      )
                    }
                  >
                    {view.shared ? 'Make private' : 'Share with everyone'}
                  </MenuItem>
                )}
                <MenuItem
                  icon={view.pinned ? <PinOff /> : <Pin />}
                  onSelect={() =>
                    actions.pin.mutate(
                      { id: view.id, pinned: !view.pinned },
                      {
                        onSuccess: () =>
                          toast.success(
                            view.pinned
                              ? 'Removed from the overview'
                              : 'Pinned to the reports overview',
                          ),
                      },
                    )
                  }
                >
                  {view.pinned ? 'Unpin from overview' : 'Pin to overview'}
                </MenuItem>
                <MenuItem icon={<Link2 />} onSelect={() => copy(view)}>
                  Copy link
                </MenuItem>
                <MenuItem
                  icon={<Mail />}
                  onSelect={() =>
                    setScheduling({
                      id: view.id,
                      name: view.name,
                      subscriptionId: view.subscriptionId,
                    })
                  }
                >
                  {view.subscriptionId ? 'Change email schedule' : 'Email on a schedule'}
                </MenuItem>
                {view.mine && (
                  <>
                    <MenuSeparator />
                    <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(view)}>
                      Delete view
                    </MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          </span>
        );
      })}
      {changed && active.mine && (
        <Button
          variant="link"
          size="sm"
          loading={actions.update.isPending}
          onClick={() =>
            actions.update.mutate(
              { id: active.id, paramsJson: viewParams(report, filters) },
              { onSuccess: () => toast.success(`Saved changes to “${active.name}”`) },
            )
          }
        >
          Save changes to “{active.name}”
        </Button>
      )}
      <Popover open={saving} onOpenChange={setSaving}>
        <PopoverTrigger asChild>
          <Button variant="quiet" size="sm" leftIcon={<Plus />}>
            Save view
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const json = viewParams(report, filters);
              actions.create.mutate(
                { name: name.trim(), paramsJson: json, shared },
                {
                  onSuccess: (created) => {
                    toast.success(`Saved “${name.trim()}”`);
                    setSaving(false);
                    setName('');
                    setShared(false);
                    open(savedViewHref(json, created.id));
                  },
                },
              );
            }}
          >
            <Input
              label="View name"
              placeholder="For example, Engineering hires this year"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              maxLength={120}
              autoFocus
            />
            <p className="text-xs text-fg-subtle">
              Saves the dates, filters and breakdown you have on now.
            </p>
            <Checkbox
              checked={shared}
              onCheckedChange={setShared}
              label="Share with everyone who can see reports"
            />
            <Button
              type="submit"
              fullWidth
              disabled={!name.trim()}
              loading={actions.create.isPending}
            >
              Save view
            </Button>
          </form>
        </PopoverContent>
      </Popover>

      <Modal
        opened={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename view"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="rename-view"
              disabled={!newName.trim()}
              loading={actions.update.isPending}
            >
              Save name
            </Button>
          </>
        }
      >
        <form
          id="rename-view"
          onSubmit={(event) => {
            event.preventDefault();
            actions.update.mutate(
              { id: renaming!.id, name: newName.trim() },
              {
                onSuccess: () => {
                  toast.success('View renamed');
                  setRenaming(null);
                },
              },
            );
          }}
        >
          <Input
            label="View name"
            value={newName}
            onChange={(event) => setNewName(event.currentTarget.value)}
            maxLength={120}
            autoFocus
          />
        </form>
      </Modal>
      <ConfirmDialog
        opened={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await actions.remove.mutateAsync(deleting!.id);
          toast.success('View deleted');
          if (deleting!.id === viewId) open(`/reports/${report}`);
        }}
        title={`Delete “${deleting?.name ?? ''}”?`}
        message={
          deleting?.shared
            ? 'Everyone loses this view, and its scheduled emails stop. You can’t undo this.'
            : 'The view and its scheduled emails are removed. You can’t undo this.'
        }
        confirmLabel="Delete view"
      />
      <ScheduleModal view={scheduling} onClose={() => setScheduling(null)} />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { CircleOff, Combine, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Input,
  MenuItem,
  MenuSeparator,
  Modal,
  RowActions,
  Select,
  SkeletonRows,
  Switch,
  TagsInput,
  toast,
} from '@/components/ui';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import {
  CATEGORIES,
  categoryLabel,
  useSources,
  type Source,
  type SourceCategory,
} from './sources-data';

const people = (n: number) => (n === 0 ? 'No one yet' : n === 1 ? '1 person' : `${n} people`);

type Draft = { name: string; category: SourceCategory; codes: string[]; active: boolean };

/**
 * Settings › Candidate sources. The list every source picker and filter offers, grouped by kind.
 * Renaming or merging rewrites the source on everyone who has it.
 */
export function SourcesSettings() {
  const query = useSources();
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['sources'] });
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
  };
  const [editing, setEditing] = useState<Source | 'new' | null>(null);
  const [merging, setMerging] = useState<Source | null>(null);
  const [deleting, setDeleting] = useState<Source | null>(null);
  const sources = query.data ?? [];

  const save = (source: Source, patch: Partial<Draft>) =>
    api.put(`/api/sources/${source.id}`, {
      name: source.name,
      category: source.category,
      codes: source.codes,
      active: source.active,
      ...patch,
    });
  const toggle = useMutation({
    mutationFn: (source: Source) => save(source, { active: !source.active }),
    onSuccess: (_, source) => {
      refresh();
      toast.success(source.active ? `${source.name} is turned off` : `${source.name} is back on`);
    },
    onError: (error: Error) => toast.error('Could not change this source', error.message),
  });

  return (
    <>
      <SettingsHeader
        actions={
          <Button leftIcon={<Plus />} onClick={() => setEditing('new')}>
            Add source
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {query.isPending ? (
          <SkeletonRows rows={8} />
        ) : (
          <div>
            {CATEGORIES.map((category) => {
              const group = sources.filter((s) => s.category === category.value);
              if (group.length === 0) return null;
              return (
                <section key={category.value} aria-label={category.label}>
                  <h3 className="border-b border-border-subtle bg-muted px-5 py-2 text-xs font-medium text-fg-muted [section:not(:first-child)>&]:border-t">
                    {category.label}
                  </h3>
                  <ul className="divide-y divide-border-subtle">
                    {group.map((source) => (
                      <li key={source.id} className="flex items-center gap-3 px-5 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-base text-fg">
                            <span className={source.active ? 'truncate' : 'truncate text-fg-muted'}>
                              {source.name}
                            </span>
                            {!source.active && <Badge tone="gray">Off</Badge>}
                          </p>
                          <p className="truncate text-xs text-fg-subtle">
                            {people(source.candidates)}
                            {source.codes.length > 0 && ` · Link codes: ${source.codes.join(', ')}`}
                          </p>
                        </div>
                        <RowActions label={`Actions for ${source.name}`}>
                          <MenuItem icon={<Pencil />} onSelect={() => setEditing(source)}>
                            Edit
                          </MenuItem>
                          <MenuItem icon={<Combine />} onSelect={() => setMerging(source)}>
                            Merge into another source
                          </MenuItem>
                          <MenuItem
                            icon={source.active ? <CircleOff /> : <Power />}
                            onSelect={() => toggle.mutate(source)}
                          >
                            {source.active ? 'Turn off' : 'Turn on'}
                          </MenuItem>
                          {source.candidates === 0 && (
                            <>
                              <MenuSeparator />
                              <MenuItem
                                icon={<Trash2 />}
                                danger
                                onSelect={() => setDeleting(source)}
                              >
                                Delete
                              </MenuItem>
                            </>
                          )}
                        </RowActions>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
        <p className="border-t border-border-subtle px-5 py-3 text-xs text-fg-subtle">
          A source you turn off stays on the people who have it, but is not offered for new people.
        </p>
      </Card>

      <Card className="mt-5">
        <CardHeader
          title="Sources from links"
          description="Add ?src= and a link code to a job link you share, for example …/careers/123?src=linkedin. People who apply from that link get the source, for 30 days after their first visit. Links with utm_source work the same way. Other careers site visits get Career site. On a job's Posting tab, Copy link for… gives you these links ready to share."
        />
      </Card>

      {editing && (
        <SourceModal
          source={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {merging && (
        <MergeModal
          source={merging}
          sources={sources}
          onClose={() => setMerging(null)}
          onMerged={refresh}
        />
      )}
      <ConfirmDialog
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        message="No one has this source, so nothing else changes."
        confirmLabel="Delete source"
        onConfirm={async () => {
          try {
            await api.delete(`/api/sources/${deleting!.id}`);
            refresh();
            toast.success('Source deleted');
          } catch (error) {
            toast.error('Could not delete this source', (error as Error).message);
          }
        }}
      />
    </>
  );
}

function SourceModal({
  source,
  onClose,
  onSaved,
}: {
  source: Source | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>({
    name: source?.name ?? '',
    category: source?.category ?? 'JobBoard',
    codes: source?.codes ?? [],
    active: source?.active ?? true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const save = useMutation({
    mutationFn: () =>
      source ? api.put(`/api/sources/${source.id}`, draft) : api.post('/api/sources', draft),
    onSuccess: () => {
      onSaved();
      onClose();
      toast.success(source ? 'Source saved' : 'Source added');
    },
    onError: (e: Error) => setError(e.message),
  });
  const renamed = source && draft.name.trim() && draft.name.trim() !== source.name;
  return (
    <Modal
      opened
      onClose={onClose}
      title={source ? `Edit ${source.name}` : 'Add a source'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="source-form"
            loading={save.isPending}
            disabled={!draft.name.trim()}
          >
            {source ? 'Save changes' : 'Add source'}
          </Button>
        </>
      }
    >
      <form
        id="source-form"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (draft.name.trim()) save.mutate();
        }}
      >
        <Input
          label="Name"
          placeholder="For example, Hacker News"
          autoFocus
          value={draft.name}
          onChange={(event) => set({ name: event.currentTarget.value })}
          error={error ?? undefined}
          description={
            renamed && source.candidates > 0
              ? `The ${people(source.candidates).toLowerCase()} with ${source.name} get the new name.`
              : undefined
          }
        />
        <Select
          label="Kind"
          data={CATEGORIES}
          value={draft.category}
          onChange={(value) => value && set({ category: value as SourceCategory })}
          description={
            draft.category === 'Referral'
              ? 'People with this source can name the teammate who referred them.'
              : undefined
          }
        />
        <TagsInput
          label="Link codes"
          description="One word each. A careers link with ?src= or utm_source set to a code gets this source."
          placeholder="Type a code and press Enter"
          value={draft.codes}
          onChange={(codes) => set({ codes: codes.map((c) => c.trim().toLowerCase()) })}
        />
        {source && (
          <Switch
            label="Offer this source for new people"
            checked={draft.active}
            onCheckedChange={(active) => set({ active })}
          />
        )}
      </form>
    </Modal>
  );
}

function MergeModal({
  source,
  sources,
  onClose,
  onMerged,
}: {
  source: Source;
  sources: Source[];
  onClose: () => void;
  onMerged: () => void;
}) {
  const [into, setInto] = useState<string | null>(null);
  const target = sources.find((s) => s.id === into);
  const merge = useMutation({
    mutationFn: () => api.post(`/api/sources/${source.id}/merge`, { intoId: into }),
    onSuccess: () => {
      onMerged();
      onClose();
      toast.success(`${source.name} merged into ${target?.name}`);
    },
    onError: (error: Error) => toast.error('Could not merge the sources', error.message),
  });
  return (
    <Modal
      opened
      onClose={onClose}
      title={`Merge ${source.name}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!into} loading={merge.isPending} onClick={() => merge.mutate()}>
            Merge sources
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Merge into"
          placeholder="Choose a source"
          data={sources
            .filter((s) => s.id !== source.id)
            .map((s) => ({ value: s.id, label: s.name, group: categoryLabel(s.category) }))}
          value={into}
          onChange={setInto}
        />
        <p className="text-sm text-fg-muted">
          {target
            ? `${people(source.candidates)} with ${source.name} will have ${target.name}. Its link codes move too, and ${source.name} is removed. You cannot undo this.`
            : `Everyone with ${source.name} moves to the source you choose, and ${source.name} is removed.`}
        </p>
      </div>
    </Modal>
  );
}

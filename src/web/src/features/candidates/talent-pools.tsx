'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Input, Modal, SearchSelect, Textarea, toast } from '@/components/ui';
import type { CandidateDetail } from '@/types';
import { useBulkCandidates, type BulkTarget } from './candidate-actions';
import { RailGroup } from './Rail';

/** GET /api/talent-pools */
export type TalentPool = {
  id: string;
  name: string;
  description: string;
  ownerEmail: string;
  ownerName: string;
  createdAt: string;
  count: number;
};

export function useTalentPools(enabled = true) {
  return useQuery({
    queryKey: ['talent-pools'],
    queryFn: () => api.get<TalentPool[]>('/api/talent-pools'),
    enabled,
    staleTime: 30_000,
  });
}

/** Make a pool, or rename one and change what it is for. */
export function PoolFormModal({
  pool,
  opened,
  onClose,
  onSaved,
}: {
  pool?: TalentPool | null;
  opened: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => {
    if (!opened) return;
    setName(pool?.name ?? '');
    setDescription(pool?.description ?? '');
  }, [opened, pool]);
  const save = useMutation({
    mutationFn: () =>
      pool
        ? api.put(`/api/talent-pools/${pool.id}`, { name, description }).then(() => pool.id)
        : api
            .post<{ id: string }>('/api/talent-pools', { name, description })
            .then((created) => created.id),
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['talent-pools'] });
      toast.success(pool ? 'Pool saved' : `${name.trim()} is ready`);
      onSaved?.(id);
      onClose();
    },
    onError: (error: Error) => toast.error('Could not save the pool', error.message),
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={pool ? `Edit ${pool.name}` : 'New talent pool'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            {pool ? 'Save changes' : 'Create pool'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) save.mutate();
        }}
      >
        <Input
          label="Name"
          placeholder="For example, Silver medalists"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          autoFocus
        />
        <Textarea
          label="What it is for (optional)"
          placeholder="For example, strong finalists we want to contact for the next opening"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          minRows={2}
        />
      </form>
    </Modal>
  );
}

/** Put one or many people in a pool, or start a new pool for them. */
export function AddToPoolModal({
  target,
  count,
  name,
  onClose,
}: {
  target: BulkTarget | null;
  count: number;
  name?: string;
  onClose: () => void;
}) {
  const pools = useTalentPools(target !== null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const bulk = useBulkCandidates(() => {
    setPoolId(null);
    onClose();
  });
  const add = (id: string) => target && bulk.mutate({ ...target, action: 'addToPool', poolId: id });
  return (
    <>
      <Modal
        opened={target !== null && !creating}
        onClose={onClose}
        title={
          name
            ? `Add ${name} to a pool`
            : `Add ${count === 1 ? '1 person' : `${count.toLocaleString()} people`} to a pool`
        }
        footer={
          <>
            <Button variant="secondary" className="mr-auto" onClick={() => setCreating(true)}>
              New pool
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!poolId}
              loading={bulk.isPending}
              onClick={() => poolId && add(poolId)}
            >
              Add to pool
            </Button>
          </>
        }
      >
        {pools.data?.length === 0 ? (
          <p className="text-base text-fg-muted">
            There are no pools yet. Start one with New pool.
          </p>
        ) : (
          <SearchSelect
            label="Pool"
            placeholder="Choose a pool"
            value={poolId}
            onChange={setPoolId}
            data={(pools.data ?? []).map((pool) => ({
              value: pool.id,
              label: `${pool.name} (${pool.count})`,
            }))}
          />
        )}
      </Modal>
      <PoolFormModal
        opened={target !== null && creating}
        onClose={() => setCreating(false)}
        onSaved={(id) => add(id)}
      />
    </>
  );
}

/** The pools a person is in (GET /api/candidates/{id} → pools). */
export type CandidatePools = { pools?: { id: string; name: string; addedAt: string }[] };

/** Rail card on the profile: which pools they are in, with add and remove. */
export function CandidatePoolsCard({ candidate }: { candidate: CandidateDetail & CandidatePools }) {
  const [adding, setAdding] = useState(false);
  const bulk = useBulkCandidates();
  const pools = candidate.pools ?? [];
  const name = `${candidate.firstName} ${candidate.lastName}`;
  return (
    <RailGroup
      title="Talent pools"
      action={
        <Button variant="link" size="sm" onClick={() => setAdding(true)}>
          Add
        </Button>
      }
    >
      {pools.length === 0 ? (
        <p className="text-sm text-fg-subtle">Not in a pool yet.</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {pools.map((pool) => (
            <li
              key={pool.id}
              className="inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-border bg-card pr-1 pl-3 text-xs"
            >
              <Link
                href={`/candidates/pools/${pool.id}`}
                className="truncate text-fg hover:text-accent-foreground hover:underline"
              >
                {pool.name}
              </Link>
              <button
                type="button"
                aria-label={`Remove ${name} from ${pool.name}`}
                onClick={() =>
                  bulk.mutate({ ids: [candidate.id], action: 'removeFromPool', poolId: pool.id })
                }
                className="rounded-full p-0.5 text-fg-subtle hover:bg-secondary hover:text-fg"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddToPoolModal
        target={adding ? { ids: [candidate.id] } : null}
        count={1}
        name={name}
        onClose={() => setAdding(false)}
      />
    </RailGroup>
  );
}

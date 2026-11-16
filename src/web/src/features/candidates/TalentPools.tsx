'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pencil, Plus, Trash2, UsersRound } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Button,
  Card,
  CardHeader,
  CellStack,
  ConfirmDialog,
  EmptyState,
  MenuItem,
  MenuSeparator,
  RowActions,
  toast,
} from '@/components/ui';
import { DataTable } from '@/components/data-table/DataTable';
import { formatDate } from '@/lib/format';
import { PoolFormModal, useTalentPools, type TalentPool } from './talent-pools';

/** Every talent pool: open one to see its people in the candidate list, or make, rename and delete pools. */
export function TalentPools() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const pools = useTalentPools();
  const [editing, setEditing] = useState<TalentPool | null | 'new'>(null);
  const [deleting, setDeleting] = useState<TalentPool | null>(null);
  const remove = useMutation({
    mutationFn: (pool: TalentPool) => api.delete(`/api/talent-pools/${pool.id}`),
    onSuccess: (_, pool) => {
      queryClient.invalidateQueries({ queryKey: ['talent-pools'] });
      queryClient.invalidateQueries({ queryKey: ['candidates', 'counts'] });
      toast.success(`${pool.name} was deleted`);
      setDeleting(null);
    },
    onError: (error: Error) => toast.error('Could not delete the pool', error.message),
  });
  // A deleted pool's link lands here (once, though dev mode runs effects twice).
  const told = useRef(false);
  useEffect(() => {
    if (searchParams.get('missingPool') && !told.current) {
      told.current = true;
      toast('That pool was deleted');
      router.replace('/candidates/talent-pools');
    }
  }, [searchParams, router]);

  const newButton = (
    <Button leftIcon={<Plus />} onClick={() => setEditing('new')}>
      New pool
    </Button>
  );
  return (
    <Card className="px-4 pt-1">
      <CardHeader
        className="px-0"
        title="Talent pools"
        description="Groups of people to come back to when a job opens. Add people from the list, a profile or a ranking."
        action={pools.data?.length ? newButton : undefined}
      />
      <DataTable
        viewKey="talent-pools-v2"
        minimal
        data={pools.data ?? []}
        loading={pools.isPending}
        getRowId={(pool) => pool.id}
        noun="pool"
        onRowOpen={(pool) => router.push(`/candidates/pools/${pool.id}`)}
        rowLabel={(pool) => pool.name}
        columns={[
          {
            id: 'pool',
            header: 'Pool',
            hideable: false,
            className: 'max-w-[360px]',
            cell: (pool) => <CellStack primary={pool.name} secondary={pool.description || null} />,
            sortValue: (pool) => pool.name,
          },
          {
            id: 'people',
            header: 'People',
            align: 'right',
            className: 'w-24 tnum',
            cell: (pool) => pool.count.toLocaleString(),
            sortValue: (pool) => pool.count,
          },
          {
            id: 'owner',
            header: 'Made by',
            className: 'whitespace-nowrap text-fg-muted',
            cell: (pool) => pool.ownerName,
          },
          {
            id: 'created',
            header: 'Made on',
            className: 'whitespace-nowrap text-fg-muted',
            cell: (pool) => formatDate(pool.createdAt),
            sortValue: (pool) => pool.createdAt,
          },
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            label: 'Actions',
            align: 'right',
            className: 'w-14',
            hideable: false,
            cell: (pool) => (
              <div onClick={(event) => event.stopPropagation()}>
                <RowActions label={`Actions for ${pool.name}`}>
                  <MenuItem icon={<Pencil />} onSelect={() => setEditing(pool)}>
                    Rename…
                  </MenuItem>
                  <MenuSeparator />
                  <MenuItem danger icon={<Trash2 />} onSelect={() => setDeleting(pool)}>
                    Delete…
                  </MenuItem>
                </RowActions>
              </div>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={UsersRound}
            title="No talent pools yet"
            description="Make a pool, for example Silver medalists, then add people from the candidate list."
            action={newButton}
          />
        }
      />
      <PoolFormModal
        opened={editing !== null}
        pool={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={(id) => editing === 'new' && router.push(`/candidates/pools/${id}`)}
      />
      <ConfirmDialog
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (deleting)
            await remove.mutateAsync(deleting).then(
              () => undefined,
              () => undefined,
            );
        }}
        title={`Delete the pool ${deleting?.name ?? ''}?`}
        message={`${deleting?.count === 1 ? 'The 1 person in it stays' : `The ${deleting?.count ?? 0} people in it stay`} in MyThorneAI. Only the list goes.`}
        confirmLabel="Delete pool"
      />
    </Card>
  );
}

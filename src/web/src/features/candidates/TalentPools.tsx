'use client';

import { UsersRound } from 'lucide-react';
import { Card, CardHeader, CellStack, EmptyState } from '@/components/ui';
import { DataTable } from '@/components/data-table/DataTable';
import { formatRelative } from '@/lib/format';
import { PreviewAlert, PreviewTitle } from '@/features/preview/preview-ui';
import { sampleTalentPools } from './sample-talent-pools';

/** Named groups of people to come back to. Sample data until pools have a backend. */
export function TalentPools() {
  return (
    <Card className="px-4 pt-1">
      <CardHeader
        className="px-0"
        title={<PreviewTitle>Talent pools</PreviewTitle>}
        description="Groups of people worth keeping in touch with, for jobs that are not open yet."
      />
      <PreviewAlert>
        Talent pools show sample data for now. Your real candidates are not changed.
      </PreviewAlert>
      <DataTable
        viewKey="talent-pools"
        data={sampleTalentPools}
        getRowId={(pool) => pool.id}
        noun="pool"
        columns={[
          {
            id: 'pool',
            header: 'Pool',
            hideable: false,
            className: 'max-w-[420px] whitespace-normal',
            cell: (pool) => <CellStack primary={pool.name} secondary={pool.description} />,
            sortValue: (pool) => pool.name,
          },
          {
            id: 'members',
            header: 'People',
            align: 'right',
            className: 'tnum',
            cell: (pool) => pool.members,
            sortValue: (pool) => pool.members,
          },
          {
            id: 'recent',
            header: 'Added in last 30 days',

            align: 'right',
            className: 'tnum text-fg-muted',
            cell: (pool) => pool.addedRecently || '–',
            sortValue: (pool) => pool.addedRecently,
          },
          {
            id: 'owner',
            header: 'Owner',
            className: 'text-fg-muted',
            cell: (pool) => pool.owner,
            sortValue: (pool) => pool.owner,
          },
          {
            id: 'updated',
            header: 'Updated',
            className: 'whitespace-nowrap text-fg-muted',
            cell: (pool) => formatRelative(pool.updatedAt),
            sortValue: (pool) => pool.updatedAt,
          },
        ]}
        empty={<EmptyState icon={UsersRound} title="No talent pools yet" />}
      />
    </Card>
  );
}

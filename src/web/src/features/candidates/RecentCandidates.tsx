'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, CellStack, EmptyState } from '@/components/ui';
import { DataTable } from '@/components/data-table/DataTable';
import { formatRelative } from '@/lib/format';
import { useLocalStorageState } from '@/lib/hooks';
import { RECENT_KEY, type RecentCandidate } from './recent';

/** The profiles this browser opened lately, newest first. */
export function RecentCandidates() {
  const router = useRouter();
  const [recent, setRecent] = useLocalStorageState<RecentCandidate[]>(RECENT_KEY, []);
  return (
    <Card className="px-4 pt-1">
      <CardHeader
        className="px-0"
        title="Recently viewed"
        description="The last 20 profiles opened in this browser."
        action={
          recent.length > 0 && (
            <Button variant="quiet" size="sm" onClick={() => setRecent([])}>
              Clear list
            </Button>
          )
        }
      />
      <DataTable
        viewKey="candidates-recent"
        data={recent}
        getRowId={(row) => row.id}
        noun="profile"
        onRowOpen={(row) => router.push(`/candidates/${row.id}`)}
        rowLabel={(row) => `Open ${row.name}`}
        columns={[
          {
            id: 'candidate',
            header: 'Candidate',
            hideable: false,
            cell: (row) => (
              <div className="flex items-center gap-3">
                <Avatar name={row.name} />
                <CellStack primary={row.name} secondary={row.title} />
              </div>
            ),
            sortValue: (row) => row.name,
          },
          {
            id: 'viewed',
            header: 'Viewed',
            className: 'whitespace-nowrap text-fg-muted',
            cell: (row) => formatRelative(row.viewedAt),
            sortValue: (row) => row.viewedAt,
          },
        ]}
        empty={
          <EmptyState
            icon={History}
            title="No profiles viewed yet"
            description="Profiles you open show up here so you can get back to them."
            action={
              <Button variant="secondary" asChild>
                <Link href="/candidates">Browse candidates</Link>
              </Button>
            }
          />
        }
      />
    </Card>
  );
}

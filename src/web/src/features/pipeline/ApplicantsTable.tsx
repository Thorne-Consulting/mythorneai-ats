'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { CellStack, EmptyState } from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table/DataTable';
import { StageBadge } from '@/components/status';
import { formatDate, formatDateTime, formatRelative } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import {
  flattenBoard,
  matchesApplicant,
  type ApplicantRow,
  type BoardStage,
} from './pipeline-stats';

/**
 * A job's active applicants as a table (the list side of the pipeline, and the job's Candidates
 * section). Search and stage filters live outside, so the table can reset paging when they change.
 */
export function ApplicantsTable({
  stages,
  viewKey,
  exportName,
  search = '',
  stageIds,
  loading,
  empty,
}: {
  stages: BoardStage[];
  viewKey: string;
  exportName?: string;
  search?: string;
  stageIds?: string[];
  loading?: boolean;
  empty?: ReactNode;
}) {
  const router = useRouter();
  // Debounced so the table (keyed on it to reset paging) doesn't remount on every keystroke.
  const q = useDebouncedValue(search);
  const order = new Map(stages.map((s, i) => [s.id, i]));
  const rows = flattenBoard(stages).filter(
    (app) => (!stageIds?.length || stageIds.includes(app.stageId)) && matchesApplicant(app, q),
  );
  const columns: Column<ApplicantRow>[] = [
    {
      id: 'candidate',
      header: 'Candidate',
      hideable: false,
      className: 'max-w-72',
      cell: (app) => (
        <CellStack primary={app.candidateName} secondary={app.currentTitle ?? app.location} />
      ),
      sortValue: (app) => app.candidateName,
    },
    {
      id: 'stage',
      header: 'Stage',
      cell: (app) => <StageBadge stage={app.stageName} size="sm" />,
      sortValue: (app) => order.get(app.stageId),
      csv: (app) => app.stageName,
    },
    { id: 'source', header: 'Source', cell: (app) => app.source, sortValue: (app) => app.source },
    {
      id: 'rating',
      header: 'Rating',
      align: 'right',
      className: 'tnum',
      cell: (app) => (app.rating ? app.rating.toFixed(1) : '—'),
      sortValue: (app) => app.rating,
    },
    {
      id: 'experience',
      header: 'Experience',
      align: 'right',
      className: 'tnum whitespace-nowrap',
      cell: (app) => (app.yearsExperience != null ? `${app.yearsExperience} years` : '—'),
      sortValue: (app) => app.yearsExperience,
    },
    {
      id: 'location',
      header: 'Location',
      defaultHidden: true,
      cell: (app) => app.location ?? '—',
      sortValue: (app) => app.location,
    },
    {
      id: 'skills',
      header: 'Skills',
      defaultHidden: true,
      className: 'max-w-64 truncate text-fg-muted',
      cell: (app) => app.skills.slice(0, 4).join(', ') || '—',
      csv: (app) => app.skills.join('; '),
    },
    {
      id: 'interview',
      header: 'Next interview',
      className: 'whitespace-nowrap',
      cell: (app) => (app.nextInterviewAt ? formatDateTime(app.nextInterviewAt) : '—'),
      sortValue: (app) => app.nextInterviewAt,
    },
    {
      id: 'applied',
      header: 'Applied',
      className: 'whitespace-nowrap text-fg-muted',
      cell: (app) => formatDate(app.appliedAt),
      sortValue: (app) => app.appliedAt,
    },
    {
      id: 'activity',
      header: 'Last activity',
      className: 'whitespace-nowrap text-fg-muted',
      cell: (app) => formatRelative(app.lastActivityAt),
      sortValue: (app) => app.lastActivityAt,
    },
  ];
  return (
    <DataTable
      key={`${q}|${stageIds?.join(',')}`}
      viewKey={viewKey}
      exportName={exportName}
      noun="candidate"
      data={rows}
      columns={columns}
      getRowId={(app) => app.id}
      loading={loading}
      onRowOpen={(app) => router.push(`/applications/${app.id}`)}
      rowLabel={(app) => `Open ${app.candidateName}`}
      empty={
        empty ?? (
          <EmptyState
            compact
            icon={Users}
            title="No candidates match"
            description="Try another stage or search."
          />
        )
      }
    />
  );
}

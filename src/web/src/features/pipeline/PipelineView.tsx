'use client';

import { useState } from 'react';
import { Kanban, List, Rows3, Rows4 } from 'lucide-react';
import {
  Card,
  IconButton,
  SearchInput,
  SegmentedControl,
  SkeletonRows,
  Tooltip,
} from '@/components/ui';
import { useLocalStorageState } from '@/lib/hooks';
import type { BoardData } from '@/types';
import { useBoard } from '@/features/requisitions/requisition-data';
import { ApplicantsTable } from './ApplicantsTable';
import { PipelineBoard } from './PipelineBoard';
import { StageStrip } from './StageStrip';
import { matchesApplicant } from './pipeline-stats';

/**
 * One job's pipeline with its controls: search, stage chips (counts + filter), Board / List and
 * card density. Used by the Pipeline page and the job's Pipeline section; the layout and density
 * choices are remembered per browser.
 */
export function PipelineView({
  requisitionId,
  initialData,
  canManage,
  owner,
}: {
  requisitionId: string;
  initialData?: BoardData;
  canManage: boolean;
  owner?: string;
}) {
  const board = useBoard(requisitionId, initialData);
  const [search, setSearch] = useState('');
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [layout, setLayout] = useLocalStorageState('ats-pipeline-layout', 'board');
  const [compact, setCompact] = useLocalStorageState('ats-pipeline-compact', false);
  const stages = board.data?.stages ?? [];
  const counts = stages.map((s) => ({
    id: s.id,
    name: s.name,
    count: s.applications.filter((a) => matchesApplicant(a, search)).length,
  }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search name, title or skill"
          className="w-full sm:w-64"
        />
        <div className="flex items-center gap-1.5 sm:ml-auto">
          {layout === 'board' && (
            <Tooltip label={compact ? 'Detailed cards' : 'Compact cards'}>
              <IconButton
                label={compact ? 'Detailed cards' : 'Compact cards'}
                aria-pressed={compact}
                onClick={() => setCompact(!compact)}
              >
                {compact ? <Rows3 /> : <Rows4 />}
              </IconButton>
            </Tooltip>
          )}
          <SegmentedControl
            aria-label="Layout"
            value={layout}
            onValueChange={setLayout}
            items={[
              { value: 'board', label: 'Board', icon: <Kanban /> },
              { value: 'list', label: 'List', icon: <List /> },
            ]}
          />
        </div>
      </div>
      {board.data && <StageStrip stages={counts} selected={stageIds} onChange={setStageIds} />}
      {!board.data ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : layout === 'list' ? (
        <Card className="px-4">
          <ApplicantsTable
            stages={stages}
            viewKey="pipeline-list"
            exportName={`pipeline-${board.data.code}`}
            search={search}
            stageIds={stageIds}
          />
        </Card>
      ) : (
        <PipelineBoard
          requisitionId={requisitionId}
          initialData={initialData}
          canManage={canManage}
          owner={owner}
          search={search}
          stageIds={stageIds}
          compact={compact}
        />
      )}
    </div>
  );
}

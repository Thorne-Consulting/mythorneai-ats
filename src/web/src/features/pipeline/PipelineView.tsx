'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ClipboardCheck,
  Kanban,
  List,
  Mail,
  Rows3,
  Rows4,
  Settings2,
  Workflow,
  UserX,
} from 'lucide-react';
import { api } from '@/api';
import {
  Button,
  Card,
  IconButton,
  SearchInput,
  SegmentedControl,
  SelectionBar,
  SkeletonRows,
  SplitView,
  Switch,
  Tooltip,
  toast,
} from '@/components/ui';
import { CandidatePreview } from '@/features/candidates/CandidatePreview';
import { RejectModal } from '@/features/applications/RejectModal';
import { RejectManyModal, type RejectManyChoice } from '@/features/applicants/RejectManyModal';
import { SendAssessmentModal } from '@/features/assessments/SendAssessmentModal';
import { BulkEmailDrawer } from '@/features/messages/BulkEmailDrawer';
import { useAbility } from '@/lib/ability';
import { useLocalStorageState } from '@/lib/hooks';
import type { BoardData } from '@/types';
import { useBoard } from '@/features/requisitions/requisition-data';
import { ApplicantsTable } from './ApplicantsTable';
import { PipelineBoard, type ArchivedCard } from './PipelineBoard';
import { ChangePipelineModal } from './ChangePipelineModal';
import { StageEditor } from './StageEditor';
import { StageStrip } from './StageStrip';
import { MoveDialog, usePipelineMoves } from './pipeline-moves';
import { PipelineFilterButton } from './PipelineFilters';
import {
  matchesApplicant,
  matchesFilters,
  NO_FILTERS,
  type BoardCard,
  type PipelineFilters,
} from './pipeline-stats';

/**
 * One job's pipeline with its controls: search, stage chips (counts and filter), Board or List,
 * card density, the rejected lane and stage editing. Selecting people (board or list) shows a bar
 * to move or reject them together. Layout and density are remembered per browser; `view` from the
 * address wins over the remembered layout.
 */
export function PipelineView({
  requisitionId,
  initialData,
  canManage,
  view,
}: {
  requisitionId: string;
  initialData?: BoardData;
  canManage: boolean;
  view?: 'board' | 'list';
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const board = useBoard(requisitionId, initialData);
  const [search, setSearch] = useState('');
  const [stageIds, setStageIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<PipelineFilters>(NO_FILTERS);
  const [layout, setLayout] = useLocalStorageState('ats-pipeline-layout', 'board');
  const [compact, setCompact] = useLocalStorageState('ats-pipeline-compact', false);
  const [showArchived, setShowArchived] = useLocalStorageState('ats-pipeline-archived', false);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [moving, setMoving] = useState<{ ids: string[]; stageId?: string } | null>(null);
  const [rejecting, setRejecting] = useState<BoardCard | null>(null);
  const [rejectingMany, setRejectingMany] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const canEmail = useAbility().can('send', 'Message');
  const [editingStages, setEditingStages] = useState(false);
  const [changingPipeline, setChangingPipeline] = useState(false);
  const move = usePipelineMoves(requisitionId);
  // Declared after the stored layout loads, so the address wins.
  useEffect(() => {
    if (view) setLayout(view);
  }, [view, setLayout]);
  const archived = useQuery({
    queryKey: ['board-archived', requisitionId],
    queryFn: () => api.get<ArchivedCard[]>(`/api/requisitions/${requisitionId}/archived`),
    enabled: showArchived && layout === 'board',
  });
  const allStages = board.data?.stages ?? [];
  // Filters narrow everything below: the cards, the stage counts and what a bulk action touches.
  const stages = allStages.map((s) => ({
    ...s,
    applications: s.applications.filter((a) => matchesFilters(a, filters)),
  }));
  const sources = [
    ...new Set(allStages.flatMap((s) => s.applications.map((a) => a.source))),
  ].sort();
  const cards = stages.flatMap((s) => s.applications);
  const cardsOf = (ids: string[]) => cards.filter((c) => ids.includes(c.id));
  // People who left the board (moved by someone else, rejected) drop out of the selection.
  const liveSelected = selected.filter((id) => cards.some((c) => c.id === id));
  const preview = cards.find((c) => c.id === previewId);
  // The record walks previous and next within the stage it was opened from.
  const recordHref = (id: string) => {
    const stage = stages.find((s) => s.applications.some((a) => a.id === id));
    return `/applications/${id}${stage ? `?stage=${stage.id}` : ''}`;
  };
  const counts = stages.map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    color: s.color,
    count: s.applications.filter((a) => matchesApplicant(a, search)).length,
  }));

  // A drop or a menu pick asks first only when the stage is set to ask about its email.
  const requestMove = (ids: string[], stageId: string) => {
    const stage = stages.find((s) => s.id === stageId);
    if (stage?.emailOnEntry === 'Ask') setMoving({ ids, stageId });
    else void move(ids, stageId, stage?.emailOnEntry === 'Always' ? {} : null);
    setSelected([]);
  };
  const refresh = () => {
    for (const key of [
      ['board', requisitionId],
      ['board-archived', requisitionId],
      ['requisition', requisitionId],
      ['requisition-stats', requisitionId],
    ])
      queryClient.invalidateQueries({ queryKey: key });
  };
  const rejectMany = useMutation({
    mutationFn: (choice: RejectManyChoice) =>
      api.post<{ message: string }>('/api/candidates/bulk', {
        ...choice,
        ids: [...new Set(cardsOf(liveSelected).map((c) => c.candidateId))],
        action: 'reject',
        requisitionId,
      }),
    onSuccess: (result) => {
      toast.success(result.message);
      setSelected([]);
      setRejectingMany(false);
      refresh();
    },
    onError: (error: Error) => toast.error('Could not reject them', error.message),
  });
  // Below the split view's breakpoint there is no side pane, so a card opens the application.
  const openPreview = (card: BoardCard) => {
    if (window.matchMedia('(min-width: 1024px)').matches)
      setPreviewId((current) => (current === card.id ? null : card.id));
    else router.push(recordHref(card.id));
  };

  const strip = <StageStrip stages={counts} selected={stageIds} onChange={setStageIds} />;
  const bulkActions = canManage && (
    <>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<ArrowRight />}
        onClick={() => setMoving({ ids: liveSelected })}
      >
        Move
      </Button>
      {canEmail && (
        <Button size="sm" variant="secondary" leftIcon={<Mail />} onClick={() => setEmailing(true)}>
          Email
        </Button>
      )}
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<ClipboardCheck />}
        onClick={() => setAssessing(true)}
      >
        Send assessment
      </Button>
      <Button
        size="sm"
        variant="danger-quiet"
        leftIcon={<UserX />}
        onClick={() => setRejectingMany(true)}
      >
        Reject
      </Button>
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search name, title or skill"
          className="w-full sm:w-64"
        />
        <PipelineFilterButton filters={filters} onChange={setFilters} sources={sources} />
        <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
          {layout === 'board' && (
            <>
              <Switch
                label="Show rejected"
                checked={showArchived}
                onCheckedChange={setShowArchived}
                className="mr-2"
              />
              <Tooltip label={compact ? 'Detailed cards' : 'Compact cards'}>
                <IconButton
                  label={compact ? 'Detailed cards' : 'Compact cards'}
                  // Phones show one column at a time; density matters on wide screens.
                  className="max-sm:hidden"
                  aria-pressed={compact}
                  onClick={() => setCompact(!compact)}
                >
                  {compact ? <Rows3 /> : <Rows4 />}
                </IconButton>
              </Tooltip>
            </>
          )}
          {canManage && (
            <>
              <Tooltip label="Edit stages">
                <IconButton label="Edit stages" onClick={() => setEditingStages(true)}>
                  <Settings2 />
                </IconButton>
              </Tooltip>
              <Tooltip label="Change pipeline">
                <IconButton label="Change pipeline" onClick={() => setChangingPipeline(true)}>
                  <Workflow />
                </IconButton>
              </Tooltip>
            </>
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
      {board.data && layout !== 'list' && strip}
      {!board.data ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : layout === 'list' ? (
        <Card className="px-4">
          <ApplicantsTable
            stages={stages}
            viewKey="pipeline-list"
            exportName={`${board.data.code}-candidates`}
            search={search}
            stageIds={stageIds}
            toolbar={strip}
            selected={canManage ? liveSelected : undefined}
            onSelectedChange={canManage ? setSelected : undefined}
            bulkActions={bulkActions}
          />
        </Card>
      ) : (
        <>
          {canManage && (
            <SelectionBar
              count={liveSelected.length}
              noun="candidate"
              onClear={() => setSelected([])}
            >
              {bulkActions}
            </SelectionBar>
          )}
          <SplitView
            storageKey="pipeline-preview"
            sideOpen={!!preview}
            main={
              <PipelineBoard
                requisitionId={requisitionId}
                initialData={initialData}
                canManage={canManage}
                search={search}
                filters={filters}
                stageIds={stageIds}
                compact={compact}
                selected={liveSelected}
                onSelectedChange={setSelected}
                previewId={previewId}
                onPreview={openPreview}
                onRequestMove={requestMove}
                onOpenMove={(ids) => setMoving({ ids })}
                onReject={setRejecting}
                archived={showArchived ? (archived.data ?? []) : null}
              />
            }
            side={
              preview && (
                <div className="flex flex-col gap-2 pl-1">
                  <Button asChild variant="secondary" size="sm" className="self-start">
                    <Link href={recordHref(preview.id)}>
                      Open full application
                      <ArrowRight />
                    </Link>
                  </Button>
                  <CandidatePreview
                    key={preview.candidateId}
                    person={{
                      id: preview.candidateId,
                      name: preview.candidateName,
                      email: preview.email ?? '',
                      currentTitle: preview.currentTitle,
                      location: preview.location,
                      skills: preview.skills,
                      matchedTerms: [],
                      doNotContact: preview.doNotContact,
                      applications: [{ id: preview.id, rating: preview.rating }],
                    }}
                    onClose={() => setPreviewId(null)}
                  />
                </div>
              )
            }
          />
        </>
      )}
      <MoveDialog
        opened={moving !== null}
        onClose={() => setMoving(null)}
        cards={cardsOf(moving?.ids ?? [])}
        stages={stages}
        stageId={moving?.stageId}
        onMove={(stageId, email) => {
          void move(moving?.ids ?? [], stageId, email);
          setSelected([]);
        }}
      />
      {rejecting && (
        <RejectModal
          opened
          applicationId={rejecting.id}
          stageId={stages.find((s) => s.applications.some((a) => a.id === rejecting.id))?.id ?? ''}
          firstName={rejecting.firstName ?? rejecting.candidateName}
          doNotContact={rejecting.doNotContact ?? false}
          onClose={() => setRejecting(null)}
          onSaved={refresh}
        />
      )}
      <BulkEmailDrawer
        opened={emailing}
        onClose={() => setEmailing(false)}
        applicationIds={liveSelected}
        onSent={() => setSelected([])}
      />
      {/* Bulk dialogs load assessments and reasons, which only people who manage the job may read. */}
      {canManage && (
        <>
          <SendAssessmentModal
            opened={assessing}
            onClose={() => setAssessing(false)}
            applicationIds={liveSelected}
            onSent={() => {
              setAssessing(false);
              setSelected([]);
            }}
          />
          <RejectManyModal
            opened={rejectingMany}
            onClose={() => setRejectingMany(false)}
            loading={rejectMany.isPending}
            count={liveSelected.length}
            title={
              liveSelected.length === 1 ? 'Reject 1 person' : `Reject ${liveSelected.length} people`
            }
            onReject={(choice) => rejectMany.mutate(choice)}
          />
        </>
      )}
      {editingStages && (
        <StageEditor
          requisitionId={requisitionId}
          stages={stages.map((s) => ({ ...s, count: s.applications.length }))}
          opened={editingStages}
          onClose={() => setEditingStages(false)}
        />
      )}
      {changingPipeline && (
        <ChangePipelineModal
          requisitionId={requisitionId}
          stages={stages.map((s) => ({ ...s, count: s.applications.length }))}
          opened={changingPipeline}
          onClose={() => setChangingPipeline(false)}
        />
      )}
    </div>
  );
}

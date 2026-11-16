'use client';

import Link from 'next/link';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  ClipboardList,
  Copy,
  Plus,
  Workflow,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Button,
  Card,
  CardHeader,
  EmptyState,
  MenuCheckboxItem,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  RowActions,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { StageBadge } from '@/components/status';
import { useKitTemplates } from '@/features/interview-library/library-data';
import { move, type KitListItem } from '@/features/interview-library/library-model';
import { useRequisition } from './requisition-data';

type KitList = { canManage: boolean; kits: KitListItem[] };

/** A job's interview kits, in the order of its interview rounds. */
export function RequisitionKits({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const job = useRequisition(id);
  const list = useQuery({
    queryKey: ['interview-kits', id],
    queryFn: () => api.get<KitList>(`/api/requisitions/${id}/interview-kits`),
  });
  // Templates are offered to the people who add kits (the hiring team); the list says who that is.
  const templates = useKitTemplates(false, list.data?.canManage ?? false);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['interview-kits', id] });
    queryClient.invalidateQueries({ queryKey: ['requisition', id] });
  };
  const action = useMutation({
    mutationFn: ({
      path,
      body,
      method = 'post',
    }: {
      path: string;
      body?: unknown;
      method?: 'post' | 'put';
    }) =>
      method === 'put'
        ? api.put(`/api/requisitions/${id}/interview-kits/${path}`, body)
        : api.post(`/api/requisitions/${id}/interview-kits/${path}`, body),
    onSuccess: (_, { path }) => {
      refresh();
      if (path.endsWith('/duplicate')) toast.success('Kit copied');
      if (path.endsWith('/archive'))
        toast.success(
          'Kit archived',
          'It is not offered when scheduling. Interviews that used it keep it.',
        );
      if (path.endsWith('/restore')) toast.success('Kit restored');
    },
    onError: (error: Error) => toast.error('Could not change the kit', error.message),
  });

  if (!list.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  const { canManage, kits } = list.data;
  const active = kits.filter((kit) => !kit.archivedAt);
  const archived = kits.filter((kit) => kit.archivedAt);
  const stages = (job.data?.stages ?? [])
    .filter((stage) => stage.type !== 'Hired' && !stage.isTerminal)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const stageOf = (stageId?: string | null) => stages.find((s) => s.id === stageId);
  const reorder = (from: number, to: number) =>
    action.mutate({
      path: 'order',
      method: 'put',
      body: { ids: move(active, from, to).map((kit) => kit.id) },
    });

  const row = (kit: KitListItem, index: number) => (
    <li
      key={kit.id}
      className="flex items-center gap-3 border-b border-border-subtle px-4 py-3.5 last:border-b-0 sm:px-5"
    >
      {!kit.archivedAt && (
        <span className="hidden w-5 shrink-0 text-sm text-fg-subtle tnum sm:block" aria-hidden>
          {index + 1}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href={`/jobs/${id}/kits/${kit.id}`}
            className="truncate text-base font-medium text-fg hover:text-accent-foreground hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {kit.name}
          </Link>
          {stageOf(kit.pipelineStageId) && (
            <StageBadge
              size="sm"
              stage={stageOf(kit.pipelineStageId)!.name}
              type={stageOf(kit.pipelineStageId)!.type}
              color={stageOf(kit.pipelineStageId)!.color}
            />
          )}
        </div>
        <p className="mt-0.5 text-xs text-fg-subtle tnum">
          {kit.durationMinutes} minutes · {kit.competencies}{' '}
          {kit.competencies === 1 ? 'competency' : 'competencies'} · Version {kit.version}
          {kit.interviews > 0 &&
            ` · Used in ${kit.interviews} ${kit.interviews === 1 ? 'interview' : 'interviews'}`}
          {kit.upcoming > 0 && ` (${kit.upcoming} upcoming)`}
        </p>
      </div>
      {canManage && (
        <RowActions label={`Actions for ${kit.name}`}>
          {!kit.archivedAt && (
            <>
              <MenuItem
                icon={<ArrowUp />}
                disabled={index === 0}
                onSelect={() => reorder(index, index - 1)}
              >
                Move up
              </MenuItem>
              <MenuItem
                icon={<ArrowDown />}
                disabled={index === active.length - 1}
                onSelect={() => reorder(index, index + 1)}
              >
                Move down
              </MenuItem>
              <MenuSub>
                <MenuSubTrigger icon={<Workflow />}>Stage</MenuSubTrigger>
                <MenuSubContent>
                  <MenuCheckboxItem
                    checked={!kit.pipelineStageId}
                    onCheckedChange={() =>
                      action.mutate({
                        path: `${kit.id}/stage`,
                        method: 'put',
                        body: { pipelineStageId: null },
                      })
                    }
                  >
                    Any stage
                  </MenuCheckboxItem>
                  {stages.map((stage) => (
                    <MenuCheckboxItem
                      key={stage.id}
                      checked={kit.pipelineStageId === stage.id}
                      onCheckedChange={() =>
                        action.mutate({
                          path: `${kit.id}/stage`,
                          method: 'put',
                          body: { pipelineStageId: stage.id },
                        })
                      }
                    >
                      {stage.name}
                    </MenuCheckboxItem>
                  ))}
                </MenuSubContent>
              </MenuSub>
              <MenuItem
                icon={<Copy />}
                onSelect={() => action.mutate({ path: `${kit.id}/duplicate` })}
              >
                Duplicate
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<Archive />}
                onSelect={() => action.mutate({ path: `${kit.id}/archive` })}
              >
                Archive
              </MenuItem>
            </>
          )}
          {kit.archivedAt && (
            <MenuItem
              icon={<ArchiveRestore />}
              onSelect={() => action.mutate({ path: `${kit.id}/restore` })}
            >
              Restore
            </MenuItem>
          )}
        </RowActions>
      )}
    </li>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Interview kits"
        description="One kit per interview round. Every interviewer in a round asks the same questions and scores the same way."
        action={
          canManage && kits.length > 0 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`/jobs/${id}/kits/new`}>
                <Plus />
                New kit
              </Link>
            </Button>
          ) : undefined
        }
      />
      {active.length === 0 ? (
        <EmptyState
          compact
          icon={ClipboardList}
          title="No interview kits yet"
          description={
            canManage
              ? 'Start from a template in your interview library, or write your own.'
              : 'The people who manage this job add kits here.'
          }
          action={
            canManage ? (
              <div className="flex flex-wrap justify-center gap-2">
                {templates.data?.slice(0, 3).map((template) => (
                  <Button key={template.id} asChild variant="secondary" size="sm">
                    <Link href={`/jobs/${id}/kits/new?template=${template.id}`}>
                      {template.name}
                    </Link>
                  </Button>
                ))}
                <Button asChild size="sm">
                  <Link href={`/jobs/${id}/kits/new`}>
                    <Plus />
                    New kit
                  </Link>
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <ol className="border-t border-border-subtle">{active.map(row)}</ol>
      )}
      {archived.length > 0 && (
        <details className="group border-t border-border-subtle">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none sm:px-5">
            Archived ({archived.length})
          </summary>
          <ul className="border-t border-border-subtle bg-muted/40">{archived.map(row)}</ul>
        </details>
      )}
    </Card>
  );
}

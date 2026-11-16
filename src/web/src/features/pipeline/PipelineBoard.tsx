'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownUp,
  CalendarPlus,
  ClipboardCheck,
  ExternalLink,
  Flag,
  Mail,
  SquareCheck,
  UserX,
} from 'lucide-react';
import {
  Badge,
  Card,
  Checkbox,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  RowActions,
  SkeletonRows,
} from '@/components/ui';
import { Board, BoardColumn } from '@/components/pipeline/BoardColumn';
import { CandidateCard } from '@/components/pipeline/CandidateCard';
import { stageTone } from '@/components/status';
import { useAbility } from '@/lib/ability';
import { cn } from '@/lib/cn';
import { formatDateTime, formatRelative } from '@/lib/format';
import { useBoard } from '@/features/requisitions/requisition-data';
import type { BoardData } from '@/types';
import {
  averageDaysInStage,
  cardSorts,
  matchesApplicant,
  sortCards,
  timeInStage,
  type BoardCard,
  type BoardStage,
  type CardSort,
} from './pipeline-stats';

export type ArchivedCard = {
  id: string;
  candidateName: string;
  currentTitle?: string;
  source: string;
  status: string;
  dispositionReason?: string | null;
  stageName: string;
  lastActivityAt: string;
};

/** What the card's detail line says: the next interview, else skills, else title. */
function detailOf(app: BoardCard) {
  if (app.nextInterviewAt) return `Interview · ${formatDateTime(app.nextInterviewAt)}`;
  if (app.skills.length) return app.skills.slice(0, 3).join(' · ');
  return app.currentTitle ?? null;
}

const owedText = (n: number) => (n === 1 ? '1 scorecard owed' : `${n} scorecards owed`);

// Arrow keys during a keyboard drag jump a whole column, not a few pixels.
const columnCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { droppableRects, droppableContainers, collisionRect } },
) => {
  if (!collisionRect || (event.code !== KeyboardCode.Right && event.code !== KeyboardCode.Left))
    return undefined;
  event.preventDefault();
  const columns = droppableContainers
    .getEnabled()
    .map((c) => droppableRects.get(c.id))
    .filter((rect) => !!rect)
    .sort((a, b) => a.left - b.left);
  const center = collisionRect.left + collisionRect.width / 2;
  const here = columns.findIndex((rect) => center >= rect.left && center <= rect.right);
  const target =
    event.code === KeyboardCode.Right
      ? here === -1
        ? columns.find((rect) => rect.left > center)
        : columns[here + 1]
      : here === -1
        ? [...columns].reverse().find((rect) => rect.right < center)
        : columns[here - 1];
  return target ? { x: target.left + 8, y: target.top + 48 } : undefined;
};

// The pointer decides when there is one; keyboard drags fall back to overlap.
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : rectIntersection(args);
};

/**
 * A job's candidates, a column per stage. Managers drag cards with a mouse, a finger, or the
 * keyboard (Space to pick up, arrows to change column, Space to drop), or use the card's ••• menu.
 * Arrow keys move between cards; M opens Move, R opens Reject. Shift-click or the checkbox selects
 * several. Clicking a card previews the person.
 */
export function PipelineBoard({
  requisitionId,
  initialData,
  canManage,
  search = '',
  stageIds,
  compact,
  selected,
  onSelectedChange,
  previewId,
  onPreview,
  onRequestMove,
  onOpenMove,
  onReject,
  archived,
}: {
  requisitionId: string;
  initialData?: BoardData;
  canManage: boolean;
  search?: string;
  /** Only these stages' columns; all when empty or missing. */
  stageIds?: string[];
  /** Name-only cards, so more fit on screen. */
  compact?: boolean;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  previewId: string | null;
  onPreview: (card: BoardCard) => void;
  /** A drop or a "Move to" pick: the page decides whether to ask about the email. */
  onRequestMove: (ids: string[], stageId: string) => void;
  /** Open the move dialog to choose a stage. */
  onOpenMove: (ids: string[]) => void;
  onReject: (card: BoardCard) => void;
  /** The archived lane's people, when it is shown. */
  archived?: ArchivedCard[] | null;
}) {
  const board = useBoard(requisitionId, initialData);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sort, setSort] = useState<CardSort>('activity');
  const lastClicked = useRef<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: columnCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space, KeyboardCode.Enter],
      },
    }),
  );

  if (!board.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  const stages = board.data.stages;
  const all = stages.flatMap((s) => s.applications);
  const cardOf = (id: string | number | undefined) => all.find((a) => a.id === id);
  const stageName = (id: string | number) => stages.find((s) => s.id === id)?.name ?? 'a stage';
  const active = cardOf(activeId ?? undefined);
  const selecting = selected.length > 0;
  const toggle = (id: string, range?: string[]) => {
    if (range) onSelectedChange([...new Set([...selected, ...range])]);
    else
      onSelectedChange(
        selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
      );
  };
  // Dragging a selected card moves everyone selected with it.
  const movingIds = (id: string) => (selected.includes(id) ? selected : [id]);

  const visible = stages.filter((stage) => !stageIds?.length || stageIds.includes(stage.id));

  return (
    <DndContext
      // A fixed id keeps dnd-kit's generated ids the same on the server and in the browser.
      id={`board-${requisitionId}`}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        const from = stages.find((s) => s.applications.some((a) => a.id === active.id));
        if (over && from && over.id !== from.id)
          onRequestMove(movingIds(String(active.id)), String(over.id));
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'To move this person, press Space. Use the left and right arrow keys to choose a stage, then press Space to drop or Escape to cancel.',
        },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${cardOf(active.id)?.candidateName ?? 'a card'}.`,
          onDragOver: ({ active, over }) =>
            over
              ? `${cardOf(active.id)?.candidateName ?? 'The card'} is over ${stageName(over.id)}.`
              : undefined,
          onDragEnd: ({ active, over }) =>
            over
              ? `${cardOf(active.id)?.candidateName ?? 'The card'} dropped on ${stageName(over.id)}.`
              : 'Dropped. Nothing moved.',
          onDragCancel: () => 'Cancelled. Nothing moved.',
        },
      }}
    >
      <Board>
        {visible.map((stage, columnIndex) => {
          const cards = sortCards(
            stage.applications.filter((a) => matchesApplicant(a, search)),
            sort,
          );
          const average = averageDaysInStage(cards);
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              droppable={canManage && !stage.isTerminal}
              compact={compact}
              count={cards.length}
              meta={
                [
                  average !== null && !stage.isTerminal
                    ? `${average === 1 ? '1 day' : `${average} days`} ${stage.assessmentName ? '' : 'in stage '}on average`
                    : null,
                  stage.assessmentName ? `Assessment: ${stage.assessmentName}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined
              }
              menu={
                <RowActions label={`${stage.name} options`} size="sm">
                  <MenuLabel>Order cards by</MenuLabel>
                  {cardSorts.map((option) => (
                    <MenuItem
                      key={option.value}
                      icon={<ArrowDownUp />}
                      onSelect={() => setSort(option.value)}
                    >
                      {option.label}
                      {sort === option.value ? ' ✓' : ''}
                    </MenuItem>
                  ))}
                  {canManage && !stage.isTerminal && cards.length > 0 && (
                    <>
                      <MenuSeparator />
                      <MenuItem
                        icon={<SquareCheck />}
                        onSelect={() =>
                          onSelectedChange([...new Set([...selected, ...cards.map((c) => c.id)])])
                        }
                      >
                        Select everyone here
                      </MenuItem>
                    </>
                  )}
                </RowActions>
              }
            >
              <ColumnCards
                cards={cards}
                compact={compact}
                render={(app, index) => {
                  const time = timeInStage(app.enteredStageAt, stage.targetDays);
                  const owed = app.feedbackOwed ?? 0;
                  return (
                    <BoardCardItem
                      key={app.id}
                      app={app}
                      columnIndex={columnIndex}
                      draggable={canManage && !stage.isTerminal}
                      selected={selected.includes(app.id)}
                      previewing={previewId === app.id}
                      boardDragging={activeId !== null}
                      onClick={(event) => {
                        if (canManage && (event.shiftKey || event.metaKey || event.ctrlKey)) {
                          // Shift-click selects everything between the last click and this card.
                          const from = cards.findIndex((c) => c.id === lastClicked.current);
                          if (event.shiftKey && from !== -1) {
                            const [a, b] = from < index ? [from, index] : [index, from];
                            toggle(
                              app.id,
                              cards.slice(a, b + 1).map((c) => c.id),
                            );
                          } else toggle(app.id);
                        } else onPreview(app);
                        lastClicked.current = app.id;
                      }}
                      onKey={(key) => {
                        if (!canManage || stage.isTerminal) return;
                        if (key === 'm') onOpenMove(movingIds(app.id));
                        if (key === 'r') onReject(app);
                        if (key === 'x') toggle(app.id);
                      }}
                      leading={
                        canManage &&
                        !stage.isTerminal && (
                          <span
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            className={cn(
                              'flex size-full items-center justify-center rounded-full bg-card',
                              !selecting &&
                                'opacity-0 group-hover/card:opacity-100 focus-within:opacity-100 [@media(hover:none)]:hidden',
                            )}
                          >
                            <Checkbox
                              aria-label={`Select ${app.candidateName}`}
                              checked={selected.includes(app.id)}
                              onCheckedChange={() => toggle(app.id)}
                            />
                          </span>
                        )
                      }
                      subtitle={compact ? app.currentTitle : app.source}
                      detail={compact ? null : detailOf(app)}
                      timeInStage={
                        compact
                          ? null
                          : (time?.text ?? `Last activity ${formatRelative(app.lastActivityAt)}`)
                      }
                      timeTone={time?.tone}
                      footerEnd={
                        !compact && (owed > 0 || app.assessment) ? (
                          <span className="flex items-center gap-2">
                            {owed > 0 && (
                              <span className="text-2xs font-medium text-tone-amber-fg">
                                {owedText(owed)}
                              </span>
                            )}
                            {app.assessment && <AssessmentScore result={app.assessment} />}
                          </span>
                        ) : undefined
                      }
                      aside={
                        <span
                          className="flex items-center gap-1"
                          // Menu clicks bubble through the portal to the card; keep them from opening it.
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {app.flagged && (
                            <span
                              title="An answer is flagged for review"
                              className="text-tone-red-fg"
                            >
                              <Flag className="size-3.5" aria-hidden />
                              <span className="sr-only">An answer is flagged for review</span>
                            </span>
                          )}
                          {compact && app.assessment && <AssessmentScore result={app.assessment} />}
                          {app.rating ? (
                            <span
                              className="text-xs font-semibold text-fg tnum"
                              title="Average rating"
                            >
                              {app.rating.toFixed(1)}
                            </span>
                          ) : null}
                          <CardMenu
                            app={app}
                            stage={stage}
                            stages={stages}
                            canManage={canManage}
                            onMove={(to) => onRequestMove([app.id], to)}
                            onReject={() => onReject(app)}
                          />
                        </span>
                      }
                    />
                  );
                }}
              />
            </StageColumn>
          );
        })}
        {archived && <ArchivedColumn cards={archived} compact={compact} />}
      </Board>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <CandidateCard
            name={active.candidateName}
            subtitle={
              selected.includes(active.id) && selected.length > 1
                ? `and ${selected.length - 1} more`
                : compact
                  ? active.currentTitle
                  : active.source
            }
            className="w-[228px] rotate-2 cursor-grabbing shadow-pop"
          />
        ) : null}
      </DragOverlay>
      {canManage && (
        <p className="mt-1 text-xs text-fg-subtle">
          Drag a card to another stage, or press Space on it and use the arrow keys. M moves, R
          rejects, Shift-click selects several.
        </p>
      )}
    </DndContext>
  );
}

type AssessmentResult = NonNullable<
  BoardData['stages'][number]['applications'][number]['assessment']
>;

/** The latest assessment result on a card: the score, green once passed, red once failed. */
function AssessmentScore({ result }: { result: AssessmentResult }) {
  const scored = result.percent !== null && result.pendingCount === 0;
  const text = scored ? `${result.percent}%` : 'To score';
  const said = `${result.name}: ${scored ? `${result.percent} percent` : 'waiting to be scored'}${
    result.decision ? `, ${result.decision === 'Passed' ? 'passed' : 'did not pass'}` : ''
  }`;
  return (
    <Badge
      size="sm"
      tone={result.decision === 'Passed' ? 'green' : result.decision === 'Failed' ? 'red' : 'gray'}
      className="tnum"
      title={said}
      icon={<ClipboardCheck aria-hidden />}
    >
      <span aria-hidden>{text}</span>
      <span className="sr-only">{said}</span>
    </Badge>
  );
}

function StageColumn({
  stage,
  droppable,
  compact,
  count,
  meta,
  menu,
  children,
}: {
  stage: BoardStage;
  droppable: boolean;
  compact?: boolean;
  count: number;
  meta?: ReactNode;
  menu: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, disabled: !droppable });
  return (
    <BoardColumn
      dropRef={setNodeRef}
      isOver={isOver}
      title={stage.name}
      count={count}
      meta={meta}
      tone={stageTone(stage.type, stage.color)}
      className={compact ? 'w-[220px]' : undefined}
      menu={menu}
      empty={
        stage.isTerminal
          ? 'Hired through an accepted offer'
          : droppable
            ? 'Drop a candidate here'
            : 'No candidates'
      }
    >
      {count > 0 ? children : null}
    </BoardColumn>
  );
}

/** A column's cards; long columns render only what is on screen. */
function ColumnCards({
  cards,
  compact,
  render,
}: {
  cards: BoardCard[];
  compact?: boolean;
  render: (card: BoardCard, index: number) => ReactNode;
}) {
  // ponytail: plain list up to 40 cards; past that, a scrolling virtual list (focus moves only
  // between cards on screen there).
  if (cards.length <= 40) return <>{cards.map((card, index) => render(card, index))}</>;
  return <VirtualCards cards={cards} estimate={compact ? 64 : 132} render={render} />;
}

function VirtualCards({
  cards,
  estimate,
  render,
}: {
  cards: BoardCard[];
  estimate: number;
  render: (card: BoardCard, index: number) => ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({
    count: cards.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => estimate,
    overscan: 6,
    gap: 10,
    getItemKey: (index) => cards[index].id,
  });
  return (
    <div ref={scroller} className="-mx-1 max-h-[70vh] overflow-y-auto px-1 py-0.5">
      <div className="relative w-full" style={{ height: virtual.getTotalSize() }}>
        {virtual.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtual.measureElement}
            className="absolute top-0 left-0 w-full"
            // Dynamic position from the virtualizer.
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {render(cards[item.index], item.index)}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Focus the card in the given direction: up and down in the column, left and right across columns. */
function moveFocus(from: HTMLElement, key: string) {
  const column = from.closest('section');
  const columns = [
    ...(column?.parentElement?.querySelectorAll<HTMLElement>(':scope > section') ?? []),
  ];
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    const cards = [...(column?.querySelectorAll<HTMLElement>('[data-card]') ?? [])];
    const index = cards.indexOf(from);
    cards[index + (key === 'ArrowDown' ? 1 : -1)]?.focus();
    return;
  }
  const index = column ? columns.indexOf(column) : -1;
  const step = key === 'ArrowRight' ? 1 : -1;
  for (let i = index + step; i >= 0 && i < columns.length; i += step) {
    const card = columns[i].querySelector<HTMLElement>('[data-card]');
    if (card) return card.focus();
  }
}

function BoardCardItem({
  app,
  columnIndex,
  draggable,
  selected,
  previewing,
  boardDragging,
  onClick,
  onKey,
  ...card
}: {
  app: BoardCard;
  columnIndex: number;
  draggable: boolean;
  selected: boolean;
  previewing: boolean;
  boardDragging: boolean;
  onClick: (event: React.MouseEvent) => void;
  onKey: (key: 'm' | 'r' | 'x') => void;
  leading?: ReactNode;
  subtitle?: ReactNode;
  detail?: ReactNode;
  timeInStage?: ReactNode;
  timeTone?: 'amber' | 'red' | null;
  footerEnd?: ReactNode;
  aside?: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: app.id,
    disabled: !draggable,
  });
  return (
    <CandidateCard
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      // The card always opens the preview; only dragging is off for people who can't move people,
      // so screen readers hear neither "draggable" nor the drag instructions then.
      aria-disabled={undefined}
      aria-roledescription={draggable ? attributes['aria-roledescription'] : undefined}
      aria-describedby={draggable ? attributes['aria-describedby'] : undefined}
      aria-label={`${app.candidateName}. Press Enter to preview.`}
      aria-pressed={selected}
      data-card={app.id}
      data-column-index={columnIndex}
      name={app.candidateName}
      selected={selected || previewing}
      dragging={isDragging}
      // select-none: shift-click selects cards, not their text.
      className="touch-manipulation select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={onClick}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        listeners?.onKeyDown?.(event);
        if (boardDragging || event.defaultPrevented || event.target !== event.currentTarget) return;
        if (event.key === 'Enter') {
          event.preventDefault();
          onClick(event as unknown as React.MouseEvent);
        } else if (event.key.startsWith('Arrow')) {
          event.preventDefault();
          moveFocus(event.currentTarget, event.key);
        } else if (event.key === 'm' || event.key === 'r' || event.key === 'x') {
          event.preventDefault();
          onKey(event.key);
        }
      }}
      {...card}
    />
  );
}

function CardMenu({
  app,
  stage,
  stages,
  canManage,
  onMove,
  onReject,
}: {
  app: BoardCard;
  stage: BoardStage;
  stages: BoardStage[];
  canManage: boolean;
  onMove: (stageId: string) => void;
  onReject: () => void;
}) {
  const router = useRouter();
  // Messages on a job belong to the people who manage it.
  const canEmail = useAbility().can('send', 'Message') && canManage;
  const targets = stages.filter((t) => t.id !== stage.id && !t.isTerminal);
  const open = (path: string) =>
    router.push(`/applications/${app.id}${path}${path.includes('?') ? '&' : '?'}stage=${stage.id}`);
  return (
    <RowActions label={`Actions for ${app.candidateName}`} size="sm">
      {canManage && !stage.isTerminal && (
        <>
          <MenuSub>
            <MenuSubTrigger icon={<ArrowDownUp />}>Move to</MenuSubTrigger>
            <MenuSubContent>
              {targets.map((target) => (
                <MenuItem key={target.id} onSelect={() => onMove(target.id)}>
                  {target.name}
                </MenuItem>
              ))}
            </MenuSubContent>
          </MenuSub>
          <MenuItem icon={<UserX />} danger shortcut="R" onSelect={onReject}>
            Reject
          </MenuItem>
          <MenuSeparator />
        </>
      )}
      {canEmail && (
        <MenuItem icon={<Mail />} onSelect={() => open('/messages')}>
          Send email
        </MenuItem>
      )}
      {canManage && (
        <MenuItem icon={<CalendarPlus />} onSelect={() => open('/interviews')}>
          Schedule interview
        </MenuItem>
      )}
      <MenuItem icon={<ExternalLink />} onSelect={() => open('')}>
        Open application
      </MenuItem>
    </RowActions>
  );
}

function ArchivedColumn({ cards, compact }: { cards: ArchivedCard[]; compact?: boolean }) {
  return (
    <BoardColumn
      title="Rejected and withdrawn"
      count={cards.length}
      tone="red"
      className={cn('bg-muted', compact ? 'w-[220px]' : undefined)}
      menu={<span />}
      empty="Nobody yet"
    >
      {cards.length > 0 &&
        cards.map((card) => (
          <Link
            key={card.id}
            href={`/applications/${card.id}`}
            className="rounded-[9px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <CandidateCard
              name={card.candidateName}
              subtitle={`${card.status === 'Withdrawn' ? 'Withdrew' : 'Rejected'} at ${card.stageName}`}
              detail={compact ? null : card.dispositionReason}
              timeInStage={compact ? null : formatRelative(card.lastActivityAt)}
              className="opacity-90 hover:border-border"
            />
          </Link>
        ))}
    </BoardColumn>
  );
}

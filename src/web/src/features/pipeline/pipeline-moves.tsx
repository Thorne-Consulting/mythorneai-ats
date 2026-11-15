'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';
import type { BoardData } from '@/types';
import type { BoardCard, BoardStage } from './pipeline-stats';

/** null: no email. {}: the stage's template. subject and body: what the person wrote (one person only). */
export type MoveEmail = null | { subject?: string; body?: string };

type Move = { id: string; from: string; to: string };

const stageOf = (board: BoardData | undefined, id: string) =>
  board?.stages.find((s) => s.applications.some((a) => a.id === id));

/** Moves cards inside the cached board, so the board changes before the server answers. */
function moveCached(board: BoardData, moves: { id: string; to: string }[]): BoardData {
  const cards = new Map(board.stages.flatMap((s) => s.applications).map((a) => [a.id, a]));
  const targets = new Map(moves.map((m) => [m.id, m.to]));
  return {
    ...board,
    stages: board.stages.map((stage) => ({
      ...stage,
      applications: [
        ...moves
          .filter((m) => m.to === stage.id && cards.has(m.id))
          .map((m) => ({ ...cards.get(m.id)!, enteredStageAt: new Date().toISOString() })),
        ...stage.applications.filter((a) => !targets.has(a.id)),
      ],
    })),
  };
}

/**
 * One request per target stage: the single move, or bulk-stage for several. The server sends the
 * stage's own email for "Always" stages unless `sendEmail` is false; it returns the queued email
 * ids so Undo can take them back.
 */
async function save(moves: { id: string; to: string }[], sendEmail = false) {
  const byStage = new Map<string, { id: string; to: string }[]>();
  for (const m of moves) byStage.set(m.to, [...(byStage.get(m.to) ?? []), m]);
  const emailIds: string[] = [];
  for (const [stageId, group] of byStage) {
    const result =
      group.length === 1
        ? await api.patch<{ emailIds?: string[] } | undefined>(
            `/api/applications/${group[0].id}/stage`,
            { stageId, status: 'Active', dispositionReason: null, sendEmail },
          )
        : await api.patch<{ emailIds?: string[] } | undefined>('/api/applications/bulk-stage', {
            applicationIds: group.map((m) => m.id),
            stageId,
            status: 'Active',
            dispositionReason: null,
            sendEmail,
          });
    emailIds.push(...(result?.emailIds ?? []));
  }
  return emailIds;
}

/**
 * Moving people between a job's stages, with an optional stage email and an Undo that puts them
 * back and takes the email back (it waits a minute before it goes).
 */
export function usePipelineMoves(requisitionId: string) {
  const queryClient = useQueryClient();
  const key = ['board', requisitionId];
  const refresh = () => {
    for (const k of [key, ['requisition', requisitionId], ['requisition-stats', requisitionId]])
      queryClient.invalidateQueries({ queryKey: k });
    for (const k of ['dashboard', 'applicants', 'requisitions'])
      queryClient.invalidateQueries({ queryKey: [k] });
  };
  const setLocal = (moves: { id: string; to: string }[]) =>
    queryClient.setQueryData<BoardData>(key, (board) => board && moveCached(board, moves));

  return async function move(ids: string[], to: string, email: MoveEmail) {
    const board = queryClient.getQueryData<BoardData>(key);
    const moves: Move[] = ids
      .map((id) => ({ id, from: stageOf(board, id)?.id ?? '', to }))
      .filter((m) => m.from && m.from !== to);
    if (!board || moves.length === 0) return;
    await queryClient.cancelQueries({ queryKey: key });
    setLocal(moves);
    // "Always" stages: the server sends the stage's own email. A written or skipped email tells it not to.
    const serverSends = board.stages.find((s) => s.id === to)?.emailOnEntry === 'Always';
    const serverDefault = serverSends && !!email && !email.subject && !email.body;
    let emailIds: string[] = [];
    try {
      emailIds = await save(moves, serverDefault);
    } catch (error) {
      queryClient.setQueryData(key, board);
      toast.error('Could not move them', (error as Error).message);
      refresh();
      return;
    }
    if (email && !serverDefault)
      try {
        const sent = await api.post<{ ids: string[]; skipped: number }>('/api/stage-emails', {
          applicationIds: moves.map((m) => m.id),
          stageId: to,
          subject: email.subject ?? null,
          body: email.body ?? null,
        });
        emailIds = sent.ids;
      } catch (error) {
        toast.error('Moved, but the email was not sent', (error as Error).message);
      }
    refresh();
    const card = board.stages.flatMap((s) => s.applications).find((a) => a.id === moves[0].id);
    const stageName = board.stages.find((s) => s.id === to)?.name ?? 'the stage';
    const who = moves.length === 1 ? (card?.candidateName ?? '1 person') : `${moves.length} people`;
    const emailNote =
      emailIds.length === 0
        ? undefined
        : emailIds.length === 1
          ? `We email ${moves.length === 1 ? (card?.firstName ?? 'them') : '1 person'} in a minute.`
          : `We email ${emailIds.length} people in a minute.`;
    toast.success(`Moved ${who} to ${stageName}`, emailNote, {
      duration: 10_000,
      action: {
        label: 'Undo',
        onClick: async () => {
          const back = moves.map((m) => ({ id: m.id, to: m.from }));
          setLocal(back);
          try {
            if (emailIds.length) await api.post('/api/stage-emails/cancel', { ids: emailIds });
            await save(back, false);
            toast.success(emailIds.length ? 'Move undone. Email cancelled.' : 'Move undone');
          } catch (error) {
            toast.error('Could not undo the move', (error as Error).message);
          } finally {
            refresh();
          }
        },
      },
    });
  };
}

type Preview = {
  to: string;
  subject: string;
  body: string;
  doNotContact: boolean;
  stageLabel: string;
};

/**
 * Move one or more people, choosing the stage (unless it is given) and whether to email them.
 * The email shows exactly what will be sent, in the words candidates see for the stage; for one
 * person it can be edited.
 */
export function MoveDialog({
  opened,
  onClose,
  cards,
  stages,
  stageId: fixedStageId,
  onMove,
}: {
  opened: boolean;
  onClose: () => void;
  cards: BoardCard[];
  stages: BoardStage[];
  /** The stage they were dropped on; without it the dialog asks. */
  stageId?: string;
  onMove: (stageId: string, email: MoveEmail) => void;
}) {
  const fromIds = new Set(
    stages
      .filter((s) => s.applications.some((a) => cards.some((c) => c.id === a.id)))
      .map((s) => s.id),
  );
  const targets = stages.filter((s) => !s.isTerminal && !(fromIds.size === 1 && fromIds.has(s.id)));
  const [stageId, setStageId] = useState<string | null>(fixedStageId ?? null);
  const stage = stages.find((s) => s.id === stageId);
  const [send, setSend] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const one = cards.length === 1 ? cards[0] : null;
  useEffect(() => {
    if (!opened) return;
    setStageId(fixedStageId ?? null);
  }, [opened, fixedStageId]);
  useEffect(() => {
    setSend(stage?.emailOnEntry === 'Ask' || stage?.emailOnEntry === 'Always');
  }, [stage?.id, stage?.emailOnEntry]);
  const preview = useQuery({
    queryKey: ['stage-email', cards[0]?.id, stageId],
    queryFn: () =>
      api.get<Preview>(`/api/applications/${cards[0].id}/stage-email?stageId=${stageId}`),
    enabled: opened && send && !!stageId && cards.length > 0,
  });
  useEffect(() => {
    if (preview.data) {
      setSubject(preview.data.subject);
      setBody(preview.data.body);
    }
  }, [preview.data]);
  const blocked = one?.doNotContact ?? false;
  const skipped = cards.filter((c) => c.doNotContact).length;
  const edited =
    !!one && !!preview.data && (subject !== preview.data.subject || body !== preview.data.body);
  const emailing = send && !blocked;
  const name = one ? (one.firstName ?? one.candidateName) : `the ${cards.length} people`;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={one ? `Move ${one.candidateName}` : `Move ${cards.length} people`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!stageId || (emailing && (!subject.trim() || !body.trim()))}
            onClick={() => {
              if (!stageId) return;
              onMove(
                stageId,
                !emailing ? null : edited ? { subject: subject.trim(), body: body.trim() } : {},
              );
              onClose();
            }}
          >
            {emailing ? 'Move and email' : 'Move'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!fixedStageId && (
          <Select
            label="Move to"
            placeholder="Choose a stage"
            value={stageId}
            onChange={setStageId}
            data={targets.map((s) => ({ value: s.id, label: s.name }))}
          />
        )}
        {stage && (
          <>
            <Checkbox
              label={`Email ${name}`}
              description={
                stage.emailOnEntry === 'Off'
                  ? 'This stage does not usually send an email.'
                  : `Candidates see this stage as “${stage.candidateLabel ?? stage.name}”.`
              }
              checked={emailing}
              disabled={blocked}
              onCheckedChange={setSend}
            />
            {blocked && (
              <Alert tone="info">{name} asked not to be contacted, so no email is sent.</Alert>
            )}
            {emailing &&
              (preview.isError ? (
                <Alert tone="danger">
                  Could not load the email. Try again, or move without it.
                </Alert>
              ) : !preview.data ? (
                <SkeletonRows rows={3} className="px-0" />
              ) : one ? (
                <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-muted p-3">
                  <p className="text-xs text-fg-subtle">To {preview.data.to}</p>
                  <Input
                    label="Subject"
                    value={subject}
                    onChange={(e) => setSubject(e.currentTarget.value)}
                  />
                  <Textarea
                    label="Message"
                    minRows={6}
                    value={body}
                    onChange={(e) => setBody(e.currentTarget.value)}
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-border-subtle bg-muted p-3">
                  <p className="text-xs text-fg-subtle">
                    Each person gets this email with their own name.
                    {skipped > 0 &&
                      ` ${skipped === 1 ? '1 person asked' : `${skipped} people asked`} not to be contacted and get nothing.`}
                  </p>
                  <p className="mt-2 text-sm font-medium text-fg">{preview.data.subject}</p>
                  <p className="mt-1 text-sm whitespace-pre-line text-fg-muted">
                    {preview.data.body}
                  </p>
                </div>
              ))}
            {emailing && (
              <p className="text-xs text-fg-subtle">
                The email waits a minute before it goes, so you can still undo the move.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

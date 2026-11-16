'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Card, CardBody, CardHeader, Select, SkeletonRows } from '@/components/ui';
import { InterviewerPicker } from './InterviewerPicker';
import { SaveStatus } from './SaveStatus';
import type { SaveState } from './interview-notes';

type Pool = { emails: string[]; pick: number; canManage: boolean };

export const poolKey = (kitId: string) => ['interviewer-pool', kitId] as const;

/**
 * Who can run this round. The scheduler suggests people from it: someone free, whose turn it is,
 * with the lightest week. Saves as you change it; it is not part of the kit's versions, because who
 * interviews does not change what is asked.
 */
export function InterviewerPoolCard({ kitId }: { kitId: string }) {
  const queryClient = useQueryClient();
  const pool = useQuery({
    queryKey: poolKey(kitId),
    queryFn: () => api.get<Pool>(`/api/interview-kits/${kitId}/pool`),
  });
  const [draft, setDraft] = useState<{ emails: string[]; pick: number } | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const latest = useRef(draft);
  latest.current = draft;

  const save = useMutation({
    mutationFn: (body: { emails: string[]; pick: number }) =>
      api.put<Pool>(`/api/interview-kits/${kitId}/pool`, body),
    onMutate: () => setState('saving'),
    onSuccess: (saved) => {
      setState('saved');
      queryClient.setQueryData(poolKey(kitId), (old: Pool | undefined) =>
        old ? { ...old, ...saved } : old,
      );
    },
    onError: () => setState('error'),
  });

  // Save shortly after the last change, so picking several people is one save.
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => save.mutate(draft), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save is stable enough; draft drives it
  }, [draft]);

  if (pool.isLoading)
    return (
      <Card>
        <SkeletonRows rows={2} />
      </Card>
    );
  if (!pool.data) return null;
  const value = draft ?? { emails: pool.data.emails, pick: pool.data.pick };
  const max = Math.max(1, Math.min(5, value.emails.length));
  const change = (next: { emails: string[]; pick: number }) =>
    setDraft({ ...next, pick: Math.min(next.pick, Math.max(1, next.emails.length)) });

  return (
    <Card>
      <CardHeader
        title="Interviewer pool"
        description="People who can run this round. When you schedule it, we suggest who is free and whose turn it is, so interviews are shared fairly."
      />
      <CardBody className="space-y-4">
        {pool.data.canManage ? (
          <>
            <InterviewerPicker
              label="People in the pool"
              description="Type a name. Only people on your team can be in a pool."
              value={value.emails}
              onChange={(emails) => change({ ...value, emails })}
            />
            {value.emails.length > 1 && (
              <Select
                label="People on each interview"
                className="sm:w-72"
                value={String(value.pick)}
                onChange={(pick) => pick && change({ ...value, pick: Number(pick) })}
                data={Array.from({ length: max }, (_, i) => ({
                  value: String(i + 1),
                  label: i === 0 ? '1 person' : `${i + 1} people`,
                }))}
              />
            )}
            <SaveStatus
              state={state}
              onRetry={() => latest.current && save.mutate(latest.current)}
            />
          </>
        ) : (
          <p className="text-base text-fg-muted">
            {pool.data.emails.length === 0
              ? 'No pool yet. Someone who runs this job can add one.'
              : `${pool.data.emails.length} people, ${pool.data.pick} on each interview.`}
          </p>
        )}
      </CardBody>
    </Card>
  );
}

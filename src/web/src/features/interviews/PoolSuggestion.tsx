'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Plus, Users } from 'lucide-react';
import { api } from '@/api';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/cn';

type Member = {
  email: string;
  name: string;
  recent: number;
  lastAt: string | null;
  thisWeek: number;
  openTimes: number;
  calendarChecked: boolean;
};
type Suggestion = { poolPick: number; members: Member[]; suggested: string[] };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Why a person sits where they do in the list, in one short line. The panel field already shows
 * the week's load and calendar of people on the panel, so it is only repeated for the others.
 */
function reason(m: Member, onPanel: boolean) {
  if (m.openTimes === 0) return 'No open time in these two weeks';
  const turns =
    m.recent === 0 ? 'No turns in 30 days' : `${plural(m.recent, 'turn', 'turns')} in 30 days`;
  return onPanel ? turns : `${turns} · ${plural(m.thisWeek, 'interview', 'interviews')} this week`;
}

/**
 * The round's interviewer pool, best first: free in the scheduler's two weeks, then whose turn it
 * is, then the lightest week. An empty panel is filled with the suggestion once; after that the
 * person scheduling decides.
 */
export function PoolSuggestion({
  kitId,
  from,
  to,
  durationMinutes,
  value,
  onChange,
}: {
  kitId: string;
  from: string;
  to: string;
  durationMinutes: number;
  value: string[];
  onChange: (emails: string[]) => void;
}) {
  const query = useQuery({
    queryKey: ['pool-suggestion', kitId, from, durationMinutes],
    queryFn: () =>
      api.post<Suggestion>(`/api/interview-kits/${kitId}/pool/suggest`, {
        from,
        to,
        durationMinutes,
      }),
    staleTime: 60_000,
  });
  const filled = useRef(false);
  const data = query.data;
  useEffect(() => {
    if (filled.current || !data?.suggested.length) return;
    filled.current = true;
    if (value.length === 0) onChange(data.suggested);
  }, [data, value.length, onChange]);

  if (!data?.members.length) return null;
  const pool = new Set(data.members.map((m) => m.email));
  const chosen = new Set(value);
  const same =
    data.suggested.length > 0 &&
    data.suggested.every((e) => chosen.has(e)) &&
    value.filter((e) => pool.has(e)).length === data.suggested.length;

  return (
    <section
      aria-label="Interviewer pool"
      className="mt-3 rounded-lg border border-border-subtle bg-muted/50 p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium text-fg">
          <Users className="size-4 text-fg-subtle" aria-hidden />
          From the pool: {plural(data.poolPick, 'person', 'people')} on each interview
        </p>
        {!same && data.suggested.length > 0 && (
          <Button
            size="xs"
            variant="soft"
            onClick={() => onChange([...value.filter((e) => !pool.has(e)), ...data.suggested])}
          >
            Use the suggestion
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {data.members.map((m) => {
          const on = chosen.has(m.email);
          const suggested = data.suggested.includes(m.email);
          return (
            <li key={m.email} className="flex items-center gap-3">
              <Button
                size="xs"
                variant={on ? 'soft' : 'quiet'}
                aria-pressed={on}
                leftIcon={on ? <Check /> : <Plus />}
                onClick={() =>
                  onChange(on ? value.filter((e) => e !== m.email) : [...value, m.email])
                }
                className="w-24 shrink-0 justify-start"
              >
                {on ? 'On panel' : 'Add'}
              </Button>
              <span className="min-w-0 flex-1">
                <span className={cn('text-sm text-fg', m.openTimes === 0 && 'text-fg-muted')}>
                  {m.name}
                </span>
                {suggested && (
                  <Badge tone="blue" size="sm" className="ml-2">
                    Their turn
                  </Badge>
                )}
                <span className="block text-xs text-fg-subtle">{reason(m, on)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

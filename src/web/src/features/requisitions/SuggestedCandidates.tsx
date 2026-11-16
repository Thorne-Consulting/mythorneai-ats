'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Avatar, Badge, Card, CardHeader, CardLink, SkeletonRows } from '@/components/ui';

type Suggestion = {
  id: string;
  name: string;
  currentTitle?: string | null;
  score: number;
  matched: string[];
  missing: string[];
  previousJob?: string | null;
  previousStatus?: string | null;
  previousStage?: string | null;
};

/**
 * People from other jobs who fit this one, with the same match number as the candidates list.
 * The top five; "See all" opens the candidates list ranked for this job.
 */
export function SuggestedCandidates({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['suggested-candidates', id],
    queryFn: () =>
      api.get<{ items: Suggestion[]; reason?: string | null }>(
        `/api/requisitions/${id}/suggested-candidates`,
      ),
    retry: false,
  });
  if (query.isError) return null;
  const items = query.data?.items ?? [];
  return (
    <Card>
      <CardHeader
        title="Suggested candidates"
        action={items.length > 0 && <CardLink href={`/candidates?find=${id}`}>See all</CardLink>}
      />
      {!query.data ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <p className="border-t border-border-subtle px-5 py-4 text-sm text-fg-subtle">
          {query.data.reason || 'No one from your other jobs fits this one yet.'}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {items.slice(0, 5).map((person) => (
            <li key={person.id}>
              <Link
                href={`/candidates/${person.id}`}
                className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <Avatar name={person.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{person.name}</span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {person.previousJob
                      ? `Applied for ${person.previousJob}`
                      : (person.currentTitle ?? person.matched.slice(0, 3).join(', '))}
                  </span>
                </span>
                <Badge tone={person.score >= 70 ? 'green' : 'blue'} className="tnum">
                  {person.score}% fit
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

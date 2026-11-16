'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { RailGroup } from './Rail';

type Duplicate = {
  id: string;
  name: string;
  email: string;
  currentTitle?: string;
  reasons: string[];
};

export function PotentialDuplicates({ candidateId }: { candidateId: string }) {
  const duplicates = useQuery({
    queryKey: ['candidate-duplicates', candidateId],
    queryFn: () => api.get<Duplicate[]>(`/api/candidates/${candidateId}/duplicates`),
  });
  if (duplicates.isLoading || duplicates.isError || !duplicates.data?.length) return null;

  return (
    <RailGroup title="Possible duplicates">
      <p className="mb-3 text-sm text-fg-subtle">
        These may be the same person. We never merge records for you.
      </p>
      <ul className="space-y-2.5">
        {duplicates.data.map((duplicate) => (
          <li key={duplicate.id} className="min-w-0">
            <Link
              href={`/candidates/${duplicate.id}`}
              className="text-base font-medium text-accent-foreground hover:underline"
            >
              {duplicate.name}
            </Link>
            <p className="truncate text-xs text-fg-subtle">
              {[duplicate.currentTitle ?? duplicate.email, ...duplicate.reasons].join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </RailGroup>
  );
}

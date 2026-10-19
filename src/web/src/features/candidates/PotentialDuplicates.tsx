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
      <p className="rail-note">
        Check these before creating another record. Nothing is merged on its own.
      </p>
      <ul className="rail-list">
        {duplicates.data.map((duplicate) => (
          <li key={duplicate.id}>
            <Link href={`/candidates/${duplicate.id}`}>{duplicate.name}</Link>
            <span className="rail-file-meta">
              {[duplicate.currentTitle ?? duplicate.email, ...duplicate.reasons].join(' · ')}
            </span>
          </li>
        ))}
      </ul>
    </RailGroup>
  );
}

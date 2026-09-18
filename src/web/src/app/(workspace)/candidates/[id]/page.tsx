'use client';

import { useParams } from 'next/navigation';
import { CandidateDetailPage } from '../../../../features/CandidateDetailPage';

export default function Page() {
  const id = useParams<{ id: string }>()?.id;
  if (!id) return null;
  return <CandidateDetailPage id={id} />;
}

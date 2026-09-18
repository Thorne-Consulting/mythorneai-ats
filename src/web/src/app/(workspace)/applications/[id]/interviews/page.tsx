'use client';

import { useParams } from 'next/navigation';
import { ApplicationInterviews } from '../../../../../features/ApplicationDetailPage';

export default function Page() {
  const id = useParams<{ id: string }>()?.id;
  if (!id) return null;
  return <ApplicationInterviews id={id} />;
}

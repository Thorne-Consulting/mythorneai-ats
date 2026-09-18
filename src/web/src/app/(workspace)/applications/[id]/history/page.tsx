'use client';

import { useParams } from 'next/navigation';
import { ApplicationHistory } from '../../../../../features/ApplicationDetailPage';

export default function Page() {
  const id = useParams<{ id: string }>()?.id;
  if (!id) return null;
  return <ApplicationHistory id={id} />;
}

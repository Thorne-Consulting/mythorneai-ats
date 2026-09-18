'use client';

import { useParams } from 'next/navigation';
import { RequisitionDetails } from '../../../../../features/RequisitionDetailPage';

export default function Page() {
  const id = useParams<{ id: string }>()?.id;
  if (!id) return null;
  return <RequisitionDetails id={id} />;
}

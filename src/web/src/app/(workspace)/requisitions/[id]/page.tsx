'use client';

import { useParams } from 'next/navigation';
import { RequisitionDetailPage } from '../../../../features/RequisitionDetailPage';

export default function Page() {
  const id = useParams<{ id: string }>()?.id;
  if (!id) return null;
  return <RequisitionDetailPage id={id} />;
}

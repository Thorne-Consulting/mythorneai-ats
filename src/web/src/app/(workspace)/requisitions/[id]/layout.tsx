'use client';

import { useParams } from 'next/navigation';
import { RequisitionShell } from '../../../../features/RequisitionDetailPage';

export default function Layout({ children }: { children: React.ReactNode }) {
  const id = useParams<{ id: string }>()?.id;
  if (!id) return null;
  return <RequisitionShell id={id}>{children}</RequisitionShell>;
}

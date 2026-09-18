'use client';

import { useParams } from 'next/navigation';
import { ApplicationShell } from '../../../../features/ApplicationDetailPage';

export default function Layout({ children }: { children: React.ReactNode }) {
  const id = useParams<{ id: string }>()?.id;
  if (!id) return null;
  return <ApplicationShell id={id}>{children}</ApplicationShell>;
}

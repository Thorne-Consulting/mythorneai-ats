import type { Metadata } from 'next';
import { ApplyPage } from '@/features/careers/ApplyWizard';

export const metadata: Metadata = { title: 'Apply' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplyPage id={id} />;
}

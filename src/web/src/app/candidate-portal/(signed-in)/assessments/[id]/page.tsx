import type { Metadata } from 'next';
import { TakeAssessment } from '@/features/assessments/take/TakeAssessment';

export const metadata: Metadata = { title: 'Assessment' };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TakeAssessment key={id} id={id} />;
}

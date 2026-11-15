import { AssessmentBuilder } from '@/features/assessments/AssessmentBuilder';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AssessmentBuilder key={id} id={id} />;
}

import { ResultReview } from '@/features/assessments/ResultReview';

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; resultId: string }>;
}) {
  const { id, resultId } = await params;
  return <ResultReview key={resultId} id={id} resultId={resultId} />;
}

import { AssessmentDetail } from '@/features/preview/assessments/AssessmentDetail';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  return <AssessmentDetail id={id} initialTab={tab} />;
}

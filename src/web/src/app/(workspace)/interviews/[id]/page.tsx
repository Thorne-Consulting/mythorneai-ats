import { InterviewPrep } from '@/features/interviews/InterviewPrep';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ application?: string }>;
}) {
  const [{ id }, { application }] = await Promise.all([params, searchParams]);
  return <InterviewPrep id={id} applicationId={application} />;
}

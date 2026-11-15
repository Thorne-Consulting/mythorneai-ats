import { NewInterviewKit } from '@/features/requisitions/InterviewKitEditor';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ template?: string }>;
}) {
  const { id } = await params;
  const { template } = await searchParams;
  return <NewInterviewKit requisitionId={id} templateId={template} />;
}

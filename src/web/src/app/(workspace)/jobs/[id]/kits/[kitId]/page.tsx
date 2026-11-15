import { InterviewKitPage } from '@/features/requisitions/EditInterviewKit';

export default async function Page({ params }: { params: Promise<{ id: string; kitId: string }> }) {
  const { id, kitId } = await params;
  return <InterviewKitPage requisitionId={id} kitId={kitId} />;
}

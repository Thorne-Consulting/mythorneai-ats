import { InterviewKitView } from '@/features/requisitions/InterviewKitView';

export default async function Page({ params }: { params: Promise<{ id: string; kitId: string }> }) {
  const { id, kitId } = await params;
  return <InterviewKitView requisitionId={id} kitId={kitId} />;
}

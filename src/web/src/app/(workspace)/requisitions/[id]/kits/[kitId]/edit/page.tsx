import { EditInterviewKit } from '@/features/requisitions/EditInterviewKit';

export default async function Page({ params }: { params: Promise<{ id: string; kitId: string }> }) {
  const { id, kitId } = await params;
  return <EditInterviewKit requisitionId={id} kitId={kitId} />;
}

import { RequisitionKits } from '@/features/requisitions/RequisitionKits';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequisitionKits id={id} />;
}

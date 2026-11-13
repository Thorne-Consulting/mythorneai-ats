import { RequisitionDetails } from '@/features/requisitions/RequisitionDetails';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RequisitionDetails id={id} />;
}

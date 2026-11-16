import { JobOverview } from '@/features/requisitions/JobOverview';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobOverview id={id} />;
}

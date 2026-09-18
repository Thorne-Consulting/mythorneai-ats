import { ApplicationRecord } from '@/features/applications/ApplicationRecord';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationRecord id={id} />;
}

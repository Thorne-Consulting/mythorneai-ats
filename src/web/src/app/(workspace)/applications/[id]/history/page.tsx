import { ApplicationHistory } from '@/features/applications/ApplicationHistory';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationHistory id={id} />;
}

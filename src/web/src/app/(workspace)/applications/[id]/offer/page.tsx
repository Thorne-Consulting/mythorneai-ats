import { ApplicationOffer } from '@/features/applications/ApplicationOffer';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationOffer id={id} />;
}

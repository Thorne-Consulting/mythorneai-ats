import { ApplicationMessagesTab } from '@/features/applications/ApplicationMessages';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationMessagesTab id={id} />;
}

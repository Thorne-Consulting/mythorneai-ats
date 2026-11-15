import { PortalInbox } from '@/features/candidate-portal/PortalHubs';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <PortalInbox selectedId={(await params).id} />;
}

import { ApplicationPage } from '@/features/candidate-portal/ApplicationPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <ApplicationPage id={(await params).id} />;
}

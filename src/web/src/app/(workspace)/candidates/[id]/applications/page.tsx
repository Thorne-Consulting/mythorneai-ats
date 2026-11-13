import { CandidateApplicationsTab } from '@/features/candidates/CandidateTabs';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CandidateApplicationsTab id={id} />;
}

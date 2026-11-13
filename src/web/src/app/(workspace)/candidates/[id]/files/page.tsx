import { CandidateFilesTab } from '@/features/candidates/CandidateTabs';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CandidateFilesTab id={id} />;
}

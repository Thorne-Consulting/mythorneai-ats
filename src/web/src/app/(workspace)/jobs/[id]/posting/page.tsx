import { JobPosting } from '@/features/requisitions/JobSections';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <JobPosting id={id} />;
}

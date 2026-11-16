import { ApplicantComparison } from '@/features/applications/CompareApplicants';

export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids = '' } = await searchParams;
  return <ApplicantComparison ids={ids} />;
}

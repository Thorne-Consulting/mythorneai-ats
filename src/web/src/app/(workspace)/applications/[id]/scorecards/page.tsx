import { ApplicationScorecards } from '@/features/applications/ApplicationScorecards';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ interview?: string }>;
}) {
  const [{ id }, { interview }] = await Promise.all([params, searchParams]);
  return <ApplicationScorecards id={id} focus={interview} />;
}

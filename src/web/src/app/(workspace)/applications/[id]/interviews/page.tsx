import { ApplicationInterviews } from '@/features/applications/ApplicationInterviews';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ApplicationInterviews id={id} />;
}

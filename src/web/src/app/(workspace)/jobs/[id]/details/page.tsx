import { redirect } from 'next/navigation';

// The job's details now live on Posting (what applicants read) and Overview.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/jobs/${id}/posting`);
}

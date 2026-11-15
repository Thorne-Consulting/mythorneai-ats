import { redirect } from 'next/navigation';

// The candidates table is the Pipeline tab's List view.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/jobs/${id}/pipeline?view=list`);
}

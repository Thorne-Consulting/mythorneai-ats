import { redirect } from 'next/navigation';

// Kits are edited in place on their own page now; old links still work.
export default async function Page({ params }: { params: Promise<{ id: string; kitId: string }> }) {
  const { id, kitId } = await params;
  redirect(`/jobs/${id}/kits/${kitId}`);
}

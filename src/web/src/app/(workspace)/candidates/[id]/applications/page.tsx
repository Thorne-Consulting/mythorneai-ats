import { redirect } from 'next/navigation';

/** Applications now live on the Overview tab. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/candidates/${id}`);
}

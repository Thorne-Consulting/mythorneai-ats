import { redirect } from 'next/navigation';

// The interviews now sit on the application page itself.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/candidate-portal/applications/${(await params).id}#interviews`);
}

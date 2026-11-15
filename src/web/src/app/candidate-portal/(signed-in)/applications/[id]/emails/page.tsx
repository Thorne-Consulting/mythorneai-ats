import { redirect } from 'next/navigation';

// Messages and copies of our emails are one conversation in the Inbox.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  redirect(`/candidate-portal/messages/${(await params).id}`);
}

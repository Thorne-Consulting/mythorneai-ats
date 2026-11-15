import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { InboxPage } from '@/features/messages/InboxPage';
import type { InboxView } from '@/features/messages/inbox-data';
import { abilityFor } from '@/lib/ability/rules';
import { serverApiGet } from '@/lib/server-api';
import type { User } from '@/types';

const views: InboxView[] = [
  'assigned',
  'unassigned',
  'unread',
  'starred',
  'awaiting-reply',
  'scheduled',
  'snoozed',
  'done',
  'unmatched',
];
// Old folder names from the sample inbox.
const renamed: Record<string, InboxView> = { sent: 'awaiting-reply', archived: 'done' };

export default async function Page({ params }: { params: Promise<{ folder: string }> }) {
  const { folder } = await params;
  if (renamed[folder]) redirect(`/messages/${renamed[folder]}`);
  if (!views.includes(folder as InboxView)) notFound();
  // Unknown senders become new candidates, so that folder is for people who add candidates.
  if (
    folder === 'unmatched' &&
    !abilityFor((await serverApiGet<User>('/api/auth/me')).rules).can('create', 'Candidate')
  )
    redirect('/messages');
  return (
    <Suspense>
      <InboxPage view={folder as InboxView} />
    </Suspense>
  );
}

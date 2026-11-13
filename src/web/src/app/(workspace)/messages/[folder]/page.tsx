import { notFound } from 'next/navigation';
import { MessagesPage } from '@/features/preview/MessagesPage';
import type { Folder } from '@/features/preview/messages/MessagesShell';

const folders: Folder[] = ['unread', 'starred', 'sent', 'archived'];

export default async function Page({ params }: { params: Promise<{ folder: string }> }) {
  const { folder } = await params;
  if (!folders.includes(folder as Folder)) notFound();
  return <MessagesPage folder={folder as Folder} />;
}

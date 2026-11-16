import { redirect } from 'next/navigation';
import { movedSettingsHref } from '@/features/admin/settings-registry';

// Settings moved from /admin to /settings. Old bookmarks and links keep working.
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  redirect(movedSettingsHref(['/admin', ...(slug ?? [])].join('/')));
}

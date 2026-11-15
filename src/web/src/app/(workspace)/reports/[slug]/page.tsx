import { redirect } from 'next/navigation';
import { ReportView } from '@/features/reports/ReportView';

// Old links: the report builder became saved views, and "Time in each stage" became Pipeline velocity.
// The "applications have gone quiet" notification links to the stuck list, which is part of velocity.
const MOVED: Record<string, string> = {
  builder: '/reports',
  'time-in-stage': '/reports/velocity',
  stuck: '/reports/velocity',
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug } = await params;
  if (MOVED[slug]) {
    const qs = new URLSearchParams(
      Object.entries(await searchParams).filter((entry): entry is [string, string] => !!entry[1]),
    ).toString();
    redirect(slug === 'builder' || !qs ? MOVED[slug] : `${MOVED[slug]}?${qs}`);
  }
  // No Suspense boundary of its own: the page hydrates with the Reports nav, so both read the
  // report catalog at the same moment and the server and browser render the same text.
  return <ReportView reportKey={slug} />;
}

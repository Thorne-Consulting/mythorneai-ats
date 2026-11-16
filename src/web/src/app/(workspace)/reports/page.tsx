import { redirect } from 'next/navigation';
import { ReportsOverview } from '@/features/reports/ReportsOverview';

// Old links were /reports?report=<key>&<filters>; each report now has its own route.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { report, ...filters } = await searchParams;
  if (report) {
    const qs = new URLSearchParams(
      Object.entries(filters).filter((entry): entry is [string, string] => !!entry[1]),
    ).toString();
    redirect(`/reports/${encodeURIComponent(report)}${qs ? `?${qs}` : ''}`);
  }
  // No Suspense boundary of its own: the page hydrates with the Reports nav, so both read the
  // report catalog at the same moment and the server and browser render the same text.
  return <ReportsOverview />;
}

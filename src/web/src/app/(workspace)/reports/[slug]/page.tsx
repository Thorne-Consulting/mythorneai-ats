import { Suspense } from 'react';
import { ReportView } from '@/features/reports/ReportView';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <Suspense>
      <ReportView reportKey={slug} />
    </Suspense>
  );
}

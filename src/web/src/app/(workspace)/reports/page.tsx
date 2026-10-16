import { Suspense } from 'react';
import { ReportsPage } from '@/features/reports/ReportsPage';

export default function Page() {
  return (
    <Suspense>
      <ReportsPage />
    </Suspense>
  );
}

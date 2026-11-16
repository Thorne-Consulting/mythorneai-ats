import { Suspense } from 'react';
import { AssessmentsHome } from '@/features/assessments/AssessmentsHome';

export default function Page() {
  return (
    <Suspense>
      <AssessmentsHome />
    </Suspense>
  );
}

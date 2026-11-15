import { Suspense } from 'react';
import { TemplatesPage } from '@/features/templates/TemplatesPage';

export default function Page() {
  return (
    <Suspense>
      <TemplatesPage />
    </Suspense>
  );
}

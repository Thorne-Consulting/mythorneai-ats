import { Suspense } from 'react';
import { TemplateEditorPage } from '@/features/templates/TemplateEditorPage';

export default function Page() {
  return (
    <Suspense>
      <TemplateEditorPage />
    </Suspense>
  );
}

import { Suspense } from 'react';
import { TemplateEditorPage } from '@/features/templates/TemplateEditorPage';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <TemplateEditorPage key={id} id={id} />
    </Suspense>
  );
}

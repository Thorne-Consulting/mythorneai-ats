import { TemplateEditor } from '@/features/interview-library/TemplateEditor';

export default async function Page({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  return <TemplateEditor templateId={templateId} />;
}

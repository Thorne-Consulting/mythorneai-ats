import { SettingsHeader } from '@/features/admin/SettingsShell';
import { PostingTemplateEditor } from '@/features/admin/PostingTemplateEditor';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SettingsHeader title="Edit posting template" crumbs={[{ label: 'Edit template' }]} />
      <PostingTemplateEditor id={id} />
    </>
  );
}

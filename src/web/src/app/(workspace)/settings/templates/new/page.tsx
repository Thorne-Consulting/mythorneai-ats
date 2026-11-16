import { SettingsHeader } from '@/features/admin/SettingsShell';
import { PostingTemplateEditor } from '@/features/admin/PostingTemplateEditor';

export default function Page() {
  return (
    <>
      <SettingsHeader title="New posting template" crumbs={[{ label: 'New posting template' }]} />
      <PostingTemplateEditor />
    </>
  );
}

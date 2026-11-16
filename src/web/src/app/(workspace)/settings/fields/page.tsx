import { SettingsPageFrame } from '@/features/admin/SettingsShell';
import { CustomFieldsSection } from '@/features/admin/CustomFieldsSection';

export default function Page() {
  return (
    <SettingsPageFrame>
      <CustomFieldsSection />
    </SettingsPageFrame>
  );
}

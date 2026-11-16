import { OrganizationSettings } from '@/features/admin/AdminSettings';
import { SettingsPageFrame } from '@/features/admin/SettingsShell';

export default function Page() {
  return (
    <SettingsPageFrame>
      <OrganizationSettings section="ai" />
    </SettingsPageFrame>
  );
}

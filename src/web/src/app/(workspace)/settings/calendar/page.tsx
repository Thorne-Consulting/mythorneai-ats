import { SettingsPageFrame } from '@/features/admin/SettingsShell';
import { AdminIntegrations } from '@/features/admin/AdminIntegrations';

export default function Page() {
  return (
    <SettingsPageFrame>
      <AdminIntegrations />
    </SettingsPageFrame>
  );
}

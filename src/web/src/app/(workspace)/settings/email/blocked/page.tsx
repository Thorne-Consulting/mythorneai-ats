import { BlockedAddresses } from '@/features/messages/EmailSettings';
import { SettingsPageFrame } from '@/features/admin/SettingsShell';

export default function Page() {
  return (
    <SettingsPageFrame>
      <BlockedAddresses />
    </SettingsPageFrame>
  );
}

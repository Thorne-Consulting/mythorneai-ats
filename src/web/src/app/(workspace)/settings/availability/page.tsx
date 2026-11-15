import { SettingsPageFrame } from '@/features/admin/SettingsShell';
import { MyAvailability } from '@/features/interviews/MyAvailability';

export default function Page() {
  return (
    <SettingsPageFrame>
      <MyAvailability />
    </SettingsPageFrame>
  );
}

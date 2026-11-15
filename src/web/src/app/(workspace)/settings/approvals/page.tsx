import { ApprovalPolicies } from '@/features/approvals/ApprovalPolicies';
import { SettingsPageFrame } from '@/features/admin/SettingsShell';

export default function Page() {
  return (
    <SettingsPageFrame>
      <ApprovalPolicies />
    </SettingsPageFrame>
  );
}

import { RoleDetail } from '@/features/admin/RolePermissionsSection';

export default async function Page({ params }: { params: Promise<{ role: string }> }) {
  const { role } = await params;
  return <RoleDetail slug={role} />;
}

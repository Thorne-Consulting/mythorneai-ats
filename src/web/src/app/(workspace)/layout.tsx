import { AuthProvider } from '@/auth';
import { AppFrame } from '@/components/layout/AppFrame';
import { LoginPage } from '@/features/auth/LoginPage';
import { ServerApiError, serverApiGet } from '@/lib/server-api';
import type { User } from '@/types';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  let user: User;
  try {
    user = await serverApiGet<User>('/api/auth/me');
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) return <LoginPage />;
    return <LoginPage unavailable />;
  }

  return (
    <AuthProvider user={user}>
      <AppFrame>{children}</AppFrame>
    </AuthProvider>
  );
}

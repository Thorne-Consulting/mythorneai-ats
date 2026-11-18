import { cookies } from 'next/headers';
import { AuthProvider } from '@/auth';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { ServerApiError, serverApiGet } from '@/lib/server-api';
import type { User } from '@/types';

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  let user: User;
  try {
    user = await serverApiGet<User>('/api/auth/me');
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 401) return <LoginPage />;
    // The page only says "not working right now"; the reason goes to the server log. The cookie
    // is never part of it.
    console.error(
      'Sign-in check failed: GET /api/auth/me',
      error instanceof ServerApiError ? `the API answered ${error.status}` : error,
    );
    return <LoginPage unavailable />;
  }

  const jar = await cookies();
  const navCollapsed = jar.get('ats-nav-collapsed')?.value === '1';
  // Beside a section nav the sidebar starts as icons, unless the person opened it there.
  const sectionNavCollapsed = jar.get('ats-nav-collapsed-section')?.value !== '0';
  return (
    <AuthProvider user={user}>
      <AppShell navCollapsed={navCollapsed} sectionNavCollapsed={sectionNavCollapsed}>
        {children}
      </AppShell>
    </AuthProvider>
  );
}

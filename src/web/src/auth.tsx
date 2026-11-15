'use client';

import { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { applyPreferences } from '@/features/admin/preferences';
import { AbilityProvider } from '@/lib/ability';
import { setDateOrder } from '@/lib/format';
import type { User } from './types';

const AuthContext = createContext<User | null>(null);

/** The signed-in person, what they may do (`useAbility`), and their preferences applied. */
export function AuthProvider({ user, children }: { user: User; children: React.ReactNode }) {
  const router = useRouter();
  // Before children render, so the first paint already uses their date order.
  setDateOrder(user.preferences?.dateFormat);
  useEffect(() => applyPreferences(user.preferences ?? {}), [user.preferences]);
  // After a 403 the role may have changed: re-render the layout, which reads /api/auth/me again.
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener('ats:forbidden', refresh);
    return () => window.removeEventListener('ats:forbidden', refresh);
  }, [router]);
  return (
    <AuthContext.Provider value={user}>
      <AbilityProvider rules={user.rules ?? []}>{children}</AbilityProvider>
    </AuthContext.Provider>
  );
}

export function useCurrentUser() {
  const user = useContext(AuthContext);
  if (!user) throw new Error('useCurrentUser must be used inside AuthProvider');
  return user;
}

import { createContext, useContext } from 'react';
import { Center, Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { ApiError, api } from './api';
import type { User } from './types';
import { LoginPage } from './pages/LoginPage';

const AuthContext = createContext<User | null>(null);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const query = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/api/auth/me'),
    retry: false,
  });

  if (query.isPending) {
    return <Center mih="100vh"><Loader size="sm" /></Center>;
  }

  if (query.error instanceof ApiError && query.error.status === 401) {
    return <LoginPage />;
  }

  if (!query.data) {
    return <LoginPage unavailable />;
  }

  return <AuthContext.Provider value={query.data}>{children}</AuthContext.Provider>;
}

export function useCurrentUser() {
  const user = useContext(AuthContext);
  if (!user) throw new Error('useCurrentUser must be used inside AuthGate');
  return user;
}

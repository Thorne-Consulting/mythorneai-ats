'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import type { AdminUser } from '@/types';

export interface AuditEvent {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorEmail: string;
  occurredAt: string;
}

export interface IntegrationStatus {
  provider: 'None' | 'Microsoft365' | 'GoogleWorkspace';
  enabled: boolean;
  calendar: string;
  pending: number;
  failed: number;
}

export const isAdmin = (role: string) => role === 'Admin';

export function useAdminUsers() {
  const currentUser = useCurrentUser();
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<AdminUser[]>('/api/admin/users'),
    enabled: isAdmin(currentUser.role),
  });
}

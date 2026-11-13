'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import type { AdminUser, Role } from '@/types';

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

export const ROLE_LABELS: Record<Role, string> = {
  Admin: 'Admin',
  Recruiter: 'Recruiter',
  HiringManager: 'Hiring manager',
  Interviewer: 'Interviewer',
};
export const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as Role[]).map((value) => ({
  value,
  label: ROLE_LABELS[value],
}));

/** URL slug per role for /admin/roles/[role]. */
export const ROLE_SLUG: Record<Role, string> = {
  Admin: 'admin',
  Recruiter: 'recruiter',
  HiringManager: 'hiring-manager',
  Interviewer: 'interviewer',
};
export const roleFromSlug = (slug: string) =>
  (Object.keys(ROLE_SLUG) as Role[]).find((role) => ROLE_SLUG[role] === slug) ?? null;

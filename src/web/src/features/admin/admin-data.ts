'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useAbility } from '@/lib/ability';
import type { Role, User } from '@/types';

/** One row of the activity history, described by the server with names and links. */
export interface AuditEvent {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  actorEmail: string;
  actorName?: string | null;
  label?: string | null;
  href?: string | null;
  job?: string | null;
  jobHref?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  details?: string | null;
  changes?: string | null;
  occurredAt: string;
}

export interface AuditPage {
  items: AuditEvent[];
  nextCursor?: string | null;
}

export interface IntegrationStatus {
  provider: 'None' | 'Microsoft365' | 'GoogleWorkspace';
  enabled: boolean;
  calendar: string;
  pending: number;
  failed: number;
}

/** GET /api/admin/users. Invited means they were invited and have not signed in yet. */
export interface Member {
  id: string;
  email: string;
  displayName: string;
  /** The built-in role theirs behaves like (Admin for any role that manages the workspace). */
  role: Role;
  /** Their role: a built-in name ("Recruiter") or a custom role's id. */
  roleKey: string;
  roleName: string;
  departments: string[];
  avatarTone?: User['avatarTone'];
  isActive: boolean;
  lastSignInAt?: string | null;
  invitedAt?: string | null;
  invitedByEmail?: string | null;
  isOwner: boolean;
  updatedAt: string;
}

export const isInvited = (member: Member) =>
  member.isActive && !!member.invitedAt && !member.lastSignInAt;

export function useAdminUsers() {
  const ability = useAbility();
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<Member[]>('/api/admin/users'),
    enabled: ability.can('manage', 'Member'),
  });
}

/** Teams to pick from: every job department, plus teams already given to someone. */
export function useDepartments() {
  const ability = useAbility();
  return useQuery({
    queryKey: ['admin', 'departments'],
    queryFn: () => api.get<string[]>('/api/admin/departments'),
    enabled: ability.can('manage', 'Member'),
  });
}

export const ROLE_LABELS: Record<Role, string> = {
  Admin: 'Admin',
  Recruiter: 'Recruiter',
  HiringManager: 'Hiring manager',
  Interviewer: 'Interviewer',
};

/** One role from GET /api/admin/roles: the four built-in ones first, then the ones admins made. */
export interface RoleInfo {
  /** Built-in name ("Recruiter") or the custom role's id. */
  key: string;
  name: string;
  description?: string | null;
  builtIn: boolean;
  /** The built-in role it behaves like. */
  kind: Role;
  permissions: string[];
  /** Active members with the role. */
  members: number;
}

const BUILT_IN: RoleInfo[] = (Object.keys(ROLE_LABELS) as Role[]).map((kind) => ({
  key: kind,
  name: ROLE_LABELS[kind],
  builtIn: true,
  kind,
  permissions: [],
  members: 0,
}));

export function useRoles() {
  const ability = useAbility();
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: () => api.get<{ roles: RoleInfo[] }>('/api/admin/roles').then((r) => r.roles),
    enabled: ability.can('manage', 'Member'),
  });
}

/** Roles to pick from (built-in ones while the list loads), grouped once the team has made some. */
export function useRoleOptions() {
  const roles = useRoles().data ?? BUILT_IN;
  const grouped = roles.some((r) => !r.builtIn);
  return {
    roles,
    options: roles.map((r) => ({
      value: r.key,
      label: r.name,
      group: grouped ? (r.builtIn ? 'Built-in roles' : 'Your roles') : undefined,
    })),
    /** The built-in role a role behaves like, which decides what teams mean for it. */
    kindOf: (key: string): Role => roles.find((r) => r.key === key)?.kind ?? (key as Role),
    nameOf: (key: string) => roles.find((r) => r.key === key)?.name ?? key,
  };
}

/** URL slug per built-in role for /settings/roles/[role]; custom roles use their id. */
export const ROLE_SLUG: Record<Role, string> = {
  Admin: 'admin',
  Recruiter: 'recruiter',
  HiringManager: 'hiring-manager',
  Interviewer: 'interviewer',
};
export const roleSlug = (key: string) => ROLE_SLUG[key as Role] ?? key;
export const roleKeyFromSlug = (slug: string) =>
  (Object.keys(ROLE_SLUG) as Role[]).find((role) => ROLE_SLUG[role] === slug) ?? slug;

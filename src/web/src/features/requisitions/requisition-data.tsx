'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import type { BoardData, RequisitionDetail, RequisitionSummary, User } from '@/types';

export type BoardApplication = BoardData['stages'][number]['applications'][number];

export function useRequisition(id: string, initialData?: RequisitionDetail) {
  return useQuery({
    queryKey: ['requisition', id],
    queryFn: () => api.get<RequisitionDetail>(`/api/requisitions/${id}`),
    initialData,
  });
}

export function useBoard(id: string, initialData?: BoardData) {
  return useQuery({
    queryKey: ['board', id],
    queryFn: () => api.get<BoardData>(`/api/requisitions/${id}/board`),
    initialData,
  });
}

type JobPeople = Pick<RequisitionSummary, 'ownerEmail' | 'recruiterEmail'>;

/** Same rule as useCanManage, for places that check many jobs at once (list rows). */
export function canManageJob(user: Pick<User, 'role' | 'email'>, job?: JobPeople) {
  return (
    ['Admin', 'Recruiter'].includes(user.role) ||
    // Named viewers see the job but don't manage it; that stays with the owner and recruiter.
    (user.role === 'HiringManager' &&
      (job?.ownerEmail === user.email || job?.recruiterEmail === user.email))
  );
}

export function useCanManage(requisition?: JobPeople) {
  return canManageJob(useCurrentUser(), requisition);
}

/** "priya.manager@acme.com" reads as "Priya Manager". */
export function nameFromEmail(email: string) {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export { statusOptions } from './job-status';

'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import type { BoardData, RequisitionDetail } from '@/types';

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

export function useCanManage(requisition?: RequisitionDetail) {
  const user = useCurrentUser();
  return (
    ['Admin', 'Recruiter'].includes(user.role) ||
    (user.role === 'HiringManager' && requisition?.ownerEmail === user.email)
  );
}

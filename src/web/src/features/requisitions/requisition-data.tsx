'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { toast } from '@/components/ui';
import type { BoardData, RequisitionDetail } from '@/types';
import type { RequisitionWithSettings } from './requirements-types';

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

/** A team member's name from their user record, else read from their address. */
export function personName(person: { displayName: string } | null | undefined, email: string) {
  return person?.displayName || nameFromEmail(email);
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

/** The fields PUT /api/requisitions/{id} replaces as a whole. */
const JOB_FIELDS = [
  'title',
  'department',
  'location',
  'employmentType',
  'workMode',
  'openings',
  'ownerEmail',
  'recruiterEmail',
  'description',
  'targetStartDate',
  'locationCity',
  'locationRegion',
  'locationCountry',
  'remoteCountries',
  'salaryMin',
  'salaryMax',
  'salaryCurrency',
  'salaryPeriod',
  'showSalary',
] as const;
/** The fields PUT /api/requisitions/{id}/settings replaces as a whole. */
const SETTINGS_FIELDS = [
  'isConfidential',
  'viewerEmails',
  'allowCandidateReschedule',
  'allowCandidateWithdraw',
] as const;
export type JobChanges = Partial<Pick<RequisitionWithSettings, (typeof JOB_FIELDS)[number]>>;
export type JobSettingsChanges = Partial<
  Pick<RequisitionWithSettings, (typeof SETTINGS_FIELDS)[number]>
>;

/**
 * Saves part of a job. Both endpoints replace every field they own, so the rest comes from the
 * cached job, which is updated first: two quick edits in a row never undo each other.
 */
function useJobSave<C extends object>(id: string, path: string, fields: readonly string[]) {
  const queryClient = useQueryClient();
  const key = ['requisition', id];
  return useMutation({
    mutationFn: async (changes: C) => {
      const cached = queryClient.getQueryData<RequisitionWithSettings>(key);
      if (!cached) throw new Error('The job is still loading. Try again in a moment.');
      const job = { ...cached, ...changes };
      const body = Object.fromEntries(fields.map((f) => [f, job[f as keyof typeof job]]));
      if ('targetStartDate' in body)
        body.targetStartDate = job.targetStartDate?.slice(0, 10) || null;
      // The place and pay go as their own objects (PlaceInput, SalaryInput).
      if ('salaryMin' in body) {
        const j = job as RequisitionWithSettings;
        Object.assign(body, {
          place: {
            city: j.locationCity ?? null,
            region: j.locationRegion ?? null,
            country: j.locationCountry ?? null,
            remoteCountries: j.remoteCountries ?? [],
          },
          salary: {
            min: j.salaryMin ?? null,
            max: j.salaryMax ?? null,
            currency: j.salaryCurrency ?? 'USD',
            period: j.salaryPeriod ?? 'Year',
            show: !!j.showSalary,
          },
        });
      }
      return api.put(`/api/requisitions/${id}${path}`, body);
    },
    onMutate: async (changes: C) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<RequisitionWithSettings>(key);
      queryClient.setQueryData<RequisitionWithSettings>(
        key,
        (job) => job && { ...job, ...changes },
      );
      return { before };
    },
    onError: (error, _changes, context) => {
      if (context?.before) queryClient.setQueryData(key, context.before);
      toast.error('Could not save your changes', error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
    },
  });
}

export const useUpdateJob = (id: string) => useJobSave<JobChanges>(id, '', JOB_FIELDS);
export const useUpdateJobSettings = (id: string) =>
  useJobSave<JobSettingsChanges>(id, '/settings', SETTINGS_FIELDS);

export { statusOptions } from './job-status';

import type { RequisitionDetail, RequisitionSummary } from '@/types';

export type Requirements = {
  required: string[];
  preferred: string[];
  minYears: number | null;
  location: string;
};

/** The job payload now carries these fields; types.ts is shared, so the extension lives here. */
export type RequisitionWithSettings = RequisitionDetail & {
  requirementsJson?: string;
  isConfidential?: boolean;
  viewerEmails?: string[];
  allowCandidateReschedule?: boolean;
  allowCandidateWithdraw?: boolean;
  openedAt?: string | null;
  closedAt?: string | null;
  /** Why the job is on hold, filled, closed or cancelled. */
  statusReason?: string | null;
  locationCity?: string | null;
  locationRegion?: string | null;
  /** ISO code, for example "US". */
  locationCountry?: string | null;
  remoteCountries?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  salaryCurrency?: string;
  salaryPeriod?: 'Year' | 'Month' | 'Hour';
  showSalary?: boolean;
  postingTemplateId?: string | null;
  pipelineTemplateId?: string | null;
  questionCount?: number;
};

/** A row of GET /api/requisitions: the summary plus the job's pipeline at a glance. */
export type JobListItem = RequisitionSummary & {
  /** Active candidates still in the first stage. */
  newApplications?: number;
  stages?: { name: string; count: number; type?: string; color?: string | null }[];
  openedAt?: string | null;
  closedAt?: string | null;
};

export function parseRequirements(json?: string): Requirements | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<Requirements>;
    return {
      required: value.required ?? [],
      preferred: value.preferred ?? [],
      minYears: value.minYears ?? null,
      location: value.location ?? '',
    };
  } catch {
    return null;
  }
}

import type { RequisitionDetail } from '@/types';

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

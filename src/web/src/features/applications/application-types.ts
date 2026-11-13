import type { ApplicationDetailResponse } from '@/types';

export type ModalProps = { opened: boolean; onClose: () => void; onSaved: () => void };
export type Interview = ApplicationDetailResponse['application']['interviews'][number];

/** Job-related reasons only; the same list for one applicant or many. */
export const DISPOSITION_REASONS = [
  'Does not meet minimum requirements',
  'Skills mismatch',
  'Experience mismatch',
  'Compensation mismatch',
  'Location or availability',
  'Withdrew',
  'Position closed',
  'Other',
];

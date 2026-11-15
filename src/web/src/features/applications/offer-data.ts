'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useAbility } from '@/lib/ability';
import type { ApprovalView, PreviousRound } from '@/features/approvals/approval-data';

export type OfferStatus =
  | 'Draft'
  | 'PendingApproval'
  | 'Approved'
  | 'Sent'
  | 'Accepted'
  | 'Declined'
  | 'Withdrawn'
  | 'Expired';

export interface Offer {
  id: string;
  status: OfferStatus;
  note: string;
  baseSalary?: number | null;
  currency: string;
  payPeriod: 'Year' | 'Month' | 'Hour';
  bonus: string;
  equity: string;
  startDate?: string | null;
  employmentType: string;
  workMode: string;
  location: string;
  expiresOn?: string | null;
  /** When it closes (set on send): the end of the last day in the organization's time zone. */
  expiresAt?: string | null;
  letterTemplateId?: string | null;
  /** The letter in Settings it started from, and that letter's version then. */
  letterTemplateName?: string | null;
  letterTemplateVersion?: number | null;
  /** This candidate's letter with detail chips, until it is sent. */
  letterMarkdown?: string | null;
  /** The letter as sent, frozen. */
  letterSent?: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
  respondedAt?: string | null;
  /** The name the candidate typed when they accepted in the portal. */
  respondedName?: string | null;
  /** Who recorded the answer, when the team did. */
  respondedByName?: string | null;
  /** A key from `declineReasons`. */
  declineReason?: string | null;
  declineReasonLabel?: string | null;
  declineNote?: string | null;
  replacesOfferId?: string | null;
}

export interface OfferResponse {
  offer: Offer | null;
  history: Offer[];
  job: { employmentType: string; workMode: string; location: string; targetStartDate?: string };
  /** The live round. */
  approvals: ApprovalView[];
  /** Earlier rounds, newest first. */
  previousRounds: PreviousRound[];
  approvalRequired: boolean;
  defaultApprovers: string[];
  sequential: boolean;
  declineReasons: { key: string; label: string }[];
}

/** One cache entry for the Offer tab, the Overview banner and the record's offer chip. */
export function useOffer(applicationId: string, enabled = true) {
  // Interviewers never see offers; the API answers them "not found".
  const ability = useAbility();
  return useQuery({
    queryKey: ['offer', applicationId],
    queryFn: () => api.get<OfferResponse>(`/api/applications/${applicationId}/offer`),
    retry: false,
    enabled: enabled && ability.can('read', 'Offer'),
  });
}

/** The offer that is still in play: anything but a withdrawn or declined one. An expired one stays, so a late answer can be recorded. */
export const liveOffer = (data?: OfferResponse) =>
  data?.offer && !['Withdrawn', 'Declined'].includes(data.offer.status) ? data.offer : null;

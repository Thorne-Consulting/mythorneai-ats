'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { useAbility } from '@/lib/ability';
import { DISPOSITION_REASONS, statusForReason } from '@/features/applications/application-types';

export type ReasonKind = 'Rejected' | 'Withdrawn';

export interface RejectionReason {
  id: string;
  label: string;
  kind: ReasonKind;
  sortOrder: number;
  archived: boolean;
  /** Closing with it asks for a note saying why (Other, for example). */
  needsNote?: boolean;
  /** How many applications are closed with it. */
  used: number;
}

/** The two groups, as the reject dialog and Settings name them. */
export const REASON_GROUPS: { kind: ReasonKind; title: string }[] = [
  { kind: 'Rejected', title: 'We decided not to move forward' },
  { kind: 'Withdrawn', title: 'They decided' },
];

/**
 * The organization's reasons from Settings, in their order. `all` adds archived ones. Until they
 * load (or if they fail), the built-in list keeps every dialog usable.
 */
export function useRejectionReasons(all = false) {
  // Only people who work on jobs reject anyone; the API refuses the list to everyone else.
  const worksOnJobs = useAbility().can('read', 'Job');
  return useQuery({
    queryKey: ['rejection-reasons', all],
    queryFn: () => api.get<RejectionReason[]>(`/api/rejection-reasons${all ? '?all=true' : ''}`),
    staleTime: 5 * 60_000,
    enabled: worksOnJobs,
    placeholderData: all
      ? undefined
      : DISPOSITION_REASONS.map((label, i) => ({
          id: label,
          label,
          kind: statusForReason(label) as ReasonKind,
          sortOrder: i,
          archived: false,
          needsNote: label === 'Other',
          used: 0,
        })),
  });
}

/** Select options grouped by who decided. "Withdrew" reads as "They withdrew". */
export function reasonOptions(
  reasons: RejectionReason[],
  kinds: ReasonKind[] = ['Rejected', 'Withdrawn'],
) {
  return REASON_GROUPS.filter((g) => kinds.includes(g.kind)).flatMap((group) =>
    reasons
      .filter((r) => r.kind === group.kind && !r.archived)
      .map((r) => ({
        value: r.label,
        label: r.label === 'Withdrew' ? 'They withdrew' : r.label,
        group: group.title,
      })),
  );
}

/** Whether closing with this reason needs a note. */
export const reasonNeedsNote = (reasons: RejectionReason[] | undefined, label: string | null) =>
  !!label && !!reasons?.find((r) => r.label === label)?.needsNote;

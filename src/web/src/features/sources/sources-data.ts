import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';

export type SourceCategory =
  'JobBoard' | 'Referral' | 'Agency' | 'CareerSite' | 'Sourced' | 'Event' | 'Other';

/** GET /api/sources */
export type Source = {
  id: string;
  name: string;
  category: SourceCategory;
  active: boolean;
  /** Words in careers links (?src= or utm_source) that mean this source. */
  codes: string[];
  /** People with this source. */
  candidates: number;
};

/** In the order Settings and every source picker group them. */
export const CATEGORIES: { value: SourceCategory; label: string }[] = [
  { value: 'JobBoard', label: 'Job board' },
  { value: 'CareerSite', label: 'Career site' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Agency', label: 'Agency' },
  { value: 'Sourced', label: 'Sourced' },
  { value: 'Event', label: 'Event' },
  { value: 'Other', label: 'Other' },
];

export const categoryLabel = (category: SourceCategory) =>
  CATEGORIES.find((c) => c.value === category)?.label ?? category;

export function useSources(enabled = true) {
  return useQuery({
    queryKey: ['sources'],
    queryFn: () => api.get<Source[]>('/api/sources'),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * Options for a source picker, grouped by kind. Turned-off sources are left out, except `keep`
 * (the one a person already has).
 */
export function sourceOptions(sources: Source[] | undefined, keep?: string | null) {
  const order = (s: Source) => CATEGORIES.findIndex((c) => c.value === s.category);
  return (sources ?? [])
    .filter((s) => s.active || s.name === keep)
    .sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name))
    .map((s) => ({ value: s.name, label: s.name, group: categoryLabel(s.category) }));
}

/** Is this source a referral, so the form asks who referred them? */
export const isReferral = (sources: Source[] | undefined, name: string | null | undefined) =>
  !!name && sources?.find((s) => s.name === name)?.category === 'Referral';

/** People in the workspace, for "Referred by". */
export type Teammate = { id: string; email: string; displayName: string; role: string };

export function useTeammates(enabled = true) {
  return useQuery({
    queryKey: ['requisition-people'],
    queryFn: () => api.get<Teammate[]>('/api/requisitions/people'),
    enabled,
    staleTime: 60_000,
  });
}

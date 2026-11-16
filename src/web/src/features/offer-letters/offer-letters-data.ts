'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { ChipItem } from '@/components/plate/editor/plugins/editor-kit';

export interface OfferLetterTemplate {
  id: string;
  name: string;
  body: string;
  version: number;
  updatedAt: string;
  updatedByName?: string | null;
}

export interface OfferLetterLibrary {
  /** May change the letters (the templates permission). */
  canEdit: boolean;
  details: { key: string; label: string; example: string }[];
  letters: OfferLetterTemplate[];
}

/** The letter templates and the details a letter can use. */
export function useOfferLetters() {
  return useQuery({
    queryKey: ['offer-letters'],
    queryFn: () => api.get<OfferLetterLibrary>('/api/offer-letters'),
  });
}

export function useRefreshOfferLetters() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['offer-letters'] });
}

/** The details as editor chips: type "{" or use "Insert detail". */
export const letterChips = (details: OfferLetterLibrary['details'] = []): ChipItem[] =>
  details.map((d) => ({ key: d.key, text: d.label }));

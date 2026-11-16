'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';

/** One of my notes: general (no criterion, no question), on a kit question, or on a question I added. */
export type NoteItem = {
  criterionId: string | null;
  question: string | null;
  body: string;
  covered: boolean;
};

type Saved = { items: NoteItem[]; updatedAt: string | null };

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** The general note: no criterion and no question. */
export const isGeneral = (item: NoteItem) => !item.criterionId && !item.question;

/**
 * My private notes for an interview, saved on the server as I type (a second after I stop).
 * Notes kept in this browser by the older notes box move to the server once, then leave the browser.
 */
export function useMyNotes(interviewId: string) {
  const queryClient = useQueryClient();
  const key = ['interview-notes', interviewId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.get<Saved>(`/api/interviews/${interviewId}/my-notes`),
    staleTime: Infinity,
  });
  const [items, setItems] = useState<NoteItem[] | null>(null);
  const [state, setState] = useState<SaveState>('idle');
  const latest = useRef<NoteItem[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (next: NoteItem[]) => {
      setState('saving');
      try {
        await api.put(`/api/interviews/${interviewId}/my-notes`, { items: next });
        queryClient.setQueryData<Saved>(['interview-notes', interviewId], {
          items: next,
          updatedAt: new Date().toISOString(),
        });
        setState(latest.current === next ? 'saved' : 'saving');
      } catch {
        setState('error');
      }
    },
    [interviewId, queryClient],
  );

  // First load: start from the server, folding in any note this browser kept before.
  useEffect(() => {
    if (!query.data || items) return;
    let start = query.data.items;
    const storageKey = `interview-notes:${interviewId}`;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const local = raw ? (JSON.parse(raw) as unknown) : null;
      if (typeof local === 'string' && local.trim()) {
        const general = start.find(isGeneral);
        start = general
          ? start.map((item) =>
              item === general ? { ...item, body: `${item.body}\n\n${local}`.trim() } : item,
            )
          : [{ criterionId: null, question: null, body: local, covered: false }, ...start];
        void save(start);
      }
      window.localStorage.removeItem(storageKey);
    } catch {
      // Storage can be blocked; the server copy is what counts.
    }
    setItems(start);
  }, [query.data, items, interviewId, save]);

  const update = useCallback(
    (next: NoteItem[]) => {
      setItems(next);
      latest.current = next;
      setState('saving');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void save(next), 800);
    },
    [save],
  );

  // Save straight away when leaving the page with changes waiting.
  useEffect(
    () => () => {
      if (timer.current && latest.current) {
        clearTimeout(timer.current);
        void api.put(`/api/interviews/${interviewId}/my-notes`, { items: latest.current });
      }
    },
    [interviewId],
  );

  return {
    items: items ?? [],
    loading: !items,
    error: query.isError,
    state,
    retry: () => latest.current && void save(latest.current),
    update,
  };
}

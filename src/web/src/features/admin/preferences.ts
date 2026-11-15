'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { toast } from '@/components/ui';
import type { AppAbility } from '@/lib/ability';
import { setDateOrder } from '@/lib/format';
import { setTheme } from '@/lib/theme';
import type { UserPreferences } from '@/types';

/** Browser copies of server preferences, read by code that runs before the account loads (tables). */
export const PREF_KEYS = {
  density: 'ats-pref:density',
  startPage: 'ats-pref:start-page',
} as const;

/** Pages someone can start on, with the check that decides whether they may open them. */
export const START_PAGES: { value: string; label: string; allowed: (a: AppAbility) => boolean }[] =
  [
    { value: '/', label: 'Dashboard', allowed: () => true },
    { value: '/jobs', label: 'Jobs', allowed: (a) => a.can('read', 'Job') },
    { value: '/candidates', label: 'Candidates', allowed: (a) => a.can('read', 'Candidate') },
    { value: '/interviews', label: 'Interviews', allowed: (a) => a.can('read', 'Interview') },
    { value: '/messages', label: 'Messages', allowed: (a) => a.can('read', 'Message') },
    { value: '/approvals', label: 'Approvals', allowed: (a) => a.can('read', 'Job') },
    { value: '/reports', label: 'Reports', allowed: (a) => a.can('read', 'Report') },
  ];

export const startPagesFor = (ability: AppAbility) =>
  START_PAGES.filter((page) => page.allowed(ability));

/**
 * Applies the account's preferences in this browser: theme, date order, and the copies other code
 * reads. A preference the person never set leaves the browser's own choice alone.
 */
export function applyPreferences(prefs: UserPreferences) {
  setDateOrder(prefs.dateFormat);
  if (typeof window === 'undefined') return;
  try {
    if (prefs.theme && localStorage.getItem('ats-theme') !== prefs.theme) setTheme(prefs.theme);
    if (prefs.density) localStorage.setItem(PREF_KEYS.density, JSON.stringify(prefs.density));
    if (prefs.startPage) localStorage.setItem(PREF_KEYS.startPage, JSON.stringify(prefs.startPage));
  } catch {}
}

/** Saves preferences to the account, then reloads who you are so every page reads the new values. */
export function useSavePreferences() {
  const router = useRouter();
  return useMutation({
    mutationFn: (patch: UserPreferences) => api.put<UserPreferences>('/api/me/preferences', patch),
    onSuccess: (saved) => {
      applyPreferences(saved);
      router.refresh();
    },
    onError: (error: Error) => toast.error('Your preference wasn’t saved', error.message),
  });
}

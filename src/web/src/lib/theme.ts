'use client';

import { useSyncExternalStore } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'ats-theme';

/** Inline in <head> so the right theme paints before React loads (no flash). */
export const themeScript = `(function(){try{var p=localStorage.getItem('${KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

const listeners = new Set<() => void>();
function read(): ThemePref {
  try {
    return (localStorage.getItem(KEY) as ThemePref) || 'system';
  } catch {
    return 'system';
  }
}
function apply(pref: ThemePref) {
  const dark =
    pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setTheme(pref: ThemePref) {
  try {
    localStorage.setItem(KEY, pref);
  } catch {}
  apply(pref);
  listeners.forEach((l) => l());
}

export function useTheme() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => read() === 'system' && apply('system');
      mq.addEventListener('change', onChange);
      return () => {
        listeners.delete(l);
        mq.removeEventListener('change', onChange);
      };
    },
    read,
    () => 'system' as ThemePref,
  );
}

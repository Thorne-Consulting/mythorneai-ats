'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** Value that only updates after `delay` ms without changes (search boxes). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Keyboard shortcuts. Keys like 'mod+k', '/', 'mod+\\'. 'mod' is ⌘ on Mac, Ctrl elsewhere.
 * Ignored while typing in inputs unless `allowInInputs`.
 */
export function useHotkeys(
  bindings: [string, (e: KeyboardEvent) => void][],
  allowInInputs = false,
) {
  const ref = useRef(bindings);
  ref.current = bindings;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
      for (const [combo, fn] of ref.current) {
        const parts = combo.toLowerCase().split('+');
        const key = parts.pop();
        const mod = parts.includes('mod');
        const isMac = navigator.platform.toLowerCase().includes('mac');
        if (mod && !(isMac ? e.metaKey : e.ctrlKey)) continue;
        if (!mod && (e.metaKey || e.ctrlKey)) continue;
        if (parts.includes('shift') !== e.shiftKey) continue;
        if (e.key.toLowerCase() !== key) continue;
        if (typing && !allowInInputs && !mod) continue;
        e.preventDefault();
        fn(e);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowInInputs]);
}

export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
) {
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) handler();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, handler]);
}

/**
 * useState that survives reloads, per browser. For conveniences only (table columns, density,
 * dashboard layout, drafts) — never for data other people need to see.
 */
export function useLocalStorageState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value, ready]);
  return [value, setValue] as const;
}

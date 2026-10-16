'use client';

import { useState } from 'react';

/**
 * A remembered open/closed panel. Kept in a cookie (not localStorage) so the server renders the
 * page already collapsed and nothing jumps on load. Read the initial value server-side with
 * `cookies().get(name)?.value === '1'`.
 */
export function useCollapsePref(name: string, initial: boolean) {
  const [collapsed, setCollapsed] = useState(initial);
  const toggle = () =>
    setCollapsed((current) => {
      document.cookie = `${name}=${current ? '0' : '1'}; path=/; max-age=31536000; samesite=lax`;
      return !current;
    });
  return [collapsed, toggle] as const;
}

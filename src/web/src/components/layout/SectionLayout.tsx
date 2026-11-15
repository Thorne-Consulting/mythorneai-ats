'use client';

import { createContext, useContext, useId, useLayoutEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { CountBadge } from '@/components/ui';
import { cn } from '@/lib/cn';

export type SectionItem = {
  href: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
  badge?: ReactNode;
  /** Only active on an exact path match (for index items like /admin). */
  exact?: boolean;
  /** Extra path prefixes that should light this item. */
  match?: string[];
};
export type SectionGroup = { label?: string; items: SectionItem[] };

function activeHref(pathname: string, groups: SectionGroup[]) {
  const all = groups.flatMap((g) => g.items);
  return all
    .filter((i) =>
      [i.href, ...(i.match ?? [])].some((p) =>
        i.exact && p === i.href ? pathname === p : pathname === p || pathname.startsWith(`${p}/`),
      ),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * Second-level navigation: a vertical, grouped list of sub-pages beside the content. Use it when
 * an area has more than ~6 sub-pages or they fall into groups (Settings, Reports, a job record).
 * Below `lg` it turns into a select so it never squeezes the content.
 */
export function SectionNav({
  groups,
  title,
  className,
}: {
  groups: SectionGroup[];
  title?: ReactNode;
  className?: string;
}) {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const active = activeHref(pathname, groups);
  const selectId = useId();
  return (
    <>
      <div className="lg:hidden">
        <label className="sr-only" htmlFor={selectId}>
          Section
        </label>
        <select
          id={selectId}
          value={active ?? ''}
          onChange={(e) => router.push(e.currentTarget.value)}
          className="h-[38px] w-full rounded-md border border-input bg-card px-3 text-base text-fg"
        >
          {groups.map((g, gi) => (
            <optgroup key={gi} label={g.label ?? ''}>
              {g.items.map((i) => (
                <option key={i.href} value={i.href}>
                  {i.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <nav
        aria-label={typeof title === 'string' ? title : 'Section'}
        className={cn('hidden lg:block', className)}
      >
        {title && (
          <p className="mb-3 px-3 text-xs font-medium tracking-[0.06em] text-fg-subtle uppercase">
            {title}
          </p>
        )}
        <div className="space-y-5">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.label && (
                <p className="mb-1 px-3 text-2xs font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                  {g.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {g.items.map((i) => {
                  const on = i.href === active;
                  const Icon = i.icon;
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={on ? 'page' : undefined}
                        className={cn(
                          'flex h-9 items-center gap-2.5 rounded-md px-3 text-sm text-fg-muted transition-colors hover:bg-secondary hover:text-fg',
                          on &&
                            'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
                        <span className="flex-1 truncate">{i.label}</span>
                        {i.badge}
                        {i.count !== undefined && i.count > 0 && (
                          <CountBadge count={i.count} tone={on ? 'blue' : 'gray'} />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}

/**
 * Lets the app shell know a section nav is on screen, so it can shrink its own sidebar to icons.
 * The shell gives a counter; the visual collapse itself is CSS (`data-section-nav`), so a full page
 * load paints the right width straight away.
 */
export const SectionNavPresence = createContext<((delta: 1 | -1) => void) | null>(null);

/** Content with a sticky second sidebar on the left. The app sidebar collapses to icons beside it. */
export function SidebarLayout({
  nav,
  children,
  className,
  navWidth = 'lg:w-56',
}: {
  nav: ReactNode;
  children: ReactNode;
  className?: string;
  navWidth?: string;
}) {
  const announce = useContext(SectionNavPresence);
  useLayoutEffect(() => {
    announce?.(1);
    return () => announce?.(-1);
  }, [announce]);
  return (
    <div
      data-section-nav=""
      className={cn('flex flex-col gap-6 lg:flex-row lg:items-start', className)}
    >
      {/* Sticky and scrollable, so every item stays reachable on a short screen. */}
      <aside
        className={cn(
          'w-full shrink-0 lg:sticky lg:top-[101px] lg:max-h-[calc(100dvh-101px)] lg:overflow-y-auto lg:pb-6',
          navWidth,
        )}
      >
        {nav}
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

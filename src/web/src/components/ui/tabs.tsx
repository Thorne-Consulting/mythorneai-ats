'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';
import { CountBadge } from './badge';

export type TabItem = { value: string; label: ReactNode; count?: number; disabled?: boolean };
type Variant = 'underline' | 'pills';

const listClasses: Record<Variant, string> = {
  // Figma: 40px tall, 2px primary underline, regular grey → medium primary when selected.
  underline: 'flex gap-6 overflow-x-auto border-b border-border-subtle scrollbar-hide',
  // Figma settings sub-nav: soft primary wash on the selected item.
  pills: 'flex flex-wrap gap-1',
};
const tabClasses: Record<Variant, string> = {
  underline:
    '-mb-px inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent text-base text-fg-subtle transition-colors hover:text-fg data-[state=active]:border-primary data-[state=active]:font-medium data-[state=active]:text-primary aria-[current=page]:border-primary aria-[current=page]:font-medium aria-[current=page]:text-primary',
  pills:
    'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm text-fg-muted transition-colors hover:bg-secondary hover:text-fg data-[state=active]:bg-accent data-[state=active]:font-medium data-[state=active]:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:font-medium aria-[current=page]:text-accent-foreground',
};

function TabLabel({ item }: { item: TabItem }) {
  return (
    <>
      {item.label}
      {item.count !== undefined && <span className="tnum">({item.count})</span>}
    </>
  );
}

/**
 * In-page tabs. Give `items` and render panels yourself with `TabPanel`, or just read `value`
 * and switch content (filters such as "All jobs (18) / Open (12)").
 */
export function Tabs({
  value,
  onValueChange,
  items,
  variant = 'underline',
  className,
  children,
  'aria-label': ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: TabItem[];
  variant?: Variant;
  className?: string;
  children?: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List aria-label={ariaLabel} className={listClasses[variant]}>
        {items.map((item) => (
          <TabsPrimitive.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(tabClasses[variant], 'disabled:opacity-50')}
          >
            <TabLabel item={item} />
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabPanel({
  value,
  className,
  children,
}: {
  value: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <TabsPrimitive.Content value={value} className={cn('outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  );
}

export type LinkTab = { href: string; label: ReactNode; count?: number; exact?: boolean };

/** Route tabs: each tab is a page (settings sections, a job's sub-pages). */
export function LinkTabs({
  items,
  variant = 'underline',
  className,
  'aria-label': ariaLabel = 'Sections',
}: {
  items: LinkTab[];
  variant?: Variant;
  className?: string;
  'aria-label'?: string;
}) {
  const pathname = usePathname() ?? '';
  // The longest matching href wins, so /admin and /admin/users don't both light up.
  const active = items
    .filter((t) =>
      t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`),
    )
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={ariaLabel} className={cn(listClasses[variant], className)}>
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.href === active ? 'page' : undefined}
          className={tabClasses[variant]}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <CountBadge count={t.count} tone={t.href === active ? 'blue' : 'gray'} />
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Two to five mutually exclusive views, e.g. Day / Week / Month. */
export function SegmentedControl({
  value,
  onValueChange,
  items,
  size = 'md',
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: ReactNode; icon?: ReactNode }[];
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-md border border-border bg-muted p-0.5', className)}
    >
      {items.map((item) => {
        const on = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onValueChange(item.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[5px] px-3 font-medium text-fg-subtle transition-colors hover:text-fg [&_svg]:size-4',
              size === 'md' ? 'h-8 text-sm' : 'h-6 text-xs',
              on && 'bg-card text-fg shadow-card',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

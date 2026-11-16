import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/cn';

export type Crumb = { label: ReactNode; href?: string };

/** "Settings / Roles & permissions / Workspace members" */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-xs text-fg-subtle', className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="hover:text-fg hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? 'page' : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Top of every page. Figma: breadcrumbs, 28px bold title, one-line muted description, actions
 * top-right (secondary first, primary last). Put tabs or filters in `children` below.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-5 space-y-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {breadcrumbs && <Breadcrumbs items={breadcrumbs} className="mb-1.5" />}
          {eyebrow && <p className="mb-1 text-base text-fg-muted">{eyebrow}</p>}
          <h1 className="text-3xl font-bold tracking-[-0.01em] text-fg sm:text-[1.875rem]">
            {title}
          </h1>
          {description && <p className="mt-1.5 text-base text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Section heading inside a page or card body. */
export function SectionTitle({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
      </div>
      {action}
    </div>
  );
}

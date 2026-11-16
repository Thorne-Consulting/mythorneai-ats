import type { HTMLAttributes, ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { Tone } from './badge';

/** White surface with the Figma card border and soft shadow. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-xl border border-border-subtle bg-card shadow-card', className)}
      {...props}
    />
  );
}

/** Card title row: bold title, optional info, and a "View all →" style action on the right. */
export function CardHeader({
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
    <div
      className={cn('flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3', className)}
    >
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-fg-subtle">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-border-subtle px-5 py-3',
        className,
      )}
      {...props}
    />
  );
}

/** "View pipeline →" link used in card headers. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
    >
      {children}
      <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

const iconWash: Record<Tone, string> = {
  blue: 'bg-tone-blue-bg text-tone-blue-dot',
  violet: 'bg-tone-violet-bg text-tone-violet-dot',
  green: 'bg-tone-green-bg text-tone-green-dot',
  amber: 'bg-tone-amber-bg text-tone-amber-dot',
  red: 'bg-tone-red-bg text-tone-red-dot',
  gray: 'bg-tone-gray-bg text-tone-gray-dot',
};

/** Round tinted icon disc. Figma metric icon: 58px circle, 27px glyph. */
export function IconDisc({
  icon: Icon,
  tone = 'blue',
  size = 'lg',
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        size === 'lg' && 'size-[58px] [&_svg]:size-[27px]',
        size === 'md' && 'size-10 [&_svg]:size-5',
        size === 'sm' && 'size-8 [&_svg]:size-4',
        iconWash[tone],
        className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}

export type StatCardProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Makes the whole card a link with a chevron (dashboard tiles). */
  href?: string;
  trend?: { direction: 'up' | 'down'; text: string; good?: boolean };
  className?: string;
};

/** Figma metric card: icon disc, label, big number, supporting text. */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'blue',
  href,
  trend,
  className,
}: StatCardProps) {
  const body = (
    <>
      {icon && <IconDisc icon={icon} tone={tone} />}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-base leading-snug text-fg-muted">{label}</p>
        <p className="mt-0.5 text-3xl font-bold text-fg tnum">{value}</p>
        {trend ? (
          <p
            className={cn(
              'mt-1 text-2xs',
              (trend.good ?? trend.direction === 'up') ? 'text-tone-green-fg' : 'text-tone-red-fg',
            )}
          >
            {trend.direction === 'up' ? '↑' : '↓'} {trend.text}
          </p>
        ) : (
          hint && <p className="mt-1 text-2xs text-fg-subtle">{hint}</p>
        )}
      </div>
      {href && <ChevronRight className="size-4 self-start text-fg-subtle" aria-hidden />}
    </>
  );
  const classes = cn(
    'flex min-h-[108px] items-center gap-4 rounded-xl border border-border-subtle bg-card px-4 py-4 shadow-card',
    href && 'transition-colors hover:border-border hover:bg-muted',
    className,
  );
  return href ? (
    <Link href={href} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/** Responsive row of stat cards: 1 → 2 → 4 columns. */
export function StatGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4',
        className,
      )}
      {...props}
    />
  );
}

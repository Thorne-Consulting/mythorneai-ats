import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Nothing to show yet: icon, one-line title, what to do next, and the action that does it. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {Icon && (
        <span
          className={cn(
            'flex items-center justify-center rounded-full bg-accent text-tone-blue-dot',
            compact ? 'size-10' : 'size-14',
          )}
        >
          <Icon className={compact ? 'size-5' : 'size-6'} strokeWidth={1.75} aria-hidden />
        </span>
      )}
      <p className={cn('font-semibold text-fg', compact ? 'text-base' : 'text-md')}>{title}</p>
      {description && <p className="max-w-md text-sm text-fg-subtle">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

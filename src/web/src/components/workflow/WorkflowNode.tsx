import type { ReactNode } from 'react';
import { ArrowRight, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Figma workflow stage card: icon tile, TYPE eyebrow, ••• menu, title, description, meta. */
export function WorkflowNode({
  icon: Icon,
  kind,
  title,
  description,
  meta,
  selected,
  onClick,
  menu,
}: {
  icon: LucideIcon;
  kind: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  menu?: ReactNode;
}) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) =>
        onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())
      }
      aria-pressed={onClick ? !!selected : undefined}
      className={cn(
        'relative flex min-h-[148px] w-full min-w-[200px] flex-col rounded-lg border bg-card p-4 text-left transition-colors',
        selected ? 'border-2 border-primary p-[15px]' : 'border-border hover:border-primary/50',
        onClick && 'cursor-pointer',
      )}
    >
      <span
        aria-hidden
        className="absolute top-1/2 -left-[5px] size-2 -translate-y-1/2 rounded-full border-2 border-primary bg-card"
      />
      <span
        aria-hidden
        className="absolute top-1/2 -right-[5px] size-2 -translate-y-1/2 rounded-full border-2 border-primary bg-card"
      />
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-accent text-tone-blue-dot">
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="flex-1 text-center text-2xs font-semibold tracking-[0.06em] text-fg-subtle uppercase">
          {kind}
        </span>
        {menu ?? <MoreHorizontal className="size-4 text-fg-subtle" aria-hidden />}
      </div>
      <p className="mt-3 text-lg font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      {meta && <p className="mt-auto pt-3 text-2xs text-fg-subtle">{meta}</p>}
    </div>
  );
}

/** Arrow between nodes. */
export function WorkflowArrow() {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center px-2 text-primary max-lg:rotate-90 max-lg:py-1"
    >
      <span className="h-px w-8 bg-primary" />
      <ArrowRight className="-ml-1 size-4" />
    </span>
  );
}

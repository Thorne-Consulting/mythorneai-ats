import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { Clock3 } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';

export type CandidateCardProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  /** Second line under the name: source, role or email. */
  subtitle?: ReactNode;
  /** Free line: skills, "Phone screen · Today, 4:00 PM", "Offer sent · ₱95,000 / month". */
  detail?: ReactNode;
  /** "1 day", "Starts Nov 02" */
  timeInStage?: ReactNode;
  owner?: string | null;
  /** Right side of the name row, e.g. an AI match score. */
  aside?: ReactNode;
  /** Laid over the avatar, for example a selection checkbox shown on hover. */
  leading?: ReactNode;
  /** Colours the time line: amber past the stage's target, red past twice the target. */
  timeTone?: 'amber' | 'red' | null;
  /** Right side of the footer, for example "2 scorecards owed". Replaces the owner avatar. */
  footerEnd?: ReactNode;
  selected?: boolean;
  dragging?: boolean;
  ref?: Ref<HTMLDivElement>;
};

/** Figma pipeline card: avatar + name + source, a detail line, then time-in-stage and owner. */
export function CandidateCard({
  name,
  subtitle,
  detail,
  timeInStage,
  owner,
  aside,
  leading,
  timeTone,
  footerEnd,
  selected,
  dragging,
  className,
  ...props
}: CandidateCardProps) {
  return (
    <div
      className={cn(
        'group/card flex flex-col gap-2.5 rounded-[9px] border border-border-subtle bg-card p-3 shadow-card transition-[box-shadow,transform]',
        props.onClick && 'cursor-pointer hover:border-border hover:shadow-pop',
        props.draggable && 'cursor-grab active:cursor-grabbing',
        selected && 'border-primary/50 bg-accent',
        dragging && 'rotate-1 opacity-60',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <span className="relative flex shrink-0">
          <Avatar name={name} size="md" />
          {leading && <span className="absolute inset-0 flex">{leading}</span>}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{name}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-fg-subtle">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {detail && <p className="text-xs text-fg-muted">{detail}</p>}
      {(timeInStage || owner || footerEnd) && (
        <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
          <span
            className={cn(
              'flex items-center gap-1.5 text-2xs text-fg-subtle',
              timeTone === 'amber' && 'font-medium text-tone-amber-fg',
              timeTone === 'red' && 'font-medium text-tone-red-fg',
            )}
          >
            {timeInStage && (
              <>
                <Clock3 className="size-3" aria-hidden />
                {timeInStage}
              </>
            )}
          </span>
          {footerEnd ?? (owner && <Avatar name={owner} size="xs" tone="blue" />)}
        </div>
      )}
    </div>
  );
}

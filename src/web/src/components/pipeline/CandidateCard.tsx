import type { HTMLAttributes, ReactNode } from 'react';
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
  dragging?: boolean;
};

/** Figma pipeline card: avatar + name + source, a detail line, then time-in-stage and owner. */
export function CandidateCard({
  name,
  subtitle,
  detail,
  timeInStage,
  owner,
  aside,
  dragging,
  className,
  ...props
}: CandidateCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-[9px] border border-border-subtle bg-card p-3 shadow-card transition-[box-shadow,transform]',
        props.onClick && 'cursor-pointer hover:border-border hover:shadow-pop',
        props.draggable && 'cursor-grab active:cursor-grabbing',
        dragging && 'rotate-1 opacity-60',
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2.5">
        <Avatar name={name} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{name}</p>
          {subtitle && <p className="mt-0.5 truncate text-xs text-fg-subtle">{subtitle}</p>}
        </div>
        {aside}
      </div>
      {detail && <p className="text-xs text-fg-muted">{detail}</p>}
      {(timeInStage || owner) && (
        <div className="flex items-center justify-between border-t border-border-subtle pt-2">
          <span className="flex items-center gap-1.5 text-2xs text-fg-subtle">
            {timeInStage && (
              <>
                <Clock3 className="size-3" aria-hidden />
                {timeInStage}
              </>
            )}
          </span>
          {owner && <Avatar name={owner} size="xs" tone="blue" />}
        </div>
      )}
    </div>
  );
}

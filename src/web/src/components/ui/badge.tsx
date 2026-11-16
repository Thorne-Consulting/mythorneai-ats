import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'blue' | 'violet' | 'green' | 'amber' | 'red' | 'gray';

const toneClasses: Record<Tone, { soft: string; dot: string; outline: string; solid: string }> = {
  blue: {
    soft: 'bg-tone-blue-bg text-tone-blue-fg',
    dot: 'bg-tone-blue-dot',
    outline: 'border-tone-blue-dot/40 text-tone-blue-fg',
    solid: 'bg-tone-blue-dot text-white',
  },
  violet: {
    soft: 'bg-tone-violet-bg text-tone-violet-fg',
    dot: 'bg-tone-violet-dot',
    outline: 'border-tone-violet-dot/40 text-tone-violet-fg',
    solid: 'bg-tone-violet-dot text-white',
  },
  green: {
    soft: 'bg-tone-green-bg text-tone-green-fg',
    dot: 'bg-tone-green-dot',
    outline: 'border-tone-green-dot/40 text-tone-green-fg',
    solid: 'bg-tone-green-dot text-white',
  },
  amber: {
    soft: 'bg-tone-amber-bg text-tone-amber-fg',
    dot: 'bg-tone-amber-dot',
    outline: 'border-tone-amber-dot/40 text-tone-amber-fg',
    solid: 'bg-tone-amber-dot text-white',
  },
  red: {
    soft: 'bg-tone-red-bg text-tone-red-fg',
    dot: 'bg-tone-red-dot',
    outline: 'border-tone-red-dot/40 text-tone-red-fg',
    solid: 'bg-tone-red-dot text-white',
  },
  gray: {
    soft: 'bg-tone-gray-bg text-tone-gray-fg',
    dot: 'bg-tone-gray-dot',
    outline: 'border-border text-fg-muted',
    solid: 'bg-tone-gray-dot text-white',
  },
};

export function toneDot(tone: Tone) {
  return toneClasses[tone].dot;
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  variant?: 'soft' | 'outline' | 'solid';
  /** Leading status dot (Figma status badge). */
  dot?: boolean;
  size?: 'sm' | 'md';
  icon?: ReactNode;
};

/** Pill label. Figma: 12px text, 6px dot, fully rounded, soft tone background. */
export function Badge({
  tone = 'gray',
  variant = 'soft',
  dot,
  size = 'md',
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  const t = toneClasses[tone];
  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-normal leading-none [&_svg]:size-3',
        size === 'md' ? 'h-6 px-2.5 text-xs' : 'h-5 px-2 text-2xs',
        variant === 'soft' && t.soft,
        variant === 'outline' && cn('border bg-transparent', t.outline),
        variant === 'solid' && cn('font-medium', t.solid),
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', t.dot)} />}
      {icon}
      {children}
    </span>
  );
}

/** Small count bubble, e.g. "Invitations 6". */
export function CountBadge({
  count,
  tone = 'blue',
  className,
}: {
  count: number;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-2xs font-medium tnum',
        toneClasses[tone].soft,
        className,
      )}
    >
      {count}
    </span>
  );
}

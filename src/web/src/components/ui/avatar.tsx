import { cn } from '@/lib/cn';
import type { Tone } from './badge';

const tones: Tone[] = ['blue', 'violet', 'green', 'amber', 'gray'];
const toneClass: Record<Tone, string> = {
  blue: 'bg-tone-blue-bg text-tone-blue-fg',
  violet: 'bg-tone-violet-bg text-tone-violet-fg',
  green: 'bg-tone-green-bg text-tone-green-fg',
  amber: 'bg-tone-amber-bg text-tone-amber-fg',
  red: 'bg-tone-red-bg text-tone-red-fg',
  gray: 'bg-tone-gray-bg text-tone-gray-fg',
};

const sizes = {
  xs: 'size-6 text-2xs',
  sm: 'size-8 text-xs',
  md: 'size-[34px] text-xs',
  lg: 'size-[41px] text-base',
  xl: 'size-14 text-lg',
  '2xl': 'size-[72px] text-2xl',
};

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Same name, same colour, everywhere. */
export function toneFor(name: string): Tone {
  return tones[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % tones.length];
}

export type AvatarProps = {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  tone?: Tone | 'solid';
  className?: string;
};

/** Round initials avatar. Figma: 34px in tables and cards, 24px for owners, 41px in the header. */
export function Avatar({ name, src, size = 'md', tone, className }: AvatarProps) {
  const t = tone ?? toneFor(name);
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold',
        sizes[size],
        t === 'solid' ? 'bg-primary text-primary-foreground' : toneClass[t],
        className,
      )}
      title={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export function AvatarGroup({
  names,
  max = 3,
  size = 'xs',
}: {
  names: string[];
  max?: number;
  size?: keyof typeof sizes;
}) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="flex -space-x-1.5">
      {shown.map((name) => (
        <Avatar key={name} name={name} size={size} className="ring-2 ring-card" />
      ))}
      {rest > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-secondary font-medium text-fg-muted ring-2 ring-card',
            sizes[size],
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

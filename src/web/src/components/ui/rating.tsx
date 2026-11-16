'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/cn';

/** 1–N star rating. Arrow keys work because it is a radio group. */
export function Rating({
  value,
  onChange,
  count = 5,
  readOnly,
  size = 'md',
  label = 'Rating',
}: {
  value: number;
  onChange?: (value: number) => void;
  count?: number;
  readOnly?: boolean;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const s = size === 'md' ? 'size-5' : 'size-4';
  if (readOnly || !onChange)
    return (
      <span className="inline-flex gap-0.5" role="img" aria-label={`${value} of ${count}`}>
        {Array.from({ length: count }, (_, i) => (
          <Star
            key={i}
            className={cn(s, i < value ? 'fill-tone-amber-dot text-tone-amber-dot' : 'text-border')}
            aria-hidden
          />
        ))}
      </span>
    );
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex gap-0.5">
      {Array.from({ length: count }, (_, i) => {
        const n = i + 1;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} of ${count}`}
            onClick={() => onChange(value === n ? 0 : n)}
            className="rounded-sm p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={cn(
                s,
                n <= value ? 'fill-tone-amber-dot text-tone-amber-dot' : 'text-control',
              )}
            />
          </button>
        );
      })}
    </span>
  );
}

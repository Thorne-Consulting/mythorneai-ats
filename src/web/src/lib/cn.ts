import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our custom tokens, or it reads `text-2xs` as a colour and drops `text-fg`.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['2xs', 'md'] }],
      shadow: [{ shadow: ['card', 'pop', 'brand'] }],
    },
  },
});

/** Merge class names; later Tailwind classes win over earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ponytail: assert-based self-check, run with `node --experimental-strip-types src/lib/cn.ts`. */
if (typeof process !== 'undefined' && process.argv[1]?.endsWith('cn.ts')) {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) throw new Error(msg);
  };
  assert(cn('text-fg text-2xs') === 'text-fg text-2xs', 'size must not drop colour');
  assert(cn('text-sm text-2xs') === 'text-2xs', 'sizes merge');
  assert(cn('shadow-card shadow-pop') === 'shadow-pop', 'shadows merge');
  console.log('cn ok');
}

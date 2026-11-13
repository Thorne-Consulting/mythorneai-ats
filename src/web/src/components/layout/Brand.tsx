import Link from 'next/link';
import { cn } from '@/lib/cn';

/** MyThorneAI ATS lockup: round mark, two-tone wordmark, tagline. Sits on the navy chrome. */
export function Brand({ compact, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      href="/"
      aria-label="MyThorneAI ATS home"
      className={cn('flex shrink-0 items-center gap-2.5', className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/mark.png" alt="" width={40} height={40} className="size-10 rounded-full" />
      {!compact && (
        <span className="leading-none">
          <span className="block text-[22px] font-bold tracking-[-0.02em]">
            <span className="text-logo-blue">MyThorneAI</span>{' '}
            <span className="text-brand">ATS</span>
          </span>
          <span className="mt-1 block text-[11px] font-medium text-nav-foreground">
            Smarter Hiring. Brighter Futures.
          </span>
        </span>
      )}
    </Link>
  );
}

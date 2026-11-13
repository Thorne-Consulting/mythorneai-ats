'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';
import { useCompany } from './public-api';

/**
 * Chrome for applicant-facing pages (careers site, candidate portal): navy bar with the brand mark
 * and company name, a footer, max-width content. No workspace shell.
 */
export function PublicFrame({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const company = useCompany();
  const pathname = usePathname();
  const links = [
    { href: '/careers', label: 'Open jobs' },
    { href: '/candidate-portal', label: 'Candidate portal', short: 'Portal' },
  ];
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="bg-chrome">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/careers"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-md focus-visible:ring-2 focus-visible:ring-nav-foreground focus-visible:outline-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/mark.png"
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 rounded-full"
            />
            <span className="truncate text-md font-semibold text-white">
              {company ?? 'Careers'}
            </span>
          </Link>
          <nav aria-label="Site" className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-sm font-medium text-nav-foreground transition-colors hover:bg-nav-hover hover:text-white focus-visible:ring-2 focus-visible:ring-nav-foreground focus-visible:outline-none',
                    active && 'bg-nav-hover text-white',
                  )}
                >
                  {link.short ? (
                    <>
                      <span className="sm:hidden">{link.short}</span>
                      <span className="hidden sm:inline">{link.label}</span>
                    </>
                  ) : (
                    link.label
                  )}
                </Link>
              );
            })}
            {action}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-fg-subtle sm:px-6">
          <p>
            © {new Date().getFullYear()} {company ?? 'MyThorneAI ATS'}
          </p>
          <p>Powered by MyThorneAI ATS</p>
        </div>
      </footer>
    </div>
  );
}

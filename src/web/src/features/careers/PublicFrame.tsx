'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/cn';
import { brandStyle, socialName, type PublicBrand } from './brand';
import { captureSource } from './source';

type Brand = { company: string; brand: PublicBrand };
const BrandContext = createContext<Brand>({ company: '', brand: {} });

/** The employer's name and brand, for public pages under `PublicFrame` (also live in the settings preview). */
export const useBrand = () => useContext(BrandContext);

/** The message the careers settings page posts into its preview frame. */
export type PreviewMessage = { type: 'careers-preview'; company: string; brand: PublicBrand };

/**
 * The employer's logo: the wide logo when there is one (with its dark-mode version), else the
 * square icon or the first letter, beside the name.
 */
export function BrandMark({
  company,
  brand,
  className,
}: {
  company: string;
  brand: PublicBrand;
  className?: string;
}) {
  const name = company.trim() || 'Careers';
  const mark = (
    <span className="flex min-w-0 items-center gap-2.5">
      {brand.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- uploaded images of any size
        <img src={brand.iconUrl} alt="" className="size-8 shrink-0 rounded-lg object-cover" />
      ) : (
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-md font-bold text-primary-foreground"
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate text-md font-semibold text-fg">{name}</span>
    </span>
  );
  if (!brand.logoUrl) return <span className={cn('flex min-w-0', className)}>{mark}</span>;
  return (
    <span className={cn('flex min-w-0 items-center', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={brand.logoUrl}
        alt={name}
        className={cn('h-8 w-auto max-w-[180px] object-contain', 'dark:hidden')}
      />
      {brand.logoDarkUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={brand.logoDarkUrl}
          alt={name}
          className="hidden h-8 w-auto max-w-[180px] object-contain dark:block"
        />
      ) : (
        <span className="hidden min-w-0 dark:flex">{mark}</span>
      )}
    </span>
  );
}

/**
 * Chrome for applicant-facing pages (careers site, candidate portal): the employer's logo, a
 * footer with their links, max-width content, and their colour on buttons. No workspace shell.
 * `company` and `brand` come from the server. Inside the careers settings preview (`?preview=1`
 * in a frame) the settings page sends the brand being edited.
 */
export function PublicFrame({
  children,
  action,
  company,
  brand,
  footer,
  nav,
  tabBar,
}: {
  children: ReactNode;
  action?: ReactNode;
  company?: string | null;
  brand?: PublicBrand | null;
  /** Replaces the default "Open jobs" and "Candidate portal" links (the signed-in portal). */
  nav?: ReactNode;
  /** Room under the footer on phones for a bottom tab bar. */
  tabBar?: boolean;
  /** Extra links in the footer, for example the portal's "Need help?". */
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  // `?embed=1`: the job list inside the employer's own website, without our header and footer.
  const embed = params.get('embed') === '1';
  const preview = params.get('preview') === '1';
  const [draft, setDraft] = useState<Brand | null>(null);
  useEffect(() => captureSource(window.location.search), []);
  useEffect(() => {
    if (!preview || window.parent === window) return;
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'careers-preview') return;
      setDraft({ company: event.data.company, brand: event.data.brand });
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'careers-preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMessage);
  }, [preview]);

  const value: Brand = draft ?? { company: company?.trim() ?? '', brand: brand ?? {} };
  const style = brandStyle(value.brand.brandColor);
  if (embed)
    return (
      <BrandContext.Provider value={value}>
        <main style={style} className="min-h-dvh w-full bg-background px-4 py-4 sm:px-6">
          {children}
        </main>
      </BrandContext.Provider>
    );
  const links = [
    { href: '/careers', label: 'Open jobs' },
    { href: '/candidate-portal', label: 'Candidate portal', short: 'Portal' },
  ];
  const external = [
    ...(value.brand.websiteUrl ? [{ href: value.brand.websiteUrl, label: 'Website' }] : []),
    ...(value.brand.socialUrls ?? []).map((href) => ({ href, label: socialName(href) })),
  ];
  return (
    <BrandContext.Provider value={value}>
      <div style={style} className="flex min-h-dvh flex-col bg-background">
        <header className="border-b border-border-subtle bg-card">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
            <Link
              href="/careers"
              className="flex min-w-0 flex-1 items-center rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <BrandMark company={value.company} brand={value.brand} />
            </Link>
            {nav ?? (
              <nav aria-label="Site" className="flex shrink-0 items-center gap-1">
                {links.map((link) => {
                  const active = pathname.startsWith(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-fg-muted transition-colors hover:bg-secondary hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        active && 'bg-secondary text-fg',
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
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
        <footer className={cn('border-t border-border-subtle', tabBar && 'pb-16 sm:pb-0')}>
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-xs text-fg-subtle sm:px-6">
            {external.length > 0 && (
              <ul className="flex flex-wrap gap-x-4 gap-y-2">
                {external.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-fg-muted hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {link.label}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <p>
                © {new Date().getFullYear()} {value.company || 'MyThorneAI ATS'}
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {footer}
                <p>Powered by MyThorneAI ATS</p>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </BrandContext.Provider>
  );
}

import type { ReactNode } from 'react';
import { RichText } from '@/components/rich-text';
import { cn } from '@/lib/cn';

/**
 * An offer letter as a document: the company and date on top, the letter, then anything the page
 * adds (for example who accepted it). It is the part that prints when someone saves it as a PDF.
 */
export function LetterPaper({
  markdown,
  company,
  date,
  footer,
  className,
}: {
  markdown: string;
  company?: string | null;
  /** Shown top right, for example the day it was sent. */
  date?: string | null;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        'print-region rounded-xl border border-border bg-card px-6 py-8 shadow-card sm:px-10 sm:py-10',
        className,
      )}
    >
      {(company || date) && (
        <header className="mb-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border-subtle pb-4">
          {company && <p className="text-lg font-semibold text-fg">{company}</p>}
          {date && <p className="text-sm text-fg-subtle">{date}</p>}
        </header>
      )}
      <RichText markdown={markdown} className="text-md leading-relaxed text-fg" />
      {footer && <footer className="mt-8 border-t border-border-subtle pt-4">{footer}</footer>}
    </article>
  );
}

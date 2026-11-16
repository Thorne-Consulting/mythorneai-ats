'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { CodeMirrorFieldProps } from './CodeMirrorField';

// CodeMirror needs the browser; it loads on first use so other pages never pay for it.
const Field = dynamic(() => import('./CodeMirrorField'), {
  ssr: false,
  loading: () => <Skeleton className="h-40 rounded-none" />,
});

/** The code editor for code questions: highlighting, line numbers, Tab indents. Read-only for reviewers. */
export function CodeEditor({ className, ...props }: CodeMirrorFieldProps & { className?: string }) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-input bg-card transition-colors',
        !props.readOnly &&
          'focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/30',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border-subtle bg-muted px-3 py-1.5">
        <span className="text-2xs font-medium text-fg-subtle">
          {props.language || 'Plain text'}
        </span>
        {!props.readOnly && (
          <span className="hidden text-2xs text-fg-subtle sm:inline">
            Tab indents. Press Esc, then Tab, to leave the editor.
          </span>
        )}
      </div>
      <Field {...props} />
    </div>
  );
}

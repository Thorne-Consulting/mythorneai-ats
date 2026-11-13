'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
type ToastItem = { id: number; tone: ToastTone; title: ReactNode; message?: ReactNode };

// ponytail: module-level store, one Toaster per app. Upgrade to context if we ever need two.
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(tone: ToastTone, title: ReactNode, message?: ReactNode, duration = 5000) {
  const id = nextId++;
  items = [...items.slice(-2), { id, tone, title, message }]; // at most 3 on screen
  emit();
  if (duration > 0) setTimeout(() => dismiss(id), duration);
  return id;
}
function dismiss(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

/**
 * Show a transient message.
 *   toast.success('Saved')
 *   toast.error('Could not move the job', error.message)
 */
export const toast = Object.assign(
  (title: ReactNode, message?: ReactNode) => push('info', title, message),
  {
    success: (title: ReactNode, message?: ReactNode) => push('success', title, message),
    error: (title: ReactNode, message?: ReactNode) => push('error', title, message, 8000),
    warning: (title: ReactNode, message?: ReactNode) => push('warning', title, message),
    info: (title: ReactNode, message?: ReactNode) => push('info', title, message),
    dismiss,
  },
);

const icons = {
  success: <CheckCircle2 className="size-5 text-tone-green-dot" />,
  error: <XCircle className="size-5 text-tone-red-dot" />,
  warning: <AlertTriangle className="size-5 text-tone-amber-dot" />,
  info: <Info className="size-5 text-tone-blue-dot" />,
};

/** Mount once (in Providers). */
export function Toaster() {
  const list = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => items,
    () => items,
  );
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {list.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-popover px-4 py-3 shadow-pop animate-in',
          )}
        >
          <span className="mt-px shrink-0">{icons[t.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-medium text-fg">{t.title}</p>
            {t.message && <p className="mt-0.5 text-sm text-fg-muted">{t.message}</p>}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(t.id)}
            className="-m-1 rounded-sm p-1 text-fg-subtle hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

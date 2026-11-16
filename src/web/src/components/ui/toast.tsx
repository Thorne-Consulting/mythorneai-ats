'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info' | 'warning';
type ToastAction = { label: string; onClick: () => void };
/** Optional extras: a button such as Undo (clicking it closes the toast), and how long it stays. */
export type ToastOptions = { action?: ToastAction; duration?: number };
type ToastItem = {
  id: number;
  tone: ToastTone;
  title: ReactNode;
  message?: ReactNode;
  action?: ToastAction;
};

// ponytail: module-level store, one Toaster per app. Upgrade to context if we ever need two.
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(
  tone: ToastTone,
  title: ReactNode,
  message?: ReactNode,
  fallbackDuration = 5000,
  options?: ToastOptions,
) {
  const id = nextId++;
  const duration = options?.duration ?? fallbackDuration;
  items = [...items.slice(-2), { id, tone, title, message, action: options?.action }]; // at most 3 on screen
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
 *   toast.success('Moved to Review', undefined, { action: { label: 'Undo', onClick: undo }, duration: 10000 })
 */
export const toast = Object.assign(
  (title: ReactNode, message?: ReactNode, options?: ToastOptions) =>
    push('info', title, message, 5000, options),
  {
    success: (title: ReactNode, message?: ReactNode, options?: ToastOptions) =>
      push('success', title, message, 5000, options),
    error: (title: ReactNode, message?: ReactNode, options?: ToastOptions) =>
      push('error', title, message, 8000, options),
    warning: (title: ReactNode, message?: ReactNode, options?: ToastOptions) =>
      push('warning', title, message, 5000, options),
    info: (title: ReactNode, message?: ReactNode, options?: ToastOptions) =>
      push('info', title, message, 5000, options),
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
          {t.action && (
            <button
              type="button"
              onClick={() => {
                dismiss(t.id);
                t.action!.onClick();
              }}
              className="-my-0.5 shrink-0 rounded-md px-2 py-0.5 text-sm font-semibold text-accent-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {t.action.label}
            </button>
          )}
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

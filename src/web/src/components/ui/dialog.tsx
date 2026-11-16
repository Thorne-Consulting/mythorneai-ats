'use client';

import { useState, type ReactNode } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, type ButtonVariant } from './button';

const overlay =
  'fixed inset-0 z-50 bg-[rgb(7_22_56/0.45)] backdrop-blur-[2px] data-[state=open]:animate-[overlay-in_160ms_ease-out]';

const sizes = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  full: 'max-w-[calc(100vw-2rem)]',
};

export type ModalProps = {
  opened: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Footer buttons, right aligned. */
  footer?: ReactNode;
  size?: keyof typeof sizes;
  children?: ReactNode;
  className?: string;
  /** Block closing on outside click / Escape (e.g. while saving). */
  dismissable?: boolean;
};

/** Centred dialog. Title + optional description up top, scrolling body, sticky footer. */
export function Modal({
  opened,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  children,
  className,
  dismissable = true,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={opened} onOpenChange={(o) => !o && dismissable && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-border bg-card shadow-pop outline-none data-[state=open]:animate-in',
            sizes[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-xl font-semibold text-fg">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-base text-fg-subtle">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {typeof title === 'string' ? title : 'Dialog'}
                </DialogPrimitive.Description>
              )}
            </div>
            {dismissable && (
              <DialogPrimitive.Close
                className="-mr-2 rounded-md p-1.5 text-fg-subtle hover:bg-secondary hover:text-fg"
                aria-label="Close"
              >
                <X className="size-5" />
              </DialogPrimitive.Close>
            )}
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">{children}</div>}
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Side panel that slides in from the right. Same props as Modal. */
export function Drawer({
  opened,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  children,
  className,
}: ModalProps) {
  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-full',
  };
  return (
    <DialogPrimitive.Root open={opened} onOpenChange={(o) => !o && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-pop outline-none data-[state=open]:animate-[sheet-in_220ms_cubic-bezier(0.16,1,0.3,1)]',
            widths[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-6 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-xl font-semibold text-fg">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-base text-fg-subtle">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {typeof title === 'string' ? title : 'Panel'}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="-mr-2 rounded-md p-1.5 text-fg-subtle hover:bg-secondary hover:text-fg"
              aria-label="Close"
            >
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <div className="flex items-center justify-end gap-2 border-t border-border-subtle px-6 py-4">
              {footer}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Ask before a destructive or irreversible action. `onConfirm` may be async; the button spins. */
export function ConfirmDialog({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'danger',
}: {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: ButtonVariant;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size="sm"
      dismissable={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message && <div className="text-base text-fg-muted">{message}</div>}
    </Modal>
  );
}

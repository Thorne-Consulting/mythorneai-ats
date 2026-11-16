'use client';

import { createContext, useContext, useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type FieldProps = {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Figma text field: label sits inside the bordered box above the value. */
  inset?: boolean;
  className?: string;
};

type FieldCtx = { id: string; describedBy?: string; invalid: boolean; inset: boolean };
const Ctx = createContext<FieldCtx | null>(null);
export const useField = () => useContext(Ctx);

/** Border, radius, focus ring and disabled look shared by every boxed control. */
export const boxClasses =
  'rounded-md border border-input bg-card text-fg transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 has-[:disabled]:bg-muted has-[:disabled]:opacity-65 aria-invalid:border-destructive';

export function Label({
  htmlFor,
  required,
  className,
  children,
}: {
  htmlFor?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cn('block text-sm font-medium text-fg', className)}>
      {children}
      {required && (
        <span className="ml-0.5 text-destructive" aria-hidden>
          *
        </span>
      )}
    </label>
  );
}

/**
 * Wraps a control with label, description and error, and wires ids/aria for it.
 * Controls read the context with `useField()`, so you rarely use this directly:
 * pass `label`, `description` and `error` straight to Input, Select, Textarea...
 */
export function Field({
  label,
  description,
  error,
  required,
  inset = false,
  className,
  id: idProp,
  children,
}: FieldProps & { id?: string; children: ReactNode }) {
  const auto = useId();
  const id = idProp ?? auto;
  const descId = description ? `${id}-desc` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [descId, errId].filter(Boolean).join(' ') || undefined;
  const useInset = inset && !!label;
  return (
    <Ctx.Provider value={{ id, describedBy, invalid: !!error, inset: useInset }}>
      <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
        {label && !useInset && (
          <Label htmlFor={id} required={required}>
            {label}
          </Label>
        )}
        {useInset ? (
          <InsetLabel label={label} required={required}>
            {children}
          </InsetLabel>
        ) : (
          children
        )}
        {description && !error && (
          <p id={descId} className="text-xs text-fg-subtle">
            {description}
          </p>
        )}
        {error && (
          <p id={errId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </Ctx.Provider>
  );
}

// The inset label is rendered by the control itself (inside its box); this only passes it down.
const InsetCtx = createContext<{ label: ReactNode; required?: boolean } | null>(null);
function InsetLabel({
  label,
  required,
  children,
}: {
  label: ReactNode;
  required?: boolean;
  children: ReactNode;
}) {
  return <InsetCtx.Provider value={{ label, required }}>{children}</InsetCtx.Provider>;
}
export function useInsetLabel() {
  return useContext(InsetCtx);
}

/** The small label drawn inside a boxed control when `inset` is on. */
export function InsetLabelText({ htmlFor }: { htmlFor?: string }) {
  const inset = useInsetLabel();
  if (!inset) return null;
  return (
    <label htmlFor={htmlFor} className="block text-xs leading-tight text-fg-subtle">
      {inset.label}
      {inset.required && <span className="ml-0.5 text-destructive">*</span>}
    </label>
  );
}

/** Group of related controls (checkbox list, radio group) with a legend. */
export function Fieldset({
  legend,
  description,
  className,
  children,
}: {
  legend?: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className={cn('min-w-0 space-y-2.5', className)}>
      {legend && <legend className="mb-1 text-sm font-medium text-fg">{legend}</legend>}
      {description && <p className="-mt-1 text-xs text-fg-subtle">{description}</p>}
      {children}
    </fieldset>
  );
}

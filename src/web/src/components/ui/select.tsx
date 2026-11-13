'use client';

import { forwardRef, type ReactNode } from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Field, InsetLabelText, boxClasses, useField, type FieldProps } from './field';
import { toOptions, type OptionData } from './options';

export type SelectProps = FieldProps & {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  data: OptionData;
  placeholder?: string;
  /** Show an × to reset to null. */
  clearable?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  leftSection?: ReactNode;
  id?: string;
  'aria-label'?: string;
};

/** Pick one option. Pass `label` for a labelled field; `inset` for the Figma inside-the-box label. */
export function Select({
  label,
  description,
  error,
  required,
  inset,
  className,
  id,
  ...props
}: SelectProps) {
  if (!label && !description && !error)
    return <SelectBox id={id} className={className} {...props} />;
  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      inset={inset}
      className={className}
      id={id}
    >
      <SelectBox {...props} />
    </Field>
  );
}

const SelectBox = forwardRef<
  HTMLButtonElement,
  Omit<SelectProps, keyof FieldProps> & { className?: string }
>(function SelectBox(
  {
    value,
    onChange,
    data,
    placeholder = 'Select…',
    clearable,
    disabled,
    size = 'md',
    leftSection,
    className,
    id,
    ...rest
  },
  ref,
) {
  const field = useField();
  const options = toOptions(data);
  const groups = [...new Set(options.map((o) => o.group ?? ''))];
  const triggerId = id ?? field?.id;
  return (
    <SelectPrimitive.Root
      value={value ?? ''}
      onValueChange={(v) => onChange(v || null)}
      disabled={disabled}
    >
      <div
        aria-invalid={field?.invalid || undefined}
        className={cn(
          boxClasses,
          'relative flex w-full items-center gap-2 px-3',
          field?.inset ? 'min-h-14 py-2' : size === 'sm' ? 'h-8' : 'h-[38px]',
          className,
        )}
      >
        {leftSection && (
          <span className="flex shrink-0 text-fg-subtle [&_svg]:size-4">{leftSection}</span>
        )}
        <div className="min-w-0 flex-1">
          <InsetLabelText htmlFor={triggerId} />
          <SelectPrimitive.Trigger
            ref={ref}
            id={triggerId}
            aria-describedby={field?.describedBy}
            aria-label={rest['aria-label']}
            className={cn(
              'flex w-full min-w-0 items-center justify-between gap-2 bg-transparent text-left text-base text-fg outline-none data-[placeholder]:text-fg-subtle disabled:cursor-not-allowed',
              size === 'sm' && !field?.inset && 'text-sm',
              // the box draws the focus ring
              'focus-visible:outline-none',
            )}
          >
            <span className="truncate">
              {/* Render the label ourselves: Radix only fills Value after the list has mounted. */}
              <SelectPrimitive.Value placeholder={placeholder}>
                {options.find((o) => o.value === value)?.label}
              </SelectPrimitive.Value>
            </span>
            <SelectPrimitive.Icon asChild>
              <ChevronDown
                className={cn('size-4 shrink-0 text-fg-subtle', clearable && value && 'invisible')}
              />
            </SelectPrimitive.Icon>
          </SelectPrimitive.Trigger>
        </div>
        {clearable && value && !disabled && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => onChange(null)}
            className="absolute right-2.5 rounded-sm p-0.5 text-fg-subtle hover:bg-secondary hover:text-fg"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-[min(var(--radix-select-content-available-height),320px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-pop data-[state=open]:animate-in"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {groups.map((group) => (
              <SelectPrimitive.Group key={group}>
                {group && (
                  <SelectPrimitive.Label className="px-3 pt-2 pb-1 text-2xs font-medium uppercase tracking-wide text-fg-subtle">
                    {group}
                  </SelectPrimitive.Label>
                )}
                {options
                  .filter((o) => (o.group ?? '') === group)
                  .map((o) => (
                    <SelectPrimitive.Item
                      key={o.value}
                      value={o.value}
                      disabled={o.disabled}
                      className="relative flex h-9 cursor-pointer select-none items-center gap-2 rounded-md pr-8 pl-3 text-base text-fg-muted outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-fg data-[state=checked]:font-medium data-[state=checked]:text-fg"
                    >
                      <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                      <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                        <Check className="size-4 text-primary" />
                      </SelectPrimitive.ItemIndicator>
                    </SelectPrimitive.Item>
                  ))}
              </SelectPrimitive.Group>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
});

/**
 * Compact filter dropdown used in toolbars: "⌄ All departments". Looks like a secondary button.
 * `allLabel` is shown when the value is null.
 */
export function FilterSelect({
  value,
  onChange,
  data,
  allLabel,
  className,
  'aria-label': ariaLabel,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  data: OptionData;
  allLabel: string;
  className?: string;
  'aria-label'?: string;
}) {
  const ALL = '__all__';
  const options = toOptions(data);
  return (
    <SelectPrimitive.Root
      value={value ?? ALL}
      onValueChange={(v) => onChange(v === ALL ? null : v)}
    >
      <SelectPrimitive.Trigger
        aria-label={ariaLabel ?? allLabel}
        className={cn(
          'inline-flex h-[38px] items-center gap-2 rounded-md border border-border bg-card px-3 text-base font-medium text-fg-muted transition-colors hover:bg-accent hover:text-fg data-[state=open]:border-primary',
          value && 'border-primary/40 bg-accent text-accent-foreground',
          className,
        )}
      >
        <ChevronDown className="size-4" aria-hidden />
        <SelectPrimitive.Value>
          {options.find((o) => o.value === value)?.label ?? allLabel}
        </SelectPrimitive.Value>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-80 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-popover shadow-pop data-[state=open]:animate-in"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {[{ value: ALL, label: allLabel }, ...options].map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="relative flex h-9 cursor-pointer select-none items-center rounded-md pr-8 pl-3 text-base text-fg-muted outline-none data-[highlighted]:bg-accent data-[highlighted]:text-fg data-[state=checked]:font-medium data-[state=checked]:text-fg"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <Check className="size-4 text-primary" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

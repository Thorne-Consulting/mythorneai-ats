'use client';

import { useId, type ReactNode } from 'react';
import {
  Checkbox as CheckboxPrimitive,
  RadioGroup as RadioPrimitive,
  Switch as SwitchPrimitive,
} from 'radix-ui';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';

type ChoiceProps = {
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
};

function ChoiceLabel({
  id,
  label,
  description,
  disabled,
}: {
  id: string;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  if (!label && !description) return null;
  return (
    <span className={cn('min-w-0', disabled && 'opacity-60')}>
      {label && (
        <label htmlFor={id} className="block cursor-pointer text-base leading-snug text-fg">
          {label}
        </label>
      )}
      {description && <span className="mt-0.5 block text-xs text-fg-subtle">{description}</span>}
    </span>
  );
}

export type CheckboxProps = ChoiceProps & {
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
  'aria-label'?: string;
};

/** Figma checkbox: 14px, 3px radius, primary when checked. Supports indeterminate. */
export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
  id: idProp,
  ...rest
}: CheckboxProps) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <span className={cn('flex w-fit items-start gap-2.5', className)}>
      <CheckboxPrimitive.Root
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-label={rest['aria-label']}
        className="peer relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-control bg-card text-primary-foreground transition-colors hover:border-primary data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary disabled:cursor-not-allowed disabled:border-border disabled:bg-secondary"
      >
        <CheckboxPrimitive.Indicator>
          {checked === 'indeterminate' ? (
            <Minus className="size-3" strokeWidth={3} />
          ) : (
            <Check className="size-3" strokeWidth={3} />
          )}
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <ChoiceLabel id={id} label={label} description={description} disabled={disabled} />
    </span>
  );
}

export type RadioOption = {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export function RadioGroup({
  value,
  onValueChange,
  options,
  orientation = 'vertical',
  className,
  'aria-label': ariaLabel,
}: {
  value: string | null;
  onValueChange: (value: string) => void;
  options: RadioOption[];
  orientation?: 'vertical' | 'horizontal';
  className?: string;
  'aria-label'?: string;
}) {
  const base = useId();
  return (
    <RadioPrimitive.Root
      value={value ?? undefined}
      onValueChange={onValueChange}
      orientation={orientation}
      aria-label={ariaLabel}
      className={cn(
        'flex gap-3',
        orientation === 'vertical' ? 'flex-col' : 'flex-row flex-wrap gap-5',
        className,
      )}
    >
      {options.map((opt) => {
        const id = `${base}-${opt.value}`;
        return (
          <span key={opt.value} className="inline-flex items-start gap-2.5">
            <RadioPrimitive.Item
              id={id}
              value={opt.value}
              disabled={opt.disabled}
              className="relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-control bg-card transition-colors hover:border-primary data-[state=checked]:border-primary disabled:cursor-not-allowed disabled:bg-secondary"
            >
              <RadioPrimitive.Indicator className="size-2 rounded-full bg-primary" />
            </RadioPrimitive.Item>
            <ChoiceLabel
              id={id}
              label={opt.label}
              description={opt.description}
              disabled={opt.disabled}
            />
          </span>
        );
      })}
    </RadioPrimitive.Root>
  );
}

export type SwitchProps = ChoiceProps & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
  /** Label on the left, switch on the right (settings rows). */
  labelPosition?: 'left' | 'right';
  'aria-label'?: string;
};

/** Figma switch: 36×21 track, 15px thumb, primary when on. */
export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  size = 'md',
  labelPosition = 'right',
  className,
  id: idProp,
  ...rest
}: SwitchProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const control = (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={rest['aria-label']}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full bg-switch-off p-[3px] transition-colors data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-[21px] w-9' : 'h-4 w-7 p-0.5',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block rounded-full bg-white shadow-sm transition-transform',
          size === 'md'
            ? 'size-[15px] data-[state=checked]:translate-x-[15px]'
            : 'size-3 data-[state=checked]:translate-x-3',
        )}
      />
    </SwitchPrimitive.Root>
  );
  return (
    <span
      className={cn(
        'flex items-start gap-3',
        labelPosition === 'left' ? 'w-full justify-between' : 'w-fit',
        className,
      )}
    >
      {labelPosition === 'left' && (
        <ChoiceLabel id={id} label={label} description={description} disabled={disabled} />
      )}
      <span className="pt-px">{control}</span>
      {labelPosition === 'right' && (
        <ChoiceLabel id={id} label={label} description={description} disabled={disabled} />
      )}
    </span>
  );
}

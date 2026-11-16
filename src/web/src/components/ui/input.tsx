'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Field, InsetLabelText, boxClasses, useField, type FieldProps } from './field';

type Sections = { leftSection?: ReactNode; rightSection?: ReactNode };

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  FieldProps &
  Sections & { size?: 'sm' | 'md'; inputClassName?: string };

/** A bare boxed input. Use `Input` (with label props) unless you build your own Field. */
export const InputBox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
    Sections & { size?: 'sm' | 'md'; boxClassName?: string }
>(function InputBox(
  { leftSection, rightSection, size = 'md', className, boxClassName, id, ...props },
  ref,
) {
  const field = useField();
  const inset = field?.inset;
  const inputId = id ?? field?.id;
  return (
    <div
      aria-invalid={field?.invalid || undefined}
      className={cn(
        boxClasses,
        'flex w-full items-center gap-2 px-3',
        inset ? 'min-h-14 py-2' : size === 'sm' ? 'h-8' : 'h-[38px]',
        boxClassName,
      )}
    >
      {leftSection && (
        <span className="flex shrink-0 items-center text-fg-subtle [&_svg]:size-[17px]">
          {leftSection}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <InsetLabelText htmlFor={inputId} />
        <input
          ref={ref}
          id={inputId}
          aria-describedby={field?.describedBy}
          aria-invalid={field?.invalid || undefined}
          className={cn(
            'w-full min-w-0 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed',
            size === 'sm' && !inset && 'text-sm',
            className,
          )}
          {...props}
        />
      </div>
      {rightSection && (
        <span className="flex shrink-0 items-center text-fg-subtle [&_svg]:size-4">
          {rightSection}
        </span>
      )}
    </div>
  );
});

/** Text input. Pass `label` for a labelled field; `inset` puts the label inside the box (Figma). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, description, error, required, inset, className, inputClassName, ...props },
  ref,
) {
  if (!label && !description && !error)
    return (
      <InputBox
        ref={ref}
        required={required}
        className={inputClassName}
        boxClassName={className}
        {...props}
      />
    );
  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      inset={inset}
      className={className}
      id={props.id}
    >
      <InputBox ref={ref} required={required} className={inputClassName} {...props} />
    </Field>
  );
});

/** Search box with magnifier and optional clear button. Figma: 38px, 7px radius. */
export const SearchInput = forwardRef<
  HTMLInputElement,
  Omit<InputProps, 'leftSection' | 'onChange'> & {
    value: string;
    onValueChange: (value: string) => void;
  }
>(function SearchInput({ value, onValueChange, className, placeholder = 'Search', ...props }, ref) {
  return (
    <Input
      ref={ref}
      type="search"
      role="searchbox"
      aria-label={typeof placeholder === 'string' ? placeholder : 'Search'}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onValueChange(e.currentTarget.value)}
      leftSection={<Search />}
      rightSection={
        value ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onValueChange('')}
            className="rounded-sm p-0.5 hover:bg-secondary hover:text-fg"
          >
            <X />
          </button>
        ) : null
      }
      className={className}
      inputClassName="[&::-webkit-search-cancel-button]:hidden"
      {...props}
    />
  );
});

export type NumberInputProps = Omit<InputProps, 'value' | 'onChange' | 'type'> & {
  value: number | '' | null | undefined;
  onValueChange: (value: number | '') => void;
};

/** Numeric input. Empty is `''`, never NaN. */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, ...props },
  ref,
) {
  return (
    <Input
      ref={ref}
      type="number"
      inputMode="decimal"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.currentTarget.value;
        onValueChange(raw === '' ? '' : Number(raw));
      }}
      inputClassName="tnum [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      {...props}
    />
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  Omit<FieldProps, 'inset'> & {
    autosize?: boolean;
    minRows?: number;
    maxRows?: number;
    textareaClassName?: string;
  };

/** Multi-line input. Grows with content by default (`autosize`). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    description,
    error,
    required,
    autosize = true,
    minRows = 3,
    maxRows = 16,
    className,
    textareaClassName,
    onChange,
    ...props
  },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => inner.current as HTMLTextAreaElement);
  const resize = () => {
    const el = inner.current;
    if (!el || !autosize) return;
    const line = parseFloat(getComputedStyle(el).lineHeight) || 21;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minRows * line + 16), maxRows * line + 16)}px`;
  };
  useEffect(resize, [props.value, autosize, minRows, maxRows]); // eslint-disable-line react-hooks/exhaustive-deps
  const control = (fieldId?: string, describedBy?: string, invalid?: boolean) => (
    <textarea
      ref={inner}
      id={props.id ?? fieldId}
      rows={minRows}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      required={required}
      onChange={(e) => {
        onChange?.(e);
        resize();
      }}
      className={cn(
        boxClasses,
        'block w-full resize-y px-3 py-2 text-base leading-normal outline-none placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-65 aria-invalid:border-destructive',
        autosize && 'resize-none',
        textareaClassName,
      )}
      {...props}
    />
  );
  if (!label && !description && !error) return <div className={className}>{control()}</div>;
  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
      id={props.id}
    >
      <FieldTextarea render={control} />
    </Field>
  );
});

function FieldTextarea({
  render,
}: {
  render: (id?: string, describedBy?: string, invalid?: boolean) => ReactNode;
}) {
  const field = useField();
  return <>{render(field?.id, field?.describedBy, field?.invalid)}</>;
}

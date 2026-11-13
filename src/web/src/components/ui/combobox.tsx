'use client';

import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Field, boxClasses, useField, type FieldProps } from './field';
import { optionText, toOptions, type Option, type OptionData } from './options';

/** Shared list + keyboard handling for the search-as-you-type controls below. */
function useList(options: Option[], query: string, onPick: (o: Option) => void) {
  const [active, setActive] = useState(0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => optionText(o).toLowerCase().includes(q)) : options;
  }, [options, query]);
  const onKeyDown = (e: KeyboardEvent, open: boolean, setOpen: (v: boolean) => void) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && open && filtered[active]) {
      e.preventDefault();
      onPick(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };
  return { filtered, active, setActive, onKeyDown };
}

function OptionList({
  filtered,
  active,
  setActive,
  isSelected,
  onPick,
  empty,
  listId,
}: {
  filtered: Option[];
  active: number;
  setActive: (i: number) => void;
  isSelected: (o: Option) => boolean;
  onPick: (o: Option) => void;
  empty: ReactNode;
  listId: string;
}) {
  return (
    <div id={listId} role="listbox" className="max-h-72 overflow-y-auto p-1.5">
      {filtered.length === 0 ? (
        <p className="px-3 py-2 text-sm text-fg-subtle">{empty}</p>
      ) : (
        filtered.map((o, i) => (
          <div
            key={o.value}
            role="option"
            aria-selected={isSelected(o)}
            aria-disabled={o.disabled || undefined}
            onMouseEnter={() => setActive(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => !o.disabled && onPick(o)}
            className={cn(
              'flex h-9 cursor-pointer items-center justify-between gap-2 rounded-md px-3 text-base text-fg-muted',
              i === active && 'bg-accent text-fg',
              isSelected(o) && 'font-medium text-fg',
              o.disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <span className="truncate">{o.label}</span>
            {isSelected(o) && <Check className="size-4 shrink-0 text-primary" />}
          </div>
        ))
      )}
    </div>
  );
}

const contentClasses =
  'z-50 w-[var(--radix-popper-anchor-width)] overflow-hidden rounded-lg border border-border bg-popover shadow-pop data-[state=open]:animate-in';

function Chip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-sm bg-accent pr-1 pl-2 text-xs font-medium text-accent-foreground">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove"
        className="rounded-xs p-0.5 hover:bg-card/60"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

type MultiProps = FieldProps & {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  nothingFound?: ReactNode;
};

/** Pick several options from a list, with search. */
export function MultiSelect({
  data,
  label,
  description,
  error,
  required,
  className,
  id,
  ...props
}: MultiProps & { data: OptionData }) {
  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
      id={id}
    >
      <ChipsBox options={toOptions(data)} {...props} />
    </Field>
  );
}

/** Free-text tags, optionally with suggestions. Enter or comma adds a tag. */
export function TagsInput({
  data = [],
  label,
  description,
  error,
  required,
  className,
  id,
  ...props
}: MultiProps & { data?: OptionData }) {
  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
      id={id}
    >
      <ChipsBox options={toOptions(data)} creatable {...props} />
    </Field>
  );
}

function ChipsBox({
  options,
  value,
  onChange,
  placeholder,
  disabled,
  creatable,
  nothingFound = 'Nothing found',
}: Omit<MultiProps, keyof FieldProps> & { options: Option[]; creatable?: boolean }) {
  const field = useField();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const add = (v: string) => {
    const t = v.trim();
    if (t && !value.includes(t)) onChange([...value, t]);
    setQuery('');
  };
  const toggle = (o: Option) =>
    value.includes(o.value) ? onChange(value.filter((v) => v !== o.value)) : add(o.value);
  const list = useList(
    options.filter((o) => !creatable || !value.includes(o.value)),
    query,
    toggle,
  );
  const listId = `${field?.id}-list`;
  return (
    <PopoverPrimitive.Root
      open={open && (list.filtered.length > 0 || !creatable)}
      onOpenChange={setOpen}
    >
      <PopoverPrimitive.Anchor asChild>
        <div
          aria-invalid={field?.invalid || undefined}
          onClick={() => input.current?.focus()}
          className={cn(
            boxClasses,
            'flex min-h-[38px] w-full flex-wrap items-center gap-1.5 px-2 py-1.5',
          )}
        >
          {value.map((v) => (
            <Chip key={v} onRemove={() => onChange(value.filter((x) => x !== v))}>
              {labelOf(v)}
            </Chip>
          ))}
          <input
            ref={input}
            id={field?.id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-describedby={field?.describedBy}
            disabled={disabled}
            value={query}
            placeholder={value.length ? '' : placeholder}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setOpen(true);
              list.setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => creatable && add(query)}
            onKeyDown={(e) => {
              if (
                creatable &&
                (e.key === 'Enter' || e.key === ',') &&
                (!open || !list.filtered[list.active])
              ) {
                e.preventDefault();
                add(query);
                return;
              }
              if (e.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1));
              list.onKeyDown(e, open, setOpen);
            }}
            className="h-6 min-w-20 flex-1 bg-transparent px-1 text-base text-fg outline-none placeholder:text-fg-subtle"
          />
          {!creatable && (
            <ChevronDown className="mr-1 size-4 shrink-0 text-fg-subtle" aria-hidden />
          )}
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (e.target instanceof Node && input.current?.parentElement?.contains(e.target))
              e.preventDefault();
          }}
          className={contentClasses}
        >
          <OptionList
            listId={listId}
            filtered={list.filtered}
            active={list.active}
            setActive={list.setActive}
            isSelected={(o) => value.includes(o.value)}
            onPick={toggle}
            empty={nothingFound}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Text input with suggestions. The value is free text; picking a suggestion fills it in. */
export function Autocomplete({
  value,
  onChange,
  data,
  label,
  description,
  error,
  required,
  placeholder,
  className,
  id,
  leftSection,
  onOptionSubmit,
}: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  data: OptionData;
  placeholder?: string;
  id?: string;
  leftSection?: ReactNode;
  onOptionSubmit?: (value: string) => void;
}) {
  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
      id={id}
    >
      <AutocompleteBox
        value={value}
        onChange={onChange}
        options={toOptions(data)}
        placeholder={placeholder}
        leftSection={leftSection}
        onOptionSubmit={onOptionSubmit}
      />
    </Field>
  );
}

function AutocompleteBox({
  value,
  onChange,
  options,
  placeholder,
  leftSection,
  onOptionSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  leftSection?: ReactNode;
  onOptionSubmit?: (value: string) => void;
}) {
  const field = useField();
  const [open, setOpen] = useState(false);
  const pick = (o: Option) => {
    onChange(o.value);
    onOptionSubmit?.(o.value);
    setOpen(false);
  };
  const list = useList(options, value, pick);
  const listId = `${field?.id}-list`;
  return (
    <PopoverPrimitive.Root open={open && list.filtered.length > 0} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div
          aria-invalid={field?.invalid || undefined}
          className={cn(boxClasses, 'flex h-[38px] w-full items-center gap-2 px-3')}
        >
          {leftSection && (
            <span className="flex shrink-0 text-fg-subtle [&_svg]:size-4">{leftSection}</span>
          )}
          <input
            id={field?.id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-describedby={field?.describedBy}
            value={value}
            placeholder={placeholder}
            onChange={(e) => {
              onChange(e.currentTarget.value);
              setOpen(true);
              list.setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => list.onKeyDown(e, open, setOpen)}
            className="w-full min-w-0 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
          />
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={contentClasses}
        >
          <OptionList
            listId={listId}
            filtered={list.filtered}
            active={list.active}
            setActive={list.setActive}
            isSelected={(o) => o.value === value}
            onPick={pick}
            empty="No suggestions"
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/** Pick one option from a long list by typing (candidates, people, jobs). Value is an option value. */
export function SearchSelect({
  value,
  onChange,
  data,
  label,
  description,
  error,
  required,
  placeholder = 'Search…',
  className,
  id,
  nothingFound = 'Nothing found',
  disabled,
}: FieldProps & {
  value: string | null;
  onChange: (value: string | null) => void;
  data: OptionData;
  placeholder?: string;
  id?: string;
  nothingFound?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Field
      label={label}
      description={description}
      error={error}
      required={required}
      className={className}
      id={id}
    >
      <SearchSelectBox
        value={value}
        onChange={onChange}
        options={toOptions(data)}
        placeholder={placeholder}
        nothingFound={nothingFound}
        disabled={disabled}
      />
    </Field>
  );
}

function SearchSelectBox({
  value,
  onChange,
  options,
  placeholder,
  nothingFound,
  disabled,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  options: Option[];
  placeholder?: string;
  nothingFound: ReactNode;
  disabled?: boolean;
}) {
  const field = useField();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const selected = options.find((o) => o.value === value);
  const pick = (o: Option) => {
    onChange(o.value);
    setQuery('');
    setOpen(false);
  };
  const list = useList(options, query, pick);
  const listId = `${field?.id}-list`;
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div
          aria-invalid={field?.invalid || undefined}
          className={cn(boxClasses, 'flex h-[38px] w-full items-center gap-2 px-3')}
        >
          <input
            id={field?.id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-describedby={field?.describedBy}
            disabled={disabled}
            value={open ? query : selected ? optionText(selected) : ''}
            placeholder={selected ? optionText(selected) : placeholder}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setOpen(true);
              list.setActive(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              setOpen(false);
              setQuery('');
            }}
            onKeyDown={(e) => list.onKeyDown(e, open, setOpen)}
            className="w-full min-w-0 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
          />
          {value && !disabled ? (
            <button
              type="button"
              aria-label="Clear"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onChange(null)}
              className="rounded-sm p-0.5 text-fg-subtle hover:text-fg"
            >
              <X className="size-4" />
            </button>
          ) : (
            <ChevronDown className="size-4 shrink-0 text-fg-subtle" aria-hidden />
          )}
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={contentClasses}
        >
          <OptionList
            listId={listId}
            filtered={list.filtered}
            active={list.active}
            setActive={list.setActive}
            isSelected={(o) => o.value === value}
            onPick={pick}
            empty={nothingFound}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

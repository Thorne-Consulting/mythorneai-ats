'use client';

import type { ReactNode } from 'react';
import { Accordion as AccordionPrimitive, Collapsible as CollapsiblePrimitive } from 'radix-ui';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

type RootProps =
  | { type?: 'single'; value?: string; defaultValue?: string; onValueChange?: (v: string) => void }
  | {
      type: 'multiple';
      value?: string[];
      defaultValue?: string[];
      onValueChange?: (v: string[]) => void;
    };

/** Stack of disclosure items. Figma: 11px radius cards, 16px medium title, chevron right. */
export function Accordion({
  children,
  className,
  ...props
}: RootProps & { children: ReactNode; className?: string }) {
  const root =
    props.type === 'multiple' ? (
      <AccordionPrimitive.Root {...props} type="multiple" className={cn('space-y-3', className)}>
        {children}
      </AccordionPrimitive.Root>
    ) : (
      <AccordionPrimitive.Root
        {...props}
        type="single"
        collapsible
        className={cn('space-y-3', className)}
      >
        {children}
      </AccordionPrimitive.Root>
    );
  return root;
}

export function AccordionItem({
  value,
  title,
  description,
  actions,
  children,
  className,
}: {
  value: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AccordionPrimitive.Item
      value={value}
      className={cn('rounded-lg border border-border bg-card', className)}
    >
      <AccordionPrimitive.Header className="flex items-center gap-2 pr-3">
        <AccordionPrimitive.Trigger className="group flex flex-1 items-center justify-between gap-3 rounded-lg px-5 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="min-w-0">
            <span className="block text-md font-medium text-fg">{title}</span>
            {description && (
              <span className="mt-0.5 block text-sm text-fg-subtle">{description}</span>
            )}
          </span>
          <ChevronDown
            className="size-[18px] shrink-0 text-fg transition-transform group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </AccordionPrimitive.Trigger>
        {actions}
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden text-base text-fg-muted data-[state=closed]:animate-[collapse_160ms_ease-out] data-[state=open]:animate-[expand_200ms_ease-out]">
        <div className="px-5 pb-5">{children}</div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}

/** Show/hide one region with an animated height. */
export function Collapse({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <CollapsiblePrimitive.Root open={open}>
      <CollapsiblePrimitive.Content
        className={cn(
          'overflow-hidden data-[state=closed]:animate-[collapse-c_160ms_ease-out] data-[state=open]:animate-[expand-c_200ms_ease-out]',
          className,
        )}
      >
        {children}
      </CollapsiblePrimitive.Content>
    </CollapsiblePrimitive.Root>
  );
}

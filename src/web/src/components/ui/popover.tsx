'use client';

import type { ReactNode } from 'react';
import { Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import { cn } from '@/lib/cn';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export function PopoverContent({
  children,
  className,
  align = 'start',
  side,
  sideOffset = 6,
}: {
  children: ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-72 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-pop outline-none data-[state=open]:animate-in',
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

/** Mount once near the root so tooltips share one delay. */
export const TooltipProvider = TooltipPrimitive.Provider;

/** Short label on hover/focus. Wraps a single focusable child. */
export function Tooltip({
  label,
  children,
  side = 'top',
  disabled,
}: {
  label: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  disabled?: boolean;
}) {
  if (disabled || !label) return <>{children}</>;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-[60] max-w-xs rounded-md bg-chrome px-2.5 py-1.5 text-xs text-white shadow-pop data-[state=delayed-open]:animate-in"
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-chrome" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

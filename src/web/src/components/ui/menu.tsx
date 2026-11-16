'use client';

import type { ReactNode } from 'react';
import { DropdownMenu as MenuPrimitive } from 'radix-ui';
import { Check, ChevronRight, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from './button';

/** Dropdown menu. Figma context menu: 11px radius, 40px items, 18px icons, danger in red. */
export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;
export const MenuGroup = MenuPrimitive.Group;
export const MenuSub = MenuPrimitive.Sub;

export function MenuContent({
  children,
  align = 'end',
  side,
  className,
  sideOffset = 6,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
  sideOffset?: number;
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-[220px] overflow-hidden rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-pop data-[state=open]:animate-in',
          className,
        )}
      >
        {children}
      </MenuPrimitive.Content>
    </MenuPrimitive.Portal>
  );
}

const itemClasses =
  'flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-md px-3 text-base text-fg-muted outline-none transition-colors data-[highlighted]:bg-accent data-[highlighted]:text-fg data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 [&_svg]:size-[18px] [&_svg]:shrink-0';

export function MenuItem({
  icon,
  danger,
  shortcut,
  className,
  children,
  ...props
}: Omit<MenuPrimitive.DropdownMenuItemProps, 'children'> & {
  icon?: ReactNode;
  danger?: boolean;
  shortcut?: ReactNode;
  children: ReactNode;
}) {
  return (
    <MenuPrimitive.Item
      className={cn(
        itemClasses,
        danger &&
          'text-destructive data-[highlighted]:bg-tone-red-bg data-[highlighted]:text-destructive',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut && <span className="text-xs text-fg-subtle">{shortcut}</span>}
    </MenuPrimitive.Item>
  );
}

export function MenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(e) => e.preventDefault()}
      className={itemClasses}
    >
      <span className="flex size-[18px] items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <Check className="text-primary" />
        </MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <MenuPrimitive.Label className="truncate px-3 pt-2 pb-1 text-xs text-fg-subtle">
      {children}
    </MenuPrimitive.Label>
  );
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="-mx-1.5 my-1.5 h-px bg-border-subtle" />;
}

export function MenuSubTrigger({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <MenuPrimitive.SubTrigger className={cn(itemClasses, 'data-[state=open]:bg-accent')}>
      {icon}
      <span className="flex-1">{children}</span>
      <ChevronRight className="text-fg-subtle" />
    </MenuPrimitive.SubTrigger>
  );
}

export function MenuSubContent({ children }: { children: ReactNode }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent
        sideOffset={6}
        className="z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1.5 shadow-pop data-[state=open]:animate-in"
      >
        {children}
      </MenuPrimitive.SubContent>
    </MenuPrimitive.Portal>
  );
}

/** The "•••" row action from the Figma tables, with its menu. */
export function RowActions({
  label = 'Actions',
  children,
  size = 'sm',
}: {
  label?: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton label={label} size={size} onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </IconButton>
      </MenuTrigger>
      <MenuContent>{children}</MenuContent>
    </Menu>
  );
}

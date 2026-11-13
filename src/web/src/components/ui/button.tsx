import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from 'radix-ui';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant =
  'primary' | 'secondary' | 'brand' | 'quiet' | 'soft' | 'danger' | 'danger-quiet' | 'link';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:cursor-not-allowed [&_svg]:shrink-0';

// Figma: Primary / Secondary / Brand / Quiet, each with default, hover and disabled.
const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary-hover disabled:bg-secondary disabled:text-fg-subtle',
  secondary:
    'border border-border bg-card text-fg-muted hover:bg-accent hover:text-fg disabled:bg-secondary disabled:text-fg-subtle',
  brand:
    'bg-brand text-brand-foreground font-semibold hover:bg-brand-hover disabled:bg-secondary disabled:text-fg-subtle',
  quiet: 'text-fg-muted hover:bg-accent hover:text-fg disabled:text-fg-subtle',
  soft: 'bg-accent text-accent-foreground hover:bg-accent/70 disabled:bg-secondary disabled:text-fg-subtle',
  danger:
    'bg-destructive text-destructive-foreground hover:bg-destructive-hover disabled:bg-secondary disabled:text-fg-subtle',
  'danger-quiet': 'text-destructive hover:bg-tone-red-bg disabled:text-fg-subtle',
  link: 'h-auto! px-0! text-accent-foreground underline-offset-4 hover:underline disabled:text-fg-subtle',
};

// md is the Figma control height (38px). The header CTA uses lg (44px).
const sizes: Record<ButtonSize, string> = {
  xs: 'h-7 px-2.5 text-xs [&_svg]:size-3.5',
  sm: 'h-8 px-3 text-sm [&_svg]:size-4',
  md: 'h-[38px] px-3.5 text-base [&_svg]:size-4',
  lg: 'h-11 px-5 text-md rounded-lg [&_svg]:size-5',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render the child element (e.g. a Next Link) with button styles. */
  asChild?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    asChild,
    loading,
    leftIcon,
    rightIcon,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  const classes = cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className);
  if (asChild)
    return (
      <Slot.Root ref={ref} className={classes} {...props}>
        {children}
      </Slot.Root>
    );
  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : leftIcon}
      {children}
      {rightIcon}
    </button>
  );
});

const iconSizes: Record<ButtonSize, string> = {
  xs: 'size-7 [&_svg]:size-3.5',
  sm: 'size-8 [&_svg]:size-4',
  md: 'size-[38px] [&_svg]:size-[18px]',
  lg: 'size-11 [&_svg]:size-5',
};

export type IconButtonProps = Omit<ButtonProps, 'leftIcon' | 'rightIcon' | 'fullWidth'> & {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
};

/** Square icon-only action. Figma: 38px, 7px radius, bordered (secondary) by default. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'secondary', size = 'md', className, children, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cn('px-0', iconSizes[size], className)}
      {...props}
    >
      {children}
    </Button>
  );
});

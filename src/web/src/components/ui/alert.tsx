import type { ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldCheck,
  XCircle,
  X,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/cn';

type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

const tones: Record<AlertTone, { box: string; icon: LucideIcon; iconColor: string }> = {
  info: {
    box: 'border-tone-blue-dot/25 bg-tone-blue-bg',
    icon: Info,
    iconColor: 'text-tone-blue-dot',
  },
  success: {
    box: 'border-tone-green-dot/25 bg-tone-green-bg',
    icon: CheckCircle2,
    iconColor: 'text-tone-green-dot',
  },
  warning: {
    box: 'border-tone-amber-dot/30 bg-tone-amber-bg',
    icon: AlertTriangle,
    iconColor: 'text-tone-amber-dot',
  },
  danger: {
    box: 'border-tone-red-dot/25 bg-tone-red-bg',
    icon: XCircle,
    iconColor: 'text-tone-red-dot',
  },
  neutral: { box: 'border-border bg-muted', icon: ShieldCheck, iconColor: 'text-fg-subtle' },
};

/**
 * Inline message. Figma banner ("Owner permissions are locked"): tinted box, icon, bold title,
 * muted body, optional action or meta on the right.
 */
export function Alert({
  tone = 'info',
  title,
  children,
  icon,
  action,
  onDismiss,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  icon?: LucideIcon | null;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}) {
  const t = tones[tone];
  const Icon = icon === null ? null : (icon ?? t.icon);
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', t.box, className)}
    >
      {Icon && <Icon className={cn('mt-0.5 size-[18px] shrink-0', t.iconColor)} aria-hidden />}
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={cn('text-fg-muted', title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 rounded-sm p-1 text-fg-subtle hover:text-fg"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

import type { ReactNode } from 'react';
import { CheckCheck } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { cn } from '@/lib/cn';

/** Figma message bubble: outgoing in primary on the right, incoming in soft grey on the left. */
export function ChatBubble({
  direction,
  time,
  delivered,
  children,
}: {
  direction: 'in' | 'out';
  time?: ReactNode;
  delivered?: boolean;
  children: ReactNode;
}) {
  const out = direction === 'out';
  return (
    <div className={cn('flex flex-col gap-1', out ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[min(72%,560px)] rounded-lg px-3.5 py-2.5 text-sm whitespace-pre-wrap',
          out ? 'bg-primary text-primary-foreground' : 'bg-secondary text-fg',
        )}
      >
        {children}
      </div>
      {time && (
        <p className="flex items-center gap-1 text-2xs text-fg-subtle">
          {time}
          {out && delivered && (
            <>
              {' · Delivered'}
              <CheckCheck className="size-3.5" aria-hidden />
            </>
          )}
        </p>
      )}
    </div>
  );
}

/** "Today, October 15, 2026" divider between message groups. */
export function DayDivider({ children }: { children: ReactNode }) {
  return <p className="py-2 text-center text-2xs text-fg-subtle">{children}</p>;
}

/** Inbox row: avatar, name, role, last message, time; selected gets the wash and a left rule. */
export function ConversationRow({
  name,
  subtitle,
  preview,
  time,
  unread,
  selected,
  onClick,
}: {
  name: string;
  subtitle?: ReactNode;
  preview?: ReactNode;
  time?: ReactNode;
  unread?: boolean;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full items-start gap-3 border-b border-border-subtle border-l-2 border-l-transparent px-3.5 py-3 text-left transition-colors hover:bg-muted',
        selected && 'border-l-primary bg-accent hover:bg-accent',
      )}
    >
      <Avatar name={name} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span
            className={cn('truncate text-sm text-fg', unread ? 'font-semibold' : 'font-medium')}
          >
            {name}
          </span>
          <span className="shrink-0 text-2xs text-fg-subtle">{time}</span>
        </span>
        {subtitle && <span className="block truncate text-2xs text-fg-subtle">{subtitle}</span>}
        {preview && (
          <span className={cn('mt-1 block truncate text-xs', unread ? 'text-fg' : 'text-fg-muted')}>
            {preview}
          </span>
        )}
      </span>
      {unread && (
        <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      )}
    </button>
  );
}

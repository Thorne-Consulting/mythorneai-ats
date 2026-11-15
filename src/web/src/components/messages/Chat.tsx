import type { ReactNode } from 'react';
import {
  AlarmClock,
  CheckCheck,
  Clock,
  Download,
  FileText,
  Mail,
  Paperclip,
  Star,
} from 'lucide-react';
import { Avatar, Checkbox } from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { cn } from '@/lib/cn';

/**
 * Figma message bubble: outgoing in primary on the right, incoming in soft grey on the left.
 * `footer` replaces the default time line (status, author, channel); `files` sit under the bubble.
 */
export function ChatBubble({
  direction,
  time,
  delivered,
  footer,
  files,
  children,
}: {
  direction: 'in' | 'out';
  time?: ReactNode;
  delivered?: boolean;
  footer?: ReactNode;
  files?: ReactNode;
  children?: ReactNode;
}) {
  const out = direction === 'out';
  return (
    <div className={cn('flex flex-col gap-1', out ? 'items-end' : 'items-start')}>
      {children !== undefined && children !== null && children !== '' && (
        <div
          className={cn(
            'max-w-[min(85%,600px)] rounded-lg px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap sm:max-w-[min(72%,600px)]',
            out ? 'bg-primary text-primary-foreground' : 'bg-secondary text-fg',
          )}
        >
          {children}
        </div>
      )}
      {files && (
        <div className={cn('flex max-w-[min(85%,600px)] flex-wrap gap-1.5', out && 'justify-end')}>
          {files}
        </div>
      )}
      {footer ? (
        <div className="flex max-w-full flex-wrap items-center gap-x-1 text-2xs text-fg-subtle">
          {footer}
        </div>
      ) : (
        time && (
          <p className="flex items-center gap-1 text-2xs text-fg-subtle">
            {time}
            {out && delivered && (
              <>
                {' · Delivered'}
                <CheckCheck className="size-3.5" aria-hidden />
              </>
            )}
          </p>
        )
      )}
    </div>
  );
}

/** A file sent in a message: type icon, name, size and a download link. */
/**
 * A message's text inside a `ChatBubble`. Team messages are written in the editor (Markdown);
 * candidate replies are plain text and show as typed.
 */
export function MessageBody({
  body,
  markdown,
  className,
}: {
  body: string;
  markdown: boolean;
  className?: string;
}) {
  if (!markdown) return <>{body}</>;
  return (
    <RichText
      markdown={body}
      className={cn(
        'text-sm whitespace-normal [&_a]:text-inherit [&_a]:underline [&_p]:my-0 [&_p+p]:mt-2',
        className,
      )}
    />
  );
}

export function FileCard({
  name,
  size,
  href,
  onRemove,
  busy,
}: {
  name: string;
  size?: string;
  href?: string;
  onRemove?: () => void;
  busy?: boolean;
}) {
  const body = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-tone-blue-bg text-tone-blue-fg">
        <FileText className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-fg">{name}</span>
        {size && (
          <span className="block text-2xs text-fg-subtle tnum">{busy ? 'Uploading…' : size}</span>
        )}
      </span>
    </>
  );
  return (
    <span className="inline-flex max-w-64 items-center gap-2 rounded-lg border border-border-subtle bg-card py-1.5 pr-1.5 pl-1.5 shadow-card">
      {href ? (
        <a
          href={href}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          download
        >
          {body}
          <Download className="mr-1 size-4 shrink-0 text-fg-subtle" aria-label="Download" />
        </a>
      ) : (
        body
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="rounded-md px-1.5 py-1 text-2xs text-fg-muted hover:bg-secondary hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Remove
        </button>
      )}
    </span>
  );
}

/** "Today, October 15, 2026" divider between message groups. */
export function DayDivider({ children }: { children: ReactNode }) {
  return <p className="py-2 text-center text-2xs text-fg-subtle">{children}</p>;
}

/**
 * Inbox row: avatar, name, time, the job, last message; selected gets the wash and a left rule.
 * Optional markers: star, files, an envelope when the last message came by email, a clock when a
 * message is scheduled, an alarm when snoozed, and the assignee's initials. With `onCheck` the
 * avatar turns into a checkbox on hover (and stays one while anything is checked) for bulk work.
 */
export function ConversationRow({
  name,
  subtitle,
  preview,
  time,
  unread,
  selected,
  starred,
  hasFiles,
  viaEmail,
  scheduled,
  snoozed,
  assignee,
  checked,
  selecting,
  onCheck,
  onClick,
}: {
  name: string;
  subtitle?: ReactNode;
  preview?: ReactNode;
  time?: ReactNode;
  unread?: boolean;
  selected?: boolean;
  starred?: boolean;
  hasFiles?: boolean;
  viaEmail?: boolean;
  scheduled?: boolean;
  snoozed?: boolean;
  /** The assignee's name; shown as small initials. */
  assignee?: string | null;
  checked?: boolean;
  /** Something in the list is checked, so every row shows its checkbox. */
  selecting?: boolean;
  onCheck?: (checked: boolean, range: boolean) => void;
  onClick?: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        aria-current={selected || undefined}
        className={cn(
          'flex w-full items-start gap-3 border-b border-l-2 border-border-subtle border-l-transparent px-3.5 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none',
          selected && 'border-l-primary bg-accent hover:bg-accent focus-visible:bg-accent',
          checked && 'bg-accent/60',
        )}
      >
        <Avatar
          name={name}
          size="md"
          className={cn(
            onCheck &&
              (selecting || checked
                ? 'opacity-0'
                : 'group-focus-within:opacity-0 group-hover:opacity-0'),
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span
              className={cn('truncate text-sm text-fg', unread ? 'font-semibold' : 'font-medium')}
            >
              {name}
            </span>
            <span
              className={cn(
                'shrink-0 text-2xs tnum',
                unread ? 'font-medium text-accent-foreground' : 'text-fg-subtle',
              )}
            >
              {time}
            </span>
          </span>
          {subtitle && <span className="block truncate text-2xs text-fg-subtle">{subtitle}</span>}
          {preview && (
            <span className="mt-1 flex items-center gap-1.5">
              {viaEmail && (
                <Mail className="size-3.5 shrink-0 text-fg-subtle" aria-label="By email" />
              )}
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-xs',
                  unread ? 'text-fg' : 'text-fg-muted',
                )}
              >
                {preview}
              </span>
              {scheduled && (
                <Clock
                  className="size-3.5 shrink-0 text-tone-amber-fg"
                  aria-label="Message scheduled"
                />
              )}
              {snoozed && (
                <AlarmClock className="size-3.5 shrink-0 text-fg-subtle" aria-label="Snoozed" />
              )}
              {hasFiles && (
                <Paperclip className="size-3.5 shrink-0 text-fg-subtle" aria-label="Has files" />
              )}
              {starred && (
                <Star
                  className="size-3.5 shrink-0 fill-current text-tone-amber-dot"
                  aria-label="Starred"
                />
              )}
              {assignee && (
                <span className="shrink-0" title={`Assigned to ${assignee}`}>
                  <Avatar name={assignee} size="xs" className="size-5" />
                  <span className="sr-only">Assigned to {assignee}</span>
                </span>
              )}
            </span>
          )}
        </span>
        {unread && (
          <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
        )}
      </button>
      {onCheck && (
        <span
          className={cn(
            'absolute top-3 left-4 flex size-[34px] items-center justify-center',
            !(selecting || checked) &&
              'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
          )}
          onClickCapture={(event) => {
            // Shift-click checks every row from the last one checked.
            if (event.shiftKey) {
              event.preventDefault();
              onCheck(!checked, true);
            }
          }}
        >
          <Checkbox
            checked={!!checked}
            onCheckedChange={(on) => onCheck(on, false)}
            aria-label={`Select the conversation with ${name}`}
          />
        </span>
      )}
    </div>
  );
}

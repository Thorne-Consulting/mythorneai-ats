'use client';

import { useEffect, useRef, useState } from 'react';
import { Braces, History } from 'lucide-react';
import { KEYS } from 'platejs';
import { useEditorRef } from 'platejs/react';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import type { ChipItem } from '@/components/plate/editor/plugins/editor-kit';
import { chipClass } from '@/components/plate/ui/chip-node-static';
import { RichText } from '@/components/rich-text';
import {
  Badge,
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  SkeletonRows,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import type { TemplateVersion } from './templates-data';

/**
 * "Insert detail" for the editor's format bar: the same chips as typing "{", for people who don't
 * know the shortcut. Render it as the editor's `header` so it can reach the editor.
 */
export function InsertDetailMenu({ chips }: { chips: ChipItem[] }) {
  const editor = useEditorRef();
  if (chips.length === 0) return null;
  const insert = (chip: ChipItem) => {
    if (!editor.selection) editor.tf.select(editor.api.end([]));
    editor.tf.insertNodes({
      type: editor.getType(KEYS.mention),
      key: chip.key,
      value: chip.text,
      trigger: '{',
      children: [{ text: '' }],
    });
    editor.tf.move({ unit: 'offset' });
    editor.tf.focus();
  };
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="quiet" size="xs" leftIcon={<Braces />} className="shrink-0">
          Insert detail
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        {chips.map((chip) => (
          <MenuItem key={chip.key} onSelect={() => insert(chip)}>
            {chip.text}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/**
 * An email subject: one line with detail chips, so "{{jobTitle}}" reads as a "Job title" chip.
 * Type "{" or use "Insert detail". The value is plain text with `{{key}}` for each chip. It keeps
 * its first value; give it a new `key` to load another.
 */
export function SubjectField({
  label = 'Subject',
  description,
  required,
  error,
  value,
  onChange,
  chips,
  readOnly = false,
  className,
}: {
  label?: string;
  description?: string;
  required?: boolean;
  error?: string;
  value: string;
  onChange: (value: string) => void;
  chips: ChipItem[];
  readOnly?: boolean;
  className?: string;
}) {
  return (
    <Field
      label={label}
      description={description}
      required={required}
      error={error}
      className={className}
    >
      {readOnly ? (
        <p className="min-h-9 rounded-md border border-border-subtle bg-muted/40 px-3 py-1.5 text-base text-fg">
          {value.split(/\{\{\s*(\w+)\s*\}\}/).map((part, index) =>
            index % 2 ? (
              <span key={index} className={chipClass({ trigger: '{' } as never)}>
                {chips.find((chip) => chip.key === part)?.text ?? part}
              </span>
            ) : (
              part
            ),
          )}
        </p>
      ) : (
        <PlateMarkdownEditor
          singleLine
          value={value}
          onChange={onChange}
          chips={{ details: chips }}
          aria-label={label}
          invalid={!!error}
          placeholder="Write a subject. Type { to add a detail."
          header={<InsertDetailMenu chips={chips} />}
        />
      )}
    </Field>
  );
}

/** Asks before throwing away unsaved changes. `ask(go)` runs `go` now, or after the person agrees. */
export function useDiscardGuard(what = 'this template') {
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  // Closing or reloading the tab gets the browser's own warning.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const ask = (go: () => void) => (dirty ? setPending(() => go) : go());
  const dialog = (
    <ConfirmDialog
      opened={!!pending}
      onClose={() => setPending(null)}
      title="Discard your changes?"
      message={`You changed ${what} but didn’t save it. If you go on, your changes are lost.`}
      confirmLabel="Discard changes"
      onConfirm={() => {
        setDirty(false);
        pending?.();
      }}
    />
  );
  return { dirty, setDirty, ask, dialog };
}

/**
 * An email as it arrives: rendered HTML on white (like an inbox, in both themes), sized to its
 * content, at desktop or phone width.
 */
export function EmailFrame({
  html,
  title,
  phone = false,
}: {
  html: string;
  title: string;
  phone?: boolean;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(320);
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (doc?.body) setHeight(Math.max(240, doc.documentElement.scrollHeight));
  };
  useEffect(fit, [html, phone]);
  return (
    <div
      className={cn(
        'mx-auto w-full transition-[max-width]',
        phone ? 'max-w-[390px]' : 'max-w-none',
      )}
    >
      <iframe
        ref={frame}
        title={title}
        // Same-origin read so the frame can size itself; scripts stay off.
        sandbox="allow-same-origin"
        srcDoc={html}
        onLoad={fit}
        className="w-full rounded-lg border border-border bg-white"
        style={{ height }}
      />
    </div>
  );
}

/** One saved wording. Offer letters have no subject. */
export type VersionRow = Omit<TemplateVersion, 'subject'> & { subject?: string };

/**
 * Every saved wording, newest first: open one to read it, then bring it back as a new version.
 * Used by the template editor and by Settings › Offer letters.
 */
export function VersionHistoryDrawer({
  opened,
  onClose,
  versions,
  readOnly,
  restoring,
  onRestore,
}: {
  opened: boolean;
  onClose: () => void;
  /** Newest first; undefined while loading. */
  versions?: VersionRow[];
  readOnly: boolean;
  restoring: boolean;
  onRestore: (version: number) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const list = versions ?? [];
  const current = list[0];
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="History"
      description="Every saved wording. Open one to read it or bring it back."
      size="lg"
    >
      {!versions ? (
        <SkeletonRows rows={4} />
      ) : list.length === 0 ? (
        <EmptyState
          compact
          icon={History}
          title="No changes yet"
          description="Each time someone saves, the wording is kept here."
        />
      ) : (
        <ol className="flex flex-col gap-2">
          {list.map((v) => {
            const open = picked === v.version;
            return (
              <li
                key={v.version}
                className={cn(
                  'rounded-lg border border-border-subtle',
                  open && 'border-primary/50 bg-accent/30',
                )}
              >
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setPicked(open ? null : v.version)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      Version {v.version}
                      {v === current && <Badge tone="green">In use</Badge>}
                      {v.action !== 'Saved' && (
                        <Badge>{v.action === 'Reset' ? 'Reset' : 'Restored'}</Badge>
                      )}
                    </span>
                    <span className="block text-xs text-fg-subtle">
                      {v.editedByName ?? 'Someone'}, {formatRelative(v.editedAt)}
                    </span>
                  </span>
                </button>
                {open && (
                  <div className="border-t border-border-subtle px-4 py-3">
                    {v.subject && (
                      <p className="mb-2 text-sm">
                        <span className="text-fg-subtle">Subject: </span>
                        <span className="font-medium text-fg">{v.subject}</span>
                      </p>
                    )}
                    <RichText markdown={v.body} className="text-sm" />
                    {!readOnly && v !== current && (
                      <Button
                        size="sm"
                        className="mt-3"
                        loading={restoring}
                        onClick={() => onRestore(v.version)}
                      >
                        Restore this version
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Drawer>
  );
}

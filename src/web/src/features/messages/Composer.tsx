'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { ChevronDown, Clock, FileText, Paperclip, Send, Sparkles } from 'lucide-react';
import { deserializeMd } from '@platejs/markdown';
import { useEditorRef } from 'platejs/react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { FileCard } from '@/components/messages/Chat';
import {
  Button,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  Modal,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SearchInput,
  toast,
} from '@/components/ui';
import {
  detailChips,
  useTemplateLibrary,
  type SavedReply,
} from '@/features/templates/templates-data';
import { useLocalStorageState } from '@/lib/hooks';
import {
  formatSize,
  timePresets,
  unsendMessage,
  useSendMessage,
  whenText,
  type MessageFile,
} from './inbox-data';

const MAX_CHARS = 10_000;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPT = '.pdf,.doc,.docx';

type Pending = { key: string; name: string; size: number; file?: MessageFile; failed?: boolean };

export type ComposerHandle = {
  focus: () => void;
  addFiles: (files: File[]) => void;
  /** Put a message back in the box (after Undo or "Cancel and edit"). */
  restore: (body: string, files: MessageFile[]) => void;
};

/**
 * The reply box shared by the inbox and the application's Messages tab: formatting, saved replies
 * (Template, or # on an empty line), details that fill in for this candidate, emoji, files, Draft
 * with AI and Send later. ⌘ or Ctrl + Enter sends. Every send can be undone for a few seconds.
 * The draft is kept per thread in this browser until it is sent.
 */
export const Composer = forwardRef<
  ComposerHandle,
  { applicationId: string; firstName: string; replyByEmail: boolean; onTyping?: () => void }
>(function Composer({ applicationId, firstName, replyByEmail, onTyping }, ref) {
  const user = useCurrentUser();
  const [text, setText] = useLocalStorageState(`ats-message-draft:${applicationId}`, '');
  // Bumped to start the editor afresh with `text` (after sending, Undo, a draft from AI).
  const [version, setVersion] = useState(0);
  const [files, setFiles] = useState<Pending[]>([]);
  const [picking, setPicking] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const send = useSendMessage(applicationId);
  const library = useTemplateLibrary();
  const saved = library.data?.saved ?? [];
  const chips = detailChips(library.data?.details, library.data?.savedReplyDetails ?? []);
  const uploading = files.some((f) => !f.file && !f.failed);
  const ready = files.filter((f) => f.file);
  const empty = !text.replace(/[\s​]/g, '');
  const canSend = (!empty || ready.length > 0) && !uploading && !send.isPending;

  const replace = (body: string) => {
    setText(body);
    setVersion((v) => v + 1);
  };

  const addFiles = (incoming: File[]) => {
    const room = MAX_FILES - files.length;
    if (incoming.length > room)
      toast.error('Too many files', `You can send up to ${MAX_FILES} files with one message.`);
    for (const file of incoming.slice(0, Math.max(room, 0))) {
      if (!/\.(pdf|docx?)$/i.test(file.name)) {
        toast.error(`Can’t attach ${file.name}`, 'Attach PDF or Word documents.');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is too big`, 'Each file can be up to 10 MB.');
        continue;
      }
      const key = crypto.randomUUID();
      setFiles((list) => [...list, { key, name: file.name, size: file.size }]);
      api
        .upload<MessageFile>(`/api/applications/${applicationId}/messages/attachments`, file)
        .then((stored) =>
          setFiles((list) => list.map((f) => (f.key === key ? { ...f, file: stored } : f))),
        )
        .catch((error: Error) => {
          setFiles((list) => list.filter((f) => f.key !== key));
          toast.error(`Could not attach ${file.name}`, error.message);
        });
    }
  };

  const restore = (body: string, back: MessageFile[]) => {
    replace(body);
    setFiles(back.map((file) => ({ key: file.id, name: file.name, size: file.size, file })));
  };

  useImperativeHandle(ref, () => ({
    focus: () => area.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus(),
    addFiles,
    restore,
  }));

  const remove = (item: Pending) => {
    setFiles((list) => list.filter((f) => f.key !== item.key));
    if (item.file) api.delete(`/api/messages/attachments/${item.file.id}`).catch(() => {});
  };

  const submit = (scheduledFor?: Date) => {
    if (!canSend) return;
    if (text.length > MAX_CHARS) {
      toast.error('This message is too long', 'Keep it under 10,000 characters.');
      return;
    }
    const body = text.trim();
    const sent = ready.map((f) => f.file!);
    send.mutate(
      { body, attachmentIds: sent.map((f) => f.id), scheduledFor: scheduledFor?.toISOString() },
      {
        onSuccess: (result) => {
          replace('');
          setFiles([]);
          const undo = () =>
            unsendMessage(result.id)
              .then((back) => {
                restore(back.body, back.attachments);
                toast.success(scheduledFor ? 'Scheduled message cancelled' : 'Message not sent');
              })
              .catch((error: Error) => toast.error('Too late to undo', error.message));
          if (scheduledFor)
            toast.success(`Scheduled for ${whenText(scheduledFor)}`, 'It waits in Scheduled.', {
              action: { label: 'Undo', onClick: undo },
            });
          else
            toast.success('Message sent', undefined, {
              action: { label: 'Undo', onClick: undo },
              duration: 9000,
            });
        },
        onError: (error: Error) => toast.error('Could not send the message', error.message),
      },
    );
  };

  return (
    <form
      className="border-t border-border-subtle px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div
        ref={area}
        aria-label={`Message to ${firstName}`}
        onKeyDownCapture={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }
        }}
        onPasteCapture={(event) => {
          const pasted = [...event.clipboardData.files];
          if (pasted.length) {
            event.preventDefault();
            event.stopPropagation();
            addFiles(pasted);
          }
        }}
      >
        <PlateMarkdownEditor
          key={`${applicationId}-${version}`}
          value={text}
          onChange={(markdown) => {
            setText(markdown);
            onTyping?.();
          }}
          headings={false}
          // Pasted or dropped files become attachments here, not pictures in the text.
          images={false}
          chips={{ details: chips }}
          templates={saved.map((reply) => ({
            label: reply.name,
            hint: reply.category ?? undefined,
            markdown: reply.body,
          }))}
          placeholder={`Write to ${firstName}… Type # for a saved reply.`}
          editorClassName="max-h-72 min-h-20 overflow-y-auto px-3 py-2.5"
          header={
            <span className="flex items-center gap-0.5">
              <TemplateButton replies={saved} open={picking} onOpenChange={setPicking} />
              {user.aiEnabled !== false && <DraftButton applicationId={applicationId} />}
            </span>
          }
        />
      </div>
      {files.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Files to send">
          {files.map((f) => (
            <li key={f.key}>
              <FileCard
                name={f.name}
                size={formatSize(f.size)}
                busy={!f.file}
                onRemove={() => remove(f)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-1">
        <input
          ref={picker}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(event) => {
            addFiles([...(event.currentTarget.files ?? [])]);
            event.currentTarget.value = '';
          }}
        />
        <IconButton
          type="button"
          variant="quiet"
          size="sm"
          label="Attach files (PDF or Word, up to 10 MB each)"
          onClick={() => picker.current?.click()}
        >
          <Paperclip />
        </IconButton>
        <p className="ml-1 line-clamp-2 min-w-0 flex-1 text-2xs text-fg-subtle">
          {text.length > MAX_CHARS - 1000
            ? `${Math.max(0, MAX_CHARS - text.length).toLocaleString()} characters left`
            : replyByEmail
              ? `${firstName} gets this by email and can reply to it.`
              : `${firstName} gets this by email and replies in their portal.`}
        </p>
        <span className="flex">
          <Button
            type="submit"
            size="sm"
            leftIcon={<Send />}
            loading={send.isPending}
            disabled={!canSend}
            title="Send (⌘ Enter)"
            className="rounded-r-none"
          >
            Send
          </Button>
          <SendLater disabled={!canSend} onPick={(at) => submit(at)} />
        </span>
      </div>
    </form>
  );
});

/** The chevron beside Send: send at 9 AM tomorrow, next Monday, or a time you pick. */
function SendLater({ disabled, onPick }: { disabled: boolean; onPick: (at: Date) => void }) {
  const [custom, setCustom] = useState(false);
  const [value, setValue] = useState('');
  const min = new Date(Date.now() + 5 * 60_000);
  const local = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const chosen = value ? new Date(value) : null;
  const valid = !!chosen && chosen.getTime() >= min.getTime() - 60_000;
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <IconButton
            type="button"
            size="sm"
            variant="primary"
            label="Send later"
            disabled={disabled}
            className="rounded-l-none border-l border-primary-foreground/25"
          >
            <ChevronDown />
          </IconButton>
        </MenuTrigger>
        <MenuContent align="end" className="w-64">
          <MenuLabel>Send later</MenuLabel>
          {timePresets().map((preset) => (
            <MenuItem key={preset.label} icon={<Clock />} onSelect={() => onPick(preset.at)}>
              <span className="flex w-full justify-between gap-3">
                {preset.label}
                <span className="text-fg-subtle">{whenText(preset.at).split(', ').pop()}</span>
              </span>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            onSelect={() => {
              setValue(local(new Date(Date.now() + 60 * 60_000)));
              setCustom(true);
            }}
          >
            Pick a date and time…
          </MenuItem>
        </MenuContent>
      </Menu>
      <Modal
        opened={custom}
        onClose={() => setCustom(false)}
        title="Send later"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCustom(false)}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              onClick={() => {
                setCustom(false);
                onPick(chosen!);
              }}
            >
              Schedule message
            </Button>
          </>
        }
      >
        <Input
          type="datetime-local"
          label="Send on"
          description={`In your time zone (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`}
          min={local(min)}
          value={value}
          error={value && !valid ? 'Pick a time at least 5 minutes from now.' : undefined}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </Modal>
    </>
  );
}

/** Saved replies with a search box. Inserts at the cursor (or fills an empty box). */
function TemplateButton({
  replies,
  open,
  onOpenChange,
}: {
  replies: SavedReply[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const editor = useEditorRef();
  const [q, setQ] = useState('');
  const words = q.trim().toLowerCase();
  const shown = replies.filter(
    (r) => !words || `${r.name} ${r.category ?? ''} ${r.body}`.toLowerCase().includes(words),
  );
  const insert = (reply: SavedReply) => {
    const nodes = deserializeMd(editor, reply.body);
    if (editor.api.isEmpty()) editor.tf.setValue(nodes);
    else {
      if (!editor.selection) editor.tf.select(editor.api.end([]));
      editor.tf.insertNodes(nodes);
    }
    onOpenChange(false);
    setQ('');
    editor.tf.focus({ edge: 'end' });
  };
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button type="button" variant="quiet" size="xs" leftIcon={<FileText />}>
          Template
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))] p-0">
        <div className="border-b border-border-subtle p-2">
          <SearchInput
            value={q}
            onValueChange={setQ}
            placeholder="Search saved replies"
            autoFocus
          />
        </div>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-fg-subtle">
            {replies.length === 0 ? (
              <>
                No saved replies yet.{' '}
                <a href="/messages/templates/new" className="text-accent-foreground underline">
                  Write one
                </a>
              </>
            ) : (
              'Nothing matches.'
            )}
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto py-1">
            {shown.map((reply) => (
              <li key={reply.id}>
                <button
                  type="button"
                  onClick={() => insert(reply)}
                  className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <span className="text-sm font-medium text-fg">{reply.name}</span>
                  <span className="line-clamp-1 text-xs text-fg-subtle">
                    {reply.body.replace(/\{\{\s*(\w+)\s*\}\}/g, '…').replace(/[*_#>`]/g, '')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Draft with AI: one line about what to say; the draft fills the box for editing, never sends. */
function DraftButton({ applicationId }: { applicationId: string }) {
  const editor = useEditorRef();
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState('');
  const [busy, setBusy] = useState(false);
  const draft = () => {
    setBusy(true);
    api
      .post<{ draft: string }>(`/api/applications/${applicationId}/messages/draft`, {
        instructions: ask.trim() || null,
      })
      .then((result) => {
        editor.tf.setValue(deserializeMd(editor, result.draft));
        setOpen(false);
        setAsk('');
        editor.tf.focus({ edge: 'end' });
      })
      .catch((error: Error) => toast.error('Could not write a draft', error.message))
      .finally(() => setBusy(false));
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="quiet" size="xs" leftIcon={<Sparkles />}>
          Draft with AI
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-2rem))]">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            draft();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            label="What should it say?"
            description="For example: thank them and ask for two times next week. It replaces what is in the box."
            value={ask}
            autoFocus
            onChange={(event) => setAsk(event.currentTarget.value)}
          />
          <Button
            type="submit"
            size="sm"
            loading={busy}
            leftIcon={<Sparkles />}
            className="self-end"
          >
            Write draft
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

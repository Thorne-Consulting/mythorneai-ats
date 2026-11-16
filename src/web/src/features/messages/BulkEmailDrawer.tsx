'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Send, UserX } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { imageProblem } from '@/components/editor/images';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { RichText } from '@/components/rich-text';
import {
  Alert,
  Button,
  Drawer,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
  Select,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { InsertDetailMenu, SubjectField } from '@/features/templates/editor-tools';
import { detailChips, useTemplateLibrary } from '@/features/templates/templates-data';
import { useDebouncedValue } from '@/lib/hooks';
import { bulkRecipients } from './bulk-recipients';
import { timePresets, useRefreshThreads, whenText } from './inbox-data';

interface PreviewRow {
  candidateId: string;
  applicationId?: string | null;
  name: string;
  email: string;
  jobTitle?: string | null;
  skip?: string | null;
  subject: string;
  body: string;
}

/**
 * Email many people at once from a selection: Candidates, a job's pipeline or a talent pool.
 * Pass `applicationIds` (each message lands in that application's conversation, so replies come
 * back one by one), `candidateIds`, `filter` (the Candidates list's query string for "everyone
 * matching", as `POST /api/candidates/bulk` takes it) or `poolId`. For people, their latest
 * application you manage carries the message; people with no job get a direct email. People who
 * asked not to be contacted, whose email bounces or who have no email are listed and skipped.
 *
 * Usage from a selection bar:
 *   <BulkEmailDrawer opened={open} onClose={() => setOpen(false)} applicationIds={[...selected]} />
 */
export function BulkEmailDrawer({
  opened,
  onClose,
  applicationIds,
  candidateIds,
  filter,
  poolId,
  onSent,
}: {
  opened: boolean;
  onClose: () => void;
  applicationIds?: string[];
  candidateIds?: string[];
  filter?: string;
  poolId?: string;
  onSent?: (result: { sent: number; skipped: { name: string; reason: string }[] }) => void;
}) {
  const library = useTemplateLibrary(opened);
  const refresh = useRefreshThreads();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [index, setIndex] = useState(0);
  const chips = detailChips(library.data?.details, library.data?.savedReplyDetails ?? []);
  const typed = useDebouncedValue(`${subject}\u0000${body}`, 400);
  const who = bulkRecipients({ applicationIds, candidateIds, filter, poolId });
  const ids = JSON.stringify(who);

  // Everyone's message with their details filled in, and who is skipped and why.
  useEffect(() => {
    if (!opened) return;
    const [s, b] = typed.split('\u0000');
    let live = true;
    api
      .post<PreviewRow[]>('/api/messages/bulk/preview', { ...JSON.parse(ids), subject: s, body: b })
      .then((result) => live && setRows(result))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, [opened, ids, typed]);

  const sendable = (rows ?? []).filter((r) => !r.skip);
  const skipped = (rows ?? []).filter((r) => r.skip);
  const current = sendable[Math.min(index, Math.max(sendable.length - 1, 0))];
  const needsSubject = sendable.some((r) => !r.applicationId);

  const send = useMutation({
    mutationFn: (scheduledFor?: Date) =>
      api.post<{ sent: number; skipped: { name: string; reason: string }[] }>(
        '/api/messages/bulk',
        {
          ...who,
          subject,
          body,
          scheduledFor: scheduledFor?.toISOString(),
        },
      ),
    onSuccess: (result, scheduledFor) => {
      refresh();
      const people = result.sent === 1 ? '1 person' : `${result.sent} people`;
      toast.success(
        scheduledFor ? `Scheduled for ${people}, ${whenText(scheduledFor)}` : `Emailed ${people}`,
        result.skipped.length
          ? `Skipped ${result.skipped.length === 1 ? '1 person' : `${result.skipped.length} people`}.`
          : undefined,
      );
      onSent?.(result);
      setBody('');
      setSubject('');
      setTemplateId(null);
      setVersion((v) => v + 1);
      onClose();
    },
    onError: (error: Error) => toast.error('Could not send the emails', error.message),
  });

  const pick = (id: string | null) => {
    setTemplateId(id);
    const reply = library.data?.saved.find((r) => r.id === id);
    if (!reply) return;
    setSubject(reply.subject);
    setBody(reply.body);
    setVersion((v) => v + 1);
  };

  const total = rows?.length ?? 0;
  const pictures = imageProblem(body);
  const ready =
    !!body.trim() && !pictures && sendable.length > 0 && (!needsSubject || !!subject.trim());

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      size="xl"
      title={total ? `Email ${total === 1 ? '1 person' : `${total} people`}` : 'Email people'}
      description="Each person gets their own email. Replies come back to their conversation."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <span className="flex">
            <Button
              leftIcon={<Send />}
              loading={send.isPending}
              disabled={!ready}
              onClick={() => send.mutate(undefined)}
              className="rounded-r-none"
            >
              {sendable.length
                ? `Send to ${sendable.length === 1 ? '1 person' : `${sendable.length} people`}`
                : 'Send'}
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <IconButton
                  label="Send later"
                  variant="primary"
                  disabled={!ready || send.isPending}
                  className="rounded-l-none border-l border-primary-foreground/25"
                >
                  <Clock />
                </IconButton>
              </MenuTrigger>
              <MenuContent align="end" className="w-60">
                <MenuLabel>Send later</MenuLabel>
                {timePresets().map((preset) => (
                  <MenuItem key={preset.label} onSelect={() => send.mutate(preset.at)}>
                    <span className="flex w-full justify-between gap-3">
                      {preset.label}
                      <span className="text-fg-subtle">
                        {whenText(preset.at).split(', ').pop()}
                      </span>
                    </span>
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </span>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Select
            label="Start from a saved reply"
            placeholder="Write a new message"
            value={templateId}
            onChange={pick}
            data={(library.data?.saved ?? []).map((r) => ({
              value: r.id,
              label: r.name,
              group: r.category ?? undefined,
            }))}
          />
          {needsSubject && (
            <SubjectField
              key={version}
              required
              description="For people with no conversation yet. Everyone else gets it in their conversation."
              value={subject}
              onChange={setSubject}
              chips={chips}
            />
          )}
          <div>
            <p className="mb-1.5 text-sm font-medium text-fg">Message</p>
            <PlateMarkdownEditor
              key={version}
              value={body}
              onChange={setBody}
              headings={false}
              chips={{ details: chips }}
              placeholder="Write the message. Type { to add a detail such as First name."
              editorClassName="min-h-48 px-4 py-3"
              header={<InsertDetailMenu chips={chips} />}
              invalid={!!pictures}
            />
            {pictures && <p className="mt-1.5 text-sm text-destructive">{pictures}</p>}
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4" aria-label="Preview">
          {!rows ? (
            <SkeletonRows rows={4} />
          ) : (
            <>
              <section className="rounded-xl border border-border-subtle">
                <div className="flex items-center gap-1 border-b border-border-subtle px-3 py-2">
                  <IconButton
                    label="Previous person"
                    variant="quiet"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft />
                  </IconButton>
                  <p className="min-w-0 flex-1 truncate text-center text-sm text-fg">
                    {current ? (
                      <>
                        <span className="tnum text-fg-subtle">
                          {Math.min(index, sendable.length - 1) + 1} of {sendable.length}
                        </span>{' '}
                        · <span className="font-medium">{current.name}</span>
                      </>
                    ) : (
                      'Nobody to email'
                    )}
                  </p>
                  <IconButton
                    label="Next person"
                    variant="quiet"
                    size="sm"
                    disabled={index >= sendable.length - 1}
                    onClick={() => setIndex((i) => Math.min(sendable.length - 1, i + 1))}
                  >
                    <ChevronRight />
                  </IconButton>
                </div>
                <div className="px-4 py-3">
                  {current ? (
                    <>
                      <p className="text-xs text-fg-subtle">
                        To {current.email}
                        {current.jobTitle ? `, about ${current.jobTitle}` : ''}
                      </p>
                      {!current.applicationId && current.subject && (
                        <p className="mt-1 text-sm font-medium text-fg">{current.subject}</p>
                      )}
                      <div className="mt-2 max-h-80 overflow-y-auto">
                        {current.body ? (
                          <RichText markdown={current.body} className="text-sm" />
                        ) : (
                          <p className="text-sm text-fg-subtle">Your message shows here.</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-fg-subtle">
                      Everyone selected is skipped. See the reasons below.
                    </p>
                  )}
                </div>
              </section>
              {skipped.length > 0 && (
                <Alert
                  tone="warning"
                  icon={UserX}
                  title={
                    skipped.length === 1
                      ? '1 person is skipped'
                      : `${skipped.length} people are skipped`
                  }
                >
                  <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto">
                    {skipped.map((r) => (
                      <li key={r.candidateId}>
                        <span className="font-medium">{r.name}</span>: {r.skip}
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}
            </>
          )}
        </aside>
      </div>
    </Drawer>
  );
}

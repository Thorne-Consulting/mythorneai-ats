'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Trash2 } from 'lucide-react';
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Input,
  SectionTitle,
  Select,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';
import { templateCategories, type MessageTemplate } from '../sample-messages';
import { useMessages } from './MessagesShell';
import { candidateValues, fillTemplate, templateVariables, variablesIn } from './template-vars';

/** /messages/templates/new (no id) and /messages/templates/[id]. */
export function TemplateEditor({ id }: { id?: string }) {
  const { templates, ready } = useMessages();
  const existing = id ? templates.find((t) => t.id === id) : undefined;
  const crumbs = (
    <Breadcrumbs
      items={[
        { label: 'Messages', href: '/messages' },
        { label: 'Templates', href: '/messages/templates' },
        { label: existing?.name ?? (id ? 'Template' : 'New template') },
      ]}
      className="mb-1.5"
    />
  );
  if (!ready)
    return (
      <>
        {crumbs}
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </>
    );
  if (id && !existing)
    return (
      <>
        {crumbs}
        <Card>
          <EmptyState
            icon={FileText}
            title="Template not found"
            description="It may have been deleted."
            action={
              <Link
                href="/messages/templates"
                className="text-sm font-medium text-accent-foreground hover:underline"
              >
                Back to templates
              </Link>
            }
          />
        </Card>
      </>
    );
  return (
    <>
      {crumbs}
      <Form initial={existing} />
    </>
  );
}

const known = new Set<string>(templateVariables.map((v) => v.key));

function Form({ initial }: { initial?: MessageTemplate }) {
  const router = useRouter();
  const { setTemplates, conversations } = useMessages();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    category: initial?.category ?? templateCategories[0],
    subject: initial?.subject ?? '',
    body: initial?.body ?? '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [previewFor, setPreviewFor] = useState<string | null>(conversations[0]?.id ?? null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'subject' | 'body'>('body');

  const errors = {
    name: !form.name.trim() ? 'Name the template' : undefined,
    subject: !form.subject.trim() ? 'Add a subject' : undefined,
    body: !form.body.trim() ? 'Write the message' : undefined,
  };
  const used = variablesIn(`${form.subject} ${form.body}`);
  const unknown = used.filter((v) => !known.has(v));
  const candidate = conversations.find((c) => c.id === previewFor);
  const values = candidate
    ? candidateValues(candidate)
    : Object.fromEntries(templateVariables.map((v) => [v.key, v.example]));
  const subject = fillTemplate(form.subject, values);
  const body = fillTemplate(form.body, values);
  const missing = [...new Set([...subject.missing, ...body.missing])].filter((m) => known.has(m));

  const insert = (key: string) => {
    const field = lastField.current;
    const el = field === 'subject' ? subjectRef.current : bodyRef.current;
    const value = form[field];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const token = `{{${key}}}`;
    setForm({ ...form, [field]: value.slice(0, start) + token + value.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const save = () => {
    setSubmitted(true);
    if (errors.name || errors.subject || errors.body) return;
    const updatedAt = new Date().toISOString().slice(0, 16);
    const next: MessageTemplate = {
      id: initial?.id ?? crypto.randomUUID(),
      ...form,
      name: form.name.trim(),
      updatedAt,
    };
    setTemplates((list) =>
      initial ? list.map((t) => (t.id === initial.id ? next : t)) : [next, ...list],
    );
    toast.success(initial ? 'Template saved' : 'Template created', next.name);
    router.push('/messages/templates');
  };

  return (
    <>
      <SectionTitle
        title={initial ? 'Edit template' : 'New template'}
        description="Click a variable to insert it where your cursor is."
        className="mb-4"
        action={
          initial && (
            <Button variant="danger-quiet" leftIcon={<Trash2 />} onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <form
              className="grid gap-4 p-5 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <Input
                required
                label="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.currentTarget.value })}
                error={submitted && errors.name}
              />
              <Select
                label="Category"
                data={templateCategories}
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v ?? templateCategories[0] })}
              />
              <Input
                ref={subjectRef}
                required
                label="Subject"
                className="sm:col-span-2"
                value={form.subject}
                onFocus={() => (lastField.current = 'subject')}
                onChange={(e) => setForm({ ...form, subject: e.currentTarget.value })}
                error={submitted && errors.subject}
              />
              <Textarea
                ref={bodyRef}
                required
                label="Message"
                minRows={8}
                className="sm:col-span-2"
                value={form.body}
                onFocus={() => (lastField.current = 'body')}
                onChange={(e) => setForm({ ...form, body: e.currentTarget.value })}
                error={submitted && errors.body}
              />
              {unknown.length > 0 && (
                <p className="text-xs text-tone-amber-fg sm:col-span-2" role="status">
                  Not a known variable: {unknown.map((u) => `{{${u}}}`).join(', ')}. It will be sent
                  as written.
                </p>
              )}
              <div className="flex justify-end gap-2 sm:col-span-2">
                <Button variant="secondary" onClick={() => router.push('/messages/templates')}>
                  Cancel
                </Button>
                <Button type="submit">{initial ? 'Save template' : 'Create template'}</Button>
              </div>
            </form>
          </Card>

          <Card>
            <CardHeader
              title="Preview"
              description="How it reads for a real candidate."
              action={
                <Select
                  aria-label="Preview for candidate"
                  placeholder="Example values"
                  clearable
                  data={conversations.map((c) => ({ value: c.id, label: c.name }))}
                  value={previewFor}
                  onChange={setPreviewFor}
                  className="w-56"
                />
              }
            />
            <div className="px-5 pb-5">
              <div className="rounded-lg border border-border-subtle bg-background p-4">
                <p className="text-xs text-fg-subtle">Subject</p>
                <p className="text-base font-medium text-fg">{subject.text || '—'}</p>
                <p className="mt-4 text-base whitespace-pre-wrap text-fg">
                  {body.text || 'Nothing written yet.'}
                </p>
              </div>
              {missing.length > 0 && (
                <p className="mt-3 text-xs text-tone-amber-fg">
                  No value for {candidate?.name ?? 'this candidate'}:{' '}
                  {missing.map((m) => `{{${m}}}`).join(', ')}. The sender fills it in by hand.
                </p>
              )}
            </div>
          </Card>
        </div>

        <Card className="self-start xl:sticky xl:top-[101px]">
          <CardHeader
            title="Variables"
            description="Filled from the candidate when you insert the template."
          />
          <ul className="flex flex-col gap-1 px-3 pb-4">
            {templateVariables.map((v) => (
              <li key={v.key}>
                <button
                  type="button"
                  onClick={() => insert(v.key)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-fg">{`{{${v.key}}}`}</span>
                    <span className="block truncate text-2xs text-fg-subtle">
                      {v.label} · e.g. {v.example}
                    </span>
                  </span>
                  {used.includes(v.key) && (
                    <Badge size="sm" tone="blue">
                      Used
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <ConfirmDialog
        opened={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this template?"
        message="Messages already sent are not affected."
        confirmLabel="Delete template"
        onConfirm={() => {
          if (!initial) return;
          setTemplates((list) => list.filter((t) => t.id !== initial.id));
          toast.success('Template deleted', initial.name);
          router.push('/messages/templates');
        }}
      />
    </>
  );
}

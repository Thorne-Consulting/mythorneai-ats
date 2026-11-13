'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Input,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';

export interface EmailTemplate {
  key: string;
  label: string;
  variables: string[];
  defaultSubject: string;
  defaultBody: string;
  subject: string;
  body: string;
  source: 'default' | 'organization' | 'job';
  version: number;
}
interface Preview {
  subject: string;
  body: string;
  html: string;
}

const SOURCE_LABEL = {
  default: 'Standard wording',
  organization: 'Changed for all jobs',
  job: 'Changed for this job',
} as const;

/** Lists the emails we send and edits one at a time. With requisitionId, edits the per-job override. */
export function EmailTemplateEditor({ requisitionId }: { requisitionId?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const templates = useQuery({
    queryKey: ['email-templates', requisitionId ?? null],
    queryFn: () =>
      api.get<EmailTemplate[]>(
        `/api/email-templates${requisitionId ? `?requisitionId=${requisitionId}` : ''}`,
      ),
  });
  if (!templates.data)
    return (
      <Card>
        <SkeletonRows rows={4} />
      </Card>
    );
  if (templates.data.length === 0)
    return (
      <Card>
        <EmptyState icon={Mail} title="No emails to edit" />
      </Card>
    );
  const current = templates.data.find((x) => x.key === selected) ?? templates.data[0];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[240px_1fr]">
      <Card className="p-2">
        <nav aria-label="Emails" className="flex gap-1 overflow-x-auto lg:flex-col">
          {templates.data.map((template) => {
            const active = template.key === current.key;
            return (
              <button
                key={template.key}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setSelected(template.key)}
                className={cn(
                  'flex shrink-0 items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-fg-muted transition-colors hover:bg-secondary hover:text-fg',
                  active &&
                    'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                <span className="truncate">{template.label}</span>
                {template.source !== 'default' && (
                  <span
                    aria-label="Changed from the standard wording"
                    className="size-1.5 shrink-0 rounded-full bg-tone-blue-dot"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </Card>
      <Editor
        key={`${current.key}-${requisitionId ?? ''}-${current.version}-${current.source}`}
        template={current}
        requisitionId={requisitionId}
      />
    </div>
  );
}

function Editor({ template, requisitionId }: { template: EmailTemplate; requisitionId?: string }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focus = useRef<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = subject !== template.subject || body !== template.body;
  const variables = [
    ...template.variables,
    ...(template.variables.includes('company') ? [] : ['company']),
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .post<Preview>(`/api/email-templates/${template.key}/preview`, { subject, body })
        .then((result) => {
          setPreview(result);
          setPreviewError(false);
        })
        .catch(() => setPreviewError(true));
    }, 400);
    return () => clearTimeout(timer);
  }, [subject, body, template.key]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['email-templates'] });
  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/email-templates/${template.key}`, {
        subject,
        body,
        requisitionId: requisitionId ?? null,
      }),
    onSuccess: () => {
      setError(null);
      refresh();
      toast.success(`${template.label} email saved`);
    },
    onError: (e: Error) => setError(e.message),
  });
  const reset = useMutation({
    mutationFn: () =>
      api.delete(
        `/api/email-templates/${template.key}${requisitionId ? `?requisitionId=${requisitionId}` : ''}`,
      ),
    onSuccess: () => {
      refresh();
      toast.success(
        requisitionId
          ? 'This job now uses the wording for all jobs'
          : 'Back to the standard wording',
      );
    },
    onError: (e: Error) => toast.error('Could not reset the wording', e.message),
  });

  const insert = (variable: string) => {
    const token = `{{${variable}}}`;
    const inSubject = focus.current === 'subject';
    const element = inSubject ? subjectRef.current : bodyRef.current;
    const value = inSubject ? subject : body;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    (inSubject ? setSubject : setBody)(next);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-2">
      <Card>
        <CardHeader
          title={template.label}
          description={
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={template.source === 'default' ? 'gray' : 'blue'}>
                {SOURCE_LABEL[template.source]}
              </Badge>
              {template.version > 0 && <span>Version {template.version}</span>}
            </span>
          }
          action={
            template.source !== 'default' && (
              <Button
                variant="secondary"
                size="sm"
                loading={reset.isPending}
                onClick={() => reset.mutate()}
              >
                {requisitionId && template.source === 'job'
                  ? 'Use the wording for all jobs'
                  : 'Go back to standard wording'}
              </Button>
            )
          }
        />
        <div className="flex flex-col gap-4 border-t border-border-subtle px-5 py-5">
          <Input
            label="Subject"
            ref={subjectRef}
            value={subject}
            onChange={(event) => setSubject(event.currentTarget.value)}
            onFocus={() => (focus.current = 'subject')}
          />
          <Textarea
            label="Message"
            ref={bodyRef}
            minRows={8}
            maxRows={20}
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            onFocus={() => (focus.current = 'body')}
          />
          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm font-medium text-fg">Details you can drop in</p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              Click one to add it where your cursor is. It’s filled in with real details when the
              email is sent.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {variables.map((variable) => (
                <button
                  key={variable}
                  type="button"
                  onClick={() => insert(variable)}
                  aria-label={`Insert ${variable}`}
                  className="rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-xs text-fg-muted transition-colors hover:border-primary hover:bg-accent hover:text-accent-foreground"
                >
                  {`{{${variable}}}`}
                </button>
              ))}
            </div>
          </div>
          {error && (
            <Alert tone="danger" title="This email wasn’t saved">
              {error}
            </Alert>
          )}
        </div>
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-border-subtle bg-card px-5 py-3">
          {dirty && (
            <Badge tone="amber" className="mr-auto">
              Unsaved changes
            </Badge>
          )}
          {dirty && (
            <Button
              variant="secondary"
              onClick={() => {
                setSubject(template.subject);
                setBody(template.body);
                setError(null);
              }}
            >
              Discard
            </Button>
          )}
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </Card>

      <Card className="2xl:sticky 2xl:top-[101px]">
        <CardHeader
          title="Preview"
          description="Uses sample details, for example “Alex” and “Senior Engineer”."
        />
        <div className="border-t border-border-subtle px-5 py-5">
          {previewError && (
            <p className="mb-2 text-sm text-destructive">
              The preview didn’t update. Your text is still here.
            </p>
          )}
          <p className="text-xs text-fg-subtle">Subject</p>
          <p className="mb-3 text-sm font-medium text-fg">{preview?.subject ?? '…'}</p>
          {/* Email HTML renders on white, like an inbox, in both themes. */}
          <iframe
            title={`Preview of ${template.label} email`}
            sandbox=""
            srcDoc={preview?.html ?? ''}
            className="h-[360px] w-full rounded-lg border border-border bg-white"
          />
        </div>
      </Card>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, History, Monitor, MoreHorizontal, Send, Smartphone } from 'lucide-react';
import { api } from '@/api';
import { imageProblem } from '@/components/editor/images';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { RichText } from '@/components/rich-text';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  PageHeader,
  SearchSelect,
  SegmentedControl,
  SkeletonRows,
  Switch,
  toast,
} from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { RequisitionSummary } from '@/types';
import {
  EmailFrame,
  InsertDetailMenu,
  SubjectField,
  useDiscardGuard,
  VersionHistoryDrawer,
} from './editor-tools';
import {
  detailChips,
  useLivePreview,
  useRefreshTemplates,
  useTemplate,
  useTemplateLibrary,
  useTemplateVersions,
  type TemplateRecord,
} from './templates-data';

const SOURCE_LABEL = {
  default: 'Standard wording',
  organization: 'Changed for all jobs',
  job: 'Own wording for this job',
} as const;

/** `/messages/templates/new` (no id) or `/messages/templates/[id]`: a saved reply or an automatic email. */
export function TemplateEditorPage({ id }: { id?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const jobId = params.get('job');
  const record = useTemplate(id ?? null, jobId);
  const library = useTemplateLibrary();
  const guard = useDiscardGuard();
  const [fresh, setFresh] = useState(0);

  const setJob = (next: string | null) =>
    guard.ask(() =>
      router.replace(`/messages/templates/${id}${next ? `?job=${next}` : ''}`, { scroll: false }),
    );

  if (id && record.isError)
    return (
      <Card>
        <EmptyState
          icon={AlertTriangle}
          title="We can’t find this template"
          description="It may have been deleted, or it belongs to someone else."
          action={
            <Button variant="secondary" onClick={() => router.push('/messages/templates')}>
              Back to templates
            </Button>
          }
        />
      </Card>
    );
  if ((id && !record.data) || !library.data)
    return (
      <Card>
        <SkeletonRows rows={8} className="p-5" />
      </Card>
    );

  const template: TemplateRecord = record.data ?? {
    id: '',
    kind: 'Saved',
    name: '',
    details: library.data.savedReplyDetails,
    subject: '',
    body: '',
    shared: false,
    version: 0,
    canEdit: true,
  };
  return (
    <>
      <Editor
        // A restore, a reset or another job's wording starts the editor afresh.
        key={`${template.id}-${jobId ?? ''}-${template.version}-${template.source ?? ''}-${fresh}`}
        template={template}
        onDiscard={() => setFresh((n) => n + 1)}
        jobId={jobId}
        onJobChange={setJob}
        chips={detailChips(library.data.details, template.details)}
        canShare={library.data.canShare}
        guard={guard}
      />
      {guard.dialog}
    </>
  );
}

function Editor({
  template,
  jobId,
  onJobChange,
  chips,
  canShare,
  guard,
  onDiscard,
}: {
  template: TemplateRecord;
  onDiscard: () => void;
  jobId: string | null;
  onJobChange: (jobId: string | null) => void;
  chips: ReturnType<typeof detailChips>;
  canShare: boolean;
  guard: ReturnType<typeof useDiscardGuard>;
}) {
  const router = useRouter();
  const refresh = useRefreshTemplates();
  const automatic = template.kind === 'Automatic';
  const isNew = !template.id;
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category ?? '');
  const [shared, setShared] = useState(!!template.shared);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [previewAs, setPreviewAs] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const readOnly = !template.canEdit;
  // The editor writes Markdown with its own spacing; compare loosely so opening is not a change.
  const dirty =
    !readOnly &&
    (name !== template.name ||
      category !== (template.category ?? '') ||
      shared !== !!template.shared ||
      subject !== template.subject ||
      body.trim() !== template.body.trim());
  const { setDirty } = guard;
  useEffect(() => setDirty(dirty), [dirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const { preview, failed } = useLivePreview({
    subject,
    body,
    id: template.id || undefined,
    applicationId: previewAs,
  });
  const recipients = useQuery({
    queryKey: ['inbox-recipients'],
    queryFn: () =>
      api.get<{ applicationId: string; candidateName: string; jobTitle: string }[]>(
        '/api/inbox/recipients',
      ),
  });
  const jobs = useQuery({
    queryKey: ['requisitions', 'all'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
    enabled: automatic,
  });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        subject,
        body,
        name,
        category: category || null,
        shared,
        requisitionId: jobId,
      };
      return isNew
        ? api.post<{ id?: string }>('/api/templates', payload)
        : api.put<{ id?: string }>(`/api/templates/${template.id}`, payload);
    },
    onSuccess: (result) => {
      setError(null);
      setDirty(false);
      refresh();
      toast.success(automatic ? `${template.name} email saved` : 'Saved reply saved');
      if (isNew && result?.id) router.replace(`/messages/templates/${result.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });
  const reset = useMutation({
    mutationFn: () =>
      api.delete(`/api/templates/${template.id}${jobId ? `?requisitionId=${jobId}` : ''}`),
    onSuccess: () => {
      refresh();
      if (automatic)
        toast.success(
          jobId ? 'This job now uses the wording for all jobs' : 'Back to the standard wording',
        );
      else {
        toast.success('Saved reply deleted', template.name);
        router.push('/messages/templates');
      }
    },
    onError: (e: Error) => toast.error('That didn’t work', e.message),
  });
  const test = useMutation({
    mutationFn: () =>
      api.post<{ recipient: string }>('/api/templates/test', {
        subject: subject || name,
        body,
        id: template.id || undefined,
        applicationId: previewAs,
      }),
    onSuccess: (result) => toast.success('Test email on its way', `Sent to ${result.recipient}.`),
    onError: (e: Error) => toast.error('Could not send the test', e.message),
  });

  const jobTitle = jobs.data?.find((j) => j.id === jobId)?.title;
  const title = automatic ? template.name : isNew ? 'New saved reply' : template.name;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: 'Messages', href: '/messages' },
          {
            label: 'Templates',
            href: automatic ? '/messages/templates?tab=automatic' : '/messages/templates',
          },
          { label: title || 'Saved reply' },
        ]}
        title={title || 'Saved reply'}
        description={automatic ? template.sentWhen : undefined}
        actions={
          <>
            {!isNew && (
              <Button
                variant="secondary"
                leftIcon={<History />}
                onClick={() => setHistoryOpen(true)}
              >
                History
              </Button>
            )}
            <Button
              variant="secondary"
              leftIcon={<Send />}
              loading={test.isPending}
              disabled={!body.trim()}
              onClick={() => test.mutate()}
            >
              Send me a test
            </Button>
            {!readOnly &&
              !isNew &&
              (automatic
                ? template.source !== 'default' && (!jobId || template.source === 'job')
                : true) && (
                <Menu>
                  <MenuTrigger asChild>
                    <IconButton label="More actions" variant="secondary">
                      <MoreHorizontal />
                    </IconButton>
                  </MenuTrigger>
                  <MenuContent align="end">
                    <MenuItem danger={!automatic} onSelect={() => setConfirmReset(true)}>
                      {automatic
                        ? jobId
                          ? 'Use the wording for all jobs'
                          : 'Go back to the standard wording'
                        : 'Delete saved reply'}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
          </>
        }
      />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Card className="min-w-0">
          {automatic ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={template.source === 'default' ? 'gray' : 'blue'}>
                  {SOURCE_LABEL[template.source ?? 'default']}
                </Badge>
                {template.updatedAt && (
                  <span className="text-xs text-fg-subtle">
                    Version {template.version}, edited {formatRelative(template.updatedAt)}
                    {template.updatedByName ? ` by ${template.updatedByName}` : ''}
                  </span>
                )}
              </span>
              <SearchSelect
                value={jobId}
                onChange={onJobChange}
                placeholder="All jobs"
                className="w-full sm:w-64"
                data={[
                  { value: '', label: 'All jobs' },
                  ...(jobs.data ?? []).map((j) => ({ value: j.id, label: j.title })),
                ].filter((option) => option.value !== '' || jobId)}
              />
            </div>
          ) : (
            <div className="grid gap-4 border-b border-border-subtle px-5 py-4 sm:grid-cols-2">
              <Input
                label="Name"
                required
                value={name}
                disabled={readOnly}
                placeholder="For example: Thanks for applying"
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <Input
                label="Category"
                value={category}
                disabled={readOnly}
                placeholder="For example: Scheduling"
                onChange={(event) => setCategory(event.currentTarget.value)}
              />
              {(canShare || shared) && (
                <Switch
                  className="sm:col-span-2"
                  checked={shared}
                  disabled={readOnly || !canShare}
                  onCheckedChange={setShared}
                  label="Share with your team"
                  description="Everyone who writes to candidates can use it. Only people who manage templates can change it."
                />
              )}
            </div>
          )}

          <div className="flex flex-col gap-4 px-5 py-5">
            {automatic && jobId && template.source !== 'job' && (
              <Alert tone="info">
                {jobTitle ?? 'This job'} uses the wording for all jobs. Save a change here to give
                it its own.
              </Alert>
            )}
            <SubjectField
              label={automatic ? 'Subject' : 'Email subject'}
              description={
                automatic
                  ? undefined
                  : 'Only used for someone with no conversation yet, for example a bulk email to a talent pool.'
              }
              required={automatic}
              value={template.subject}
              readOnly={readOnly}
              onChange={setSubject}
              chips={chips}
            />
            <div>
              <p className="mb-1.5 text-sm font-medium text-fg">Message</p>
              {readOnly ? (
                <div className="rounded-md border border-border-subtle bg-muted/40 px-4 py-3">
                  <RichText markdown={body} className="text-base" />
                </div>
              ) : (
                <PlateMarkdownEditor
                  value={template.body}
                  onChange={setBody}
                  // Saved replies go into conversations, where files travel as attachments.
                  images={automatic}
                  chips={{ details: chips }}
                  placeholder="Write the message. Type { to add a detail such as First name."
                  header={<InsertDetailMenu chips={chips} />}
                />
              )}
              <p className="mt-1.5 text-xs text-fg-subtle">
                Details fill in with each person’s information when the email goes out.
              </p>
            </div>
            {automatic && !jobId && (template.overrides?.length ?? 0) > 0 && (
              <div className="rounded-lg bg-muted px-3 py-2.5 text-sm">
                <p className="font-medium text-fg">These jobs have their own wording</p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {template.overrides!.map((o) => (
                    <li key={o.requisitionId}>
                      <Link
                        href={`/messages/templates/${template.id}?job=${o.requisitionId}`}
                        className="text-accent-foreground hover:underline"
                      >
                        {o.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {error && (
              <Alert tone="danger" title="This wasn’t saved">
                {error}
              </Alert>
            )}
            {readOnly && (
              <Alert tone="info">
                {automatic
                  ? 'Only people who manage templates can change automatic emails.'
                  : 'This saved reply is shared. Only people who manage templates can change it. Make a copy to change your own.'}
              </Alert>
            )}
          </div>
          {!readOnly && (
            <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-border-subtle bg-card px-5 py-3">
              {dirty && (
                <Badge tone="amber" className="mr-auto">
                  Unsaved changes
                </Badge>
              )}
              {dirty && !isNew && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDirty(false);
                    onDiscard();
                  }}
                >
                  Discard
                </Button>
              )}
              <Button
                onClick={() => {
                  const problem = imageProblem(body);
                  if (problem) setError(problem);
                  else save.mutate();
                }}
                loading={save.isPending}
                disabled={!dirty && !isNew}
              >
                {isNew ? 'Save reply' : 'Save changes'}
              </Button>
            </div>
          )}
        </Card>

        <Card className="min-w-0 xl:sticky xl:top-[101px]">
          <CardHeader
            title="Preview"
            action={
              <SegmentedControl
                size="sm"
                aria-label="Preview width"
                value={phone ? 'phone' : 'desktop'}
                onValueChange={(v) => setPhone(v === 'phone')}
                items={[
                  { value: 'desktop', label: 'Desktop', icon: <Monitor /> },
                  { value: 'phone', label: 'Phone', icon: <Smartphone /> },
                ]}
              />
            }
          />
          <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4">
            <SearchSelect
              label="Preview as"
              value={previewAs}
              onChange={setPreviewAs}
              placeholder="Sample details"
              data={(recipients.data ?? []).map((r) => ({
                value: r.applicationId,
                label: `${r.candidateName}, ${r.jobTitle}`,
              }))}
            />
            {preview && preview.missing.length > 0 && (
              <p className="flex items-start gap-1.5 rounded-md bg-tone-amber-bg px-3 py-2 text-xs text-tone-amber-fg">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                No real value for {preview.missing.map((m) => m.label.toLowerCase()).join(', ')}, so
                the preview shows a sample.
              </p>
            )}
            {failed && (
              <p className="text-sm text-destructive">
                The preview didn’t update. Your text is still here.
              </p>
            )}
            {(automatic || subject) && (
              <div>
                <p className="text-xs text-fg-subtle">Subject</p>
                <p className="text-sm font-medium text-fg">{preview?.subject || '…'}</p>
              </div>
            )}
            <EmailFrame
              html={preview?.html ?? ''}
              title={`Preview of ${title || 'the saved reply'}`}
              phone={phone}
            />
          </div>
        </Card>
      </div>

      {!isNew && (
        <HistoryDrawer
          opened={historyOpen}
          onClose={() => setHistoryOpen(false)}
          template={template}
          jobId={jobId}
          readOnly={readOnly}
          onRestored={() => {
            setDirty(false);
            refresh();
          }}
        />
      )}
      <ConfirmDialog
        opened={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={automatic ? 'Go back to the earlier wording?' : 'Delete this saved reply?'}
        message={
          automatic
            ? jobId
              ? 'This job will use the wording for all jobs again. Its own wording stays in the history.'
              : 'Every job without its own wording will use the standard wording again. Your wording stays in the history.'
            : template.shared
              ? 'It is removed for everyone on your team. Messages already sent stay as they are.'
              : 'Messages already sent stay as they are.'
        }
        confirmLabel={automatic ? 'Use earlier wording' : 'Delete saved reply'}
        onConfirm={() => reset.mutate()}
      />
    </>
  );
}

function HistoryDrawer({
  opened,
  onClose,
  template,
  jobId,
  readOnly,
  onRestored,
}: {
  opened: boolean;
  onClose: () => void;
  template: TemplateRecord;
  jobId: string | null;
  readOnly: boolean;
  onRestored: () => void;
}) {
  const versions = useTemplateVersions(template.id, jobId, opened);
  const restore = useMutation({
    mutationFn: (version: number) =>
      api.post(`/api/templates/${template.id}/restore`, { version, requisitionId: jobId }),
    onSuccess: () => {
      toast.success('Older wording restored', 'It is saved as the newest version.');
      onClose();
      onRestored();
    },
    onError: (e: Error) => toast.error('Could not restore that version', e.message),
  });
  return (
    <VersionHistoryDrawer
      opened={opened}
      onClose={onClose}
      versions={versions.data}
      readOnly={readOnly}
      restoring={restore.isPending}
      onRestore={(version) => restore.mutate(version)}
    />
  );
}

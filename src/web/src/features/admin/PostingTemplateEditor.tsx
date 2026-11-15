'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { History } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Input,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { JobPostingView } from '@/components/careers/JobPostingView';
import { imageProblem } from '@/components/editor/images';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import {
  draftProblem,
  toDraft,
  toInput,
  type Question,
  type QuestionDraft,
} from '@/features/careers/questions';
import { QuestionBuilder } from '@/features/requisitions/QuestionBuilder';
import { formatDateTime } from '@/lib/format';

type Template = {
  id: string;
  name: string;
  version: number;
  headerMarkdown: string;
  descriptionMarkdown: string;
  benefitsMarkdown: string;
  questions: Omit<Question, 'id'>[];
  archivedAt?: string | null;
};
type Version = {
  id: string;
  version: number;
  isActive: boolean;
  updatedAt: string;
  updatedByName?: string | null;
};
type Draft = {
  name: string;
  header: string;
  description: string;
  benefits: string;
  questions: QuestionDraft[];
};

const EMPTY: Draft = { name: '', header: '', description: '', benefits: '', questions: [] };

const SECTIONS = [
  {
    key: 'header',
    title: 'Company intro',
    hint: 'Shown first on every job made from this template.',
    placeholder: 'Who you are and why the work matters',
  },
  {
    key: 'description',
    title: 'Role description starter',
    hint: 'The part people edit for each job.',
    placeholder: 'What this kind of role owns, day to day',
  },
  {
    key: 'benefits',
    title: 'Benefits',
    hint: 'Shown last.',
    placeholder: 'Leave, pay extras, ways of working',
  },
] as const;

/** Create a posting template, or edit one (each save is a new version; older ones can be restored). */
export function PostingTemplateEditor({ id }: { id?: string }) {
  const router = useRouter();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const existing = useQuery({
    queryKey: ['posting-template', id],
    queryFn: () =>
      api.get<{ template: Template; versions: Version[] }>(`/api/posting-templates/${id}`),
    enabled: !!id,
  });
  const [draft, setDraft] = useState<Draft | null>(id ? null : EMPTY);
  const [editorVersion, setEditorVersion] = useState(0);
  const [tried, setTried] = useState(false);
  const [restoring, setRestoring] = useState<Version | null>(null);
  const template = existing.data?.template;
  useEffect(() => {
    if (!template) return;
    setDraft({
      name: template.name,
      header: template.headerMarkdown,
      description: template.descriptionMarkdown,
      benefits: template.benefitsMarkdown,
      questions: template.questions.map((q) => toDraft({ ...q, id: undefined })),
    });
    setEditorVersion((v) => v + 1);
  }, [template]);

  const done = (newId: string) => {
    queryClient.invalidateQueries({ queryKey: ['posting-templates'] });
    queryClient.invalidateQueries({ queryKey: ['posting-template'] });
    router.push(`/settings/templates/${newId}`);
  };
  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = {
        name: d.name.trim(),
        headerMarkdown: d.header,
        descriptionMarkdown: d.description,
        benefitsMarkdown: d.benefits,
        questions: d.questions.map(toInput),
      };
      return id
        ? api.put<{ id: string; version: number }>(`/api/posting-templates/${id}`, body)
        : api.post<{ id: string; version: number }>('/api/posting-templates', body);
    },
    onSuccess: ({ id: newId, version }) => {
      toast.success(id ? `Saved as version ${version}` : 'Template created');
      done(newId);
    },
    onError: (error: Error) => toast.error('Could not save the template', error.message),
  });
  const restore = useMutation({
    mutationFn: (versionId: string) =>
      api.post<{ id: string; version: number }>(`/api/posting-templates/${versionId}/restore`),
    onSuccess: ({ id: newId, version }) => {
      setRestoring(null);
      toast.success(`Restored as version ${version}`);
      done(newId);
    },
    onError: (error: Error) => toast.error('Could not restore that version', error.message),
  });

  if (!draft || (id && !existing.data))
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const problems = [
    !draft.name.trim() && 'Give the template a name.',
    !draft.description.trim() && 'Write a role description starter.',
    draft.questions.some((q) => draftProblem(q)) && 'Fix the questions marked in red.',
    // The server refuses a picture without a description, so say so before saving.
    imageProblem([draft.header, draft.description, draft.benefits].join('\n\n')),
  ].filter(Boolean) as string[];
  const submit = () => {
    setTried(true);
    if (problems.length === 0) save.mutate(draft);
  };
  const composed = [draft.header, draft.description, draft.benefits]
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
  const versions = existing.data?.versions ?? [];
  const viewing = template && versions.find((v) => v.id === template.id);
  const latest = !viewing || viewing.isActive;

  return (
    <div className="flex flex-col gap-5">
      {template?.archivedAt && (
        <Alert tone="info" title="This template is archived">
          It does not show when people create a job. Restore it from the templates list.
        </Alert>
      )}
      {!latest && (
        <Alert tone="warning" title={`You are looking at version ${template?.version}`}>
          Saving makes it the newest version.
        </Alert>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader title="Posting" />
            <CardBody className="flex flex-col gap-5">
              <Input
                label="Template name"
                placeholder="Engineering standard"
                required
                className="max-w-md"
                value={draft.name}
                error={tried && !draft.name.trim() ? 'Give the template a name.' : undefined}
                onChange={(event) => set({ name: event.currentTarget.value })}
              />
              {SECTIONS.map((section) => (
                <section key={section.key} className="flex flex-col gap-1.5">
                  <h3 className="text-sm font-medium text-fg">{section.title}</h3>
                  <p className="text-xs text-fg-subtle">{section.hint}</p>
                  <PlateMarkdownEditor
                    key={`${section.key}-${editorVersion}`}
                    value={draft[section.key]}
                    onChange={(value) => set({ [section.key]: value })}
                    placeholder={section.placeholder}
                    editorClassName={
                      section.key === 'description' ? 'min-h-48 px-4 py-3' : 'min-h-28 px-4 py-3'
                    }
                  />
                </section>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Default questions"
              description="Every job made from this template starts with these."
            />
            <CardBody>
              <QuestionBuilder
                value={draft.questions}
                onChange={(questions) => set({ questions })}
                showErrors={tried}
              />
            </CardBody>
          </Card>
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border-subtle bg-card px-5 py-3 shadow-card">
            {tried && problems.length > 0 && (
              <p className="mr-auto text-sm text-destructive">{problems[0]}</p>
            )}
            <Button variant="secondary" onClick={() => router.push('/settings/templates')}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={submit}>
              {id ? 'Save as new version' : 'Create template'}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-5 xl:sticky xl:top-[101px]">
          <Card>
            <CardHeader
              title="Preview"
              description="A job made from this template, before edits."
            />
            <CardBody>
              <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border-subtle bg-background p-4">
                <JobPostingView
                  company={user.organizationName}
                  emptyDescription="The posting shows here as you write it."
                  job={{
                    title: 'Job title',
                    department: 'Team',
                    location: 'Location',
                    workMode: 'Hybrid',
                    employmentType: 'Full time',
                    description: composed,
                  }}
                />
              </div>
            </CardBody>
          </Card>
          {versions.length > 0 && (
            <Card>
              <CardHeader title="Versions" />
              <ul className="divide-y divide-border-subtle border-t border-border-subtle">
                {versions.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">
                        Version {v.version}
                        {v.id === template?.id && (
                          <span className="font-normal text-fg-subtle"> · open now</span>
                        )}
                      </p>
                      <p className="text-xs text-fg-subtle">
                        {formatDateTime(v.updatedAt)}
                        {v.updatedByName ? ` by ${v.updatedByName}` : ''}
                      </p>
                    </div>
                    {v.isActive ? (
                      <Badge tone="green">Current</Badge>
                    ) : (
                      <>
                        {v.id !== template?.id && (
                          <Button asChild size="xs" variant="quiet">
                            <Link href={`/settings/templates/${v.id}`}>View</Link>
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="quiet"
                          leftIcon={<History />}
                          onClick={() => setRestoring(v)}
                        >
                          Restore
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog
        opened={restoring !== null}
        onClose={() => setRestoring(null)}
        title={`Restore version ${restoring?.version}?`}
        message="Its text and questions become the newest version. Jobs already made keep their posting."
        confirmLabel="Restore version"
        confirmVariant="primary"
        onConfirm={() =>
          restoring
            ? restore.mutateAsync(restoring.id).then(
                () => undefined,
                () => undefined,
              )
            : undefined
        }
      />
    </div>
  );
}

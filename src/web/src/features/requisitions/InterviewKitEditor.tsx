'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookmarkPlus, ClipboardList, FilePlus2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { useAbility } from '@/lib/ability';
import { Alert, Badge, Button, Card, Input, Modal, SkeletonRows, toast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { imageProblem } from '@/components/editor/images';
import { KitForm } from '@/features/interview-library/KitForm';
import { useKitTemplates, useSaveTemplate } from '@/features/interview-library/library-data';
import { InterviewerPoolCard } from '@/features/interviews/InterviewerPoolCard';
import {
  blankDraft,
  draftFromTemplate,
  sameDraft,
  toKitBody,
  toTemplateBody,
  validateKit,
  type KitDraft,
  type KitResponse,
} from '@/features/interview-library/library-model';
import { useRequisition } from './requisition-data';

export const kitsHref = (requisitionId: string) => `/jobs/${requisitionId}/kits`;

/** The job's stages as options, Hired left out (nobody is interviewed there). */
function useStageOptions(requisitionId: string) {
  const job = useRequisition(requisitionId);
  return useMemo(
    () =>
      (job.data?.stages ?? [])
        .filter((stage) => stage.type !== 'Hired' && !stage.isTerminal)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((stage) => ({ value: stage.id, label: stage.name })),
    [job.data?.stages],
  );
}

/** Asks before leaving the page with unsaved changes. */
function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
}

/** A new kit: pick a template from the library (or start blank), then write it. */
export function NewInterviewKit({
  requisitionId,
  templateId,
}: {
  requisitionId: string;
  templateId?: string;
}) {
  const templates = useKitTemplates();
  const [draft, setDraft] = useState<KitDraft | null>(null);
  const picked = templateId ? templates.data?.find((item) => item.id === templateId) : undefined;
  const start = draft ?? (picked ? draftFromTemplate(picked) : null);

  if (start)
    return <KitEditor requisitionId={requisitionId} initial={start} key={picked?.id ?? 'new'} />;
  if (templateId && templates.isPending)
    return (
      <Card>
        <SkeletonRows rows={5} />
      </Card>
    );

  return (
    <article className="space-y-4">
      <Card className="p-5 sm:p-6">
        <h1 className="text-xl font-semibold text-fg">New interview kit</h1>
        <p className="mt-1 text-base text-fg-muted">
          Start from a template in your interview library. You can change everything after.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <li>
            <button
              type="button"
              onClick={() => setDraft(blankDraft())}
              className="flex h-full w-full flex-col items-start gap-2 rounded-xl border border-dashed border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
            >
              <FilePlus2 className="size-5 text-fg-subtle" aria-hidden />
              <span className="text-base font-medium text-fg">Blank kit</span>
              <span className="text-sm text-fg-subtle">Write your own competencies.</span>
            </button>
          </li>
          {templates.isPending &&
            [0, 1, 2].map((index) => (
              <li key={index}>
                <SkeletonRows rows={2} className="rounded-xl border border-border p-4" />
              </li>
            ))}
          {templates.data?.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => setDraft(draftFromTemplate(template))}
                className="flex h-full w-full flex-col items-start gap-2 rounded-xl border border-border p-4 text-left transition-colors hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
              >
                <ClipboardList className="size-5 text-tone-blue-fg" aria-hidden />
                <span className="text-base font-medium text-fg">{template.name}</span>
                {template.summary && (
                  <span className="text-sm text-fg-muted">{template.summary}</span>
                )}
                <span className="mt-auto pt-1 text-xs text-fg-subtle tnum">
                  {template.durationMinutes} minutes · {template.competencies.length}{' '}
                  {template.competencies.length === 1 ? 'competency' : 'competencies'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </article>
  );
}

/**
 * Writes a kit. With `saved`, it edits that kit: saving makes a new version, and interviews that
 * already use the kit keep the version they have.
 */
export function KitEditor({
  requisitionId,
  initial,
  saved,
}: {
  requisitionId: string;
  initial: KitDraft;
  saved?: KitResponse;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const ability = useAbility();
  const stages = useStageOptions(requisitionId);
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const errors = validateKit(draft, imageProblem(draft.instructions));
  const dirty = !sameDraft(draft, initial);
  useLeaveWarning(dirty);
  const kit = saved?.kit;

  const mutation = useMutation({
    mutationFn: () =>
      kit
        ? api.put(`/api/requisitions/${requisitionId}/interview-kits/${kit.id}`, toKitBody(draft))
        : api.post<{ id: string }>(
            `/api/requisitions/${requisitionId}/interview-kits`,
            toKitBody(draft),
          ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      queryClient.invalidateQueries({ queryKey: ['interview-kits', requisitionId] });
      toast.success(kit ? 'Kit saved' : 'Kit created');
      router.push(kitsHref(requisitionId));
    },
    onError: (error: Error) => toast.error('Could not save the kit', error.message),
  });
  const submit = () => {
    setTried(true);
    if (errors.ok) mutation.mutate();
    else toast.error('Some fields need attention', 'Fix the fields marked in red, then save.');
  };

  const versionNotice = kit && (kit.interviews > 0 || saved.versions.length > 0) && (
    <Alert tone="info" title={`Version ${kit.version}`}>
      {kit.interviews > 0 &&
        `${kit.interviews} ${kit.interviews === 1 ? 'interview uses' : 'interviews use'} this version. Saving makes version ${kit.version + 1}; ${kit.interviews === 1 ? 'that interview keeps' : 'those interviews keep'} version ${kit.version}. `}
      {saved.versions.map((version, index) => (
        <span key={version.id}>
          {index === 0 ? 'Earlier versions still in use: ' : ', '}
          <Link
            href={`/jobs/${requisitionId}/kits/${version.id}`}
            className="font-medium text-accent-foreground hover:underline"
          >
            version {version.version}
          </Link>{' '}
          ({version.interviews} {version.interviews === 1 ? 'interview' : 'interviews'})
          {index === saved.versions.length - 1 && '.'}
        </span>
      ))}
    </Alert>
  );

  return (
    <article className="space-y-4 pb-24">
      <Card className="p-4 sm:p-6">
        <KitForm
          draft={draft}
          onChange={setDraft}
          errors={tried ? errors : null}
          stages={stages}
          header={versionNotice}
        />
      </Card>
      {kit && <InterviewerPoolCard kitId={kit.id} />}
      {/* Sticky save bar: always in reach on a long kit. */}
      <div className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-border bg-card px-4 py-3 shadow-pop">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="w-full min-w-0 text-sm text-fg-muted sm:mr-auto sm:w-auto">
            {dirty ? (
              <Badge tone="amber" dot>
                Unsaved changes
              </Badge>
            ) : kit ? (
              `Version ${kit.version} · saved ${formatDate(kit.updatedAt)}`
            ) : (
              'Not saved yet'
            )}
            {tried && !errors.ok && (
              <span className="ml-2 text-destructive">Fix the fields marked in red.</span>
            )}
          </p>
          {ability.can('manage', 'InterviewKit') && (
            <Button
              variant="quiet"
              leftIcon={<BookmarkPlus />}
              aria-label="Save as template"
              className="mr-auto sm:mr-0"
              onClick={() => {
                setTried(true);
                if (errors.ok) setTemplateOpen(true);
              }}
            >
              {/* Icon only on a phone, so the bar stays one row of buttons. */}
              <span className="hidden sm:inline">Save as template</span>
            </Button>
          )}
          <Button
            variant="secondary"
            onClick={() =>
              kit && dirty ? setDraft(initial) : router.push(kitsHref(requisitionId))
            }
          >
            {kit && dirty ? 'Discard changes' : 'Cancel'}
          </Button>
          <Button loading={mutation.isPending} disabled={Boolean(kit) && !dirty} onClick={submit}>
            {kit ? 'Save changes' : 'Create kit'}
          </Button>
        </div>
      </div>
      <SaveAsTemplate draft={draft} opened={templateOpen} onClose={() => setTemplateOpen(false)} />
    </article>
  );
}

/** Copies the kit as written into the interview library, for other jobs to start from. */
function SaveAsTemplate({
  draft,
  opened,
  onClose,
}: {
  draft: KitDraft;
  opened: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(draft.name);
  const [summary, setSummary] = useState('');
  const save = useSaveTemplate();
  useEffect(() => {
    if (opened) setName(draft.name);
  }, [opened, draft.name]);
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Save as template"
      description="Other jobs can start a kit from it. Changes you make to this kit later do not change the template."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            disabled={!name.trim()}
            onClick={() =>
              save.mutate(toTemplateBody({ ...draft, name }, summary), {
                onSuccess: () => {
                  toast.success('Saved to the interview library');
                  onClose();
                },
              })
            }
          >
            Save template
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Template name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Input
          label="Summary"
          description="Optional. One line on what the round covers."
          value={summary}
          maxLength={200}
          onChange={(event) => setSummary(event.currentTarget.value)}
        />
      </div>
    </Modal>
  );
}

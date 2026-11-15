'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleAlert, Copy, Eye, Pencil } from 'lucide-react';
import { api, ApiError } from '@/api';
import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  Input,
  NumberInput,
  PageHeader,
  RadioGroup,
  SegmentedControl,
  Select,
  SkeletonRows,
  Switch,
  Wizard,
  toast,
} from '@/components/ui';
import { imageProblem, imagesNeedingWork } from '@/components/editor/images';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { useAbility } from '@/lib/ability';
import {
  formOf,
  useAssessment,
  useDepartments,
  useRefreshAssessments,
  type AssessmentForm,
} from './api';
import { CopyQuestionsModal } from './CopyQuestionsModal';
import { QuestionsEditor } from './QuestionEditor';
import { allQuestions, contentProblems, emptyContent, plural } from './scoring';
import { AssessmentPreview } from './take/AssessmentPreview';

const blankForm = (): AssessmentForm => ({
  name: '',
  department: null,
  kind: 'Native',
  expiryDays: 7,
  remindAfterDays: 3,
  blindReview: false,
  providerName: null,
  externalUrl: null,
  content: emptyContent(),
});

/** What stops a publish, in the order the steps come. */
function problemsOf(form: AssessmentForm): string[] {
  const out: string[] = [];
  // Pictures need a description before applicants see them (the server checks the same on publish).
  const pictures = (where: string, markdown: string) => {
    const problem = imageProblem(markdown);
    if (problem) out.push(`${where}: ${problem.charAt(0).toLowerCase()}${problem.slice(1, -1)}`);
  };
  if (!form.name.trim()) out.push('Give the assessment a name');
  pictures('Instructions', form.content.instructions);
  if (form.kind === 'External') {
    if (!form.providerName?.trim()) out.push('Name the provider that runs the test');
    if (!/^https:\/\/\S+$/.test(form.externalUrl?.trim() ?? ''))
      out.push('Add the test link, starting with https://');
    return out;
  }
  out.push(...contentProblems(form.content));
  allQuestions(form.content).forEach((q, i) => pictures(`Question ${i + 1}`, q.prompt));
  return out;
}

/** Every Markdown field, to hold a save while a picture is still uploading. */
const markdownOf = (form: AssessmentForm) => [
  form.content.instructions,
  ...allQuestions(form.content).map((q) => q.prompt),
];

/** /assessments/new and /assessments/[id]/edit: three steps, saved on the server as a draft at any point. */
export function AssessmentBuilder({ id: initialId }: { id?: string }) {
  const router = useRouter();
  const ability = useAbility();
  const refresh = useRefreshAssessments();
  const departments = useDepartments();
  const [id, setId] = useState(initialId);
  const existing = useAssessment(initialId);
  const [form, setForm] = useState<AssessmentForm | null>(initialId ? null : blankForm());
  const [saved, setSaved] = useState(() => (initialId ? '' : JSON.stringify(blankForm())));
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [copying, setCopying] = useState(false);
  const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const [leaving, setLeaving] = useState(false);
  const [nameTouched, setNameTouched] = useState(false);

  // Start from the saved assessment once it loads.
  useEffect(() => {
    if (form || !existing.data) return;
    const loaded = formOf(existing.data);
    setForm(loaded);
    setSaved(JSON.stringify(loaded));
  }, [existing.data, form]);

  const dirty = !!form && JSON.stringify(form) !== saved;
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const problems = useMemo(() => (form ? problemsOf(form) : []), [form]);
  const canEdit = ability.can('manage', 'Assessment');
  const status = existing.data?.status;
  const published = !!existing.data?.version;
  const back = id ? `/assessments/${id}` : '/assessments';

  const crumbs = [
    { label: 'Assessments', href: '/assessments' },
    ...(existing.data
      ? [{ label: existing.data.name, href: `/assessments/${existing.data.id}` }]
      : []),
    { label: initialId ? 'Edit' : 'New assessment' },
  ];

  if (!canEdit)
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title="Edit assessment" />
        <Card>
          <EmptyState
            icon={Pencil}
            title="Only recruiters and admins edit assessments"
            description="You can still send published ones to applicants and grade them."
          />
        </Card>
      </>
    );
  if (initialId && existing.isError)
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title="Edit assessment" />
        <Alert tone="warning" title="We could not open this assessment">
          It may have been removed. Go back to Assessments and pick another one.
        </Alert>
      </>
    );
  if (!form)
    return (
      <>
        <PageHeader breadcrumbs={crumbs} title="Edit assessment" />
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      </>
    );

  const set = (patch: Partial<AssessmentForm>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setContent = (patch: Partial<AssessmentForm['content']>) =>
    setForm((f) => (f ? { ...f, content: { ...f.content, ...patch } } : f));
  const native = form.kind === 'Native';
  const questions = allQuestions(form.content);
  const points = questions.reduce((n, q) => n + q.points, 0);

  /** Saves the draft (creating it the first time). Returns the id, or null when it failed. */
  async function save(): Promise<string | null> {
    if (!form) return null;
    if (markdownOf(form).some((markdown) => imagesNeedingWork(markdown).uploading)) {
      toast.error('Wait for the picture to finish uploading.');
      return null;
    }
    try {
      let current = id;
      if (current) await api.put(`/api/assessments/${current}`, form);
      else {
        current = (await api.post<{ id: string }>('/api/assessments', form)).id;
        setId(current);
        window.history.replaceState(null, '', `/assessments/${current}/edit`);
      }
      setSaved(JSON.stringify(form));
      return current;
    } catch (error) {
      toast.error((error as Error).message);
      return null;
    }
  }

  async function saveDraft() {
    setBusy('draft');
    const saved = await save();
    setBusy(null);
    if (!saved) return;
    refresh();
    toast.success(
      status === 'Active' ? 'Changes saved, not published yet' : 'Draft saved',
      form?.name || undefined,
    );
  }

  async function publish() {
    setBusy('publish');
    setServerProblems([]);
    const current = await save();
    if (!current) return setBusy(null);
    try {
      await api.post(`/api/assessments/${current}/publish`);
      await refresh();
      toast.success(
        published ? 'Changes published' : 'Assessment published',
        form?.name || undefined,
      );
      router.push(`/assessments/${current}`);
    } catch (error) {
      const details =
        error instanceof ApiError ? (error.details as { errors?: { problems?: string[] } }) : null;
      if (details?.errors?.problems) setServerProblems(details.errors.problems);
      else toast.error((error as Error).message);
      setBusy(null);
    }
  }

  const steps = native
    ? [
        { id: 'details', title: 'Details', description: 'Name, kind and instructions' },
        {
          id: 'questions',
          title: 'Questions',
          description: `${plural(questions.length, 'question')} · ${plural(points, 'point')}`,
        },
        {
          id: 'settings',
          title: 'Settings',
          description: 'Timer, checks and publishing',
          valid: problems.length === 0,
        },
      ]
    : [
        { id: 'details', title: 'Details', description: 'Name, provider and link' },
        {
          id: 'settings',
          title: 'Settings',
          description: 'Links, reminders and publishing',
          valid: problems.length === 0,
        },
      ];
  const current = steps[Math.min(step, steps.length - 1)].id;

  return (
    <>
      <PageHeader
        breadcrumbs={crumbs}
        title={initialId ? 'Edit assessment' : 'Create assessment'}
        actions={
          <>
            <Button variant="quiet" onClick={() => (dirty ? setLeaving(true) : router.push(back))}>
              {dirty ? 'Discard changes' : 'Close'}
            </Button>
            <Button
              variant="secondary"
              loading={busy === 'draft'}
              disabled={!!busy}
              onClick={saveDraft}
            >
              Save draft
            </Button>
          </>
        }
      />
      {status === 'Active' && (
        <Alert tone="info" className="mb-5">
          Applicants who already started keep the version they started. Your changes reach new
          invites when you publish them.
        </Alert>
      )}
      <Wizard
        steps={steps}
        current={Math.min(step, steps.length - 1)}
        onStepChange={(i) => {
          setStep(i);
          window.scrollTo({ top: 0 });
        }}
        onFinish={publish}
        busy={busy === 'publish'}
        finishLabel={published ? 'Publish changes' : 'Publish assessment'}
      >
        {current === 'details' && (
          <div className="flex flex-col gap-5">
            <Input
              required
              label="Name"
              value={form.name}
              maxLength={200}
              onChange={(e) => set({ name: e.currentTarget.value })}
              onBlur={() => setNameTouched(true)}
              error={nameTouched && !form.name.trim() ? 'Give the assessment a name' : undefined}
              autoFocus={!initialId}
            />
            {!published && (
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-fg">Kind</legend>
                <RadioGroup
                  aria-label="Kind"
                  value={form.kind}
                  onValueChange={(v) => set({ kind: v as AssessmentForm['kind'] })}
                  options={[
                    {
                      value: 'Native',
                      label: 'Questions here',
                      description:
                        'Quizzes, written answers, code and file uploads, taken in the candidate portal.',
                    },
                    {
                      value: 'External',
                      label: 'A test on another site',
                      description:
                        'Send a link to a provider such as HackerRank or TestGorilla, then type in the result.',
                    },
                  ]}
                />
              </fieldset>
            )}
            <Select
              label="Department"
              description="Helps people find it in the library."
              placeholder="No department"
              clearable
              data={departments.data?.departments ?? []}
              value={form.department}
              onChange={(department) => set({ department })}
              className="sm:max-w-sm"
            />
            {!native && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  required
                  label="Provider"
                  placeholder="For example, HackerRank"
                  value={form.providerName ?? ''}
                  maxLength={120}
                  onChange={(e) => set({ providerName: e.currentTarget.value })}
                />
                <Input
                  required
                  label="Test link"
                  type="url"
                  placeholder="https://"
                  value={form.externalUrl ?? ''}
                  onChange={(e) => set({ externalUrl: e.currentTarget.value })}
                  description="Add {{email}}, {{firstName}} or {{lastName}} and we fill them in for each person."
                  className="sm:col-span-2"
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-fg">Instructions</span>
              <span className="text-xs text-fg-subtle">
                Applicants read this before they start.
              </span>
              <PlateMarkdownEditor
                value={form.content.instructions}
                onChange={(instructions) => setContent({ instructions })}
                placeholder="What to expect, what they may use, and how long it takes."
              />
            </div>
          </div>
        )}

        {current === 'questions' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl
                aria-label="View"
                value={preview ? 'preview' : 'edit'}
                onValueChange={(v) => setPreview(v === 'preview')}
                items={[
                  { value: 'edit', label: 'Edit', icon: <Pencil /> },
                  { value: 'preview', label: 'Preview as applicant', icon: <Eye /> },
                ]}
              />
              {!preview && (
                <Button
                  variant="quiet"
                  size="sm"
                  leftIcon={<Copy />}
                  onClick={() => setCopying(true)}
                >
                  Copy from another assessment
                </Button>
              )}
            </div>
            {preview ? (
              <AssessmentPreview content={form.content} />
            ) : (
              <QuestionsEditor
                sections={form.content.sections}
                onChange={(sections) => setContent({ sections })}
              />
            )}
          </div>
        )}

        {current === 'settings' && (
          <div className="flex flex-col gap-7">
            {native && (
              <fieldset className="flex flex-col gap-4">
                <legend className="mb-3 text-md font-semibold text-fg">Time and scoring</legend>
                <Switch
                  label="Use a timer"
                  description="The clock runs on our server from the moment they start. Answers save until time runs out, then we submit them."
                  checked={form.content.timed}
                  onCheckedChange={(timed) =>
                    setContent({
                      timed,
                      minutes: timed && !form.content.minutes ? 45 : form.content.minutes,
                    })
                  }
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {form.content.timed && (
                    <NumberInput
                      label="Time limit"
                      min={5}
                      max={600}
                      rightSection={<span className="pr-3 text-sm text-fg-subtle">minutes</span>}
                      value={form.content.minutes || ''}
                      onValueChange={(v) => setContent({ minutes: v === '' ? 0 : Math.round(v) })}
                    />
                  )}
                  <NumberInput
                    label="Pass mark"
                    min={1}
                    max={100}
                    rightSection={<span className="pr-3 text-sm text-fg-subtle">%</span>}
                    value={form.content.passMark || ''}
                    onValueChange={(v) => setContent({ passMark: v === '' ? 0 : Math.round(v) })}
                    description={`${Math.ceil((points * (form.content.passMark || 0)) / 100)} of ${plural(points, 'point')}`}
                  />
                </div>
              </fieldset>
            )}

            <fieldset className="flex flex-col gap-4">
              <legend className="mb-3 text-md font-semibold text-fg">Links and reminders</legend>
              <NumberInput
                label="Links stay open for"
                min={1}
                max={90}
                rightSection={<span className="pr-3 text-sm text-fg-subtle">days</span>}
                value={form.expiryDays || ''}
                onValueChange={(v) => set({ expiryDays: v === '' ? 0 : Math.round(v) })}
                description="You can pick another due date when you send it, and change it later."
                className="sm:max-w-xs"
              />
              <Switch
                label="Remind people who have not finished"
                checked={form.remindAfterDays !== null}
                onCheckedChange={(on) => set({ remindAfterDays: on ? 3 : null })}
              />
              {form.remindAfterDays !== null && (
                <NumberInput
                  label="Send the reminder after"
                  min={1}
                  max={30}
                  rightSection={<span className="pr-3 text-sm text-fg-subtle">days</span>}
                  value={form.remindAfterDays || ''}
                  onValueChange={(v) => set({ remindAfterDays: v === '' ? 1 : Math.round(v) })}
                  description="One email, sent during your working hours."
                  className="sm:max-w-xs"
                />
              )}
            </fieldset>

            {native && (
              <fieldset className="flex flex-col gap-4">
                <legend className="mb-3 text-md font-semibold text-fg">Order</legend>
                <Switch
                  label="Shuffle questions"
                  description="Each person gets the questions of each section in a different order. Reviewers see the order they saw."
                  checked={form.content.shuffleQuestions}
                  onCheckedChange={(shuffleQuestions) => setContent({ shuffleQuestions })}
                />
                <Switch
                  label="Shuffle answers in multiple choice questions"
                  checked={form.content.shuffleOptions}
                  onCheckedChange={(shuffleOptions) => setContent({ shuffleOptions })}
                />
              </fieldset>
            )}

            {native && (
              <fieldset className="flex flex-col gap-4">
                <legend className="mb-1 text-md font-semibold text-fg">Checks</legend>
                <p className="-mt-1 text-sm text-fg-muted">
                  Applicants are told about each check before they start. Checks show up for the
                  reviewer as a timeline. They never fail anyone on their own.
                </p>
                <Switch
                  label="Note when they leave the tab"
                  checked={form.content.tabSwitch}
                  onCheckedChange={(tabSwitch) => setContent({ tabSwitch })}
                />
                <Switch
                  label="Ask for full screen"
                  description="We note each time they leave full screen. Some phones cannot go full screen; that is fine."
                  checked={form.content.fullscreen}
                  onCheckedChange={(fullscreen) => setContent({ fullscreen })}
                />
                <Switch
                  label="Turn off pasting"
                  description="Pasting into answers is blocked, and we note each try."
                  checked={form.content.blockPaste}
                  onCheckedChange={(blockPaste) => setContent({ blockPaste })}
                />
              </fieldset>
            )}

            <fieldset className="flex flex-col gap-4">
              <legend className="mb-3 text-md font-semibold text-fg">Grading</legend>
              <Switch
                label="Grade without names"
                description="Reviewers see a code instead of the name and email until they record a decision."
                checked={form.blindReview}
                onCheckedChange={(blindReview) => set({ blindReview })}
              />
            </fieldset>

            <section
              aria-labelledby="publish-check"
              className="rounded-xl border border-border-subtle bg-muted p-4 sm:p-5"
            >
              <h3 id="publish-check" className="text-md font-semibold text-fg">
                Before you publish
              </h3>
              <DescriptionList
                className="mt-3"
                columns={2}
                items={[
                  { label: 'Name', value: form.name || 'Not set' },
                  native
                    ? {
                        label: 'Questions',
                        value: `${plural(questions.length, 'question')} in ${plural(form.content.sections.length, 'section')}`,
                      }
                    : { label: 'Provider', value: form.providerName || 'Not set' },
                  ...(native
                    ? [
                        {
                          label: 'Time',
                          value: form.content.timed
                            ? `${form.content.minutes} minutes`
                            : 'No time limit',
                        },
                        {
                          label: 'To pass',
                          value: `${form.content.passMark || 0}% (${Math.ceil((points * (form.content.passMark || 0)) / 100)} of ${plural(points, 'point')})`,
                        },
                      ]
                    : []),
                ]}
              />
              {[...problems, ...serverProblems.filter((p) => !problems.includes(p))].length ===
              0 ? (
                <p className="mt-4 flex items-center gap-2 text-sm font-medium text-tone-green-fg">
                  <CheckCircle2 className="size-4" aria-hidden /> Ready to publish.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-1.5" aria-label="Problems to fix">
                  {[...new Set([...problems, ...serverProblems])].map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm text-tone-amber-fg">
                      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-xs text-fg-subtle">
                You can save a draft at any time, even with problems.
              </p>
            </section>
          </div>
        )}
      </Wizard>

      <CopyQuestionsModal
        opened={copying}
        onClose={() => setCopying(false)}
        excludeId={id}
        onCopy={(copied) => {
          const sections = form.content.sections;
          const last = sections.length - 1;
          setContent({
            sections: sections.map((s, i) =>
              i === last ? { ...s, questions: [...s.questions, ...copied] } : s,
            ),
          });
          toast.success(
            `${plural(copied.length, 'question')} copied`,
            `Added to ${sections[last]?.title || 'the last section'}`,
          );
        }}
      />
      <ConfirmDialog
        opened={leaving}
        onClose={() => setLeaving(false)}
        title="Discard your changes?"
        message={
          id
            ? 'The assessment goes back to how it was last saved.'
            : 'Everything you entered for this new assessment is removed.'
        }
        confirmLabel="Discard changes"
        onConfirm={() => {
          setSaved(JSON.stringify(form));
          router.push(back);
        }}
      />
    </>
  );
}

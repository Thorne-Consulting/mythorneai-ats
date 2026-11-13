'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Circle } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  Input,
  NumberInput,
  PageHeader,
  RadioGroup,
  Select,
  SkeletonRows,
  Switch,
  Textarea,
  Wizard,
  toast,
  type Tone,
} from '@/components/ui';
import { useLocalStorageState } from '@/lib/hooks';
import { PreviewTitle } from '../preview-ui';
import {
  assessmentTypes,
  defaultSettings,
  departments,
  newQuestion,
  type Assessment,
  type AssessmentStatus,
} from '../sample-assessments';
import { CandidatePreview } from './CandidatePreview';
import { QuestionsEditor } from './QuestionEditor';
import { questionProblems } from './scoring';
import { useAssessments } from './store';

type Form = Omit<Assessment, 'id' | 'status' | 'tone'> & { publish: AssessmentStatus };

const deptTones: Record<string, Tone> = {
  Engineering: 'blue',
  Product: 'violet',
  Design: 'blue',
  Analytics: 'green',
  Marketing: 'amber',
  Support: 'green',
  Sales: 'violet',
};

const emptyForm = (): Form => ({
  name: '',
  type: assessmentTypes[0],
  department: departments[0],
  minutes: 45,
  passMark: 70,
  instructions:
    'Work through each section in order. Your answers save as you go. Use your own words; do not ask anyone for help.',
  sections: [{ id: crypto.randomUUID(), title: 'Section 1', questions: [newQuestion('single')] }],
  settings: defaultSettings,
  publish: 'active',
});

/** /assessments/new (no id) and /assessments/[id]/edit. Unsaved work is kept per browser. */
export function AssessmentBuilder({ id }: { id?: string }) {
  const router = useRouter();
  const { assessments, invites, ready, setAssessments, updateAssessment } = useAssessments();
  const existing = id ? assessments.find((a) => a.id === id) : undefined;
  const [form, setForm] = useLocalStorageState<Form | null>(
    `ats-preview:assessment-draft:${id ?? 'new'}`,
    null,
  );
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  const [nameTouched, setNameTouched] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // Set when saving or discarding, so the draft is not re-created on the way out.
  const leaving = useRef(false);
  // After the stored draft has loaded: start from the assessment (edit) or a blank one (new).
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!mounted || !ready || form || leaving.current) return;
    if (!id) setForm(emptyForm());
    else if (existing) {
      const { id: _id, status, tone: _tone, ...rest } = existing;
      setForm({ ...rest, publish: status === 'archived' ? 'draft' : status });
    }
  }, [mounted, ready, form, id, existing, setForm]);

  const crumbs = [
    { label: 'Assessments', href: '/assessments' },
    ...(existing ? [{ label: existing.name, href: `/assessments/${existing.id}` }] : []),
    { label: id ? 'Edit' : 'New assessment' },
  ];
  const header = (
    <PageHeader
      breadcrumbs={crumbs}
      title={<PreviewTitle>{id ? 'Edit assessment' : 'Create assessment'}</PreviewTitle>}
      description="Set the basics, write the questions, choose the rules, then check it as a candidate would."
      actions={
        form && (
          <>
            <Button variant="quiet" onClick={() => setDiscarding(true)}>
              Discard changes
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                toast.success('Draft kept in this browser', 'Pick up where you left off any time.');
                router.push(existing ? `/assessments/${existing.id}` : '/assessments');
              }}
            >
              Save and exit
            </Button>
          </>
        )
      }
    />
  );

  if (ready && id && !existing)
    return (
      <>
        {header}
        <Alert tone="warning" title="Assessment not found">
          It may have been removed, or it was created in another browser.
        </Alert>
      </>
    );
  if (!form)
    return (
      <>
        {header}
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      </>
    );

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));
  const setSettings = (patch: Partial<Form['settings']>) =>
    set({ settings: { ...form.settings, ...patch } });
  const questions = form.sections.flatMap((s) => s.questions);
  const totalPoints = questions.reduce((n, q) => n + q.points, 0);
  const submitted = id
    ? invites.filter((i) => i.assessmentId === id && i.status === 'Completed').length
    : 0;

  const errors = {
    name: !form.name.trim() ? 'Give the assessment a name' : undefined,
    minutes: !(form.minutes >= 5) ? 'At least 5 minutes' : undefined,
    passMark: !(form.passMark >= 1 && form.passMark <= 100) ? 'Between 1 and 100' : undefined,
    attempts: !(form.settings.attempts >= 1) ? 'At least 1' : undefined,
    expiry: !(form.settings.expiryDays >= 1) ? 'At least 1 day' : undefined,
  };
  const questionsOk =
    questions.length > 0 &&
    form.sections.every((s) => s.title.trim()) &&
    questions.every((q) => questionProblems(q).length === 0);
  const checks = [
    {
      ok: !errors.name && !errors.minutes && !errors.passMark,
      label: 'Name, duration and pass mark set',
    },
    { ok: questions.length > 0, label: 'At least one question' },
    { ok: questionsOk, label: 'Every question complete, with correct answers marked' },
    { ok: !errors.attempts && !errors.expiry, label: 'Attempts and expiry set' },
  ];

  const finish = () => {
    leaving.current = true;
    const { publish, ...data } = form;
    const status: AssessmentStatus =
      existing?.status === 'archived' && publish === 'draft' ? 'archived' : publish;
    if (existing) {
      updateAssessment(existing.id, { ...data, status });
      setForm(null);
      toast.success(status === 'active' ? 'Changes published' : 'Changes saved', data.name);
      router.push(`/assessments/${existing.id}`);
    } else {
      const newId = crypto.randomUUID();
      setAssessments((list) => [
        { ...data, id: newId, status, tone: deptTones[data.department] ?? 'blue' },
        ...list,
      ]);
      setForm(null);
      toast.success(status === 'active' ? 'Assessment published' : 'Draft saved', data.name);
      router.push(`/assessments/${newId}`);
    }
  };

  return (
    <>
      {header}
      {submitted > 0 && (
        <Alert tone="warning" className="mb-5">
          {submitted} {submitted === 1 ? 'candidate has' : 'candidates have'} already submitted.
          Changing questions or points changes their scores.
        </Alert>
      )}
      <Wizard
        steps={[
          {
            id: 'details',
            title: 'Details',
            description: 'Name, type and timing',
            valid: !errors.name && !errors.minutes && !errors.passMark,
          },
          {
            id: 'questions',
            title: 'Questions',
            description: `${questions.length} questions · ${totalPoints} points`,
            valid: questionsOk,
          },
          {
            id: 'settings',
            title: 'Settings',
            description: 'Timer, attempts, proctoring',
            valid: !errors.attempts && !errors.expiry,
          },
          { id: 'review', title: 'Review', description: 'See it as a candidate' },
          { id: 'publish', title: 'Publish', description: 'Go live or keep as draft' },
        ]}
        current={step}
        onStepChange={(i) => {
          setStep(i);
          window.scrollTo({ top: 0 });
        }}
        onFinish={finish}
        finishLabel={form.publish === 'active' ? 'Publish assessment' : 'Save as draft'}
        aside={
          <Card>
            <CardHeader title="Summary" />
            <div className="px-5 pb-5">
              <DescriptionList
                items={[
                  { label: 'Name', value: form.name || '—' },
                  { label: 'Type', value: `${form.type} · ${form.department}` },
                  {
                    label: 'Questions',
                    value: `${questions.length} in ${form.sections.length} sections`,
                  },
                  { label: 'Total points', value: totalPoints },
                  {
                    label: 'To pass',
                    value: `${form.passMark || 0}% · ${Math.ceil((totalPoints * (form.passMark || 0)) / 100)} points`,
                  },
                ]}
              />
            </div>
          </Card>
        }
      >
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              required
              label="Name"
              className="sm:col-span-2"
              value={form.name}
              onChange={(e) => set({ name: e.currentTarget.value })}
              onBlur={() => setNameTouched(true)}
              error={nameTouched && errors.name}
              autoFocus
            />
            <Select
              label="Type"
              data={assessmentTypes}
              value={form.type}
              onChange={(v) => set({ type: v ?? assessmentTypes[0] })}
            />
            <Select
              label="Department"
              data={departments}
              value={form.department}
              onChange={(v) => set({ department: v ?? departments[0] })}
            />
            <NumberInput
              label="Duration (minutes)"
              min={5}
              value={form.minutes || ''}
              onValueChange={(v) => set({ minutes: v === '' ? 0 : v })}
              error={errors.minutes}
            />
            <NumberInput
              label="Pass mark (%)"
              min={1}
              max={100}
              value={form.passMark || ''}
              onValueChange={(v) => set({ passMark: v === '' ? 0 : v })}
              error={errors.passMark}
            />
            <Textarea
              label="Instructions"
              description="Shown to candidates before they start."
              className="sm:col-span-2"
              value={form.instructions}
              onChange={(e) => set({ instructions: e.currentTarget.value })}
            />
          </div>
        )}

        {step === 1 && (
          <QuestionsEditor sections={form.sections} onChange={(sections) => set({ sections })} />
        )}

        {step === 2 && (
          <div className="flex flex-col gap-6">
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-md font-semibold text-fg">Time and attempts</legend>
              <Switch
                className="sm:col-span-2"
                label="Timed"
                description={`Submit automatically after ${form.minutes || 0} minutes.`}
                checked={form.settings.timed}
                onCheckedChange={(timed) => setSettings({ timed })}
              />
              <NumberInput
                label="Attempts allowed"
                min={1}
                value={form.settings.attempts || ''}
                onValueChange={(v) => setSettings({ attempts: v === '' ? 0 : v })}
                error={errors.attempts}
              />
              <NumberInput
                label="Invitation expires after (days)"
                min={1}
                value={form.settings.expiryDays || ''}
                onValueChange={(v) => setSettings({ expiryDays: v === '' ? 0 : v })}
                error={errors.expiry}
              />
            </fieldset>
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-2 text-md font-semibold text-fg">Order</legend>
              <Switch
                label="Shuffle questions"
                description="Each candidate gets the questions in a different order within each section."
                checked={form.settings.shuffleQuestions}
                onCheckedChange={(shuffleQuestions) => setSettings({ shuffleQuestions })}
              />
              <Switch
                label="Shuffle answer options"
                checked={form.settings.shuffleOptions}
                onCheckedChange={(shuffleOptions) => setSettings({ shuffleOptions })}
              />
            </fieldset>
            <fieldset className="flex flex-col gap-4">
              <legend className="mb-2 text-md font-semibold text-fg">Proctoring</legend>
              <Switch
                label="Record webcam"
                description="Candidates are asked for camera access before they start."
                checked={form.settings.webcam}
                onCheckedChange={(webcam) => setSettings({ webcam })}
              />
              <Switch
                label="Log tab switches"
                checked={form.settings.tabSwitch}
                onCheckedChange={(tabSwitch) => setSettings({ tabSwitch })}
              />
              <Switch
                label="Require full screen"
                checked={form.settings.fullscreen}
                onCheckedChange={(fullscreen) => setSettings({ fullscreen })}
              />
              <Switch
                label="Block copy and paste"
                checked={form.settings.blockPaste}
                onCheckedChange={(blockPaste) => setSettings({ blockPaste })}
              />
            </fieldset>
          </div>
        )}

        {step === 3 && <CandidatePreview a={form} />}

        {step === 4 && (
          <div className="flex flex-col gap-5">
            <ul className="flex flex-col gap-2">
              {checks.map((c) => (
                <li key={c.label} className="flex items-center gap-2 text-base">
                  {c.ok ? (
                    <CheckCircle2 className="size-5 text-tone-green-fg" aria-label="Done" />
                  ) : (
                    <Circle className="size-5 text-fg-subtle" aria-label="Not done" />
                  )}
                  <span className={c.ok ? 'text-fg' : 'text-fg-muted'}>{c.label}</span>
                </li>
              ))}
            </ul>
            <RadioGroup
              aria-label="When to publish"
              value={form.publish}
              onValueChange={(v) => set({ publish: v as AssessmentStatus })}
              options={[
                {
                  value: 'active',
                  label: 'Publish now',
                  description: 'Recruiters can invite candidates straight away.',
                },
                {
                  value: 'draft',
                  label: 'Save as draft',
                  description: 'Only visible under Drafts until you publish it.',
                },
              ]}
            />
          </div>
        )}
      </Wizard>

      <ConfirmDialog
        opened={discarding}
        onClose={() => setDiscarding(false)}
        title="Discard your changes?"
        message={
          existing
            ? 'The assessment goes back to how it was last saved.'
            : 'Everything you entered for this new assessment is removed.'
        }
        confirmLabel="Discard"
        onConfirm={() => {
          leaving.current = true;
          setForm(null);
          setStep(0);
          router.push(existing ? `/assessments/${existing.id}` : '/assessments');
        }}
      />
    </>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Trash2, UserPlus } from 'lucide-react';
import { api } from '@/api';
import { useSupportedCurrencyCodes } from '@/features/currencies/currency-data';
import { useCurrentUser } from '@/auth';
import {
  Alert,
  Autocomplete,
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  IconButton,
  Input,
  MultiSelect,
  NumberInput,
  PageHeader,
  RadioGroup,
  SearchSelect,
  SegmentedControl,
  Select,
  SkeletonRows,
  Switch,
  TagsInput,
  Wizard,
  toast,
  type WizardStep,
} from '@/components/ui';
import { StageBadge } from '@/components/status';
import { JobPostingView } from '@/components/careers/JobPostingView';
import { imageProblem } from '@/components/editor/images';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { toDraft, toInput, type Question } from '@/features/careers/questions';
import { formatDate, formatRelative } from '@/lib/format';
import { countryName, countryOptions } from './countries';
import { ROLES, rolesFor } from './JobSections';
import {
  EMPTY_REQUIREMENTS,
  INITIAL_FORM,
  PERIODS,
  composeDescription,
  createPayload,
  locationText,
  payText,
  restoreDraft,
  validateForm,
  type StartFrom,
  type TeamRole,
  type WizardDraftData,
  type WizardErrors,
  type WizardForm,
  type WizardRequirements,
} from './job-form';
import { QuestionBuilder } from './QuestionBuilder';
import type { RequisitionWithSettings } from './requirements-types';
import { parseRequirements } from './requirements-types';

type Reqs = WizardRequirements;
type Person = { id: string; email: string; displayName: string; role: string };
type StageSummary = { name: string; type: string };
type PipelineTemplate = { id: string; name: string; stages: StageSummary[]; isDefault: boolean };
type PostingTemplate = {
  id: string;
  name: string;
  version: number;
  headerMarkdown: string;
  descriptionMarkdown: string;
  benefitsMarkdown: string;
  questions: Omit<Question, 'id'>[];
};
type JobValues = {
  approvalRequired: boolean;
  departments: string[];
  employmentTypes: string[];
  locations: {
    location: string;
    city: string | null;
    region: string | null;
    country: string | null;
  }[];
};
type JobOption = { id: string; title: string; code: string; status: string };

// Mirrors StageRules.DefaultTemplate, which the API uses when no pipeline exists.
const HIRED: StageSummary = { name: 'Hired', type: 'Hired' };
const DEFAULT_STAGES: StageSummary[] = [
  { name: 'New', type: 'Applied' },
  { name: 'Review', type: 'Screen' },
  { name: 'Interview', type: 'Interview' },
  { name: 'Interview scheduled', type: 'Interview' },
  { name: 'Offer', type: 'Offer' },
  HIRED,
];

const STEP_KEYS = {
  start: ['title', 'department', 'openings'],
  place: ['location', 'pay'],
  posting: ['posting'],
  team: ['members'],
} as const;

/** Create a job in steps, with the careers posting previewed beside the form. */
export function CreateRequisitionPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(INITIAL_FORM);
  const [reqs, setReqs] = useState<Reqs>(EMPTY_REQUIREMENTS);
  const [editorVersion, setEditorVersion] = useState(0);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [copyStages, setCopyStages] = useState<StageSummary[] | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  // Errors show once a step has been left or a field touched, so a new step isn't a wall of red.
  const [shownSteps, setShownSteps] = useState<Set<number>>(new Set());
  const set = (patch: Partial<WizardForm>) => setForm((f) => ({ ...f, ...patch }));

  // ---- The draft on the server: saved as you go once the job has a title ----
  const resumeId = searchParams.get('draft');
  const [draftId] = useState(() => resumeId ?? crypto.randomUUID());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const resumed = useQuery({
    queryKey: ['job-draft', resumeId],
    queryFn: () =>
      api.get<{ data: unknown; step: number; updatedAt: string }>(
        `/api/requisitions/drafts/${resumeId}`,
      ),
    enabled: !!resumeId,
    staleTime: Infinity,
    gcTime: 0,
  });
  const restored = useRef(false);
  useEffect(() => {
    if (!resumed.data || restored.current) return;
    restored.current = true;
    const draft = restoreDraft(resumed.data.data);
    setForm(draft.form);
    setReqs(draft.reqs);
    setCopyStages(draft.copyStages);
    setStep(Math.min(resumed.data.step, 6));
    setSavedAt(resumed.data.updatedAt);
    setEditorVersion((v) => v + 1);
  }, [resumed.data]);
  const ready = !resumeId || restored.current || resumed.isError;
  const saveDraft = useMutation({
    mutationFn: (body: { title: string; step: number; data: WizardDraftData }) =>
      api.put<{ updatedAt: string }>(`/api/requisitions/drafts/${draftId}`, body),
    onSuccess: ({ updatedAt }) => {
      setSavedAt(updatedAt);
      queryClient.invalidateQueries({ queryKey: ['job-drafts'] });
      // A refresh, or the link in the Jobs list, opens this draft again.
      if (!resumeId) window.history.replaceState(null, '', `/jobs/new?draft=${draftId}`);
    },
  });

  const people = useQuery({
    queryKey: ['requisition-people'],
    queryFn: () => api.get<Person[]>('/api/requisitions/people'),
    staleTime: 60_000,
  });
  const currencies = useSupportedCurrencyCodes();
  const values = useQuery({
    queryKey: ['requisition-values'],
    queryFn: () => api.get<JobValues>('/api/requisitions/values'),
    staleTime: 60_000,
  });
  const templates = useQuery({
    queryKey: ['posting-templates'],
    queryFn: () => api.get<PostingTemplate[]>('/api/posting-templates'),
  });
  const pipelines = useQuery({
    queryKey: ['pipeline-templates'],
    queryFn: () => api.get<PipelineTemplate[]>('/api/pipeline-templates'),
  });
  const jobs = useQuery({
    queryKey: ['requisitions-list'],
    queryFn: () => api.get<JobOption[]>('/api/requisitions'),
    enabled: form.startFrom === 'job',
  });

  // The person creating the job joins the team in their usual role.
  const me = people.data?.find((p) => p.email.toLowerCase() === user.email.toLowerCase());
  useEffect(() => {
    if (!me) return;
    setForm((f) =>
      f.members.length
        ? f
        : {
            ...f,
            members: [
              { userId: me.id, role: me.role === 'HiringManager' ? 'HiringManager' : 'Recruiter' },
            ],
          },
    );
  }, [me]);

  const pipelineList = pipelines.data ?? [];
  const defaultPipelineId = (pipelineList.find((item) => item.isDefault) ?? pipelineList[0])?.id;
  useEffect(() => {
    // Preselect the default once; later changes by the user are kept.
    if (defaultPipelineId)
      setForm((f) => (f.pipelineTemplateId ? f : { ...f, pipelineTemplateId: defaultPipelineId }));
  }, [defaultPipelineId]);
  const selectedPipeline = pipelineList.find((item) => item.id === form.pipelineTemplateId);
  const stages =
    copyStages ?? (selectedPipeline ? [...selectedPipeline.stages, HIRED] : DEFAULT_STAGES);

  const description = composeDescription(form);
  const pictures = imageProblem(description);
  const allErrors: WizardErrors & { posting?: string } = {
    ...validateForm(form),
    ...(pictures ? { posting: pictures } : {}),
  };
  const errorFor = (key: keyof typeof allErrors, stepIndex: number) =>
    shownSteps.has(stepIndex) ? allErrors[key] : undefined;
  const okFor = (keys: readonly (keyof typeof allErrors)[]) => keys.every((k) => !allErrors[k]);
  const location = locationText(form.place, form.workMode, countryName);
  const pay = form.pay.show ? payText(form.pay) : null;
  const approvalRequired = values.data?.approvalRequired ?? false;

  function applyTemplate(id: string | null) {
    const template = templates.data?.find((t) => t.id === id);
    set({
      templateId: id,
      intro: template?.headerMarkdown ?? '',
      role: template?.descriptionMarkdown ?? '',
      benefits: template?.benefitsMarkdown ?? '',
      questions: (template?.questions ?? []).map((q) => toDraft({ ...q, id: undefined })),
    });
    setEditorVersion((v) => v + 1);
  }
  const edited = !!(form.intro.trim() || form.role.trim() || form.benefits.trim());
  // Picking another template replaces the posting text, so ask first once something is written.
  const pickTemplate = (id: string | null) =>
    edited && id !== form.templateId ? setPendingTemplate(id ?? '') : applyTemplate(id);

  async function startFromJob(id: string | null) {
    set({ copyFromId: id });
    setCopyStages(null);
    if (!id) return;
    setLoadingJob(true);
    try {
      const [job, questions] = await Promise.all([
        api.get<RequisitionWithSettings>(`/api/requisitions/${id}`),
        api.get<Question[]>(`/api/requisitions/${id}/questions`),
      ]);
      const r = parseRequirements(job.requirementsJson);
      setReqs({
        required: r?.required ?? [],
        preferred: r?.preferred ?? [],
        minYears: r?.minYears ?? '',
      });
      setCopyStages(job.stages.map((s) => ({ name: s.name, type: s.type ?? 'Other' })));
      setForm((f) => ({
        ...f,
        copyFromId: id,
        title: job.title,
        department: job.department,
        employmentType: job.employmentType,
        workMode: job.workMode,
        openings: job.openings,
        place: {
          city: job.locationCity ?? (job.locationCountry ? '' : job.location),
          region: job.locationRegion ?? '',
          country: job.locationCountry ?? '',
          remoteCountries: job.remoteCountries ?? [],
        },
        pay: {
          min: job.salaryMin ?? '',
          max: job.salaryMax ?? '',
          currency: job.salaryCurrency ?? 'USD',
          period: job.salaryPeriod ?? 'Year',
          show: !!job.showSalary,
        },
        intro: '',
        role: job.description ?? '',
        benefits: '',
        questions: questions.map((q) => toDraft({ ...q, id: undefined })),
        members: (job.members ?? []).map((m) => ({ userId: m.userId, role: m.role as TeamRole })),
      }));
      setEditorVersion((v) => v + 1);
    } catch (e) {
      toast.error('Could not load that job', (e as Error).message);
    }
    setLoadingJob(false);
  }

  function changeStart(start: StartFrom) {
    set({ startFrom: start });
    if (start !== 'job') {
      set({ copyFromId: null });
      setCopyStages(null);
    }
    if (start === 'blank') applyTemplate(null);
  }

  // Save a moment after each change, once there is a title (and the saved draft has loaded).
  const creating = useRef(false);
  useEffect(() => {
    if (!ready || !form.title.trim() || creating.current) return;
    const timer = setTimeout(
      () =>
        saveDraft.mutate({
          title: form.title.trim(),
          step,
          data: { form, reqs, copyStages },
        }),
      1000,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, reqs, copyStages, step, ready]);

  const create = useMutation({
    mutationFn: async () => {
      creating.current = true;
      const { id } = await api.post<{ id: string }>('/api/requisitions', {
        ...createPayload(form, toInput, countryName),
        // The server removes the saved draft with the new job.
        draftId: savedAt ? draftId : null,
      });
      // Requirements have their own endpoint; the job exists either way.
      const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
      if (reqs.required.length || reqs.preferred.length || reqs.minYears !== '')
        await api
          .put(`/api/requisitions/${id}/requirements`, {
            required: clean(reqs.required),
            preferred: clean(reqs.preferred),
            minYears: reqs.minYears === '' ? null : reqs.minYears,
            location: '',
          })
          .catch((error: Error) =>
            toast.error('Job created, but the requirements were not saved', error.message),
          );
      let then = '';
      if (form.after === 'open')
        await api
          .patch(`/api/requisitions/${id}/status`, { status: 'Open' })
          .then(() => (then = 'It is open and on your careers site.'))
          .catch((error: Error) =>
            toast.error('Job created, but it could not open', error.message),
          );
      if (form.after === 'submit')
        await api
          .post(`/api/requisitions/${id}/submit-for-approval`, {})
          .then(() => (then = 'We asked the approvers.'))
          .catch((error: Error) =>
            toast.error('Job created, but it was not sent for approval', error.message),
          );
      return { id, then };
    },
    onSuccess: ({ id, then }) => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      queryClient.invalidateQueries({ queryKey: ['requisition-values'] });
      queryClient.invalidateQueries({ queryKey: ['job-drafts'] });
      toast.success('Job created', then || 'It is a draft until you open it.');
      router.push(`/jobs/${id}`);
    },
    onError: (error: Error) => {
      creating.current = false;
      toast.error('Could not create the job', error.message);
    },
  });

  const steps: WizardStep[] = [
    { id: 'start', title: 'Start', valid: okFor(STEP_KEYS.start) },
    { id: 'place', title: 'Location and pay', valid: okFor(STEP_KEYS.place) },
    {
      id: 'posting',
      title: 'Posting and questions',
      optional: true,
      valid: okFor(STEP_KEYS.posting),
    },
    { id: 'requirements', title: 'Requirements', optional: true },
    { id: 'pipeline', title: 'Pipeline' },
    { id: 'team', title: 'Hiring team', valid: okFor(STEP_KEYS.team) },
    { id: 'review', title: 'Review' },
  ];
  const goTo = (next: number) => {
    setShownSteps((s) => new Set(s).add(step));
    setStep(next);
  };
  const finish = () => {
    if (Object.keys(allErrors).length === 0) return create.mutate();
    setShownSteps(new Set([0, 1, 2, 5]));
    setStep(
      !okFor(STEP_KEYS.start) ? 0 : !okFor(STEP_KEYS.place) ? 1 : !okFor(STEP_KEYS.posting) ? 2 : 5,
    );
  };
  const stageBadges = (list: StageSummary[]) => (
    <ol className="flex flex-wrap gap-1.5" aria-label="Stage order">
      {list.map((stage, index) => (
        <li key={`${stage.name}-${index}`}>
          <StageBadge stage={`${index + 1}. ${stage.name}`} type={stage.type} />
        </li>
      ))}
    </ol>
  );

  // Next stays off until a step is done; say why under the step.
  const blocked = (keys: readonly (keyof typeof allErrors)[]) => {
    const first = keys.map((k) => allErrors[k]).find(Boolean);
    return first ? <p className="text-xs text-fg-subtle">To continue: {first}</p> : null;
  };

  const content = [
    <div key="start" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-fg">Start from</p>
        <SegmentedControl
          aria-label="Start from"
          value={form.startFrom}
          onValueChange={(v) => changeStart(v as StartFrom)}
          items={[
            { value: 'blank', label: 'Blank' },
            { value: 'template', label: 'A template' },
            { value: 'job', label: 'Another job' },
          ]}
        />
        {form.startFrom === 'template' && (
          <Select
            label="Posting template"
            className="max-w-sm"
            placeholder={templates.data?.length ? 'Choose a template' : 'No templates yet'}
            value={form.templateId}
            data={(templates.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
            onChange={pickTemplate}
            description="Fills in the posting and the questions. You can change anything."
          />
        )}
        {form.startFrom === 'job' && (
          <SearchSelect
            label="Job to copy"
            className="max-w-sm"
            placeholder="Search by title or code"
            value={form.copyFromId}
            data={(jobs.data ?? []).map((j) => ({ value: j.id, label: `${j.title} (${j.code})` }))}
            onChange={startFromJob}
            description="Copies its posting, questions, team, stages and interview kits."
          />
        )}
        {loadingJob && <SkeletonRows rows={1} className="px-0" />}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Job title"
          placeholder="Product designer"
          required
          value={form.title}
          onChange={(e) => set({ title: e.currentTarget.value })}
          error={errorFor('title', 0)}
          className="sm:col-span-2"
        />
        <Autocomplete
          label="Team"
          placeholder="For example, Engineering"
          required
          data={values.data?.departments ?? []}
          value={form.department}
          onChange={(department) => set({ department })}
          error={errorFor('department', 0)}
        />
        <Select
          label="Employment type"
          data={
            values.data?.employmentTypes ?? [
              'Full time',
              'Part time',
              'Contract',
              'Internship',
              'Temporary',
            ]
          }
          value={form.employmentType}
          onChange={(v) => v && set({ employmentType: v })}
        />
        <NumberInput
          label="Openings"
          min={1}
          step={1}
          value={form.openings}
          onValueChange={(v) => set({ openings: v === '' ? '' : Math.round(v) })}
          error={errorFor('openings', 0)}
        />
        <Input
          type="date"
          label="Target start"
          value={form.targetStartDate}
          onChange={(e) => set({ targetStartDate: e.currentTarget.value })}
        />
      </div>
      {blocked(STEP_KEYS.start)}
    </div>,

    <div key="place" className="flex flex-col gap-6">
      <section className="flex flex-col gap-4" aria-label="Location">
        <h3 className="text-md font-semibold text-fg">Where</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Work mode"
            data={['On-site', 'Hybrid', 'Remote']}
            value={form.workMode}
            onChange={(v) => v && set({ workMode: v })}
          />
          {(values.data?.locations.length ?? 0) > 0 && (
            <Select
              label="Use a place other jobs use"
              placeholder="Choose a place"
              clearable
              value={null}
              data={(values.data?.locations ?? []).map((l) => ({
                value: l.location,
                label: l.location,
              }))}
              onChange={(value) => {
                const known = values.data?.locations.find((l) => l.location === value);
                if (known)
                  set({
                    place: {
                      ...form.place,
                      city: known.city ?? (known.country ? '' : known.location),
                      region: known.region ?? '',
                      country: known.country ?? '',
                    },
                  });
              }}
            />
          )}
          <Input
            label="City"
            placeholder="Chicago"
            value={form.place.city}
            onChange={(e) => set({ place: { ...form.place, city: e.currentTarget.value } })}
            error={errorFor('location', 1)}
          />
          <Input
            label="State or region"
            placeholder="Illinois"
            value={form.place.region}
            onChange={(e) => set({ place: { ...form.place, region: e.currentTarget.value } })}
          />
          <SearchSelect
            label="Country"
            placeholder="Search countries"
            value={form.place.country || null}
            data={countryOptions()}
            onChange={(country) => set({ place: { ...form.place, country: country ?? '' } })}
          />
          {form.workMode === 'Remote' && (
            <MultiSelect
              label="People can work from"
              description="Leave empty for anywhere."
              placeholder="Search countries"
              data={countryOptions()}
              value={form.place.remoteCountries}
              onChange={(remoteCountries) => set({ place: { ...form.place, remoteCountries } })}
            />
          )}
        </div>
        {location && <p className="text-sm text-fg-muted">Applicants see: {location}</p>}
      </section>

      <section className="flex flex-col gap-4 border-t border-border-subtle pt-5" aria-label="Pay">
        <h3 className="text-md font-semibold text-fg">Pay range</h3>
        <div className="grid gap-4 sm:grid-cols-4">
          <NumberInput
            label="From"
            min={0}
            step={1000}
            value={form.pay.min}
            onValueChange={(min) => set({ pay: { ...form.pay, min } })}
            error={errorFor('pay', 1)}
          />
          <NumberInput
            label="To"
            min={0}
            step={1000}
            value={form.pay.max}
            onValueChange={(max) => set({ pay: { ...form.pay, max } })}
          />
          <Select
            label="Currency"
            data={currencies.options}
            value={form.pay.currency}
            onChange={(currency) => currency && set({ pay: { ...form.pay, currency } })}
          />
          <Select
            label="Per"
            data={PERIODS.map((p) => ({ value: p.value, label: p.label.replace(/^an? /, '') }))}
            value={form.pay.period}
            onChange={(period) =>
              period && set({ pay: { ...form.pay, period: period as WizardForm['pay']['period'] } })
            }
          />
        </div>
        <Switch
          label="Show the pay range on the posting"
          description="Applicants and search engines see it."
          checked={form.pay.show}
          onCheckedChange={(show) => set({ pay: { ...form.pay, show } })}
        />
      </section>
      {blocked(STEP_KEYS.place)}
    </div>,

    <div key="posting" className="flex flex-col gap-6">
      {(
        [
          ['intro', 'About the company', 'Who you are and why the work matters.'],
          ['role', 'About the role', 'What this person will own and do.'],
          ['benefits', 'Benefits', 'Pay extras, leave, ways of working.'],
        ] as const
      ).map(([key, title, placeholder]) => (
        <section key={key} className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-fg">{title}</h3>
          <PlateMarkdownEditor
            key={`${key}-${editorVersion}`}
            value={form[key]}
            onChange={(value) => set({ [key]: value })}
            placeholder={placeholder}
            editorClassName={key === 'role' ? 'min-h-48 px-4 py-3' : 'min-h-28 px-4 py-3'}
          />
        </section>
      ))}
      <section className="flex flex-col gap-3 border-t border-border-subtle pt-5">
        <div>
          <h3 className="text-md font-semibold text-fg">Application questions</h3>
          <p className="text-sm text-fg-muted">
            Asked on the apply page. You can change them later on the job’s Posting tab.
          </p>
        </div>
        <QuestionBuilder value={form.questions} onChange={(questions) => set({ questions })} />
      </section>
      {blocked(STEP_KEYS.posting)}
    </div>,

    <div key="requirements" className="flex flex-col gap-4">
      <TagsInput
        label="Must have"
        description="Press Enter after each one. We use these to match and screen candidates."
        placeholder="For example, Figma"
        value={reqs.required}
        onChange={(required) => setReqs((r) => ({ ...r, required }))}
      />
      <TagsInput
        label="Nice to have"
        placeholder="For example, design systems"
        value={reqs.preferred}
        onChange={(preferred) => setReqs((r) => ({ ...r, preferred }))}
      />
      <NumberInput
        label="Minimum years of experience"
        className="max-w-[240px]"
        min={0}
        step={1}
        value={reqs.minYears}
        onValueChange={(minYears) => setReqs((r) => ({ ...r, minYears }))}
      />
      <p className="text-xs text-fg-subtle">
        Not sure yet? Skip this step. You can add requirements on the job later.
      </p>
    </div>,

    <div key="pipeline" className="flex flex-col gap-3">
      {copyStages ? (
        <>
          <p className="text-sm text-fg-muted">
            The stages and interview kits come from the job you started from.
          </p>
          {stageBadges(copyStages)}
        </>
      ) : pipelines.isLoading ? (
        <SkeletonRows rows={2} className="px-0" />
      ) : pipelineList.length === 0 ? (
        <>
          {stageBadges(DEFAULT_STAGES)}
          <p className="text-xs text-fg-subtle">
            This is the standard pipeline. An admin can add more in Settings, under Pipelines.
          </p>
        </>
      ) : (
        <>
          <Select
            label="Pipeline"
            className="max-w-[360px]"
            data={pipelineList.map((item) => ({
              value: item.id,
              label: item.isDefault ? `${item.name} (default)` : item.name,
            }))}
            value={form.pipelineTemplateId}
            onChange={(id) => id && set({ pipelineTemplateId: id })}
          />
          {stageBadges(stages)}
        </>
      )}
      <p className="text-xs text-fg-subtle">
        Interview rounds come from interview kits, which you add on the job after you create it.
      </p>
    </div>,

    <div key="team" className="flex flex-col gap-3">
      <TeamStep
        people={people.data}
        members={form.members}
        error={errorFor('members', 5)}
        onChange={(members) => set({ members })}
      />
      {!errorFor('members', 5) && blocked(STEP_KEYS.team)}
    </div>,

    <div key="review" className="flex flex-col gap-5">
      <ReviewBlock title="Basics" onEdit={() => setStep(0)}>
        <DescriptionList
          columns={2}
          items={[
            { label: 'Job title', value: form.title },
            { label: 'Team', value: form.department },
            { label: 'Location', value: `${location} · ${form.workMode}` },
            { label: 'Employment type', value: form.employmentType },
            { label: 'Openings', value: form.openings },
            {
              label: 'Target start',
              value: form.targetStartDate ? formatDate(form.targetStartDate) : 'Not set',
            },
            {
              label: 'Pay',
              value: payText(form.pay)
                ? `${payText(form.pay)}${form.pay.show ? '' : ' (not shown)'}`
                : 'Not set',
            },
          ]}
        />
      </ReviewBlock>
      <ReviewBlock title="Posting" onEdit={() => setStep(2)}>
        <p className="text-sm text-fg-muted">
          {description
            ? `${description.split(/\s+/).length} words`
            : 'No description yet. Applicants will see an empty posting.'}
          {' · '}
          {form.questions.length === 1 ? '1 question' : `${form.questions.length} questions`}
        </p>
      </ReviewBlock>
      <ReviewBlock title="Pipeline" onEdit={() => setStep(4)}>
        {stageBadges(stages)}
      </ReviewBlock>
      <ReviewBlock title="Hiring team" onEdit={() => setStep(5)}>
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {form.members.map((m) => {
            const person = people.data?.find((p) => p.id === m.userId);
            return (
              <li key={m.userId} className="flex items-center gap-2 text-sm">
                <Avatar name={person?.displayName ?? '?'} size="xs" />
                {person?.displayName ?? 'Unknown'}
                <span className="text-fg-subtle">
                  {ROLES.find((r) => r.value === m.role)?.label}
                </span>
              </li>
            );
          })}
        </ul>
      </ReviewBlock>
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-fg">After you create it</h3>
        <RadioGroup
          aria-label="After you create it"
          value={form.after}
          onValueChange={(after) => set({ after: after as WizardForm['after'] })}
          options={[
            { value: 'draft', label: 'Keep it as a draft' },
            approvalRequired
              ? { value: 'submit', label: 'Send it for approval' }
              : { value: 'open', label: 'Open it now, on your careers site' },
          ]}
        />
      </section>
    </div>,
  ];

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeader
        breadcrumbs={[{ label: 'Jobs', href: '/jobs' }, { label: 'New job' }]}
        title="Create job"
        actions={
          <>
            {savedAt && (
              <span className="text-xs text-fg-subtle" aria-live="polite">
                {saveDraft.isPending
                  ? 'Saving…'
                  : saveDraft.isError
                    ? 'Not saved. We try again when you make a change.'
                    : `Draft saved ${formatRelative(savedAt)}`}
              </span>
            )}
            <Button asChild variant="secondary">
              <Link href="/jobs">{savedAt ? 'Close' : 'Cancel'}</Link>
            </Button>
          </>
        }
      />
      {resumeId && resumed.isError && (
        <Alert tone="warning" title="We could not open that draft" className="mb-4">
          It may have been discarded, or the job was already created. You can start a new one here.
        </Alert>
      )}
      <Wizard
        steps={steps}
        current={step}
        onStepChange={goTo}
        onFinish={finish}
        finishLabel={
          form.after === 'open'
            ? 'Create and open'
            : form.after === 'submit'
              ? 'Create and send for approval'
              : 'Create job'
        }
        busy={create.isPending}
        aside={
          <Card>
            <CardHeader title="What applicants see" />
            <CardBody>
              <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border-subtle bg-background p-4">
                <JobPostingView
                  company={user.organizationName}
                  pay={pay}
                  emptyDescription="The posting shows here as you write it."
                  job={{
                    title: form.title.trim() || 'Job title',
                    department: form.department.trim() || 'Team',
                    location: location || 'Location',
                    workMode: form.workMode,
                    employmentType: form.employmentType,
                    openings: Number(form.openings) || 1,
                    description,
                    targetStartDate: form.targetStartDate || null,
                  }}
                />
                {form.questions.some((q) => q.label.trim()) && (
                  <div className="mt-6 border-t border-border-subtle pt-4">
                    <p className="text-sm font-semibold text-fg">What we will ask you</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-fg">
                      {form.questions
                        .filter((q) => q.label.trim())
                        .map((q) => (
                          <li key={q.key}>{q.label}</li>
                        ))}
                    </ul>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        }
      >
        {content[step]}
      </Wizard>
      <ConfirmDialog
        opened={pendingTemplate !== null}
        onClose={() => setPendingTemplate(null)}
        title="Replace the posting?"
        message="The template’s text and questions replace what you wrote."
        confirmLabel="Replace posting"
        onConfirm={() => {
          applyTemplate(pendingTemplate || null);
          setPendingTemplate(null);
        }}
      />
    </div>
  );
}

/** People with accounts and their role on this job; at least one hiring manager. */
function TeamStep({
  people,
  members,
  error,
  onChange,
}: {
  people?: Person[];
  members: WizardForm['members'];
  error?: string;
  onChange: (members: WizardForm['members']) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const byId = useMemo(() => new Map((people ?? []).map((p) => [p.id, p])), [people]);
  const available = (people ?? []).filter((p) => !members.some((m) => m.userId === p.id));
  if (!people) return <SkeletonRows rows={3} className="px-0" />;
  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert tone="danger" title={error}>
          The hiring manager owns the hire and makes the final call.
        </Alert>
      )}
      <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
        {members.map((m) => {
          const person = byId.get(m.userId);
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <Avatar name={person?.displayName ?? '?'} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">
                  {person?.displayName ?? 'Unknown person'}
                </p>
                <p className="truncate text-xs text-fg-subtle">{person?.email}</p>
              </div>
              <Select
                aria-label={`Role for ${person?.displayName ?? 'this person'}`}
                className="w-44"
                value={m.role}
                data={rolesFor(person?.role ?? '').map((r) => ({ value: r.value, label: r.label }))}
                onChange={(role) =>
                  role &&
                  onChange(
                    members.map((x) =>
                      x.userId === m.userId ? { ...x, role: role as TeamRole } : x,
                    ),
                  )
                }
              />
              <IconButton
                variant="quiet"
                label={`Remove ${person?.displayName ?? 'this person'}`}
                onClick={() => onChange(members.filter((x) => x.userId !== m.userId))}
              >
                <Trash2 />
              </IconButton>
            </li>
          );
        })}
        {members.length === 0 && (
          <li className="px-3 py-4 text-sm text-fg-subtle">
            No one yet. Add the hiring manager first.
          </li>
        )}
      </ul>
      <div className="flex flex-wrap items-end gap-2">
        <SearchSelect
          label="Add someone"
          className="w-full max-w-xs"
          placeholder="Search by name"
          value={adding}
          data={available.map((p) => ({ value: p.id, label: p.displayName, group: p.role }))}
          onChange={setAdding}
          nothingFound="No one matches that name"
        />
        <Button
          variant="secondary"
          leftIcon={<UserPlus />}
          disabled={!adding}
          onClick={() => {
            const person = adding ? byId.get(adding) : null;
            if (!person) return;
            const hasManager = members.some((m) => m.role === 'HiringManager');
            const role: TeamRole =
              person.role === 'Interviewer'
                ? 'Interviewer'
                : !hasManager && person.role !== 'Recruiter'
                  ? 'HiringManager'
                  : person.role === 'Recruiter'
                    ? 'Recruiter'
                    : 'Viewer';
            onChange([...members, { userId: person.id, role }]);
            setAdding(null);
          }}
        >
          Add to team
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">
        Only people with an account can be on the team. An admin can invite others in Settings,
        under Members.
      </p>
    </div>
  );
}

function ReviewBlock({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border-subtle pb-5 last-of-type:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        <Button variant="link" size="sm" onClick={onEdit}>
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}

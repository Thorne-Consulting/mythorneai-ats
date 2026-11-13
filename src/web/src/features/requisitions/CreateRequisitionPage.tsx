'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Input,
  NumberInput,
  PageHeader,
  Select,
  SkeletonRows,
  TagsInput,
  Wizard,
  toast,
  type WizardStep,
} from '@/components/ui';
import { JobPostingView } from '@/components/careers/JobPostingView';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { formatDate } from '@/lib/format';
import { nameFromEmail } from './requisition-data';

interface RequisitionForm {
  title: string;
  department: string;
  location: string;
  employmentType: string;
  workMode: string;
  openings: number | '';
  ownerEmail: string;
  recruiterEmail: string;
  targetStartDate: string;
}

const INITIAL: RequisitionForm = {
  title: '',
  department: '',
  location: '',
  employmentType: 'Full time',
  workMode: 'Hybrid',
  openings: 1,
  ownerEmail: '',
  recruiterEmail: '',
  targetStartDate: '',
};

type Errors = Partial<Record<keyof RequisitionForm, string>>;

function validate(values: RequisitionForm): Errors {
  const errors: Errors = {};
  if (!values.title.trim()) errors.title = 'Required';
  if (!values.department.trim()) errors.department = 'Required';
  if (!values.location.trim()) errors.location = 'Required';
  if (!(Number(values.openings) >= 1)) errors.openings = 'At least one opening';
  if (!values.ownerEmail.includes('@')) errors.ownerEmail = 'Enter an email or choose a person';
  if (!values.recruiterEmail.includes('@'))
    errors.recruiterEmail = 'Enter an email or choose a person';
  return errors;
}

type Reqs = { required: string[]; preferred: string[]; minYears: number | '' };

type DirectoryUser = { email: string; displayName: string; role: string };
// Mirrors SeedData.CreateDefaultStages, which the API uses when no pipeline template exists.
const DEFAULT_STAGES = ['New', 'Review', 'Interview', 'Booked', 'Offer handoff', 'Hired'];

type PipelineTemplate = { id: string; name: string; stageNames: string[]; isDefault: boolean };
type PostingTemplate = { id: string; name: string; version: number; descriptionMarkdown: string };

const BASICS: (keyof RequisitionForm)[] = ['title', 'department', 'location', 'openings'];
const TEAM: (keyof RequisitionForm)[] = ['ownerEmail', 'recruiterEmail'];

/** Create a job in steps, with the careers posting previewed beside the form. */
export function CreateRequisitionPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [description, setDescription] = useState('');
  const [postingTemplateId, setPostingTemplateId] = useState<string | null>(null);
  const [pipelineTemplateId, setPipelineTemplateId] = useState<string | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [values, setValues] = useState(INITIAL);
  const [reqs, setReqs] = useState<Reqs>({ required: [], preferred: [], minYears: '' });
  // Errors show once a field has been touched, so an untouched step isn't a wall of red.
  const [touched, setTouched] = useState<Set<keyof RequisitionForm>>(new Set());
  const allErrors = validate(values);
  const errors: Errors = Object.fromEntries(
    Object.entries(allErrors).filter(([key]) => touched.has(key as keyof RequisitionForm)),
  );
  const touch = (key: keyof RequisitionForm) =>
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  const set = <K extends keyof RequisitionForm>(key: K, value: RequisitionForm[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    touch(key);
  };
  const field = (key: 'title' | 'department' | 'location' | 'targetStartDate') => ({
    value: values[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.currentTarget.value),
    onBlur: () => touch(key),
    error: errors[key],
  });
  const directory = useQuery({
    queryKey: ['directory-users'],
    queryFn: () => api.get<DirectoryUser[]>('/api/directory/users'),
  });
  const templates = useQuery({
    queryKey: ['posting-templates'],
    queryFn: () => api.get<PostingTemplate[]>('/api/posting-templates'),
  });
  const pipelines = useQuery({
    queryKey: ['pipeline-templates'],
    queryFn: () => api.get<PipelineTemplate[]>('/api/pipeline-templates'),
  });
  const pipelineList = pipelines.data ?? [];
  const defaultPipelineId = (pipelineList.find((item) => item.isDefault) ?? pipelineList[0])?.id;
  useEffect(() => {
    // Preselect the default once; later changes by the user are kept.
    if (defaultPipelineId) setPipelineTemplateId((current) => current ?? defaultPipelineId);
  }, [defaultPipelineId]);
  const selectedPipeline = pipelineList.find((item) => item.id === pipelineTemplateId);
  const stageNames = selectedPipeline?.stageNames ?? DEFAULT_STAGES;

  const mutation = useMutation({
    mutationFn: async (values: RequisitionForm) => {
      const { id } = await api.post<{ id: string }>('/api/requisitions', {
        ...values,
        description,
        postingTemplateId,
        pipelineTemplateId,
        targetStartDate: values.targetStartDate || null,
      });
      // Requirements are saved on the new job through their own endpoint; the job exists either way.
      const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);
      if (reqs.required.length || reqs.preferred.length || reqs.minYears !== '') {
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
      }
      return { id };
    },
    onSuccess: ({ id }) => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      toast.success('Job created');
      router.push(`/jobs/${id}`);
    },
    onError: (error: Error) => toast.error('Could not create job', error.message),
  });
  const people = (role: string) =>
    (directory.data ?? [])
      .filter((person) => person.role === role || person.role === 'Admin')
      .map((person) => ({ value: person.email, label: `${person.displayName} · ${person.email}` }));

  const okFor = (keys: (keyof RequisitionForm)[]) => keys.every((key) => !allErrors[key]);
  const steps: WizardStep[] = [
    {
      id: 'basics',
      title: 'Basics',
      description: 'Title, team and where it is based',
      valid: okFor(BASICS),
    },
    {
      id: 'description',
      title: 'Description',
      description: 'What applicants read',
      optional: true,
    },
    {
      id: 'requirements',
      title: 'Requirements',
      description: 'Must-haves and nice-to-haves',
      optional: true,
    },
    { id: 'pipeline', title: 'Pipeline', description: 'Stages applicants move through' },
    {
      id: 'team',
      title: 'Hiring team',
      description: 'Who owns and runs the hire',
      valid: okFor(TEAM),
    },
    { id: 'review', title: 'Review', description: 'Check and create' },
  ];
  const finish = () => {
    if (Object.keys(allErrors).length === 0) return mutation.mutate(values);
    // Defensive: jump back to the first step with a problem and show its errors.
    setTouched(new Set(Object.keys(allErrors) as (keyof RequisitionForm)[]));
    setStep(okFor(BASICS) ? 4 : 0);
  };
  const stageBadges = (names: string[]) => (
    <ol className="flex flex-wrap gap-1.5" aria-label="Stage order">
      {names.map((name, index) => (
        <li key={`${name}-${index}`}>
          <Badge variant="outline">
            {index + 1}. {name}
          </Badge>
        </li>
      ))}
    </ol>
  );
  const blocked = steps[step].valid === false && (
    <p className="mt-4 text-xs text-fg-subtle">Fill in the required fields to continue.</p>
  );

  const content = [
    <div key="basics">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Job title" placeholder="Product designer" required {...field('title')} />
        <Input
          label="Team"
          placeholder="Engineering, sales, operations…"
          required
          {...field('department')}
        />
        <Input label="Location" placeholder="Chicago, IL" required {...field('location')} />
        <NumberInput
          label="Openings"
          min={1}
          step={1}
          value={values.openings}
          onValueChange={(value) => set('openings', value === '' ? '' : Math.round(value))}
          error={errors.openings}
        />
        <Select
          label="Employment type"
          data={['Full time', 'Part time', 'Contract', 'Internship', 'Temporary']}
          value={values.employmentType}
          onChange={(value) => value && set('employmentType', value)}
        />
        <Select
          label="Work mode"
          data={['On-site', 'Hybrid', 'Remote']}
          value={values.workMode}
          onChange={(value) => value && set('workMode', value)}
        />
        <Input type="date" label="Target start" {...field('targetStartDate')} />
      </div>
      {blocked}
    </div>,
    <div key="description">
      <PlateMarkdownEditor
        key={editorVersion}
        value={description}
        onChange={setDescription}
        placeholder="Describe what this person will own…"
        header={
          <Select
            aria-label="Add from template"
            size="sm"
            className="w-60"
            clearable
            placeholder="Add from template"
            value={postingTemplateId}
            data={(templates.data ?? []).map((template) => ({
              value: template.id,
              label: `${template.name} · v${template.version}`,
            }))}
            onChange={(id) => {
              setPostingTemplateId(id);
              const template = templates.data?.find((item) => item.id === id);
              if (template) {
                setDescription(template.descriptionMarkdown);
                setEditorVersion((version) => version + 1);
              }
            }}
          />
        }
      />
      <p className="mt-2 text-xs text-fg-subtle">
        Use headings, lists, emphasis and quotes. The saved content stays Markdown.
      </p>
    </div>,
    <div key="requirements" className="flex flex-col gap-4">
      <TagsInput
        label="Must have"
        description="Press Enter after each one. Used to match and screen candidates."
        placeholder="e.g. Figma, 5+ years of B2B SaaS"
        value={reqs.required}
        onChange={(required) => setReqs((r) => ({ ...r, required }))}
      />
      <TagsInput
        label="Nice to have"
        placeholder="e.g. Design systems"
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
        Skip this if you are not sure yet. You can write or extract requirements on the job later.
      </p>
    </div>,
    <div key="pipeline">
      {pipelines.isLoading ? (
        <SkeletonRows rows={2} className="px-0" />
      ) : pipelineList.length === 0 ? (
        <div className="flex flex-col gap-2">
          {stageBadges(DEFAULT_STAGES)}
          <p className="text-xs text-fg-subtle">
            The standard pipeline. An admin can add others under Settings › Pipelines.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Select
            label="Pipeline"
            className="max-w-[360px]"
            data={pipelineList.map((item) => ({
              value: item.id,
              label: item.isDefault ? `${item.name} (default)` : item.name,
            }))}
            value={pipelineTemplateId}
            onChange={(id) => id && setPipelineTemplateId(id)}
          />
          {selectedPipeline && stageBadges(selectedPipeline.stageNames)}
        </div>
      )}
    </div>,
    <div key="team">
      <div className="grid gap-4 sm:grid-cols-2">
        <Autocomplete
          label="Hiring manager"
          placeholder="Search or type an email"
          data={people('HiringManager')}
          value={values.ownerEmail}
          onChange={(value) => set('ownerEmail', value)}
          error={errors.ownerEmail}
        />
        <Autocomplete
          label="Recruiter"
          placeholder="Search or type an email"
          data={people('Recruiter')}
          value={values.recruiterEmail}
          onChange={(value) => set('recruiterEmail', value)}
          error={errors.recruiterEmail}
        />
      </div>
      <p className="mt-3 text-xs text-fg-subtle">
        Add named viewers or make the job confidential on its Settings page after you create it.
      </p>
      {blocked}
    </div>,
    <div key="review" className="flex flex-col gap-5">
      <ReviewBlock title="Basics" onEdit={() => setStep(0)}>
        <DescriptionList
          columns={2}
          items={[
            { label: 'Job title', value: values.title },
            { label: 'Team', value: values.department },
            { label: 'Location', value: `${values.location} · ${values.workMode}` },
            { label: 'Employment type', value: values.employmentType },
            { label: 'Openings', value: values.openings },
            {
              label: 'Target start',
              value: values.targetStartDate ? formatDate(values.targetStartDate) : '—',
            },
          ]}
        />
      </ReviewBlock>
      <ReviewBlock title="Description" onEdit={() => setStep(1)}>
        <p className="text-sm text-fg-muted">
          {description.trim()
            ? `${description.trim().split(/\s+/).length} words`
            : 'No description yet. Applicants will see an empty posting.'}
        </p>
      </ReviewBlock>
      <ReviewBlock title="Requirements" onEdit={() => setStep(2)}>
        {reqs.required.length || reqs.preferred.length ? (
          <div className="flex flex-wrap gap-1.5">
            {reqs.required.map((item) => (
              <Badge key={`r-${item}`} tone="blue">
                {item}
              </Badge>
            ))}
            {reqs.preferred.map((item) => (
              <Badge key={`p-${item}`} variant="outline">
                {item}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-fg-muted">None yet.</p>
        )}
      </ReviewBlock>
      <ReviewBlock title="Pipeline" onEdit={() => setStep(3)}>
        {stageBadges(stageNames)}
      </ReviewBlock>
      <ReviewBlock title="Hiring team" onEdit={() => setStep(4)}>
        <DescriptionList
          columns={2}
          items={[
            {
              label: 'Hiring manager',
              value: values.ownerEmail ? nameFromEmail(values.ownerEmail) : '—',
            },
            {
              label: 'Recruiter',
              value: values.recruiterEmail ? nameFromEmail(values.recruiterEmail) : '—',
            },
          ]}
        />
      </ReviewBlock>
      <Alert tone="info">
        The job is created as a draft. If your organization needs approval, you submit it for
        approval on the job page; otherwise open it with Change status.
      </Alert>
    </div>,
  ];

  return (
    <div className="mx-auto max-w-[1320px]">
      <PageHeader
        breadcrumbs={[{ label: 'Jobs', href: '/jobs' }, { label: 'New job' }]}
        title="Create job"
        description="Set up the role, owners, and the candidate-facing summary."
        actions={
          <Button asChild variant="secondary">
            <Link href="/jobs">Cancel</Link>
          </Button>
        }
      />
      <Wizard
        steps={steps}
        current={step}
        onStepChange={setStep}
        onFinish={finish}
        finishLabel="Create job"
        busy={mutation.isPending}
        aside={
          <Card>
            <CardHeader title="Posting preview" description="How the careers page will read." />
            <CardBody>
              <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border-subtle bg-background p-4">
                <JobPostingView
                  company={user.organizationName}
                  job={{
                    title: values.title.trim() || 'Job title',
                    department: values.department.trim() || 'Team',
                    location: values.location.trim() || 'Location',
                    workMode: values.workMode,
                    employmentType: values.employmentType,
                    openings: Number(values.openings) || 1,
                    description,
                    targetStartDate: values.targetStartDate || null,
                  }}
                />
              </div>
            </CardBody>
          </Card>
        }
      >
        {content[step]}
      </Wizard>
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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, MailCheck } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Checkbox,
  DescriptionList,
  FileDrop,
  Input,
  PageHeader,
  SkeletonRows,
  Textarea,
  Wizard,
  toast,
  type WizardStep,
} from '@/components/ui';
import { safeWebUrl } from '@/lib/safe-url';
import { writeToken } from '@/features/candidate-portal/portal';
import { JobMeta } from './CareersBoard';
import { JobUnavailable, useJob } from './JobPage';
import { postJson, publicFetch, PublicError, type PublicJob } from './public-api';
import { formatAnswers, parseQuestions } from './questions';

type Contact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  linkedInUrl: string;
};
const EMPTY: Contact = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  linkedInUrl: '',
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Same rules as the API's file store.
const RESUME_TYPES = ['.pdf', '.doc', '.docx'];
const MAX_BYTES = 10 * 1024 * 1024;

export function ApplyPage({ id }: { id: string }) {
  const job = useJob(id);
  if (job.isPending)
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  if (job.isError) return <JobUnavailable error={job.error} onRetry={() => job.refetch()} />;
  return <ApplyWizard job={job.data} />;
}

function ApplyWizard({ job }: { job: PublicJob }) {
  const questions = parseQuestions(job.applicationQuestionsMarkdown);
  const [contact, setContact] = useState<Contact>(EMPTY);
  const [resume, setResume] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState('');
  const [noResume, setNoResume] = useState(false);
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''));
  const [current, setCurrent] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const set = (key: keyof Contact) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setContact((c) => ({ ...c, [key]: event.currentTarget.value }));
  const emailError =
    contact.email && !EMAIL.test(contact.email.trim())
      ? 'Enter an email like name@example.com.'
      : undefined;
  const linkedInError =
    contact.linkedInUrl && !safeWebUrl(contact.linkedInUrl)
      ? 'Paste the full link, starting with https://'
      : undefined;
  const contactValid =
    !!contact.firstName.trim() &&
    !!contact.lastName.trim() &&
    EMAIL.test(contact.email.trim()) &&
    !linkedInError;
  const answersValid = questions.every((q, i) => !q.required || answers[i]?.trim());

  const steps: WizardStep[] = [
    {
      id: 'contact',
      title: 'Contact details',
      description: 'How the team reaches you',
      valid: contactValid,
    },
    { id: 'resume', title: 'Resume', description: 'Upload or skip', valid: !!resume || noResume },
    ...(questions.length
      ? [
          {
            id: 'questions',
            title: 'Questions',
            description: `${questions.length} from the team`,
            valid: answersValid,
          },
        ]
      : []),
    { id: 'review', title: 'Review and submit', description: 'Check your answers' },
  ];
  const step = steps[current];
  const goTo = (stepId: string) => setCurrent(steps.findIndex((s) => s.id === stepId));

  function pickResume(file: File | null) {
    setResumeError('');
    if (!file) return setResume(null);
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!RESUME_TYPES.includes(ext)) return setResumeError('Upload a PDF or Word document.');
    if (file.size === 0 || file.size > MAX_BYTES)
      return setResumeError('Choose a file that is under 10 MB.');
    setResume(file);
    setNoResume(false);
  }

  // `withResume` false is also how "send a new code" works: same data, no second upload.
  async function send(withResume: boolean) {
    const fields = {
      firstName: contact.firstName.trim(),
      lastName: contact.lastName.trim(),
      email: contact.email.trim(),
      phone: contact.phone.trim(),
      location: contact.location.trim(),
      linkedInUrl: contact.linkedInUrl.trim(),
      answersMarkdown: questions.length ? formatAnswers(questions, answers) : '',
    };
    const fallback = 'We could not send your application. Please try again.';
    if (withResume && resume) {
      const form = new FormData();
      Object.entries(fields).forEach(([key, value]) => value && form.append(key, value));
      form.append('resume', resume);
      await publicFetch(
        `/public/jobs/${job.id}/applications/resume`,
        { method: 'POST', body: form },
        fallback,
      );
    } else {
      await postJson(`/public/jobs/${job.id}/applications`, fields, fallback);
    }
  }

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await send(true);
      setSubmitted(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setError(
        e instanceof PublicError && e.status === 404
          ? 'This job closed while you were applying, so we could not send your application.'
          : (e as Error).message,
      );
    }
    setBusy(false);
  }

  const header = (
    <PageHeader
      breadcrumbs={[
        { label: 'Open jobs', href: '/careers' },
        { label: job.title, href: `/careers/${job.id}` },
        { label: 'Apply' },
      ]}
      title={submitted ? 'Confirm your email' : `Apply for ${job.title}`}
      description={submitted ? undefined : 'Fields marked * are required.'}
    />
  );

  if (submitted)
    return (
      <>
        {header}
        <ConfirmApplication
          email={contact.email.trim()}
          jobTitle={job.title}
          onResend={() => send(false)}
          onChangeEmail={() => {
            setSubmitted(false);
            setCurrent(0);
          }}
        />
      </>
    );

  return (
    <>
      {header}
      <Wizard
        steps={steps}
        current={current}
        onStepChange={setCurrent}
        onFinish={submit}
        finishLabel="Submit application"
        busy={busy}
        aside={
          <Card>
            <CardBody className="space-y-3 pt-5">
              <JobMeta job={job} />
              <Link
                href={`/careers/${job.id}`}
                className="inline-block text-sm font-medium text-accent-foreground hover:underline"
              >
                Read the job description
              </Link>
            </CardBody>
          </Card>
        }
      >
        {step.id === 'contact' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First name"
              required
              autoComplete="given-name"
              value={contact.firstName}
              onChange={set('firstName')}
            />
            <Input
              label="Last name"
              required
              autoComplete="family-name"
              value={contact.lastName}
              onChange={set('lastName')}
            />
            <Input
              label="Email"
              required
              type="email"
              autoComplete="email"
              description="We send a code here to confirm your application."
              error={emailError}
              value={contact.email}
              onChange={set('email')}
              className="sm:col-span-2"
            />
            <Input
              label="Phone"
              type="tel"
              autoComplete="tel"
              value={contact.phone}
              onChange={set('phone')}
            />
            <Input
              label="Location"
              autoComplete="address-level2"
              placeholder="City, country"
              value={contact.location}
              onChange={set('location')}
            />
            <Input
              label="LinkedIn profile"
              type="url"
              placeholder="https://www.linkedin.com/in/…"
              error={linkedInError}
              value={contact.linkedInUrl}
              onChange={set('linkedInUrl')}
              className="sm:col-span-2"
            />
            {!contactValid && (
              <p className="text-sm text-fg-subtle sm:col-span-2">
                Add your first name, last name and email to continue.
              </p>
            )}
          </div>
        )}

        {step.id === 'resume' && (
          <div className="space-y-4">
            <p className="text-base text-fg-muted">
              A resume helps the team see your experience at a glance.
            </p>
            <FileDrop
              file={resume}
              onFile={pickResume}
              accept={RESUME_TYPES.join(',')}
              hint="PDF or Word document, up to 10 MB"
              label="Drop your resume here or browse"
            />
            {resumeError && (
              <p role="alert" className="text-sm text-destructive">
                {resumeError}
              </p>
            )}
            {!resume && (
              <Checkbox
                checked={noResume}
                onCheckedChange={setNoResume}
                label="Apply without a resume"
                description="You can share one later by messaging the team from the candidate portal."
              />
            )}
          </div>
        )}

        {step.id === 'questions' && (
          <div className="space-y-5">
            {questions.map((q, i) => (
              <Textarea
                key={q.text}
                label={q.text}
                required={q.required}
                minRows={3}
                maxLength={4000}
                value={answers[i] ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setAnswers((a) => a.map((old, j) => (j === i ? value : old)));
                }}
              />
            ))}
          </div>
        )}

        {step.id === 'review' && (
          <div className="space-y-6">
            {error && (
              <Alert tone="danger" title="Your application was not sent">
                {error}
              </Alert>
            )}
            <ReviewSection title="Contact details" onEdit={() => goTo('contact')}>
              <DescriptionList
                columns={2}
                items={[
                  {
                    label: 'Name',
                    value: `${contact.firstName.trim()} ${contact.lastName.trim()}`,
                  },
                  { label: 'Email', value: contact.email.trim() },
                  { label: 'Phone', value: contact.phone.trim() || '—' },
                  { label: 'Location', value: contact.location.trim() || '—' },
                  { label: 'LinkedIn', value: contact.linkedInUrl.trim() || '—' },
                ]}
              />
            </ReviewSection>
            <ReviewSection title="Resume" onEdit={() => goTo('resume')}>
              <p className="text-base text-fg">{resume ? resume.name : 'No resume'}</p>
            </ReviewSection>
            {questions.length > 0 && (
              <ReviewSection title="Your answers" onEdit={() => goTo('questions')}>
                <DescriptionList
                  items={questions.map((q, i) => ({
                    label: q.text,
                    value: <span className="whitespace-pre-wrap">{answers[i]?.trim() || '—'}</span>,
                  }))}
                />
              </ReviewSection>
            )}
            <p className="text-sm text-fg-subtle">
              When you submit, we email a 6-digit code to {contact.email.trim()}. Your application
              reaches the team once you enter it.
            </p>
          </div>
        )}
      </Wizard>
    </>
  );
}

function ReviewSection({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-b border-border-subtle pb-5 last-of-type:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        <Button
          variant="link"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${title.toLowerCase()}`}
        >
          Edit
        </Button>
      </div>
      {children}
    </section>
  );
}

/** After submit: the API emails a code and the application waits until it is confirmed. */
function ConfirmApplication({
  email,
  jobTitle,
  onResend,
  onChangeEmail,
}: {
  email: string;
  jobTitle: string;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ href: string; stored: boolean } | null>(null);

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await publicFetch<{ token: string; applicationId: string }>(
        '/public/applications/verify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: code.trim() }),
        },
      );
      const stored = writeToken(result.token);
      setDone({
        href: stored
          ? `/candidate-portal/applications/${result.applicationId}`
          : '/candidate-portal',
        stored,
      });
    } catch (e) {
      setError(
        e instanceof PublicError && e.status === 400
          ? 'That code is wrong or too old. Check it and try again, or send a new code.'
          : (e as Error).message,
      );
    }
    setBusy(false);
  }

  async function resend() {
    setResending(true);
    try {
      await onResend();
      setCode('');
      setError('');
      toast.success('New code sent', `Check ${email}. The old code no longer works.`);
    } catch (e) {
      toast.error('We could not send a new code', (e as Error).message);
    }
    setResending(false);
  }

  if (done)
    return (
      <Card className="mx-auto max-w-xl">
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-12 text-tone-green-dot" strokeWidth={1.5} aria-hidden />
          <h2 className="text-lg font-semibold text-fg">Your application is in</h2>
          <p className="max-w-md text-base text-fg-muted">
            Thanks for applying for {jobTitle}. The hiring team will review it. In the candidate
            portal, you can follow each step, book interviews and message the team.
          </p>
          {!done.stored && (
            <p className="max-w-md text-sm text-fg-subtle">
              Your browser settings stop us from keeping you signed in. Sign in to the portal with
              your email to see your application.
            </p>
          )}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/careers">See other jobs</Link>
            </Button>
            <Button asChild>
              <Link href={done.href}>Track your application</Link>
            </Button>
          </div>
        </CardBody>
      </Card>
    );

  return (
    <Card className="mx-auto max-w-xl">
      <CardBody className="space-y-5 pt-6">
        <div className="flex items-start gap-3">
          <MailCheck className="mt-0.5 size-6 shrink-0 text-tone-blue-dot" aria-hidden />
          <div>
            <h2 className="text-lg font-semibold text-fg">Check your email</h2>
            <p className="mt-1 text-base text-fg-muted">
              We sent a 6-digit code to <span className="font-medium text-fg">{email}</span>. It
              expires in 15 minutes. Your application reaches the team once you confirm.
            </p>
          </div>
        </div>
        {error && <Alert tone="danger">{error}</Alert>}
        <form onSubmit={verify} className="flex flex-col gap-3">
          <Input
            label="Confirmation code"
            autoComplete="one-time-code"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.currentTarget.value)}
            required
          />
          <Button type="submit" loading={busy} disabled={code.trim().length < 6} fullWidth>
            Confirm application
          </Button>
        </form>
        <div className="space-y-2 border-t border-border-subtle pt-4 text-sm text-fg-subtle">
          <p>
            No email after a few minutes? Check your spam folder, or{' '}
            <Button variant="link" size="sm" loading={resending} onClick={resend}>
              send a new code
            </Button>
            .
          </p>
          <p>
            Wrong address?{' '}
            <Button variant="link" size="sm" onClick={onChangeEmail}>
              Change your email
            </Button>
            .
          </p>
          <p>
            Applied for this job before? Then we do not send a new code. Your application is already
            in the{' '}
            <Link
              href="/candidate-portal"
              className="font-medium text-accent-foreground hover:underline"
            >
              candidate portal
            </Link>
            .
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

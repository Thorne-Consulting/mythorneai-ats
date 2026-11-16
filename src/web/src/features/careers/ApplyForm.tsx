'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleAlert, FileText, Sparkles, X } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardBody,
  Checkbox,
  FileDrop,
  Input,
  Progress,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { ApplicationSent } from './ApplicationSent';
import {
  attentionText,
  autofill,
  countryFromLocale,
  EMPTY_DETAILS,
  phoneNumber,
  validate,
  type DetailKey,
  type Details,
} from './apply';
import { jobPath, metaParts } from './jobs';
import { errorText, OFFLINE, type PublicJob } from './public-api';
import { AnswerField } from './AnswerField';
import { answerProblem, toAnswerInputs, type Answer } from './questions';
import { readSource } from './source';

// Same rules as the API's file store.
const RESUME_TYPES = ['.pdf', '.doc', '.docx'];
const MAX_BYTES = 10 * 1024 * 1024;

type Upload =
  | { state: 'uploading'; name: string; progress: number }
  | { state: 'done'; name: string; token: string; readable: boolean }
  | null;
// Answers by question id; files are not kept (their upload token expires).
type Draft = { details: Details; answers: Record<string, Answer>; noResume: boolean };
type ParseResult = {
  fileToken: string;
  fileName: string;
  readable: boolean;
  fields?: Partial<Record<DetailKey, string | null>> | null;
};

const draftKey = (jobId: string) => `apply-draft:${jobId}`;

/** POST the file with upload progress (fetch cannot report it). */
function uploadResume(file: File, onProgress: (percent: number) => void) {
  return new Promise<ParseResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/public/resume');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress((e.loaded / e.total) * 100);
    xhr.onload = async () => {
      const response = new Response(xhr.responseText, { status: xhr.status });
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else
        reject(new Error(await errorText(response, 'We could not upload that file. Try again.')));
    };
    xhr.onerror = () => reject(new Error(OFFLINE));
    const body = new FormData();
    body.append('resume', file);
    xhr.send(body);
  });
}

/**
 * Apply on one page: resume first (it fills the details), then contact details, then the team's
 * questions. Errors show under each field and in a summary at the top. What is typed is kept on
 * this device until it is sent.
 */
export function ApplyForm({
  job,
  requireResume = false,
}: {
  job: PublicJob;
  /** Set in the careers settings: no "Apply without a resume". */
  requireResume?: boolean;
}) {
  const questions = useMemo(() => job.questions ?? [], [job.questions]);
  const country = useMemo(
    () => countryFromLocale(typeof navigator === 'undefined' ? undefined : navigator.language),
    [],
  );
  const [details, setDetails] = useState<Details>(EMPTY_DETAILS);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [noResume, setNoResume] = useState(false);
  const [upload, setUpload] = useState<Upload>(null);
  const [resumeError, setResumeError] = useState('');
  const [fromResume, setFromResume] = useState<DetailKey[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [restored, setRestored] = useState(false);
  const [sent, setSent] = useState<{ applicationId: string; email: string } | null>(null);
  const website = useRef<HTMLInputElement>(null);
  // The latest details, for filling from the resume once the upload finishes.
  const latest = useRef(details);
  latest.current = details;

  // Bring back what was typed on this device (not the file).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey(job.id));
      if (!saved) return;
      const draft = JSON.parse(saved) as Draft;
      setDetails({ ...EMPTY_DETAILS, ...draft.details });
      // Old drafts kept a list of texts; they start the questions empty.
      const kept = Array.isArray(draft.answers) ? {} : (draft.answers ?? {});
      setAnswers(
        Object.fromEntries(
          questions
            .filter((q) => q.type !== 'File' && kept[q.id])
            .map((q) => [q.id, { values: kept[q.id].values ?? [] }]),
        ),
      );
      setNoResume(!!draft.noResume);
      setRestored(true);
    } catch {
      // storage blocked or old data: start empty
    }
  }, [job.id, questions]);

  useEffect(() => {
    const typed =
      Object.values(details).some((v) => v.trim()) ||
      Object.values(answers).some((a) => a.values.some((v) => v.trim()));
    try {
      if (typed)
        localStorage.setItem(
          draftKey(job.id),
          JSON.stringify({ details, answers, noResume } satisfies Draft),
        );
    } catch {
      // storage blocked: nothing is kept
    }
  }, [details, answers, noResume, job.id]);

  function startOver() {
    try {
      localStorage.removeItem(draftKey(job.id));
    } catch {
      // storage blocked
    }
    setDetails(EMPTY_DETAILS);
    setAnswers({});
    setNoResume(false);
    setFromResume([]);
    setTouched(new Set());
    setSubmitted(false);
    setRestored(false);
  }

  // In the order they appear on the page, so the summary and the focus go top to bottom.
  const errors: Record<string, string> = {};
  if (!upload && (requireResume || !noResume))
    errors.resume =
      resumeError ||
      (requireResume ? 'Add your resume.' : 'Add your resume, or choose Apply without a resume.');
  else if (upload?.state === 'uploading')
    errors.resume = 'Wait for your resume to finish uploading.';
  Object.assign(errors, validate(details, country));
  for (const q of questions) {
    const problem = answerProblem(q, answers[q.id]);
    if (problem) errors[`answers.${q.id}`] = problem;
  }
  Object.assign(errors, serverErrors);
  const shown = (key: string) => (submitted || touched.has(key) ? errors[key] : undefined);
  const visible = Object.keys(errors).filter((key) => shown(key));

  const set = (key: DetailKey) => (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    setDetails((d) => ({ ...d, [key]: value }));
    setFromResume((keys) => keys.filter((k) => k !== key));
    setServerErrors(({ [key]: _, ...rest }) => rest);
  };
  const blur = (key: string) => () => setTouched((t) => new Set(t).add(key));

  async function pickResume(file: File | null) {
    setResumeError('');
    setServerErrors(({ resume: _, ...rest }) => rest);
    if (!file) return setUpload(null);
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!RESUME_TYPES.includes(ext)) return setResumeError('Upload a PDF or Word document.');
    if (file.size === 0 || file.size > MAX_BYTES)
      return setResumeError('Choose a file that is under 10 MB.');
    setNoResume(false);
    setUpload({ state: 'uploading', name: file.name, progress: 0 });
    try {
      const result = await uploadResume(file, (progress) =>
        setUpload((u) => (u?.state === 'uploading' ? { ...u, progress } : u)),
      );
      setUpload({
        state: 'done',
        name: result.fileName,
        token: result.fileToken,
        readable: result.readable,
      });
      if (result.fields) {
        // Only a number we can dial: a wrong guess is worse than an empty field.
        const phone = result.fields.phone && phoneNumber(result.fields.phone, country);
        const { next, filled } = autofill(latest.current, { ...result.fields, phone });
        setDetails(next);
        setFromResume(filled);
      }
    } catch (e) {
      setUpload(null);
      setResumeError((e as Error).message);
      setTouched((t) => new Set(t).add('resume'));
    }
  }

  function focusField(key: string) {
    const el = document.getElementById(`apply-${key}`);
    el?.focus();
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    setFailure('');
    const keys = Object.keys(errors);
    if (keys.length) {
      // The summary is read out; focus goes to the first field to fix.
      focusField(keys[0]);
      return;
    }
    setBusy(true);
    const email = details.email.trim();
    const source = readSource();
    try {
      const response = await fetch(`/public/jobs/${job.id}/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: details.firstName.trim(),
          lastName: details.lastName.trim(),
          email,
          phone: details.phone.trim()
            ? (phoneNumber(details.phone, country) ?? details.phone.trim())
            : null,
          location: details.location.trim() || null,
          linkedInUrl: details.linkedInUrl.trim() || null,
          answers: toAnswerInputs(questions, answers),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          fileToken: upload?.state === 'done' ? upload.token : null,
          website: website.current?.value ?? '',
          ...source,
        }),
      });
      if (response.ok) {
        const { applicationId } = (await response.json()) as { applicationId: string };
        try {
          localStorage.removeItem(draftKey(job.id));
        } catch {
          // storage blocked
        }
        setSent({ applicationId, email });
        window.scrollTo({ top: 0 });
      } else if (response.status === 400) {
        const body = await response.json().catch(() => ({}));
        const mapped: Record<string, string> = {};
        for (const [key, messages] of Object.entries(body.errors ?? {}))
          mapped[key] = (messages as string[])[0];
        if (mapped.resume) setUpload(null);
        setServerErrors(mapped);
        if (Object.keys(mapped).length) focusField(Object.keys(mapped)[0]);
        else setFailure(body.message ?? 'Check your details and try again.');
      } else if (response.status === 404) {
        setFailure(
          'This job closed while you were applying, so we could not send your application.',
        );
      } else {
        setFailure(
          await errorText(response, 'We could not send your application. Please try again.'),
        );
      }
    } catch {
      setFailure(OFFLINE);
    }
    setBusy(false);
  }

  const header = (
    <header className="mb-6 space-y-2">
      <Link
        href={jobPath(job)}
        className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-accent-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to the job
      </Link>
      <p className="text-sm text-fg-muted">{sent ? 'Application sent' : 'Applying for'}</p>
      <h1 className="text-3xl font-bold tracking-[-0.01em] text-fg">{job.title}</h1>
      <p className="text-base text-fg-muted">{metaParts(job).join(' · ')}</p>
    </header>
  );

  if (sent)
    return (
      <div className="mx-auto max-w-[640px]">
        {header}
        <ApplicationSent
          jobTitle={job.title}
          applicationId={sent.applicationId}
          email={sent.email}
          onFixEmail={() => {
            setSent(null);
            setSubmitted(false);
            setTimeout(() => focusField('email'), 50);
          }}
        />
      </div>
    );

  const hint = (key: DetailKey) =>
    fromResume.includes(key) ? (
      <span className="inline-flex items-center gap-1 text-accent-foreground">
        <Sparkles className="size-3.5" aria-hidden /> From your resume
      </span>
    ) : undefined;

  return (
    <div className="mx-auto max-w-[640px]">
      {header}
      <form onSubmit={submit} noValidate aria-describedby="apply-summary">
        <div id="apply-summary" aria-live="polite" className="empty:hidden">
          {submitted && visible.length > 0 && (
            <Alert tone="danger" className="mb-5" title={attentionText(visible.length)}>
              <ul className="mt-1 space-y-0.5">
                {visible.map((key) => (
                  <li key={key}>
                    <button
                      type="button"
                      className="text-left underline-offset-2 hover:underline"
                      onClick={() => focusField(key)}
                    >
                      {/* A question's message names the question, so two "Answer this question." differ. */}
                      {key.startsWith('answers.')
                        ? `${questions.find((q) => `answers.${q.id}` === key)?.label ?? 'Question'}: ${errors[key]}`
                        : errors[key]}
                    </button>
                  </li>
                ))}
              </ul>
            </Alert>
          )}
          {failure && (
            <Alert tone="danger" className="mb-5" title="Your application was not sent">
              {failure}
            </Alert>
          )}
        </div>
        {restored && (
          <p className="mb-4 flex flex-wrap items-center gap-x-2 text-sm text-fg-muted">
            We restored what you typed on this device.
            <Button type="button" variant="link" size="sm" onClick={startOver}>
              Start over
            </Button>
          </p>
        )}

        <Card>
          <CardBody className="divide-y divide-border-subtle p-0">
            <Section title="Resume">
              <p className="text-sm text-fg-muted">
                Add it first. We fill in your details from it, and you can change anything.
              </p>
              {upload ? (
                <div
                  id="apply-resume"
                  tabIndex={-1}
                  className="flex items-center gap-3 rounded-lg border border-border bg-muted px-4 py-3 focus-visible:outline-none"
                >
                  <FileText className="size-5 shrink-0 text-fg-subtle" aria-hidden />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="truncate text-base font-medium text-fg">{upload.name}</p>
                    {upload.state === 'uploading' ? (
                      <Progress value={upload.progress} size="sm" label="Upload progress" />
                    ) : upload.readable ? (
                      <p className="text-xs text-fg-subtle">
                        {fromResume.length
                          ? 'We filled in your details from it. Check them below.'
                          : 'Uploaded.'}
                      </p>
                    ) : (
                      <p className="text-xs text-fg-muted">
                        We could not read this file. Fill in your details below.
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setUpload(null)}
                    aria-label="Remove resume"
                    className="rounded-sm p-1 text-fg-subtle hover:text-fg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div id="apply-resume" tabIndex={-1} className="focus-visible:outline-none">
                  <FileDrop
                    file={null}
                    onFile={pickResume}
                    accept={RESUME_TYPES.join(',')}
                    hint="PDF or Word document, up to 10 MB"
                    label="Drop your resume here or browse"
                    className={cn(
                      shown('resume') && (requireResume || !noResume) && 'border-destructive',
                    )}
                  />
                </div>
              )}
              {shown('resume') && !(upload?.state === 'done') && (
                <p className="flex items-center gap-1.5 text-sm text-destructive">
                  <CircleAlert className="size-4 shrink-0" aria-hidden />
                  {errors.resume}
                </p>
              )}
              {!upload && !requireResume && (
                <Checkbox
                  checked={noResume}
                  onCheckedChange={(checked) => {
                    setNoResume(checked);
                    setTouched((t) => new Set(t).add('resume'));
                  }}
                  label="Apply without a resume"
                />
              )}
            </Section>

            <Section title="Your details">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="apply-firstName"
                  label="First name"
                  required
                  autoComplete="given-name"
                  value={details.firstName}
                  onChange={set('firstName')}
                  onBlur={blur('firstName')}
                  error={shown('firstName')}
                  description={hint('firstName')}
                />
                <Input
                  id="apply-lastName"
                  label="Last name"
                  required
                  autoComplete="family-name"
                  value={details.lastName}
                  onChange={set('lastName')}
                  onBlur={blur('lastName')}
                  error={shown('lastName')}
                  description={hint('lastName')}
                />
                <Input
                  id="apply-email"
                  label="Email"
                  required
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={details.email}
                  onChange={set('email')}
                  onBlur={blur('email')}
                  error={shown('email')}
                  description={hint('email') ?? 'We send your confirmation here.'}
                  className="sm:col-span-2"
                />
                <Input
                  id="apply-phone"
                  label="Phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+1 312 555 0142"
                  value={details.phone}
                  onChange={set('phone')}
                  onBlur={() => {
                    blur('phone')();
                    const formatted = details.phone.trim() && phoneNumber(details.phone, country);
                    if (formatted) setDetails((d) => ({ ...d, phone: formatted }));
                  }}
                  error={shown('phone')}
                  description={hint('phone')}
                />
                <Input
                  id="apply-location"
                  label="Location"
                  autoComplete="address-level2"
                  placeholder="City, country"
                  value={details.location}
                  onChange={set('location')}
                  onBlur={blur('location')}
                  error={shown('location')}
                />
                <Input
                  id="apply-linkedInUrl"
                  label="LinkedIn profile"
                  type="url"
                  autoComplete="url"
                  placeholder="https://www.linkedin.com/in/…"
                  value={details.linkedInUrl}
                  onChange={set('linkedInUrl')}
                  onBlur={blur('linkedInUrl')}
                  error={shown('linkedInUrl')}
                  description={hint('linkedInUrl')}
                  className="sm:col-span-2"
                />
              </div>
            </Section>

            {questions.length > 0 && (
              <Section title="Questions from the team">
                <div className="space-y-6">
                  {questions.map((q) => {
                    const key = `answers.${q.id}`;
                    return (
                      <AnswerField
                        key={q.id}
                        id={`apply-${key}`}
                        question={q}
                        value={answers[q.id]}
                        error={shown(key)}
                        onBlur={blur(key)}
                        onChange={(answer) => {
                          setAnswers((a) => ({ ...a, [q.id]: answer }));
                          setServerErrors(({ [key]: _, ...rest }) => rest);
                          // A pick is an answer; show its problem at once.
                          if (q.type !== 'ShortText' && q.type !== 'LongText')
                            setTouched((t) => new Set(t).add(key));
                        }}
                      />
                    );
                  })}
                </div>
              </Section>
            )}
          </CardBody>
        </Card>

        {/* Hidden from people and screen readers; only bots fill it in. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Website
            <input ref={website} type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-fg-subtle">Fields marked * are required.</p>
          <Button type="submit" size="lg" loading={busy}>
            Submit application
          </Button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 px-5 py-6 sm:px-6" aria-label={title}>
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      {children}
    </section>
  );
}

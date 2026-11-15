'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileQuestion,
  ListChecks,
  Maximize,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { RichText } from '@/components/rich-text';
import { cn } from '@/lib/cn';
import { PORTAL_HEADERS, when } from '@/features/candidate-portal/portal';
import { usePortal } from '@/features/candidate-portal/PortalProvider';
import { clock, plural, promptLine, questionTypeLabels, type IntegrityEvent } from '../scoring';
import {
  emptyAnswer,
  isAnswered,
  QuestionInput,
  type AnswerValue,
  type CandidateQuestion,
} from './QuestionInput';
import type { TakeView } from './take-api';

const HOME = { label: 'Home', href: '/candidate-portal/home' };

/**
 * /candidate-portal/assessments/[id]: the intro, the test itself (timer on the server, autosave,
 * section by section), a review step and the confirmation. Reached from Home or an email link.
 */
export function TakeAssessment({ id }: { id: string }) {
  const { reload: reloadPortal } = usePortal();
  const [view, setView] = useState<TakeView | null>(null);
  const [problem, setProblem] = useState<'missing' | 'offline' | null>(null);
  // Server time minus this device's time, so the countdown is right even when the clock is off.
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/public/assessments/${id}`);
      if (response.status === 401) return void reloadPortal();
      if (!response.ok) return setProblem('missing');
      const data = (await response.json()) as TakeView;
      setOffset(new Date(data.serverNow).getTime() - Date.now());
      setView(data);
      setProblem(null);
    } catch {
      setProblem('offline');
    }
  }, [id, reloadPortal]);
  useEffect(() => {
    load();
  }, [load]);

  if (problem === 'missing')
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={FileQuestion}
          title="We could not find this assessment"
          description="The link may be old, or the team took it back. Your Home page lists everything you have to do."
          action={
            <Button asChild variant="secondary">
              <Link href="/candidate-portal/home">Go to Home</Link>
            </Button>
          }
        />
      </Card>
    );
  if (problem === 'offline' && !view)
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={WifiOff}
          title="You seem to be offline"
          description="Check your connection, then try again. Anything you saved is safe."
          action={<Button onClick={load}>Try again</Button>}
        />
      </Card>
    );
  if (!view)
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );

  if (view.status === 'Submitted') return <Finished view={view} />;
  if (view.status === 'Expired' || view.status === 'Revoked') return <Closed view={view} />;
  if (view.kind === 'External') return <External view={view} onChange={load} />;
  if (view.status === 'NotStarted')
    return (
      <Intro
        view={view}
        onStarted={(v) => {
          setOffset(new Date(v.serverNow).getTime() - Date.now());
          setView(v);
        }}
      />
    );
  return (
    <Runner key={view.startedAt} view={view} offset={offset} onFinished={setView} onReload={load} />
  );
}

function Facts({ view }: { view: TakeView }) {
  const kinds = [
    ...new Set(
      view.types.map((t) =>
        t === 'single' || t === 'multi' ? 'Multiple choice' : questionTypeLabels[t],
      ),
    ),
  ];
  return (
    <dl className="grid gap-4 sm:grid-cols-3">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 size-5 shrink-0 text-accent-foreground" aria-hidden />
        <div>
          <dt className="text-xs text-fg-subtle">Time</dt>
          <dd className="text-base font-medium text-fg">
            {view.timed ? `${view.minutes} minutes once you start` : 'No time limit'}
          </dd>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <ListChecks className="mt-0.5 size-5 shrink-0 text-accent-foreground" aria-hidden />
        <div>
          <dt className="text-xs text-fg-subtle">Questions</dt>
          <dd className="text-base font-medium text-fg">
            {plural(view.questions, 'question')}
            {view.sections > 1 && ` in ${plural(view.sections, 'section')}`}
          </dd>
          {kinds.length > 0 && <dd className="text-xs text-fg-subtle">{kinds.join(', ')}</dd>}
        </div>
      </div>
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-0.5 size-5 shrink-0 text-accent-foreground" aria-hidden />
        <div>
          <dt className="text-xs text-fg-subtle">Finish by</dt>
          <dd className="text-base font-medium text-fg">{when(view.expiresAt)}</dd>
        </div>
      </div>
    </dl>
  );
}

/** What we check, said plainly before they start. */
function ChecksNotice({ checks }: { checks: TakeView['checks'] }) {
  const lines = [
    checks.tabSwitch && 'We note when you leave this tab, and for how long.',
    checks.fullscreen && 'We ask you to work in full screen, and note when you leave it.',
    checks.blockPaste && 'Pasting into your answers is turned off. We note each try.',
  ].filter(Boolean) as string[];
  return (
    <div className="rounded-lg border border-border-subtle bg-muted p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
        <ShieldCheck className="size-4 text-tone-green-fg" aria-hidden />
        {lines.length ? 'What we check while you work' : 'No checks while you work'}
      </p>
      {lines.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-fg-muted">
        {lines.length
          ? 'These checks help the team read your answers fairly. They never decide your result on their own. We never use your camera or microphone.'
          : 'We never use your camera or microphone.'}
      </p>
    </div>
  );
}

function Intro({ view, onStarted }: { view: TakeView; onStarted: (view: TakeView) => void }) {
  const { call } = usePortal();
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    // Full screen needs this click, so ask now; phones that cannot do it just carry on.
    if (view.checks.fullscreen)
      await document.documentElement.requestFullscreen?.().catch(() => undefined);
    const { ok, response } = await call(
      `/public/assessments/${view.id}/start`,
      undefined,
      'We could not start the assessment. Please try again.',
    );
    if (ok && response) onStarted((await response.json()) as TakeView);
    setBusy(false);
  }
  return (
    <>
      <PageHeader
        breadcrumbs={[HOME]}
        title={view.name}
        description={`${view.jobTitle}${view.company ? ` at ${view.company}` : ''}`}
      />
      <Card>
        <CardBody className="flex flex-col gap-6 py-6 sm:px-8">
          <Facts view={view} />
          {view.instructions.trim() && (
            <div>
              <h2 className="text-md font-semibold text-fg">Before you start</h2>
              <RichText markdown={view.instructions} className="mt-2 text-base text-fg-muted" />
            </div>
          )}
          <ChecksNotice checks={view.checks} />
          <ul className="space-y-1.5 text-sm text-fg-muted">
            <li>
              Your answers save as you go. You can close this page and come back on any device.
            </li>
            {view.timed ? (
              <li>
                The timer starts when you press Start and keeps running if you leave. When it runs
                out, we send what you saved.
              </li>
            ) : (
              <li>There is no timer. Submit when you are done, before the date above.</li>
            )}
          </ul>
          <div className="flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="quiet">
              <Link href={`/candidate-portal/applications/${view.applicationId}`}>Not now</Link>
            </Button>
            <Button size="lg" loading={busy} onClick={start}>
              Start when you are ready
            </Button>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

type SaveState = 'saved' | 'saving' | 'error';

function Runner({
  view,
  offset,
  onFinished,
  onReload,
}: {
  view: TakeView;
  offset: number;
  onFinished: (view: TakeView) => void;
  onReload: () => void;
}) {
  const sections = view.content ?? [];
  const questions = sections.flatMap((s) => s.questions);
  const numberOf = new Map(questions.map((q, i) => [q.id, i + 1]));
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() =>
    Object.fromEntries(
      (view.answers ?? []).map((a) => [
        a.questionId,
        { choiceIds: a.choiceIds, text: a.text ?? '', file: a.file },
      ]),
    ),
  );
  const [sectionIndex, setSectionIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [uploading, setUploading] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [fullscreenLeft, setFullscreenLeft] = useState(false);
  const markKey = `ats-assessment-marks:${view.id}`;
  const [marked, setMarked] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(markKey) ?? '[]');
    } catch {
      return [];
    }
  });

  // Per-question time, counted while a question has focus and the page is visible.
  const seconds = useRef<Record<string, number>>(
    Object.fromEntries((view.answers ?? []).map((a) => [a.questionId, a.seconds])),
  );
  const active = useRef<{ id: string | null; since: number | null }>({ id: null, since: null });
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef(new Set<string>());
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const signals = useRef<IntegrityEvent[]>([]);
  const finished = useRef(false);

  const tally = () => {
    const a = active.current;
    if (a.id && a.since)
      seconds.current[a.id] = (seconds.current[a.id] ?? 0) + (Date.now() - a.since) / 1000;
    a.since = a.id && document.visibilityState === 'visible' ? Date.now() : null;
  };
  const focusQuestion = (qid: string) => {
    if (active.current.id === qid) return;
    tally();
    active.current = { id: qid, since: Date.now() };
  };

  const deadline = view.deadlineAt ? new Date(view.deadlineAt).getTime() : null;
  const remaining = deadline === null ? null : deadline - (now + offset);

  const save = useCallback(
    async (qid: string, keepalive = false) => {
      clearTimeout(timers.current[qid]);
      const q = questions.find((x) => x.id === qid);
      if (!q || q.type === 'file') return;
      tally();
      const a = answersRef.current[qid] ?? emptyAnswer;
      pending.current.add(qid);
      setSaveState('saving');
      try {
        const response = await fetch(`/public/assessments/${view.id}/answers/${qid}`, {
          method: 'PUT',
          keepalive,
          headers: { ...PORTAL_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            choiceIds: a.choiceIds,
            text: a.text,
            seconds: Math.round(seconds.current[qid] ?? 0),
          }),
        });
        if (response.status === 409) {
          // Time is up on the server: show what was submitted.
          finished.current = true;
          onReload();
          return;
        }
        if (!response.ok) throw new Error();
        pending.current.delete(qid);
        if (pending.current.size === 0) setSaveState('saved');
      } catch {
        setSaveState('error');
        timers.current[qid] = setTimeout(() => save(qid), 3000);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view.id],
  );

  const change = (q: CandidateQuestion, value: AnswerValue) => {
    setAnswers((x) => ({ ...x, [q.id]: value }));
    focusQuestion(q.id);
    clearTimeout(timers.current[q.id]);
    setSaveState('saving');
    timers.current[q.id] = setTimeout(
      () => save(q.id),
      q.type === 'single' || q.type === 'multi' ? 150 : 800,
    );
  };

  const flushSignals = useCallback(
    async (keepalive = false) => {
      if (!signals.current.length) return;
      const events = signals.current.splice(0);
      await fetch(`/public/assessments/${view.id}/signals`, {
        method: 'POST',
        keepalive,
        headers: { ...PORTAL_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      }).catch(() => signals.current.unshift(...events));
    },
    [view.id],
  );
  const note = (type: string, extra: Partial<IntegrityEvent> = {}) =>
    signals.current.push({
      type,
      at: new Date().toISOString(),
      questionId: active.current.id,
      ...extra,
    });

  // The countdown, the signal flush and saving on the way out.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const flush = setInterval(() => flushSignals(), 10_000);
    let leftAt = 0;
    const onVisibility = () => {
      tally();
      if (!view.checks.tabSwitch) return;
      if (document.visibilityState === 'hidden') {
        leftAt = Date.now();
        note('left');
        flushSignals(true);
      } else if (leftAt) {
        note('returned', { seconds: Math.round((Date.now() - leftAt) / 1000) });
        leftAt = 0;
      }
    };
    const onFullscreen = () => {
      if (!view.checks.fullscreen) return;
      if (!document.fullscreenElement) {
        note('fullscreen-exit');
        setFullscreenLeft(true);
      } else setFullscreenLeft(false);
    };
    const onHide = () => {
      for (const qid of pending.current) save(qid, true);
      flushSignals(true);
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current.size && !finished.current) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('fullscreenchange', onFullscreen);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', warn);
    // A reload loses full screen; offer the button again.
    if (view.checks.fullscreen && document.fullscreenEnabled && !document.fullscreenElement)
      setFullscreenLeft(true);
    return () => {
      clearInterval(tick);
      clearInterval(flush);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('fullscreenchange', onFullscreen);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', warn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    setSubmitting(true);
    tally();
    // Send the last answers and time first, then submit.
    await Promise.all(
      questions
        .filter((q) => q.type !== 'file')
        .filter((q) => pending.current.has(q.id) || (seconds.current[q.id] ?? 0) > 0)
        .map((q) => save(q.id)),
    );
    await flushSignals();
    try {
      const response = await fetch(`/public/assessments/${view.id}/submit`, {
        method: 'POST',
        headers: PORTAL_HEADERS,
      });
      if (!response.ok) throw new Error();
      try {
        localStorage.removeItem(markKey);
      } catch {}
      if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
      onFinished((await response.json()) as TakeView);
    } catch {
      finished.current = false;
      setSubmitting(false);
      toast.error(
        'We could not submit. Check your connection and try again. Your answers are saved.',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.id]);

  // Time is up: submit what is saved.
  const warned = useRef(false);
  const autoTried = useRef(false);
  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 5 * 60_000 && remaining > 0 && !warned.current) {
      warned.current = true;
      toast.warning('5 minutes left', 'Your answers are saved. We submit them when time runs out.');
    }
    if (remaining <= 0 && !autoTried.current) {
      autoTried.current = true;
      // Offline: try again every few seconds; the server submits by itself soon after anyway.
      submit().finally(() => setTimeout(() => (autoTried.current = false), 5000));
    }
  }, [remaining, submit]);

  const onPaste = (event: ClipboardEvent | React.ClipboardEvent) => {
    if (!view.checks.blockPaste) return;
    event.preventDefault();
    note('paste-blocked');
    toast.info('Pasting is turned off for this assessment');
  };

  async function upload(q: CandidateQuestion, file: File) {
    focusQuestion(q.id);
    if (file.size > 25 * 1024 * 1024)
      return toast.error('Files can be up to 25 MB. Make it smaller, or zip it, and try again.');
    setUploading(q.id);
    const body = new FormData();
    body.append('file', file);
    try {
      const response = await fetch(`/public/assessments/${view.id}/files/${q.id}`, {
        method: 'POST',
        headers: PORTAL_HEADERS,
        body,
      });
      if (response.status === 409) return onReload();
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          data?.errors?.file?.[0] ?? 'We could not upload the file. Please try again.',
        );
      setAnswers((x) => ({
        ...x,
        [q.id]: { ...emptyAnswer, file: { id: data.id, name: data.name, length: data.length } },
      }));
    } catch (error) {
      toast.error((error as Error).message || 'We could not upload the file. Please try again.');
    } finally {
      setUploading(null);
    }
  }
  async function removeFile(q: CandidateQuestion) {
    const response = await fetch(`/public/assessments/${view.id}/files/${q.id}`, {
      method: 'DELETE',
      headers: PORTAL_HEADERS,
    }).catch(() => null);
    if (response?.ok) setAnswers((x) => ({ ...x, [q.id]: emptyAnswer }));
    else toast.error('We could not remove the file. Please try again.');
  }

  const toggleMark = (qid: string) =>
    setMarked((m) => {
      const next = m.includes(qid) ? m.filter((x) => x !== qid) : [...m, qid];
      try {
        localStorage.setItem(markKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  const goTo = (qid: string) => {
    const si = sections.findIndex((s) => s.questions.some((q) => q.id === qid));
    setReviewing(false);
    setSectionIndex(Math.max(0, si));
    requestAnimationFrame(() =>
      document
        .getElementById(`take-${qid}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    );
  };

  const answered = questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const low = remaining !== null && remaining <= 5 * 60_000;
  const section = sections[sectionIndex];

  return (
    <>
      <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border-subtle bg-card/95 px-4 py-2.5 shadow-card backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-fg">{view.name}</p>
            <p className="text-2xs text-fg-subtle" aria-live="polite">
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'error'
                  ? 'Not saved yet. Trying again…'
                  : 'All answers saved'}
              <span className="hidden sm:inline">
                {' '}
                · {answered} of {plural(questions.length, 'question')} answered
              </span>
            </p>
          </div>
          {remaining !== null && (
            <span
              role="timer"
              aria-label={`Time left: ${clock(remaining)}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-sm font-semibold tnum',
                low ? 'bg-tone-amber-bg text-tone-amber-fg' : 'bg-secondary text-fg',
              )}
            >
              <Clock className="size-4" aria-hidden />
              {clock(remaining)}
            </span>
          )}
          {!reviewing && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setReviewing(true)}
              className="hidden sm:inline-flex"
            >
              Review and submit
            </Button>
          )}
        </div>
        <span className="sr-only" aria-live="assertive">
          {remaining !== null && remaining <= 60_000 && remaining > 55_000
            ? 'One minute left.'
            : ''}
        </span>
      </div>

      {fullscreenLeft && (
        <Alert
          tone="warning"
          className="mb-5"
          title="Please work in full screen"
          action={
            <Button
              size="sm"
              leftIcon={<Maximize />}
              onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}
            >
              Use full screen
            </Button>
          }
        >
          This assessment asks for full screen. We noted that you left it.
        </Alert>
      )}

      {reviewing ? (
        <Card>
          <CardBody className="flex flex-col gap-5 py-6 sm:px-8">
            <div>
              <h2 className="text-lg font-semibold text-fg">Check your answers</h2>
              <p className="mt-1 text-sm text-fg-muted">
                {answered} of {plural(questions.length, 'question')} answered.
                {answered < questions.length && ' Unanswered questions score 0.'}
              </p>
            </div>
            {sections.map((s) => (
              <section key={s.id} aria-label={s.title}>
                {sections.length > 1 && (
                  <h3 className="mb-2 text-sm font-semibold text-fg">{s.title}</h3>
                )}
                <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                  {s.questions.map((q) => {
                    const done = isAnswered(q, answers[q.id]);
                    return (
                      <li
                        key={q.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
                      >
                        <span className="w-6 text-sm font-semibold text-fg-subtle tnum">
                          {numberOf.get(q.id)}.
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-fg">
                          {promptLine(q.prompt) || 'Question'}
                        </span>
                        {marked.includes(q.id) && (
                          <Badge size="sm" tone="blue">
                            To check again
                          </Badge>
                        )}
                        <Badge size="sm" tone={done ? 'green' : 'amber'}>
                          {done ? 'Answered' : 'Not answered'}
                        </Badge>
                        <Button variant="link" size="sm" onClick={() => goTo(q.id)}>
                          Go to question
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <div className="flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:justify-between">
              <Button variant="secondary" onClick={() => setReviewing(false)}>
                Back to questions
              </Button>
              <Button loading={submitting} onClick={() => setConfirming(true)}>
                Submit answers
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        section && (
          <>
            <nav aria-label="Questions" className="mb-4 flex flex-wrap gap-1.5">
              {questions.map((q) => {
                const done = isAnswered(q, answers[q.id]);
                const here = section.questions.some((x) => x.id === q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => goTo(q.id)}
                    aria-label={`Question ${numberOf.get(q.id)}, ${done ? 'answered' : 'not answered'}${marked.includes(q.id) ? ', marked to check again' : ''}`}
                    className={cn(
                      'relative flex size-8 items-center justify-center rounded-md border text-sm font-medium tnum transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      done
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'border-border bg-card text-fg-muted hover:bg-muted',
                      !here && 'opacity-60',
                    )}
                  >
                    {numberOf.get(q.id)}
                    {marked.includes(q.id) && (
                      <span
                        className="absolute -top-1 -right-1 size-2.5 rounded-full border-2 border-background bg-tone-amber-dot"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </nav>
            <section aria-labelledby="section-title">
              {sections.length > 1 && (
                <div className="mb-3">
                  <p className="text-xs text-fg-subtle tnum">
                    Section {sectionIndex + 1} of {sections.length}
                  </p>
                  <h2 id="section-title" className="text-lg font-semibold text-fg">
                    {section.title}
                  </h2>
                </div>
              )}
              <ol className="flex flex-col gap-4">
                {section.questions.map((q) => (
                  <li
                    key={q.id}
                    id={`take-${q.id}`}
                    onFocusCapture={() => focusQuestion(q.id)}
                    className="scroll-mt-28 rounded-xl border border-border-subtle bg-card p-4 shadow-card sm:p-6"
                  >
                    <QuestionInput
                      question={q}
                      number={numberOf.get(q.id)!}
                      value={answers[q.id] ?? emptyAnswer}
                      onChange={(value) => change(q, value)}
                      onPaste={onPaste}
                      onUpload={(file) => upload(q, file)}
                      onRemoveFile={() => removeFile(q)}
                      uploading={uploading === q.id}
                      marked={marked.includes(q.id)}
                      onToggleMark={() => toggleMark(q.id)}
                      disabled={submitting}
                    />
                  </li>
                ))}
              </ol>
            </section>
            <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="secondary"
                disabled={sectionIndex === 0}
                onClick={() => {
                  setSectionIndex(sectionIndex - 1);
                  window.scrollTo({ top: 0 });
                }}
              >
                Previous section
              </Button>
              {sectionIndex < sections.length - 1 ? (
                <Button
                  onClick={() => {
                    setSectionIndex(sectionIndex + 1);
                    window.scrollTo({ top: 0 });
                  }}
                >
                  Next section
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setReviewing(true);
                    window.scrollTo({ top: 0 });
                  }}
                >
                  Review answers
                </Button>
              )}
            </div>
          </>
        )
      )}

      <ConfirmDialog
        opened={confirming}
        onClose={() => setConfirming(false)}
        title="Submit your answers?"
        message={
          answered < questions.length
            ? `${plural(questions.length - answered, 'question is', 'questions are')} not answered. You cannot change anything after you submit.`
            : 'You cannot change anything after you submit.'
        }
        confirmLabel="Submit answers"
        confirmVariant="primary"
        onConfirm={submit}
      />
    </>
  );
}

function Finished({ view }: { view: TakeView }) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardBody className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:px-10">
        <span className="flex size-14 items-center justify-center rounded-full bg-tone-green-bg">
          <CheckCircle2 className="size-7 text-tone-green-fg" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-fg">Your answers are in</h1>
          <p className="mt-1 text-base text-fg-muted">
            {view.name} for {view.jobTitle}
            {view.submittedAt ? `, sent ${when(view.submittedAt)}` : ''}.
          </p>
        </div>
        {view.autoSubmitted && (
          <p className="text-sm text-fg-muted">
            Time ran out, so we sent everything you had saved.
          </p>
        )}
        <div className="w-full rounded-lg bg-muted p-4 text-left">
          <p className="text-sm font-semibold text-fg">What happens next</p>
          <p className="mt-1 text-sm text-fg-muted">
            The hiring team reads your answers, usually within a few days. You will hear from them
            by email and here in the portal.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link href={`/candidate-portal/applications/${view.applicationId}`}>
              Back to your application
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/candidate-portal/home">Go to Home</Link>
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Closed({ view }: { view: TakeView }) {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={AlertTriangle}
        title="This assessment is closed"
        description={
          view.status === 'Revoked'
            ? 'The hiring team took this link back. If you think that is a mistake, write to them.'
            : `The link closed on ${when(view.expiresAt)}. If you still want to take it, write to the hiring team.`
        }
        action={
          <Button asChild variant="secondary">
            <Link href={`/candidate-portal/messages/${view.applicationId}`}>Write to the team</Link>
          </Button>
        }
      />
    </Card>
  );
}

function External({ view, onChange }: { view: TakeView; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const provider = view.providerName ?? 'the provider';
  async function open() {
    setBusy(true);
    // Open the tab during the click, so the browser does not block it, then send it on.
    const tab = window.open('', '_blank');
    try {
      const response = await fetch(`/public/assessments/${view.id}/open`, {
        method: 'POST',
        headers: PORTAL_HEADERS,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.url)
        throw new Error(data?.message ?? 'We could not open the test. Please try again.');
      if (tab) {
        tab.opener = null;
        tab.location.href = data.url;
      } else window.location.href = data.url;
      onChange();
    } catch (error) {
      tab?.close();
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        breadcrumbs={[HOME]}
        title={view.name}
        description={`${view.jobTitle}${view.company ? ` at ${view.company}` : ''}`}
      />
      <Card>
        <CardBody className="flex flex-col gap-5 py-6 sm:px-8">
          <p className="text-base text-fg">
            This test runs on {provider}&apos;s website. Finish it there by {when(view.expiresAt)}.
          </p>
          {view.instructions.trim() && (
            <RichText markdown={view.instructions} className="text-base text-fg-muted" />
          )}
          {view.status === 'InProgress' && (
            <Alert tone="info">
              You opened the test{view.startedAt ? ` on ${when(view.startedAt)}` : ''}. When you
              finish on {provider}&apos;s website, the team gets your result. There is nothing else
              to do here.
            </Alert>
          )}
          <div className="flex justify-end border-t border-border-subtle pt-5">
            <Button rightIcon={<ExternalLink />} loading={busy} onClick={open}>
              {view.status === 'InProgress'
                ? 'Open the test again'
                : `Open the test on ${provider}`}
            </Button>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CopyButton,
  EmptyState,
  IconButton,
  Input,
  NumberInput,
  PageHeader,
  RadioGroup,
  SearchInput,
  SearchSelect,
  SegmentedControl,
  Select,
  SkeletonRows,
  Switch,
  Textarea,
  Wizard,
  toast,
} from '@/components/ui';
import { AvailabilityGrid, type GridPerson } from '@/components/scheduling/AvailabilityGrid';
import {
  dayKey,
  dayLabel,
  timeLabel,
  zonedInstant,
  zoneLongName,
  zoneOptions,
  type Slot,
} from '@/components/scheduling/time';
import { useDebouncedValue } from '@/lib/hooks';
import type { ApplicationDetailResponse, CandidateListPage } from '@/types';
import { InterviewerPicker } from './InterviewerPicker';
import { PoolSuggestion } from './PoolSuggestion';
import { interviewHref, useInBrowser, usePeople, type InterviewRecordData } from './interview-api';
import { browserZone } from './interview-state';

type Round = {
  key: string;
  kitId: string | null;
  title: string;
  durationMinutes: number;
  interviewers: string[];
};

type Suggestions = {
  people: GridPerson[];
  slots: Record<string, string[]>;
  suggestions: { sessions: { key: string; startsAt: string; endsAt: string }[]; load: number }[];
  checkedCalendars: string[];
  missingConnections: string[];
  capped: boolean;
};

type Email = { to: string; subject: string; body: string; toCandidate: boolean };

const MEETING_TYPES = [
  {
    value: 'GoogleMeet',
    label: 'Google Meet',
    description: 'A Meet room is made with the calendar invite.',
  },
  {
    value: 'Teams',
    label: 'Microsoft Teams',
    description: 'A Teams meeting is made with the calendar invite.',
  },
  {
    value: 'Link',
    label: 'Another video link',
    description: 'Paste a Zoom or other link everyone uses.',
  },
  {
    value: 'Phone',
    label: 'Phone call',
    description: 'Add the number to call, or leave it empty if you will call them.',
  },
  { value: 'InPerson', label: 'In person', description: 'Add the address.' },
];

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 180, 240].map((minutes) => ({
  value: String(minutes),
  label:
    minutes < 60
      ? `${minutes} minutes`
      : `${minutes / 60} ${minutes === 60 ? 'hour' : 'hours'}`
          .replace('1.25 hours', '1 hour 15 minutes')
          .replace('1.5 hours', '1 hour 30 minutes'),
}));

const addDays = (key: string, days: number) => {
  const date = new Date(`${key}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const newKey = () => Math.random().toString(36).slice(2, 9);

/**
 * The one scheduler: pick the rounds and their panels, find a time on everyone's calendars (or let
 * the candidate choose with a link), say how you will meet, then check what each person receives.
 * With `interview`, it moves or edits that interview instead.
 */
export function ScheduleInterview({
  applicationId: initialApplication,
  kitId,
  interviewId,
  date,
}: {
  applicationId?: string;
  kitId?: string;
  interviewId?: string;
  date?: string;
}) {
  const router = useRouter();
  const inBrowser = useInBrowser();
  const [applicationId, setApplicationId] = useState<string | null>(initialApplication ?? null);
  const existing = useQuery({
    queryKey: ['interview', interviewId],
    queryFn: () => api.get<InterviewRecordData>(`/api/interviews/${interviewId}`),
    enabled: Boolean(interviewId),
  });
  const appId = existing.data?.interview.applicationId ?? applicationId;
  const application = useQuery({
    queryKey: ['application', appId],
    queryFn: () => api.get<ApplicationDetailResponse>(`/api/applications/${appId}`),
    enabled: Boolean(appId),
  });

  if (!inBrowser || (interviewId && !existing.data) || (appId && !application.data))
    return (
      <>
        <PageHeader
          breadcrumbs={[{ label: 'Interviews', href: '/interviews' }, { label: 'Schedule' }]}
          title="Schedule interview"
        />
        {existing.isError || application.isError ? (
          <Alert tone="danger" title="We could not load this">
            {(existing.error ?? application.error)?.message}
          </Alert>
        ) : (
          <Card>
            <SkeletonRows rows={6} />
          </Card>
        )}
      </>
    );

  return (
    <SchedulerSteps
      key={appId ?? 'none'}
      application={application.data ?? null}
      existing={existing.data ?? null}
      kitId={kitId}
      date={date}
      onPickApplication={setApplicationId}
      onDone={(href) => router.push(href)}
    />
  );
}

function SchedulerSteps({
  application,
  existing,
  kitId,
  date,
  onPickApplication,
  onDone,
}: {
  application: ApplicationDetailResponse | null;
  existing: InterviewRecordData | null;
  kitId?: string;
  date?: string;
  onPickApplication: (id: string | null) => void;
  onDone: (href: string) => void;
}) {
  const app = application?.application;
  const kits = useMemo(() => app?.interviewKits ?? [], [app]);
  const editing = existing?.interview;
  const [zone, setZone] = useState(() => browserZone());
  const [rounds, setRounds] = useState<Round[]>(() => {
    if (editing)
      return [
        {
          key: 'r0',
          kitId: editing.interviewKitId ?? null,
          title: editing.title,
          durationMinutes: Math.round(
            (new Date(editing.endsAt).getTime() - new Date(editing.startsAt).getTime()) / 60_000,
          ),
          interviewers: editing.interviewerEmails,
        },
      ];
    // The round asked for, else the kit for the application's current stage, else the only kit.
    const kit =
      kits.find((item) => item.id === kitId) ??
      kits.find(
        (item) => (item as { pipelineStageId?: string | null }).pipelineStageId === app?.stageId,
      ) ??
      (kits.length === 1 ? kits[0] : undefined);
    return kit
      ? [
          {
            key: newKey(),
            kitId: kit.id,
            title: kit.name,
            durationMinutes: kit.durationMinutes,
            interviewers: [],
          },
        ]
      : [];
  });
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [mode, setMode] = useState<'book' | 'link'>('book');
  const [linkMode, setLinkMode] = useState<'offer' | 'window'>('offer');
  const today = dayKey(new Date(), zone);
  const [windowStart, setWindowStart] = useState(() => (date && date >= today ? date : today));
  const [day, setDay] = useState<string | null>(
    date ?? (editing ? dayKey(editing.startsAt, zone) : null),
  );
  const [start, setStart] = useState<string | null>(editing?.startsAt ?? null);
  const [offered, setOffered] = useState<string[]>([]);
  const [linkFrom, setLinkFrom] = useState(today);
  const [linkTo, setLinkTo] = useState(addDays(today, 10));
  const [noticeHours, setNoticeHours] = useState<number | ''>(24);
  const [expiresDays, setExpiresDays] = useState<number | ''>(7);
  const [meetingType, setMeetingType] = useState<string>(
    editing?.meetingType ?? (editing?.meetingLink ? 'Link' : 'GoogleMeet'),
  );
  const [meetingLink, setMeetingLink] = useState(
    editing?.meetingType === 'Link' || !editing?.meetingType ? (editing?.meetingLink ?? '') : '',
  );
  const [location, setLocation] = useState(editing?.location ?? '');
  const [message, setMessage] = useState('');
  const [notifyCandidate, setNotifyCandidate] = useState(true);
  const [notifyInterviewers, setNotifyInterviewers] = useState(true);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<{ url: string } | null>(null);

  // The sessions back to back from the chosen start.
  const sessions = useMemo(() => {
    if (!start) return [];
    let at = new Date(start).getTime();
    return rounds.map((round, index) => {
      const startsAt = new Date(at).toISOString();
      const endsAt = new Date(at + round.durationMinutes * 60_000).toISOString();
      at += (round.durationMinutes + (index < rounds.length - 1 ? breakMinutes : 0)) * 60_000;
      return { ...round, startsAt, endsAt };
    });
  }, [start, rounds, breakMinutes]);

  const ready =
    rounds.length > 0 &&
    rounds.every((round) => round.title.trim() && round.interviewers.length > 0);
  const from = zonedInstant(windowStart, '00:00', zone);
  const to = zonedInstant(addDays(windowStart, 14), '00:00', zone);
  const suggestions = useQuery({
    queryKey: [
      'scheduling-suggestions',
      rounds.map((r) => [r.key, r.durationMinutes, r.interviewers.join()]),
      breakMinutes,
      from.toISOString(),
      zone,
      editing?.id,
    ],
    queryFn: () =>
      api.post<Suggestions>('/api/scheduling/suggestions', {
        rounds: rounds.map((round) => ({
          key: round.key,
          interviewerEmails: round.interviewers,
          durationMinutes: round.durationMinutes,
        })),
        from: from.toISOString(),
        to: to.toISOString(),
        timeZone: zone,
        breakMinutes,
        ignoreInterviewId: editing?.id ?? null,
      }),
    enabled: ready && step >= (editing ? 0 : 1),
    staleTime: 60_000,
  });

  // Starts where the whole loop fits: each round open at its turn.
  const loopStarts = useMemo(() => {
    const data = suggestions.data;
    if (!data || rounds.length === 0) return new Set<string>();
    const sets = rounds.map(
      (round) => new Set((data.slots[round.key] ?? []).map((x) => new Date(x).getTime())),
    );
    const result = new Set<string>();
    for (const first of data.slots[rounds[0].key] ?? []) {
      let at = new Date(first).getTime();
      let ok = true;
      for (let i = 0; i < rounds.length; i++) {
        if (!sets[i].has(at)) {
          ok = false;
          break;
        }
        at += (rounds[i].durationMinutes + breakMinutes) * 60_000;
      }
      if (ok) result.add(new Date(first).toISOString());
    }
    return result;
  }, [suggestions.data, rounds, breakMinutes]);
  const isOpen = (iso: string) => loopStarts.has(new Date(iso).toISOString());

  const payloadMeeting = {
    meetingType,
    meetingLink: meetingType === 'Link' ? meetingLink.trim() || null : null,
    location:
      meetingType === 'Phone' || meetingType === 'InPerson' ? location.trim() || null : null,
  };
  const scheduleBody = (preview: boolean) => ({
    sessions: sessions.map((session) => ({
      title: session.title.trim(),
      interviewKitId: session.kitId,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      interviewerEmails: session.interviewers,
    })),
    timeZone: zone,
    ...payloadMeeting,
    messageToCandidate: message.trim() || null,
    notifyCandidate,
    notifyInterviewers,
    preview,
  });
  const linkBody = (preview: boolean) => ({
    title: rounds[0]?.title.trim(),
    interviewKitId: rounds[0]?.kitId,
    durationMinutes: rounds[0]?.durationMinutes,
    interviewerEmails: rounds[0]?.interviewers,
    timeZone: zone,
    offeredStarts: linkMode === 'offer' ? offered : null,
    windowStart: linkMode === 'window' ? zonedInstant(linkFrom, '00:00', zone).toISOString() : null,
    windowEnd:
      linkMode === 'window' ? zonedInstant(addDays(linkTo, 1), '00:00', zone).toISOString() : null,
    minimumNoticeHours: Number(noticeHours) || 0,
    expiresInDays: Number(expiresDays) || 7,
    ...payloadMeeting,
    messageToCandidate: message.trim() || null,
    notifyCandidate,
    preview,
  });

  const reviewStep = editing ? 2 : 3;
  const preview = useQuery({
    queryKey: [
      'scheduling-preview',
      step === reviewStep && JSON.stringify(mode === 'book' ? scheduleBody(true) : linkBody(true)),
    ],
    queryFn: () =>
      mode === 'book'
        ? api.post<{ emails: Email[] }>(
            `/api/applications/${app!.id}/interviews/schedule`,
            scheduleBody(true),
          )
        : api.post<{ emails: Email[] }>(
            `/api/applications/${app!.id}/scheduling-requests`,
            linkBody(true),
          ),
    enabled: !editing && step === reviewStep && Boolean(app),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editing)
        return api.patch(`/api/interviews/${editing.id}`, {
          title: rounds[0].title.trim(),
          interviewKitId: rounds[0].kitId,
          startsAt: sessions[0].startsAt,
          endsAt: sessions[0].endsAt,
          timeZone: zone,
          interviewerEmails: rounds[0].interviewers,
          status: editing.status === 'Proposed' ? 'Scheduled' : editing.status,
          reason: reason.trim() || null,
          notify: notifyCandidate,
          ...payloadMeeting,
          meetingLink: meetingType === 'Link' ? meetingLink.trim() || null : null,
        });
      if (mode === 'book')
        return api.post<{ id: string }>(
          `/api/applications/${app!.id}/interviews/schedule`,
          scheduleBody(false),
        );
      return api.post<{ id: string; url: string }>(
        `/api/applications/${app!.id}/scheduling-requests`,
        linkBody(false),
      );
    },
    onSuccess: (data) => {
      if (editing) {
        toast.success('Interview updated');
        onDone(interviewHref(editing.id));
      } else if (mode === 'book') {
        toast.success(rounds.length > 1 ? 'Interviews scheduled' : 'Interview scheduled');
        onDone(interviewHref((data as { id: string }).id));
      } else {
        const url = (data as { url: string }).url;
        setResult({ url: url.startsWith('/') ? `${window.location.origin}${url}` : url });
      }
    },
    onError: (error: Error) => toast.error('Could not save', error.message),
  });

  const timeValid =
    mode === 'book'
      ? Boolean(start)
      : linkMode === 'offer'
        ? offered.length > 0 && offered.length <= 5
        : linkFrom >= today && linkTo >= linkFrom && Number(expiresDays) >= 1;
  const meetingValid =
    (meetingType !== 'Link' || /^https?:\/\/\S+$/.test(meetingLink.trim())) &&
    (meetingType !== 'InPerson' || location.trim().length > 0);

  const steps = [
    ...(editing
      ? []
      : [
          {
            id: 'who',
            title: 'Rounds and panel',
            description: 'Who meets the candidate',
            valid: Boolean(app) && ready,
          },
        ]),
    {
      id: 'when',
      title: mode === 'link' ? 'Times to offer' : 'Time',
      description: 'Everyone’s calendars and hours',
      valid: timeValid,
    },
    {
      id: 'how',
      title: 'How you meet',
      description: 'Video, phone or in person',
      valid: meetingValid,
    },
    { id: 'review', title: 'Review', description: 'What each person gets' },
  ];
  const current = steps[step]?.id;

  if (result)
    return (
      <>
        <Header app={app} editing={!!editing} />
        <Card className="mx-auto max-w-2xl">
          <CardBody className="space-y-4 py-8 text-center">
            <Link2 className="mx-auto size-8 text-tone-blue-dot" aria-hidden />
            <h2 className="text-xl font-semibold text-fg">Scheduling link ready</h2>
            <p className="text-base text-fg-muted">
              {notifyCandidate
                ? `We emailed it to ${app?.candidateName}. You can also send it yourself.`
                : `Send it to ${app?.candidateName}. Nothing was emailed.`}{' '}
              We tell you when they book.
            </p>
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted px-3 py-2 text-left">
              <span className="min-w-0 flex-1 truncate text-sm text-fg">{result.url}</span>
              <CopyButton value={result.url} label="Copy link" />
            </div>
            <Button asChild variant="secondary">
              <Link href={`/applications/${app?.id}/interviews`}>Back to the application</Link>
            </Button>
          </CardBody>
        </Card>
      </>
    );

  return (
    <>
      <Header app={app} editing={!!editing} title={editing?.title} />
      <Wizard
        steps={steps}
        current={step}
        onStepChange={setStep}
        onFinish={() => save.mutate()}
        busy={save.isPending}
        finishLabel={
          editing
            ? 'Save changes'
            : mode === 'link'
              ? notifyCandidate
                ? 'Send scheduling link'
                : 'Create scheduling link'
              : rounds.length > 1
                ? `Schedule ${rounds.length} interviews`
                : 'Schedule interview'
        }
      >
        {current === 'who' && (
          <WhoStep
            app={app}
            kits={kits}
            rounds={rounds}
            setRounds={(next) => {
              setRounds(next);
              setStart(null);
              setOffered([]);
              if (next.length > 1) setMode('book');
            }}
            breakMinutes={breakMinutes}
            setBreakMinutes={setBreakMinutes}
            onPickApplication={onPickApplication}
            from={from.toISOString()}
            to={to.toISOString()}
          />
        )}
        {current === 'when' && (
          <div className="space-y-5">
            {!editing && (
              <SegmentedControl
                aria-label="How to book"
                value={mode}
                onValueChange={(value) => setMode(value as 'book' | 'link')}
                items={[
                  { value: 'book', label: 'Book a time now' },
                  ...(rounds.length === 1
                    ? [{ value: 'link', label: 'Let the candidate choose' }]
                    : []),
                ]}
              />
            )}
            {rounds.length > 1 && (
              <p className="text-sm text-fg-subtle">
                A loop of {rounds.length} interviews is booked back to back on one day. To let the
                candidate pick, schedule one round at a time.
              </p>
            )}
            {mode === 'link' && (
              <RadioGroup
                aria-label="What the candidate can pick"
                orientation="horizontal"
                value={linkMode}
                onValueChange={(value) => setLinkMode(value as 'offer' | 'window')}
                options={[
                  { value: 'offer', label: 'Times I pick (up to 5)' },
                  { value: 'window', label: 'Any open time between two dates' },
                ]}
              />
            )}
            {mode === 'link' && linkMode === 'window' ? (
              <WindowFields
                from={linkFrom}
                to={linkTo}
                today={today}
                setFrom={setLinkFrom}
                setTo={setLinkTo}
                noticeHours={noticeHours}
                setNoticeHours={setNoticeHours}
                expiresDays={expiresDays}
                setExpiresDays={setExpiresDays}
              />
            ) : (
              <TimeFinder
                data={suggestions.data}
                loading={suggestions.isFetching && !suggestions.data}
                error={suggestions.error as Error | null}
                rounds={rounds}
                zone={zone}
                setZone={setZone}
                windowStart={windowStart}
                setWindowStart={setWindowStart}
                today={today}
                day={day}
                setDay={setDay}
                isOpen={isOpen}
                sessions={
                  mode === 'book'
                    ? sessions
                    : offered.map((at) => ({
                        ...rounds[0],
                        startsAt: at,
                        endsAt: new Date(
                          new Date(at).getTime() + rounds[0].durationMinutes * 60_000,
                        ).toISOString(),
                      }))
                }
                multi={mode === 'link'}
                onPick={(iso) => {
                  if (mode === 'book') setStart(iso);
                  else
                    setOffered((list) =>
                      list.includes(iso)
                        ? list.filter((x) => x !== iso)
                        : list.length >= 5
                          ? list
                          : [...list, iso].sort(),
                    );
                }}
                breakMinutes={breakMinutes}
              />
            )}
            {mode === 'link' && linkMode === 'offer' && (
              <OfferedList
                offered={offered}
                zone={zone}
                onRemove={(iso) => setOffered((list) => list.filter((x) => x !== iso))}
              />
            )}
            {mode === 'link' && linkMode === 'offer' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberInput
                  label="Link works for (days)"
                  min={1}
                  max={30}
                  value={expiresDays}
                  onValueChange={setExpiresDays}
                />
              </div>
            )}
          </div>
        )}
        {current === 'how' && (
          <div className="space-y-5">
            <RadioGroup
              aria-label="How you meet"
              value={meetingType}
              onValueChange={setMeetingType}
              options={MEETING_TYPES}
            />
            <MeetingWarning type={meetingType} people={suggestions.data?.people} />
            {meetingType === 'Link' && (
              <Input
                label="Meeting link"
                placeholder="https://"
                value={meetingLink}
                error={
                  meetingLink && !/^https?:\/\/\S+$/.test(meetingLink.trim())
                    ? 'Paste the whole link. It starts with https://.'
                    : undefined
                }
                onChange={(event) => setMeetingLink(event.currentTarget.value)}
              />
            )}
            {(meetingType === 'Phone' || meetingType === 'InPerson') && (
              <Input
                label={meetingType === 'Phone' ? 'Number to call (optional)' : 'Address'}
                value={location}
                maxLength={300}
                onChange={(event) => setLocation(event.currentTarget.value)}
              />
            )}
            {!editing && (
              <Textarea
                label="Message to the candidate (optional)"
                description="Added to their email. For example, who they will meet or what to prepare."
                minRows={3}
                maxLength={2000}
                value={message}
                onChange={(event) => setMessage(event.currentTarget.value)}
              />
            )}
            <div className="space-y-3">
              <Switch
                checked={notifyCandidate}
                onCheckedChange={setNotifyCandidate}
                label={
                  editing
                    ? 'Email everyone about the change'
                    : mode === 'link'
                      ? 'Email the link to the candidate'
                      : 'Email the candidate'
                }
              />
              {!editing && mode === 'book' && (
                <Switch
                  checked={notifyInterviewers}
                  onCheckedChange={setNotifyInterviewers}
                  label="Email the interviewers"
                />
              )}
            </div>
          </div>
        )}
        {current === 'review' && (
          <Review
            editing={!!editing}
            mode={mode}
            linkMode={linkMode}
            sessions={sessions}
            offered={offered}
            linkFrom={linkFrom}
            linkTo={linkTo}
            zone={zone}
            emails={preview.data?.emails}
            loading={preview.isFetching}
            error={preview.error as Error | null}
            reason={reason}
            setReason={setReason}
            moved={!!editing && sessions[0]?.startsAt !== new Date(editing.startsAt).toISOString()}
            notify={notifyCandidate}
          />
        )}
      </Wizard>
    </>
  );
}

function Header({
  app,
  editing,
  title,
}: {
  app?: ApplicationDetailResponse['application'];
  editing: boolean;
  title?: string;
}) {
  return (
    <PageHeader
      breadcrumbs={[
        { label: 'Interviews', href: '/interviews' },
        ...(app ? [{ label: app.candidateName, href: `/applications/${app.id}/interviews` }] : []),
        { label: editing ? 'Reschedule' : 'Schedule' },
      ]}
      title={editing ? `Reschedule ${title ?? 'interview'}` : 'Schedule interview'}
    />
  );
}

function CandidatePicker({ onPick }: { onPick: (applicationId: string) => void }) {
  const [text, setText] = useState('');
  const search = useDebouncedValue(text.trim(), 300);
  const query = useQuery({
    queryKey: ['schedule-candidates', search],
    queryFn: () =>
      api.get<CandidateListPage>(
        `/api/candidates?page=1&pageSize=20&status=Active${search ? `&search=${encodeURIComponent(search)}` : '&sort=name'}`,
      ),
  });
  const options = (query.data?.items ?? []).flatMap((person) =>
    person.applications
      .filter((application) => application.status === 'Active')
      .map((application) => ({
        id: application.id,
        name: person.name,
        job: application.requisitionTitle,
        stage: application.stage,
      })),
  );
  return (
    <div className="space-y-3">
      <SearchInput
        aria-label="Find a candidate"
        placeholder="Find a candidate by name or email"
        value={text}
        onValueChange={setText}
      />
      {query.isLoading ? (
        <SkeletonRows rows={3} />
      ) : options.length === 0 ? (
        <p className="text-sm text-fg-subtle">
          No active candidates match. Check the spelling, or search by email.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onPick(option.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-medium text-fg">
                    {option.name}
                  </span>
                  <span className="block truncate text-sm text-fg-muted">{option.job}</span>
                </span>
                <Badge size="sm">{option.stage}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function WhoStep({
  app,
  kits,
  rounds,
  setRounds,
  breakMinutes,
  setBreakMinutes,
  onPickApplication,
  from,
  to,
}: {
  app?: ApplicationDetailResponse['application'];
  kits: ApplicationDetailResponse['application']['interviewKits'];
  rounds: Round[];
  setRounds: (rounds: Round[]) => void;
  breakMinutes: number;
  setBreakMinutes: (value: number) => void;
  onPickApplication: (id: string | null) => void;
  /** The two weeks the time step looks at, so pool suggestions are about the same days. */
  from: string;
  to: string;
}) {
  // Two rounds' pool suggestions can arrive in one render: each change builds on the last.
  const latest = useRef(rounds);
  latest.current = rounds;
  if (!app) return <CandidatePicker onPick={onPickApplication} />;
  const chosen = new Set(rounds.map((round) => round.kitId));
  const update = (key: string, change: Partial<Round>) => {
    const next = latest.current.map((round) =>
      round.key === key ? { ...round, ...change } : round,
    );
    latest.current = next;
    setRounds(next);
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted px-4 py-3">
        <p className="text-base text-fg">
          <span className="font-semibold">{app.candidateName}</span>{' '}
          <span className="text-fg-muted">for {app.requisitionTitle}</span>
        </p>
        <Button size="sm" variant="quiet" onClick={() => onPickApplication(null)}>
          Change candidate
        </Button>
      </div>

      {kits.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">Rounds from the job’s plan</h3>
          <p className="text-sm text-fg-subtle">
            Pick one, or several to book back to back on one day.
          </p>
          <div className="flex flex-wrap gap-2">
            {kits.map((kit) => {
              const on = chosen.has(kit.id);
              return (
                <Button
                  key={kit.id}
                  size="sm"
                  variant={on ? 'soft' : 'secondary'}
                  aria-pressed={on}
                  leftIcon={on ? <CalendarCheck /> : <Plus />}
                  onClick={() =>
                    setRounds(
                      on
                        ? rounds.filter((round) => round.kitId !== kit.id)
                        : [
                            ...rounds,
                            {
                              key: newKey(),
                              kitId: kit.id,
                              title: kit.name,
                              durationMinutes: kit.durationMinutes,
                              interviewers: [],
                            },
                          ],
                    )
                  }
                >
                  {kit.name} · {kit.durationMinutes} min
                </Button>
              );
            })}
          </div>
        </section>
      )}

      {rounds.length === 0 && (
        <EmptyState
          compact
          icon={CalendarCheck}
          title="No round chosen yet"
          description={
            kits.length
              ? 'Pick a round above, or add one without a kit.'
              : 'This job has no interview plan. Add a round to schedule.'
          }
        />
      )}

      <ol className="space-y-4">
        {rounds.map((round, index) => (
          <li key={round.key} className="rounded-xl border border-border-subtle p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-fg">
                {rounds.length > 1 && <span className="text-fg-subtle tnum">{index + 1}. </span>}
                {round.kitId ? round.title : 'Round without a kit'}
              </p>
              <IconButton
                size="sm"
                variant="quiet"
                label={`Remove ${round.title || 'this round'}`}
                onClick={() => setRounds(rounds.filter((item) => item.key !== round.key))}
              >
                <X />
              </IconButton>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
              <Input
                label="Interview name"
                value={round.title}
                maxLength={200}
                onChange={(event) => update(round.key, { title: event.currentTarget.value })}
              />
              <Select
                label="Length"
                value={String(round.durationMinutes)}
                onChange={(value) => value && update(round.key, { durationMinutes: Number(value) })}
                data={
                  DURATIONS.some((x) => x.value === String(round.durationMinutes))
                    ? DURATIONS
                    : [
                        ...DURATIONS,
                        {
                          value: String(round.durationMinutes),
                          label: `${round.durationMinutes} minutes`,
                        },
                      ]
                }
              />
            </div>
            <div className="mt-4">
              <InterviewerPicker
                value={round.interviewers}
                onChange={(emails) => update(round.key, { interviewers: emails })}
              />
              {round.kitId && (
                <PoolSuggestion
                  kitId={round.kitId}
                  from={from}
                  to={to}
                  durationMinutes={round.durationMinutes}
                  value={round.interviewers}
                  onChange={(emails) => update(round.key, { interviewers: emails })}
                />
              )}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus />}
          onClick={() =>
            setRounds([
              ...rounds,
              {
                key: newKey(),
                kitId: null,
                title: 'Interview',
                durationMinutes: 30,
                interviewers: [],
              },
            ])
          }
        >
          Add a round without a kit
        </Button>
        {rounds.length > 1 && (
          <Select
            label="Break between interviews"
            className="w-56"
            value={String(breakMinutes)}
            onChange={(value) => setBreakMinutes(Number(value ?? 0))}
            data={[0, 15, 30, 45, 60].map((minutes) => ({
              value: String(minutes),
              label: minutes ? `${minutes} minutes` : 'No break',
            }))}
          />
        )}
      </div>
    </div>
  );
}

function TimeFinder({
  data,
  loading,
  error,
  rounds,
  zone,
  setZone,
  windowStart,
  setWindowStart,
  today,
  day,
  setDay,
  isOpen,
  sessions,
  multi,
  onPick,
  breakMinutes,
}: {
  data?: Suggestions;
  loading: boolean;
  error: Error | null;
  rounds: Round[];
  zone: string;
  setZone: (zone: string) => void;
  windowStart: string;
  setWindowStart: (key: string) => void;
  today: string;
  day: string | null;
  setDay: (key: string) => void;
  isOpen: (iso: string) => boolean;
  sessions: (Round & Slot)[];
  multi: boolean;
  onPick: (iso: string) => void;
  breakMinutes: number;
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(windowStart, i));
  const openDays = new Set(
    (data?.slots[rounds[0]?.key ?? ''] ?? []).filter(isOpen).map((x) => dayKey(x, zone)),
  );
  const shown = day && days.includes(day) ? day : (days.find((d) => openDays.has(d)) ?? days[0]);
  const [manual, setManual] = useState('');
  useEffect(() => setManual(''), [shown]);
  const total =
    rounds.reduce((sum, round) => sum + round.durationMinutes, 0) +
    breakMinutes * (rounds.length - 1);
  // The open bands for the whole loop: each valid start covers [start, start + whole loop).
  const open = useMemo(() => {
    const starts = (data?.slots[rounds[0]?.key ?? ''] ?? [])
      .filter(isOpen)
      .map((x) => new Date(x).getTime())
      .sort((a, b) => a - b);
    const bands: Slot[] = [];
    for (const at of starts) {
      const last = bands.at(-1);
      const end = at + total * 60_000;
      if (last && new Date(last.endsAt).getTime() >= at)
        last.endsAt = new Date(Math.max(end, new Date(last.endsAt).getTime())).toISOString();
      else
        bands.push({ startsAt: new Date(at).toISOString(), endsAt: new Date(end).toISOString() });
    }
    return bands;
  }, [data, rounds, isOpen, total]);
  const pickMinute = (minute: number) => {
    const wanted = zonedInstant(
      shown,
      `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`,
      zone,
    ).getTime();
    // The nearest open start at or after the click, else the one just before.
    const starts = (data?.slots[rounds[0]?.key ?? ''] ?? [])
      .filter(isOpen)
      .map((x) => new Date(x).getTime());
    const after = starts.filter((x) => x >= wanted).sort((a, b) => a - b)[0];
    const before = starts.filter((x) => x < wanted).sort((a, b) => b - a)[0];
    const at = after ?? before;
    if (at !== undefined) onPick(new Date(at).toISOString());
  };
  const missing = data?.missingConnections ?? [];
  const nameOf = (email: string) => data?.people.find((p) => p.email === email)?.name ?? email;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <SearchSelect
          label="Times shown in"
          className="w-full sm:w-96"
          value={zone}
          onChange={(value) => value && setZone(value)}
          data={zoneOptions()}
        />
      </div>

      {error ? (
        <Alert tone="danger" title="We could not check calendars">
          {error.message}
        </Alert>
      ) : loading || !data ? (
        <SkeletonRows rows={4} />
      ) : (
        <>
          {missing.length > 0 && (
            <Alert
              tone="neutral"
              title={`${data.checkedCalendars.length} of ${data.checkedCalendars.length + missing.length} calendars checked`}
            >
              Times fit everyone’s working hours and MyThorneAI interviews. We cannot see other
              meetings for {missing.map(nameOf).join(', ')}.
            </Alert>
          )}
          <section aria-label="Suggested times" className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
              <Sparkles className="size-4 text-tone-violet-dot" aria-hidden />
              Suggested times
            </h3>
            {data.suggestions.length === 0 ? (
              <p className="text-sm text-fg-muted">
                No time works for everyone in these two weeks. Try later dates, fewer people or a
                shorter interview.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {data.suggestions.map((suggestion, index) => {
                  const first = suggestion.sessions[0];
                  const last = suggestion.sessions.at(-1)!;
                  const on = sessions.some(
                    (s) => new Date(s.startsAt).getTime() === new Date(first.startsAt).getTime(),
                  );
                  return (
                    <button
                      key={first.startsAt}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        onPick(first.startsAt);
                        setDay(dayKey(first.startsAt, zone));
                      }}
                      className={
                        on
                          ? 'rounded-lg border-2 border-primary bg-accent px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                          : 'rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                      }
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-fg">
                          {dayLabel(dayKey(first.startsAt, zone), { month: 'short' })}
                        </span>
                        {index === 0 && (
                          <Badge tone="green" size="sm">
                            Lightest load
                          </Badge>
                        )}
                      </span>
                      <span className="block text-base text-accent-foreground tnum">
                        {timeLabel(first.startsAt, zone)} – {timeLabel(last.endsAt, zone)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section aria-label="Calendars" className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <IconButton
                label="Earlier two weeks"
                size="sm"
                variant="secondary"
                disabled={windowStart <= today}
                onClick={() =>
                  setWindowStart(
                    addDays(windowStart, -14) < today ? today : addDays(windowStart, -14),
                  )
                }
              >
                <ChevronLeft />
              </IconButton>
              <IconButton
                label="Later two weeks"
                size="sm"
                variant="secondary"
                onClick={() => setWindowStart(addDays(windowStart, 14))}
              >
                <ChevronRight />
              </IconButton>
              <div
                className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-hide"
                role="tablist"
                aria-label="Day"
              >
                {days.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={key === shown}
                    onClick={() => setDay(key)}
                    className={
                      key === shown
                        ? 'shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground'
                        : `shrink-0 rounded-md px-2.5 py-1.5 text-xs hover:bg-accent ${openDays.has(key) ? 'font-medium text-fg' : 'text-fg-subtle'}`
                    }
                  >
                    {dayLabel(key, { weekday: 'short', month: 'short' })}
                  </button>
                ))}
              </div>
            </div>
            <AvailabilityGrid
              day={shown}
              timeZone={zone}
              people={data.people}
              open={open}
              sessions={sessions.map((s) => ({
                startsAt: s.startsAt,
                endsAt: s.endsAt,
                label: s.title,
              }))}
              startHour={7}
              endHour={20}
              onPick={pickMinute}
            />
            <div className="flex flex-wrap items-end gap-3">
              <Input
                type="time"
                label="Or type a start time"
                className="w-44"
                step={900}
                value={manual}
                onChange={(event) => setManual(event.currentTarget.value)}
              />
              <Button
                variant="secondary"
                disabled={!manual}
                onClick={() => onPick(zonedInstant(shown, manual, zone).toISOString())}
              >
                {multi ? 'Add this time' : 'Use this time'}
              </Button>
            </div>
            {!multi && sessions.length > 0 && (
              <div className="rounded-lg border border-border-subtle p-3">
                <p className="text-xs text-fg-subtle">Your pick</p>
                <ul className="mt-1 space-y-0.5">
                  {sessions.map((session) => (
                    <li key={session.key} className="text-base text-fg tnum">
                      {dayLabel(dayKey(session.startsAt, zone), { month: 'short' })},{' '}
                      {timeLabel(session.startsAt, zone)} – {timeLabel(session.endsAt, zone)}
                      {rounds.length > 1 && (
                        <span className="text-fg-muted"> · {session.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
                {!isOpen(sessions[0].startsAt) && (
                  <p className="mt-2 text-sm text-tone-amber-fg">
                    Not everyone is free then. Check with the panel before you book it.
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function OfferedList({
  offered,
  zone,
  onRemove,
}: {
  offered: string[];
  zone: string;
  onRemove: (iso: string) => void;
}) {
  if (offered.length === 0)
    return (
      <p className="text-sm text-fg-subtle">
        Pick up to 5 times from the suggestions or the calendar. The candidate chooses one.
      </p>
    );
  return (
    <div>
      <p className="mb-1.5 text-xs text-fg-subtle tnum">{offered.length} of 5 times picked</p>
      <ul className="flex flex-wrap gap-2">
        {offered.map((iso) => (
          <li
            key={iso}
            className="flex items-center gap-1 rounded-md border border-border bg-card py-1 pr-1 pl-2.5 text-sm text-fg tnum"
          >
            {dayLabel(dayKey(iso, zone), { weekday: 'short', month: 'short' })},{' '}
            {timeLabel(iso, zone)}
            <IconButton
              size="sm"
              variant="quiet"
              label="Remove this time"
              onClick={() => onRemove(iso)}
            >
              <Trash2 />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WindowFields({
  from,
  to,
  today,
  setFrom,
  setTo,
  noticeHours,
  setNoticeHours,
  expiresDays,
  setExpiresDays,
}: {
  from: string;
  to: string;
  today: string;
  setFrom: (value: string) => void;
  setTo: (value: string) => void;
  noticeHours: number | '';
  setNoticeHours: (value: number | '') => void;
  expiresDays: number | '';
  setExpiresDays: (value: number | '') => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-subtle">
        The candidate sees every time that suits the whole panel between these dates, kept up to
        date as calendars change.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          type="date"
          label="From"
          min={today}
          value={from}
          onChange={(event) => setFrom(event.currentTarget.value)}
        />
        <Input
          type="date"
          label="To"
          min={from}
          value={to}
          error={to < from ? 'Choose a date on or after the start.' : undefined}
          onChange={(event) => setTo(event.currentTarget.value)}
        />
        <NumberInput
          label="Hours of notice"
          description="How soon they can book"
          min={0}
          max={168}
          value={noticeHours}
          onValueChange={setNoticeHours}
        />
        <NumberInput
          label="Link works for (days)"
          min={1}
          max={30}
          value={expiresDays}
          onValueChange={setExpiresDays}
        />
      </div>
    </div>
  );
}

function MeetingWarning({ type, people }: { type: string; people?: GridPerson[] }) {
  if (!people || (type !== 'GoogleMeet' && type !== 'Teams')) return null;
  const provider = type === 'GoogleMeet' ? 'Google' : 'Microsoft';
  const can = people.some(
    (person) =>
      (person as GridPerson & { calendarProvider?: string }).calendarProvider === provider,
  );
  if (can) return null;
  return (
    <Alert
      tone="warning"
      title={`No one on the panel has ${provider === 'Google' ? 'Google Calendar' : 'Outlook'} connected`}
    >
      The {type === 'Teams' ? 'Teams' : 'Meet'} link is made by the calendar invite, so there may be
      no link unless your workspace calendar makes one. To be sure, choose Another video link and
      paste one.
    </Alert>
  );
}

function Review({
  editing,
  mode,
  linkMode,
  sessions,
  offered,
  linkFrom,
  linkTo,
  zone,
  emails,
  loading,
  error,
  reason,
  setReason,
  moved,
  notify,
}: {
  editing: boolean;
  mode: 'book' | 'link';
  linkMode: 'offer' | 'window';
  sessions: (Round & Slot)[];
  offered: string[];
  linkFrom: string;
  linkTo: string;
  zone: string;
  emails?: Email[];
  loading: boolean;
  error: Error | null;
  reason: string;
  setReason: (value: string) => void;
  moved: boolean;
  notify: boolean;
}) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-muted p-4">
        <p className="text-xs text-fg-subtle">
          {mode === 'link' ? 'The candidate can pick' : editing ? 'New details' : 'You are booking'}
        </p>
        {mode === 'link' ? (
          linkMode === 'offer' ? (
            <ul className="mt-1 space-y-0.5 text-base text-fg tnum">
              {offered.map((iso) => (
                <li key={iso}>
                  {dayLabel(dayKey(iso, zone))}, {timeLabel(iso, zone)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-base text-fg">
              Any open time from {dayLabel(linkFrom)} to {dayLabel(linkTo)}
            </p>
          )
        ) : (
          <ul className="mt-1 space-y-0.5">
            {sessions.map((session) => (
              <li key={session.key} className="text-base text-fg tnum">
                {session.title}: {dayLabel(dayKey(session.startsAt, zone))},{' '}
                {timeLabel(session.startsAt, zone)} – {timeLabel(session.endsAt, zone)}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-fg-subtle">{zoneLongName(zone)}</p>
      </section>

      {editing ? (
        <>
          {moved && (
            <Input
              label="Why is it moving? (optional)"
              description="The panel sees this. The candidate gets the new time only."
              value={reason}
              maxLength={300}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          )}
          <p className="text-sm text-fg-muted">
            {notify
              ? 'Everyone gets an email with the change, in their own time zone.'
              : 'Nobody is emailed. Calendar invites still update.'}
          </p>
        </>
      ) : error ? (
        <Alert tone="danger" title="Something needs fixing">
          {error.message}
        </Alert>
      ) : loading || !emails ? (
        <SkeletonRows rows={4} />
      ) : emails.length === 0 ? (
        <p className="text-sm text-fg-muted">Nobody is emailed.</p>
      ) : (
        <section aria-label="Emails" className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">What each person gets</h3>
          <div className="flex flex-wrap gap-1.5">
            {emails.map((email, index) => (
              <Button
                key={`${email.to}-${index}`}
                size="xs"
                variant={open === index ? 'soft' : 'quiet'}
                aria-pressed={open === index}
                onClick={() => setOpen(index)}
              >
                {email.toCandidate ? 'Candidate' : email.to}
              </Button>
            ))}
          </div>
          {emails[open] && (
            <article className="rounded-lg border border-border bg-card">
              <header className="border-b border-border-subtle px-4 py-2.5">
                <p className="text-xs text-fg-subtle">To {emails[open].to}</p>
                <p className="text-base font-semibold text-fg">{emails[open].subject}</p>
              </header>
              <p className="px-4 py-3 text-sm whitespace-pre-wrap text-fg">{emails[open].body}</p>
            </article>
          )}
        </section>
      )}
    </div>
  );
}

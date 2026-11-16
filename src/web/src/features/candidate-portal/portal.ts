// Candidate portal: types for GET /public/portal, the sign-in helpers, and the plain-words status.
// No imports, so `portal.check.mjs` can run it with node.

export type ThreadMessage = {
  id: string;
  fromCandidate: boolean;
  body: string;
  createdAt: string;
  unread: boolean;
  /** Files sent with the message, by either side. */
  files?: { id: string; fileName: string; length: number }[];
};
export type PortalInterview = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timeZone?: string | null;
  meetingLink?: string | null;
};
export type PortalEmail = {
  id: string;
  subject: string;
  /** Null for emails with a sign-in link or code: only the subject is shown. */
  body: string | null;
  createdAt: string;
};
export type PortalApplication = {
  id: string;
  requisitionId: string;
  jobTitle: string;
  /** False once the job is closed or private: there is no posting to link to. */
  jobListed: boolean;
  /** The stage as candidates see it (its candidate label), never the internal name. */
  stage: string;
  stageType?: 'Applied' | 'Screen' | 'Interview' | 'Offer' | 'Hired' | 'Other';
  status: string;
  appliedAt: string;
  lastActivityAt: string;
  /** False until the person confirms their email for this application. */
  emailConfirmed: boolean;
  canWithdraw: boolean;
  canReschedule: boolean;
  /** When the team sent an offer that is still open; null otherwise. */
  offerSentAt?: string | null;
  /** What the team asked for that has not arrived yet. */
  documentRequests: OpenDocumentRequest[];
  thread: ThreadMessage[];
  interviews: PortalInterview[];
  proposedInterviews: PortalInterview[];
  emails: PortalEmail[];
};
export type Portal = {
  candidate: {
    firstName: string;
    lastName: string;
    email: string;
    timeZone?: string | null;
    phone?: string | null;
    location?: string | null;
    linkedInUrl?: string | null;
  };
  company?: string | null;
  applications: PortalApplication[];
};
export type Slot = { startsAt: string; endsAt: string };

export type DocumentKind = 'Resume' | 'CoverLetter' | 'Portfolio' | 'Other';
export type OpenDocumentRequest = {
  id: string;
  label: string;
  kind: DocumentKind;
  note?: string | null;
  requestedAt: string;
};
export type SentFile = {
  id: string;
  fileName: string;
  kind: DocumentKind;
  length: number;
  uploadedAt: string;
};
/** GET /public/portal/applications/{id}/sent: what the candidate sent with one application. */
export type SentDetails = {
  submittedAt: string;
  email: string;
  profile: {
    firstName: string;
    lastName: string;
    phone?: string | null;
    location?: string | null;
    linkedInUrl?: string | null;
  } | null;
  answersMarkdown: string;
  resume: SentFile | null;
  documents: SentFile[];
  requests: (OpenDocumentRequest & { fulfilledAt?: string | null })[];
};

export const DOCUMENT_KINDS: { value: DocumentKind; label: string }[] = [
  { value: 'CoverLetter', label: 'Cover letter' },
  { value: 'Portfolio', label: 'Portfolio or work sample' },
  { value: 'Resume', label: 'Updated resume' },
  { value: 'Other', label: 'Something else' },
];

export const documentHref = (id: string) => `/public/portal/documents/${id}`;

/** "240 KB", "1.2 MB". */
export function fileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The session lives in an HttpOnly cookie the server sets; scripts never see it. Changes must carry
 * this header, which other sites cannot add, so they cannot act for the candidate.
 */
export const PORTAL_HEADERS = { 'X-Candidate-Portal': '1' } as const;

/** A portal page to return to after signing in. Anything else (another site, a trick path) is ignored. */
export function safeNext(path: string | null | undefined) {
  return path &&
    path.length <= 200 &&
    path.startsWith('/candidate-portal/') &&
    !path.includes('//') &&
    !path.includes('\\')
    ? path
    : null;
}

type Phase = 'review' | 'interview' | 'decision' | 'other';
function phaseOf(stage: string, type?: string): Phase {
  // The stage type decides; the label heuristic only covers old payloads without a type.
  if (type === 'Applied' || type === 'Screen') return 'review';
  if (type === 'Interview') return 'interview';
  if (type === 'Offer' || type === 'Hired') return 'decision';
  if (type === 'Other') return 'other';
  const s = stage.toLowerCase();
  if (s === 'new' || s.includes('review') || s.includes('screen')) return 'review';
  if (s.includes('interview') || s.includes('booked')) return 'interview';
  if (s.includes('offer') || s.includes('decision')) return 'decision';
  return 'other';
}

// Plain words for the candidate, instead of the team's internal stage name.
export function whatHappensNext(application: {
  status: string;
  stage: string;
  stageType?: string;
}) {
  switch (application.status) {
    case 'Hired':
      return 'You got the job';
    case 'Rejected':
      return 'This application is closed';
    case 'Withdrawn':
      return 'You withdrew this application';
  }
  switch (phaseOf(application.stage, application.stageType)) {
    case 'review':
      return "We're reviewing your application";
    case 'interview':
      return 'Interviews are in progress';
    case 'decision':
      return "We're making a decision";
    default:
      return `Current step: ${application.stage}`;
  }
}

export type StatusStep = {
  id: string;
  title: string;
  state: 'done' | 'current' | 'todo' | 'final';
  /** Final step tone: green for accepted, grey for closed or withdrawn. */
  positive?: boolean;
};

const STEPS = [
  { id: 'applied', title: 'Application received' },
  { id: 'review', title: 'Review' },
  { id: 'interview', title: 'Interviews' },
  { id: 'decision', title: 'Decision' },
];

/**
 * The application's journey for the status timeline. Active: steps up to now are done, the
 * current one is marked, later ones are still to come. Closed: the steps reached, then the outcome.
 */
export function statusSteps(application: {
  status: string;
  stage: string;
  stageType?: string;
}): StatusStep[] {
  const phase = phaseOf(application.stage, application.stageType);
  const at = phase === 'interview' ? 2 : phase === 'decision' ? 3 : 1;
  if (application.status === 'Hired')
    return [
      ...STEPS.map((s) => ({ ...s, state: 'done' as const })),
      { id: 'outcome', title: whatHappensNext(application), state: 'final', positive: true },
    ];
  if (application.status === 'Rejected' || application.status === 'Withdrawn')
    return [
      ...STEPS.slice(0, at + 1).map((s) => ({ ...s, state: 'done' as const })),
      { id: 'outcome', title: whatHappensNext(application), state: 'final', positive: false },
    ];
  return STEPS.map((s, i) => ({
    ...s,
    title: i === at && phase === 'other' ? `Current step: ${application.stage}` : s.title,
    state: i < at ? 'done' : i === at ? 'current' : 'todo',
  }));
}

/** "Sun, Nov 15, 10:00 AM CST": in the reader's own time zone, with the zone named. */
export const when = (value: string, zone?: string) =>
  new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone: zone,
  });
/** "10:00 – 10:45 AM CST" for a start and end on the same day. */
export const timeRange = (start: string, end: string, zone?: string) => {
  const time = (value: string, withZone: boolean) =>
    new Date(value).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: zone,
      ...(withZone ? { timeZoneName: 'short' as const } : {}),
    });
  return `${time(start, false)} – ${time(end, true)}`;
};
export const dayLabel = (value: string, zone?: string) =>
  new Date(value).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: zone,
  });
export const timeOnly = (value: string) =>
  new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

// ---- Derived views for the portal pages (pure, so portal.check.mjs covers them) ----

export const isClosed = (a: { status: string }) =>
  ['Rejected', 'Withdrawn', 'Hired'].includes(a.status);
export const unreadCount = (a: Pick<PortalApplication, 'thread'>) =>
  a.thread.filter((m) => m.unread).length;

export const applicationHref = (id: string) => `/candidate-portal/applications/${id}`;
export const conversationHref = (id: string) => `/candidate-portal/messages/${id}`;

export type TodoItem = {
  id: string;
  kind: 'confirm' | 'book' | 'document' | 'message' | 'offer';
  title: string;
  detail: string;
  href: string;
  /** Sort key: earlier first. */
  at: string;
  applicationId: string;
};

/** What needs the candidate's attention, most urgent first. */
export function todoItems(portal: Pick<Portal, 'applications'>): TodoItem[] {
  const items: TodoItem[] = [];
  for (const a of portal.applications) {
    const base = applicationHref(a.id);
    if (!a.emailConfirmed && !isClosed(a))
      items.push({
        id: `confirm-${a.id}`,
        kind: 'confirm',
        title: `Confirm your application for ${a.jobTitle}`,
        detail: `Sent ${new Date(a.appliedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}. Not yours? Withdraw it.`,
        href: base,
        at: a.appliedAt,
        applicationId: a.id,
      });
    // Proposed slots with the same title are alternative times for one interview: one to-do each.
    const byTitle = new Map<string, string[]>();
    for (const p of a.proposedInterviews)
      byTitle.set(p.title, [...(byTitle.get(p.title) ?? []), p.startsAt]);
    for (const [title, starts] of byTitle)
      items.push({
        id: `book-${a.id}-${title}`,
        kind: 'book',
        title: `Pick a time for your ${title.toLowerCase()}`,
        detail: `${a.jobTitle} · ${starts.length} ${starts.length === 1 ? 'time' : 'times'} to choose from`,
        href: `${base}#interviews`,
        at: [...starts].sort()[0],
        applicationId: a.id,
      });
    for (const r of isClosed(a) ? [] : (a.documentRequests ?? []))
      items.push({
        id: `doc-${r.id}`,
        kind: 'document',
        title: `Add your ${r.label.toLowerCase()}`,
        detail: r.note ? `${a.jobTitle} · ${r.note}` : a.jobTitle,
        href: `${base}#documents`,
        at: r.requestedAt,
        applicationId: a.id,
      });
    const unread = unreadCount(a);
    if (unread > 0)
      items.push({
        id: `msg-${a.id}`,
        kind: 'message',
        title: `${unread} new ${unread === 1 ? 'message' : 'messages'} from the hiring team`,
        detail: a.jobTitle,
        href: conversationHref(a.id),
        at: a.thread
          .filter((m) => m.unread)
          .map((m) => m.createdAt)
          .sort()[0],
        applicationId: a.id,
      });
    // Only an offer the team has actually sent, never a stage that happens to say "offer".
    if (a.offerSentAt && a.status === 'Active')
      items.push({
        id: `offer-${a.id}`,
        kind: 'offer',
        title: 'Your offer is ready',
        detail: `${a.jobTitle} · read it and give your answer`,
        href: `${base}/offer`,
        at: a.offerSentAt,
        applicationId: a.id,
      });
  }
  const rank = { confirm: 0, offer: 1, book: 2, document: 3, message: 4 } as const;
  return items.sort((x, y) => rank[x.kind] - rank[y.kind] || x.at.localeCompare(y.at));
}

/** Booked interviews still to come, soonest first, with their application. */
export function upcomingInterviews(portal: Pick<Portal, 'applications'>, now = new Date()) {
  return portal.applications
    .flatMap((a) =>
      a.interviews.filter((i) => new Date(i.endsAt) > now).map((i) => ({ ...i, application: a })),
    )
    .sort((x, y) => x.startsAt.localeCompare(y.startsAt));
}

/** The next interview when it is within a week: Home leads with it. */
export function interviewSoon(portal: Pick<Portal, 'applications'>, now = new Date()) {
  const next = upcomingInterviews(portal, now)[0];
  return next && new Date(next.startsAt).getTime() - now.getTime() < 7 * 86_400_000 ? next : null;
}

/** Active first (most recent activity first), then closed. */
export function sortApplications<T extends { status: string; lastActivityAt: string }>(apps: T[]) {
  return [...apps].sort(
    (x, y) =>
      Number(isClosed(x)) - Number(isClosed(y)) || y.lastActivityAt.localeCompare(x.lastActivityAt),
  );
}

export type ThreadItem =
  | { kind: 'message'; at: string; message: ThreadMessage }
  | { kind: 'email'; at: string; email: PortalEmail };

/** Messages and the emails we sent, in one list by time: the inbox shows emails as small notes. */
export function threadItems(a: Pick<PortalApplication, 'thread' | 'emails'>): ThreadItem[] {
  return [
    ...a.thread.map((message) => ({ kind: 'message' as const, at: message.createdAt, message })),
    ...a.emails.map((email) => ({ kind: 'email' as const, at: email.createdAt, email })),
  ].sort((x, y) => x.at.localeCompare(y.at));
}

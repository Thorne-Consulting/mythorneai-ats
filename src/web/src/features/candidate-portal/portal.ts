// Candidate portal: types for GET /public/portal, the session token, and the plain-words status.
// No imports, so `portal.check.mjs` can run it with node.

export type ThreadMessage = {
  id: string;
  fromCandidate: boolean;
  body: string;
  createdAt: string;
  unread: boolean;
};
export type PortalApplication = {
  id: string;
  requisitionId: string;
  jobTitle: string;
  stage: string;
  status: string;
  appliedAt: string;
  lastActivityAt: string;
  canWithdraw: boolean;
  canReschedule: boolean;
  thread: ThreadMessage[];
  interviews: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    meetingLink?: string | null;
  }>;
  proposedInterviews: Array<{ id: string; title: string; startsAt: string; endsAt: string }>;
  messages: Array<{ subject: string; body: string; createdAt: string }>;
};
export type Portal = {
  candidate: { firstName: string; lastName: string };
  company?: string | null;
  applications: PortalApplication[];
};
export type Slot = { startsAt: string; endsAt: string };

// Session token for the X-Candidate-Session header. sessionStorage: gone when the tab closes.
const TOKEN_KEY = 'candidate-session';
export const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
};
/** False when the browser blocks storage. */
export const writeToken = (token: string) => {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch {
    return false;
  }
};
export const clearToken = () => {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable
  }
};

type Phase = 'review' | 'interview' | 'decision' | 'other';
function phaseOf(stage: string): Phase {
  const s = stage.toLowerCase();
  if (s === 'new' || s.includes('review') || s.includes('screen')) return 'review';
  if (s.includes('interview') || s.includes('booked')) return 'interview';
  if (s.includes('offer') || s.includes('decision')) return 'decision';
  return 'other';
}

// Plain words for the candidate, instead of the team's internal stage name.
export function whatHappensNext(application: { status: string; stage: string }) {
  switch (application.status) {
    case 'Hired':
      return 'You got the job';
    case 'Rejected':
      return 'This application is closed';
    case 'Withdrawn':
      return 'You withdrew this application';
  }
  switch (phaseOf(application.stage)) {
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
export function statusSteps(application: { status: string; stage: string }): StatusStep[] {
  const phase = phaseOf(application.stage);
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

export const when = (value: string) =>
  new Date(value).toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
export const timeOnly = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---- Derived views for the portal pages (pure, so portal.check.mjs covers them) ----

export const isClosed = (a: { status: string }) =>
  ['Rejected', 'Withdrawn', 'Hired'].includes(a.status);
export const isOfferStage = (a: { status: string; stage: string }) =>
  a.status === 'Active' && phaseOf(a.stage) === 'decision';
export const unreadCount = (a: Pick<PortalApplication, 'thread'>) =>
  a.thread.filter((m) => m.unread).length;

export type TodoItem = {
  id: string;
  kind: 'book' | 'message' | 'offer';
  title: string;
  detail: string;
  href: string;
  /** Sort key: earlier first. */
  at: string;
};

/** What needs the candidate's attention, most urgent first. */
export function todoItems(portal: Pick<Portal, 'applications'>): TodoItem[] {
  const items: TodoItem[] = [];
  for (const a of portal.applications) {
    const base = `/candidate-portal/applications/${a.id}`;
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
        href: `${base}/interviews`,
        at: [...starts].sort()[0],
      });
    const unread = unreadCount(a);
    if (unread > 0)
      items.push({
        id: `msg-${a.id}`,
        kind: 'message',
        title: `${unread} new ${unread === 1 ? 'message' : 'messages'} from the hiring team`,
        detail: a.jobTitle,
        href: `${base}/messages`,
        at: a.thread
          .filter((m) => m.unread)
          .map((m) => m.createdAt)
          .sort()[0],
      });
    if (isOfferStage(a))
      items.push({
        id: `offer-${a.id}`,
        kind: 'offer',
        title: 'Your offer is almost ready',
        detail: `${a.jobTitle} · check your email for details`,
        href: `${base}/emails`,
        at: a.lastActivityAt,
      });
  }
  const rank = { book: 0, message: 1, offer: 2 } as const;
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

export type ActivityItem = {
  id: string;
  at: string;
  title: string;
  detail: string;
  href: string;
  tone: 'blue' | 'green' | 'gray' | 'violet';
};

/** Everything that happened, newest first: applications, messages and emails. */
export function activityFeed(portal: Pick<Portal, 'applications'>, limit = 8): ActivityItem[] {
  const out: ActivityItem[] = [];
  for (const a of portal.applications) {
    const base = `/candidate-portal/applications/${a.id}`;
    // The "we received your application" email already says this; show it only when there is none.
    const receipt = a.messages.some(
      (e) => Math.abs(Date.parse(e.createdAt) - Date.parse(a.appliedAt)) < 86_400_000,
    );
    if (!receipt)
      out.push({
        id: `applied-${a.id}`,
        at: a.appliedAt,
        title: 'You applied',
        detail: a.jobTitle,
        href: base,
        tone: 'green',
      });
    for (const m of a.thread)
      out.push({
        id: `m-${m.id}`,
        at: m.createdAt,
        title: m.fromCandidate ? 'You sent a message' : 'The hiring team wrote to you',
        detail: a.jobTitle,
        href: `${base}/messages`,
        tone: m.fromCandidate ? 'gray' : 'blue',
      });
    for (const e of a.messages)
      out.push({
        id: `e-${a.id}-${e.createdAt}`,
        at: e.createdAt,
        title: e.subject,
        detail: 'Email',
        href: `${base}/emails`,
        tone: 'violet',
      });
  }
  return out.sort((x, y) => y.at.localeCompare(x.at)).slice(0, limit);
}

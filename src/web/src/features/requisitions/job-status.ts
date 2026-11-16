// Pure job-status rules, kept free of React so job-status.check.mjs can run them in node.

/** Every status a person can move a job to by hand (Pending approval only comes from submitting). */
export const JOB_STATUS_TARGETS = ['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled'];

/** Statuses where hiring has stopped. Moving into one can reject the active candidates. */
export const CLOSED_STATUSES = ['Filled', 'Closed', 'Cancelled'];

/** The server refuses these without a reason. */
export const REASON_REQUIRED = ['OnHold', 'Closed', 'Cancelled'];

/** Preset reasons per status. The dialog adds "Other" so people can type their own. */
export const STATUS_REASONS: Record<string, string[]> = {
  OnHold: [
    'Hiring is paused',
    'Budget under review',
    'Role is being redefined',
    'Waiting on the team',
  ],
  Filled: ['Hired through MyThorneAI', 'Hired outside MyThorneAI', 'Filled by an internal move'],
  Closed: ['No suitable candidates', 'Budget removed', 'Role no longer needed'],
  Cancelled: ['Budget removed', 'Role no longer needed', 'Created by mistake'],
};

/** The reason active candidates get when the job closes. It is in the shared reason list. */
export const JOB_CLOSED_REASON = 'Position closed';

type JobState = { status: string; openedAt?: string | null };

// A job that was never opened needs approval to open when the organization asks for it.
const opensWithoutApproval = (job: JobState, approvalRequired?: boolean) =>
  !approvalRequired || !!job.openedAt;

export function statusOptions(job: JobState, approvalRequired?: boolean) {
  if (job.status === 'PendingApproval') return ['Draft', 'Cancelled'];
  const all = JOB_STATUS_TARGETS.filter((s) => s !== job.status);
  return opensWithoutApproval(job, approvalRequired) ? all : all.filter((s) => s !== 'Open');
}

export type JobAction = 'open' | 'submit' | 'find' | 'reopen';

/** The one main button in the job header, by where the job is in its life. */
export function primaryAction(job: JobState, approvalRequired?: boolean): JobAction | null {
  if (job.status === 'Open') return 'find';
  if (job.status === 'PendingApproval') return null;
  if (job.status === 'Draft')
    return opensWithoutApproval(job, approvalRequired) ? 'open' : 'submit';
  return opensWithoutApproval(job, approvalRequired) ? 'reopen' : null;
}

/**
 * Whole days the job has been (or was) open. A closed job counts to the day it closed; jobs
 * closed before close dates were kept fall back to their last update.
 */
export function daysOpen(
  job: JobState & { closedAt?: string | null; updatedAt?: string },
  now = Date.now(),
) {
  if (!job.openedAt) return null;
  const closed = CLOSED_STATUSES.includes(job.status);
  const end = job.closedAt ?? (closed ? job.updatedAt : undefined);
  const days = ((end ? Date.parse(end) : now) - Date.parse(job.openedAt)) / 86_400_000;
  return Math.max(0, Math.floor(days));
}

/**
 * Splits a bulk "Change status" into jobs to send and jobs to skip: already in that status, not
 * yours to manage, or a move the status rules don't allow (for example pending approval → open).
 */
export function planStatusChange<J extends JobState>(
  jobs: J[],
  target: string,
  canManage: (job: J) => boolean,
  approvalRequired?: boolean,
) {
  const change: J[] = [];
  const skipped: J[] = [];
  for (const job of jobs) {
    const ok =
      job.status !== target &&
      canManage(job) &&
      statusOptions(job, approvalRequired).includes(target);
    (ok ? change : skipped).push(job);
  }
  return { change, skipped };
}

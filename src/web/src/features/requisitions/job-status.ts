// Pure job-status rules, kept free of React so job-status.check.mjs can run them in node.

/** Every status a person can move a job to by hand (Pending approval only comes from submitting). */
export const JOB_STATUS_TARGETS = ['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled'];

// Opening goes through approval when the organization asks for it, so Open is not offered then.
// Pending approval only comes from submitting for approval, so it is never a target.
export function statusOptions(current: string, approvalRequired?: boolean) {
  if (current === 'PendingApproval') return ['Draft', 'Cancelled'];
  const all = JOB_STATUS_TARGETS.filter((s) => s !== current);
  return current === 'Draft' && approvalRequired ? all.filter((item) => item !== 'Open') : all;
}

/**
 * Splits a bulk "Change status" into jobs to send and jobs to skip: already in that status, not
 * yours to manage, or a move the status rules don't allow (e.g. pending approval → open).
 */
export function planStatusChange<J extends { status: string }>(
  jobs: J[],
  target: string,
  canManage: (job: J) => boolean,
) {
  const change: J[] = [];
  const skipped: J[] = [];
  for (const job of jobs) {
    const ok =
      job.status !== target && canManage(job) && statusOptions(job.status).includes(target);
    (ok ? change : skipped).push(job);
  }
  return { change, skipped };
}

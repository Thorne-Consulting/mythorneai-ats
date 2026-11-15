'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Alert, Button, Checkbox, Input, Modal, RadioGroup, Select, toast } from '@/components/ui';
import { statusLabel } from '@/components/status';
import { CLOSED_STATUSES, JOB_CLOSED_REASON, REASON_REQUIRED, STATUS_REASONS } from './job-status';

export type StatusJob = { id: string; title: string; activeApplications: number };
type Change = {
  jobs: StatusJob[];
  target: string;
  reason: string | null;
  rejectActive: { reason: string; sendEmail: boolean } | null;
  skipped: number;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const done: Record<string, string> = {
  Open: 'opened',
  Draft: 'moved back to draft',
  OnHold: 'put on hold',
  Filled: 'marked as filled',
  Closed: 'closed',
  Cancelled: 'cancelled',
};

const titles: Record<string, [string, string]> = {
  OnHold: ['Put job on hold', 'Put jobs on hold'],
  Filled: ['Mark job as filled', 'Mark jobs as filled'],
  Closed: ['Close job', 'Close jobs'],
  Cancelled: ['Cancel job', 'Cancel jobs'],
};

/**
 * Changing a job's status from the header, a row menu or a bulk action. Opening a job or moving
 * it back to draft happens at once; hold, filled, closed and cancelled ask why first, and the
 * closing ones ask what happens to the active candidates.
 */
export function useJobStatusChange(onDone?: () => void) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Omit<Change, 'reason' | 'rejectActive'> | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ jobs, target, reason, rejectActive, skipped }: Change) => {
      const results = await Promise.allSettled(
        jobs.map((job) =>
          api.patch<{ rejected: number }>(`/api/requisitions/${job.id}/status`, {
            status: target,
            reason,
            rejectActive,
          }),
        ),
      );
      const failed = results.flatMap((result, i) =>
        result.status === 'rejected'
          ? [
              `${jobs[i].title}: ${(result.reason as Error)?.message ?? 'the change was not allowed'}`,
            ]
          : [],
      );
      const rejected = results.reduce(
        (sum, r) => sum + (r.status === 'fulfilled' ? (r.value?.rejected ?? 0) : 0),
        0,
      );
      return { jobs, target, changed: jobs.length - failed.length, failed, rejected, skipped };
    },
    onSuccess: ({ jobs, target, changed, failed, rejected, skipped }) => {
      onDone?.();
      if (changed) {
        const what = jobs.length === 1 ? 'Job' : plural(changed, 'job');
        const notes = [
          rejected ? `${plural(rejected, 'candidate')} rejected.` : '',
          skipped
            ? `${plural(skipped, 'job')} skipped: already there, or not yours to change.`
            : '',
        ].filter(Boolean);
        toast.success(
          `${what} ${done[target] ?? `moved to ${statusLabel(target).toLowerCase()}`}`,
          notes.join(' ') || undefined,
        );
      }
      if (failed.length)
        toast.error(
          jobs.length === 1
            ? 'Could not change the job status'
            : `${plural(failed.length, 'job')} could not be changed`,
          failed.join('\n'),
        );
    },
    onError: (error: Error) => toast.error('Could not change the job status', error.message),
    onSettled: (_data, _error, { jobs }) => {
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      for (const job of jobs) {
        queryClient.invalidateQueries({ queryKey: ['requisition', job.id] });
        queryClient.invalidateQueries({ queryKey: ['requisition-status-history', job.id] });
        queryClient.invalidateQueries({ queryKey: ['board', job.id] });
      }
    },
  });

  /** Ask for the change. `skipped` is how many selected jobs could not take it (bulk only). */
  const request = (jobs: StatusJob[], target: string, skipped = 0) => {
    if (jobs.length === 0) {
      toast.error(
        'Nothing changed',
        `None of the selected jobs can move to ${statusLabel(target)}.`,
      );
      return;
    }
    if (STATUS_REASONS[target]) setPending({ jobs, target, skipped });
    else mutation.mutate({ jobs, target, reason: null, rejectActive: null, skipped });
  };

  const dialog = pending && (
    <JobStatusDialog
      key={pending.target}
      jobs={pending.jobs}
      target={pending.target}
      onClose={() => setPending(null)}
      onConfirm={async (reason, rejectActive) => {
        await mutation.mutateAsync({ ...pending, reason, rejectActive });
        setPending(null);
      }}
    />
  );

  return { request, dialog, isPending: mutation.isPending };
}

function JobStatusDialog({
  jobs,
  target,
  onClose,
  onConfirm,
}: {
  jobs: StatusJob[];
  target: string;
  onClose: () => void;
  onConfirm: (
    reason: string | null,
    rejectActive: { reason: string; sendEmail: boolean } | null,
  ) => Promise<void>;
}) {
  const [preset, setPreset] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [candidates, setCandidates] = useState<'reject' | 'keep'>('reject');
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const many = jobs.length > 1;
  const active = jobs.reduce((sum, job) => sum + job.activeApplications, 0);
  const closing = CLOSED_STATUSES.includes(target);
  const required = REASON_REQUIRED.includes(target);
  const reason = preset === 'Other' ? other.trim() : preset;
  const destructive = target === 'Closed' || target === 'Cancelled';
  const [title, titleMany] = titles[target];

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(
        reason || null,
        closing && active > 0 && candidates === 'reject'
          ? { reason: JOB_CLOSED_REASON, sendEmail }
          : null,
      );
    } catch {
      // The toast already explains it; keep the dialog open so nothing typed is lost.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      dismissable={!busy}
      size="sm"
      title={many ? `${titleMany.replace('jobs', plural(jobs.length, 'job'))}` : title}
      description={many ? undefined : jobs[0].title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            loading={busy}
            disabled={required && !reason}
            onClick={confirm}
          >
            {many ? titleMany : title}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Select
          label={required ? 'Reason' : 'Reason (optional)'}
          placeholder="Choose a reason"
          value={preset}
          onChange={setPreset}
          data={[...STATUS_REASONS[target], 'Other']}
        />
        {preset === 'Other' && (
          <Input
            label="Tell your team why"
            value={other}
            onChange={(e) => setOther(e.currentTarget.value)}
            autoFocus
          />
        )}

        {closing && active > 0 && (
          <div className="flex flex-col gap-3 rounded-lg border border-border-subtle p-4">
            <p className="text-sm font-medium text-fg">
              {plural(active, 'active candidate')} {active === 1 ? 'is' : 'are'} still in the
              pipeline
            </p>
            <RadioGroup
              aria-label="What happens to active candidates"
              value={candidates}
              onValueChange={(value) => setCandidates(value as 'reject' | 'keep')}
              options={[
                {
                  value: 'reject',
                  label: active === 1 ? 'Reject them' : `Reject all ${active}`,
                  description: (
                    <>
                      Their reason is “{JOB_CLOSED_REASON}”.
                      {candidates === 'reject' && (
                        // Sits under the option it belongs to.
                        <Checkbox
                          className="mt-2.5"
                          label="Send them the rejection email"
                          checked={sendEmail}
                          onCheckedChange={setSendEmail}
                        />
                      )}
                    </>
                  ),
                },
                {
                  value: 'keep',
                  label: 'Leave them as they are',
                  description: 'You can move or reject them later.',
                },
              ]}
            />
          </div>
        )}

        {target === 'OnHold' && (
          <Alert tone="neutral" icon={null}>
            {many ? 'These jobs are' : 'The job is'} hidden from your careers site until you open
            {many ? ' them' : ' it'} again. Candidates stay where they are.
          </Alert>
        )}
        {closing && (
          <Alert tone="neutral" icon={null}>
            {many ? 'These jobs come' : 'The job comes'} off your careers site. You can open
            {many ? ' them' : ' it'} again later.
          </Alert>
        )}
      </div>
    </Modal>
  );
}

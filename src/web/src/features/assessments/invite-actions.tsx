'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import {
  Button,
  ConfirmDialog,
  Input,
  MenuItem,
  MenuSeparator,
  Modal,
  NumberInput,
  Textarea,
  toast,
} from '@/components/ui';
import { displayName, resultHref, useRefreshAssessments, type InviteRow } from './api';
import { plural } from './scoring';

/** "2026-11-20" for a date input, in the reader's own zone. */
export const dateInput = (iso: string | number | Date) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** The end of the picked day in the reader's zone. */
export const endOfDay = (date: string) => new Date(`${date}T23:59:00`).toISOString();

/**
 * Row actions for one attempt (remind, change the deadline, retake, revoke or remove), with their
 * dialogs. Used by the Invited tab, the application's card and the review page.
 */
export function useInviteActions() {
  const router = useRouter();
  const refresh = useRefreshAssessments();
  const [extending, setExtending] = useState<InviteRow | null>(null);
  const [retaking, setRetaking] = useState<InviteRow | null>(null);
  const [revoking, setRevoking] = useState<InviteRow | null>(null);
  const [due, setDue] = useState('');
  const [extra, setExtra] = useState<number | ''>(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function remind(rows: InviteRow[]) {
    const open = rows.filter(
      (r) => r.canManage && (r.status === 'NotStarted' || r.status === 'InProgress'),
    );
    if (!open.length)
      return toast.info(
        'Nobody to remind',
        'People who finished or whose link expired are skipped.',
      );
    const results = await Promise.allSettled(
      open.map((r) => api.post(`/api/assessment-invites/${r.id}/remind`)),
    );
    const sent = results.filter((r) => r.status === 'fulfilled').length;
    if (sent) toast.success(`Reminder sent to ${plural(sent, 'person', 'people')}`);
    if (sent < open.length)
      toast.error(`${plural(open.length - sent, 'reminder')} could not be sent. Try again.`);
    refresh();
  }

  const openExtend = (row: InviteRow) => {
    setDue(
      dateInput(new Date(row.expiresAt) > new Date() ? row.expiresAt : Date.now() + 3 * 864e5),
    );
    setExtra(row.extraMinutes);
    setExtending(row);
  };
  const openRetake = (row: InviteRow) => {
    setDue(dateInput(Date.now() + 7 * 864e5));
    setNote('');
    setRetaking(row);
  };

  async function run(action: () => Promise<unknown>, success: string, close: () => void) {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      close();
      refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /** Whether `menu(row)` has anything in it. */
  const hasMenu = (row: InviteRow) => row.canManage || row.status === 'Submitted';

  const menu = (row: InviteRow) => {
    // Only people who manage the job remind, change, retake or revoke; everyone can open a result.
    const manage = row.canManage;
    const open = manage && (row.status === 'NotStarted' || row.status === 'InProgress');
    const finished = row.status === 'Submitted';
    return (
      <>
        {finished && (
          <MenuItem onSelect={() => router.push(resultHref(row.assessmentId, row.id))}>
            {row.decision ? 'Open result' : 'Grade'}
          </MenuItem>
        )}
        {open && <MenuItem onSelect={() => remind([row])}>Send reminder</MenuItem>}
        {(open || (manage && row.status === 'Expired')) && !row.replaced && (
          <MenuItem onSelect={() => openExtend(row)}>
            {row.status === 'Expired' ? 'Reopen with a new date' : 'Change deadline'}
          </MenuItem>
        )}
        {manage &&
          (finished || row.status === 'InProgress' || row.status === 'Expired') &&
          !row.decision &&
          !row.replaced && <MenuItem onSelect={() => openRetake(row)}>Allow a retake</MenuItem>}
        {manage && !row.decision && !row.replaced && row.status !== 'Expired' && (
          <>
            <MenuSeparator />
            <MenuItem danger onSelect={() => setRevoking(row)}>
              {finished ? 'Remove result' : 'Revoke link'}
            </MenuItem>
          </>
        )}
      </>
    );
  };

  const dialogs = (
    <>
      <Modal
        opened={!!extending}
        onClose={() => setExtending(null)}
        title="Change deadline"
        description={
          extending ? `${displayName(extending)} · ${extending.assessmentName}` : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setExtending(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!due}
              onClick={() =>
                extending &&
                run(
                  () =>
                    api.post(`/api/assessment-invites/${extending.id}/extend`, {
                      expiresAt: endOfDay(due),
                      extraMinutes: extra === '' ? 0 : extra,
                    }),
                  'Deadline changed',
                  () => setExtending(null),
                )
              }
            >
              Save deadline
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            type="date"
            label="Link open until"
            min={dateInput(new Date())}
            value={due}
            onChange={(e) => setDue(e.currentTarget.value)}
          />
          <NumberInput
            label="Extra time"
            min={0}
            max={600}
            rightSection={<span className="pr-3 text-sm text-fg-subtle">minutes</span>}
            description="Added to the timer, for example for an accommodation."
            value={extra}
            onValueChange={setExtra}
          />
        </div>
      </Modal>

      <Modal
        opened={!!retaking}
        onClose={() => setRetaking(null)}
        title="Allow a retake"
        description={
          retaking
            ? `${displayName(retaking)} gets a fresh link. This attempt stays readable but leaves the grading queue.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRetaking(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!due}
              onClick={() =>
                retaking &&
                run(
                  () =>
                    api.post(`/api/assessment-invites/${retaking.id}/retake`, {
                      expiresAt: endOfDay(due),
                      note: note.trim() || null,
                    }),
                  'Retake sent',
                  () => setRetaking(null),
                )
              }
            >
              Send retake
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Input
            type="date"
            label="Due"
            min={dateInput(new Date())}
            value={due}
            onChange={(e) => setDue(e.currentTarget.value)}
          />
          <Textarea
            label="Note in the email"
            description="Optional. For example, why they get another try."
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
        </div>
      </Modal>

      <ConfirmDialog
        opened={!!revoking}
        onClose={() => setRevoking(null)}
        title={revoking?.status === 'Submitted' ? 'Remove this result?' : 'Revoke this link?'}
        message={
          revoking?.status === 'Submitted'
            ? 'The result disappears from the assessment and the application. It is noted in the activity history.'
            : 'The link stops working straight away. You can send the assessment again later.'
        }
        confirmLabel={revoking?.status === 'Submitted' ? 'Remove result' : 'Revoke link'}
        onConfirm={async () => {
          if (!revoking) return;
          try {
            await api.post(`/api/assessment-invites/${revoking.id}/revoke`);
            toast.success(revoking.status === 'Submitted' ? 'Result removed' : 'Link revoked');
            refresh();
          } catch (error) {
            toast.error((error as Error).message);
          }
        }}
      />
    </>
  );

  return { menu, hasMenu, dialogs, remind };
}

/** "Reminded 2 times, last on Nov 3". */
export const reminderText = (row: Pick<InviteRow, 'reminderCount' | 'lastReminderAt'>) =>
  row.reminderCount
    ? `Reminded ${plural(row.reminderCount, 'time')}${row.lastReminderAt ? `, last on ${new Date(row.lastReminderAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
    : null;

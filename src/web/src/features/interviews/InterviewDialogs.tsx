'use client';

import { useEffect, useState } from 'react';
import { Button, Checkbox, Input, Modal, RadioGroup, Textarea } from '@/components/ui';
import { useInterviewActions } from './interview-api';

const REASONS = [
  'The candidate asked to cancel',
  "An interviewer can't make it",
  'The job is filled or closed',
  'We are not moving forward',
  'Other',
];

/**
 * Cancel from the team side: a reason (kept on the interview and told to the panel), and whether
 * to email the candidate, with an optional note from you.
 */
export function CancelInterviewDialog({
  interviewId,
  applicationId,
  title,
  candidateName,
  opened,
  onClose,
}: {
  interviewId: string;
  applicationId?: string;
  title: string;
  candidateName: string;
  opened: boolean;
  onClose: () => void;
}) {
  const { cancel } = useInterviewActions(interviewId, applicationId);
  const [reason, setReason] = useState<string | null>(null);
  const [other, setOther] = useState('');
  const [notify, setNotify] = useState(true);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!opened) return;
    setReason(null);
    setOther('');
    setNotify(true);
    setMessage('');
  }, [opened]);
  const finalReason = reason === 'Other' ? other.trim() : reason;
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      dismissable={!cancel.isPending}
      title="Cancel this interview?"
      description={`${title} with ${candidateName}. Everyone on the panel gets an email, and calendar invites are removed.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Keep interview
          </Button>
          <Button
            variant="danger"
            disabled={!finalReason}
            loading={cancel.isPending}
            onClick={() =>
              cancel.mutate(
                {
                  reason: finalReason!,
                  notifyCandidate: notify,
                  messageToCandidate: notify && message.trim() ? message.trim() : undefined,
                },
                { onSuccess: onClose },
              )
            }
          >
            Cancel interview
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg">Reason</legend>
          <RadioGroup
            aria-label="Reason"
            value={reason}
            onValueChange={setReason}
            options={REASONS.map((value) => ({ value, label: value }))}
          />
        </fieldset>
        {reason === 'Other' && (
          <Input
            label="Say why"
            value={other}
            maxLength={300}
            onChange={(event) => setOther(event.currentTarget.value)}
          />
        )}
        <Checkbox
          checked={notify}
          onCheckedChange={setNotify}
          label="Email the candidate"
          description="They get the date and time, and that we will be in touch. The reason stays with the team."
        />
        {notify && (
          <Textarea
            label="Note to the candidate (optional)"
            minRows={3}
            maxLength={2000}
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * Say how an interview went once it has started: it happened, or someone did not attend. For a
 * candidate no-show you can email them that you missed them.
 */
export function OutcomeDialog({
  interviewId,
  applicationId,
  candidateName,
  initial,
  opened,
  onClose,
}: {
  interviewId: string;
  applicationId?: string;
  candidateName: string;
  initial: 'Completed' | 'NoShow';
  opened: boolean;
  onClose: () => void;
}) {
  const { outcome } = useInterviewActions(interviewId, applicationId);
  const [choice, setChoice] = useState<string>(initial);
  const [party, setParty] = useState<string>('Candidate');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (!opened) return;
    setChoice(initial);
    setParty('Candidate');
    setNote('');
    setNotify(true);
  }, [opened, initial]);
  const noShow = choice === 'NoShow';
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      dismissable={!outcome.isPending}
      title="How did the interview go?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={outcome.isPending}
            onClick={() =>
              outcome.mutate(
                {
                  outcome: noShow ? 'NoShow' : 'Completed',
                  noShowParty: noShow ? (party as 'Candidate' | 'Interviewer') : undefined,
                  note: note.trim() || undefined,
                  notifyCandidate: noShow && party === 'Candidate' && notify,
                },
                { onSuccess: onClose },
              )
            }
          >
            {noShow ? 'Mark as no-show' : 'Mark completed'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <RadioGroup
          aria-label="What happened"
          value={choice}
          onValueChange={setChoice}
          options={[
            {
              value: 'Completed',
              label: 'It happened',
              description: 'Scorecard reminders carry on.',
            },
            { value: 'NoShow', label: 'Someone did not attend' },
          ]}
        />
        {noShow && (
          <fieldset className="space-y-3 rounded-lg bg-muted p-4">
            <legend className="sr-only">Who did not attend</legend>
            <RadioGroup
              aria-label="Who did not attend"
              orientation="horizontal"
              value={party}
              onValueChange={setParty}
              options={[
                { value: 'Candidate', label: candidateName },
                { value: 'Interviewer', label: 'An interviewer' },
              ]}
            />
            {party === 'Candidate' && (
              <Checkbox
                checked={notify}
                onCheckedChange={setNotify}
                label="Email the candidate that we missed them"
                description="It asks them to message us if something came up."
              />
            )}
          </fieldset>
        )}
        <Textarea
          label="Note for the team (optional)"
          minRows={2}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
      </div>
    </Modal>
  );
}

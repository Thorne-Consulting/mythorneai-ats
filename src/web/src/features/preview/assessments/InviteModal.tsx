'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button, Modal, Select, TagsInput } from '@/components/ui';
import type { Assessment } from '../sample-assessments';
import { emailPattern } from './store';

/** Invite candidates by email. Pass one assessment to fix it, or several to let the user pick. */
export function InviteModal({
  opened,
  initialAssessment,
  assessments,
  existingEmails = [],
  onClose,
  onInvite,
}: {
  opened: boolean;
  initialAssessment: string | null;
  assessments: Assessment[];
  /** Emails already invited to the chosen assessment; inviting them again is blocked. */
  existingEmails?: string[];
  onClose: () => void;
  onInvite: (assessmentId: string, emails: string[]) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const assessmentId = picked ?? initialAssessment;
  const bad = emails.filter((e) => !emailPattern.test(e));
  const dupes = emails.filter((e) => existingEmails.includes(e.toLowerCase()));
  const errors = {
    assessment: !assessmentId ? 'Pick an assessment' : undefined,
    emails:
      emails.length === 0
        ? 'Add at least one email'
        : bad.length
          ? `Not an email: ${bad.join(', ')}`
          : dupes.length
            ? `Already invited: ${dupes.join(', ')}`
            : undefined,
  };
  const close = () => {
    setPicked(null);
    setEmails([]);
    setSubmitted(false);
    onClose();
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Invite candidates"
      description="Candidates get a link to take the assessment. Sample only: no email is sent."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            leftIcon={<Send />}
            onClick={() => {
              setSubmitted(true);
              if (errors.assessment || errors.emails || !assessmentId) return;
              onInvite(
                assessmentId,
                emails.map((e) => e.toLowerCase()),
              );
              close();
            }}
          >
            Send invites
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {assessments.length > 1 && (
          <Select
            label="Assessment"
            data={assessments.map((a) => ({ value: a.id, label: a.name }))}
            value={assessmentId}
            onChange={setPicked}
            error={submitted && errors.assessment}
          />
        )}
        <TagsInput
          label="Candidate emails"
          description="Press Enter or comma after each email."
          placeholder="name@example.com"
          value={emails}
          onChange={setEmails}
          error={submitted && errors.emails}
        />
      </div>
    </Modal>
  );
}

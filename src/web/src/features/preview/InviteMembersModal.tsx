'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { Button, Modal, Select, TagsInput } from '@/components/ui';
import { workspaceRoles } from './sample-admin';

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

export function InviteMembersModal({
  opened,
  onClose,
  onInvite,
}: {
  opened: boolean;
  onClose: () => void;
  onInvite: (emails: string[], role: string) => void;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [role, setRole] = useState<string | null>('Interviewer');
  const [submitted, setSubmitted] = useState(false);
  const bad = emails.filter((e) => !isEmail(e));
  const emailError =
    emails.length === 0
      ? 'Add at least one email address'
      : bad.length
        ? `Check these addresses: ${bad.join(', ')}`
        : undefined;
  const close = () => {
    setEmails([]);
    setRole('Interviewer');
    setSubmitted(false);
    onClose();
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Invite members"
      description="They get an email with a link to join this workspace."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            leftIcon={<Send />}
            onClick={() => {
              setSubmitted(true);
              if (emailError || !role) return;
              onInvite(
                emails.map((e) => e.toLowerCase()),
                role,
              );
              close();
            }}
          >
            Send invitations
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TagsInput
          label="Email addresses"
          description="Press Enter or type a comma after each one."
          placeholder="name@example.com"
          value={emails}
          onChange={setEmails}
          error={submitted && emailError}
        />
        <Select
          label="Role"
          data={workspaceRoles}
          value={role}
          onChange={setRole}
          error={submitted && !role && 'Pick a role'}
        />
      </div>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Button,
  Modal,
  MultiSelect,
  Select,
  TagsInput,
  Textarea,
  toast,
} from '@/components/ui';
import type { Role } from '@/types';
import { useRoleOptions } from './admin-data';

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

type InviteResult = {
  created: { id: string; email: string }[];
  skipped: { email: string; reason: string }[];
};

/** Invite people: each gets an email with a way to sign in, and shows under Invited until they do. */
export function InviteMembersModal({
  opened,
  onClose,
  teams,
}: {
  opened: boolean;
  onClose: () => void;
  /** Teams to pick from (job departments). */
  teams: string[];
}) {
  const queryClient = useQueryClient();
  const [emails, setEmails] = useState<string[]>([]);
  const { options: roleOptions, kindOf } = useRoleOptions();
  const [role, setRole] = useState('Interviewer');
  const [departments, setDepartments] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [skipped, setSkipped] = useState<InviteResult['skipped']>([]);
  const bad = emails.filter((e) => !isEmail(e));
  const emailError =
    emails.length === 0
      ? 'Add at least one email address.'
      : bad.length
        ? `Check these addresses: ${bad.join(', ')}`
        : undefined;
  const close = () => {
    setEmails([]);
    setRole('Interviewer');
    setDepartments([]);
    setNote('');
    setSubmitted(false);
    setSkipped([]);
    onClose();
  };
  const invite = useMutation({
    mutationFn: () =>
      api.post<InviteResult>('/api/admin/invitations', {
        emails: emails.map((e) => e.toLowerCase()),
        role,
        departments,
        note: note.trim() || null,
      }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      const n = result.created.length;
      if (n > 0)
        toast.success(
          n === 1 ? `Invited ${result.created[0].email}` : `Invited ${n} people`,
          'They get an email with a way to sign in.',
        );
      // Keep the dialog open to explain anyone we could not invite.
      if (result.skipped.length) {
        setSkipped(result.skipped);
        setEmails(result.skipped.map((s) => s.email));
      } else close();
    },
    onError: (e: Error) => toast.error('Invitations weren’t sent', e.message),
  });
  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Invite people"
      description="Each person gets an email with a way to sign in."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {skipped.length ? 'Done' : 'Cancel'}
          </Button>
          <Button
            leftIcon={<Send />}
            loading={invite.isPending}
            onClick={() => {
              setSubmitted(true);
              if (!emailError) invite.mutate();
            }}
          >
            {emails.length > 1 ? `Send ${emails.length} invitations` : 'Send invitation'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {skipped.length > 0 && (
          <Alert tone="warning" title="Some people weren’t invited">
            <ul className="mt-1 space-y-0.5">
              {skipped.map((s) => (
                <li key={s.email}>
                  {s.email}: {s.reason}
                </li>
              ))}
            </ul>
          </Alert>
        )}
        <TagsInput
          label="Email addresses"
          description="Press Enter or type a comma after each one."
          placeholder="name@company.com"
          value={emails}
          onChange={(value) => {
            setEmails(value);
            setSkipped([]);
          }}
          error={submitted ? emailError : undefined}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Role"
            data={roleOptions}
            value={role}
            onChange={(value) => value && setRole(value)}
          />
          <TeamsField
            role={kindOf(role)}
            data={teams}
            value={departments}
            onChange={setDepartments}
          />
        </div>
        <Textarea
          label="Personal note (optional)"
          placeholder="Added to the email."
          rows={3}
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
      </div>
    </Modal>
  );
}

/**
 * Teams are job departments. They limit someone who works on every open job to those jobs, and let
 * someone who works on their own jobs see the open jobs there too. `role` is the built-in role the
 * picked role behaves like (`kindOf`), so custom roles get the right wording.
 */
export function TeamsField({
  role,
  data,
  value,
  onChange,
}: {
  role: Role;
  data: string[];
  value: string[];
  onChange: (value: string[]) => void;
}) {
  if (role === 'Admin' || role === 'Interviewer') return null;
  return (
    <MultiSelect
      label="Teams (optional)"
      description={
        role === 'Recruiter'
          ? 'They see only jobs in these departments, plus jobs they are on. Empty means every job.'
          : 'They also see the open jobs in these departments. Empty means only the jobs they are on.'
      }
      placeholder={role === 'Recruiter' ? 'All teams' : 'Only their jobs'}
      data={[...new Set([...data, ...value])]}
      value={value}
      onChange={onChange}
      className="sm:col-span-2"
    />
  );
}

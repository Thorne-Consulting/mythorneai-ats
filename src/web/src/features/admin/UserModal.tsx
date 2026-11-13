'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Input, Modal, Select, Switch, toast } from '@/components/ui';
import type { AdminUser, Role } from '@/types';
import { ROLE_OPTIONS } from './admin-data';

/** Add a member, or edit one when `user` is given. The API upserts by email. */
export function UserModal({
  opened,
  onClose,
  user,
}: {
  opened: boolean;
  onClose: () => void;
  user?: AdminUser | null;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState(user?.email ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [role, setRole] = useState<Role>(user?.role ?? 'Interviewer');
  const [department, setDepartment] = useState(user?.department ?? '');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/admin/users', {
        email,
        displayName,
        role,
        department: department || null,
        isActive,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(user ? 'Member updated' : 'Member added');
      onClose();
    },
    onError: (error: Error) => toast.error('Could not save access', error.message),
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={user ? `Edit ${user.displayName}` : 'Add member'}
      description="Only active members with a company email can sign in."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!email.includes('@') || !displayName.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save access
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          inset
          label="Company email"
          type="email"
          value={email}
          // Email identifies the account; changing it would create someone new.
          disabled={!!user}
          onChange={(e) => setEmail(e.currentTarget.value)}
          autoFocus={!user}
        />
        <Input
          inset
          label="Name"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            inset
            label="Role"
            value={role}
            onChange={(value) => value && setRole(value as Role)}
            data={ROLE_OPTIONS}
          />
          <Input
            inset
            label="Team"
            placeholder="All teams"
            value={department}
            onChange={(e) => setDepartment(e.currentTarget.value)}
          />
        </div>
        <Switch
          labelPosition="left"
          label="Can sign in"
          description="Turn this off to stop them signing in. Their history stays."
          checked={isActive}
          onCheckedChange={setIsActive}
        />
      </div>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import { Button, Group, Modal, Select, SimpleGrid, Stack, Switch, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { Role } from '@/types';

export function UserModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<Role>('Interviewer');
  const [department, setDepartment] = useState('');
  const [isActive, setIsActive] = useState(true);
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
      notifications.show({ color: 'teal', message: 'User access saved' });
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Add or update user" centered>
      <Stack>
        <TextInput
          label="Company email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <TextInput
          label="Display name"
          value={displayName}
          onChange={(e) => setDisplayName(e.currentTarget.value)}
        />
        <SimpleGrid cols={2}>
          <Select
            label="Role"
            value={role}
            onChange={(value) => value && setRole(value as Role)}
            data={[
              { value: 'Admin', label: 'Administrator' },
              { value: 'Recruiter', label: 'Recruiter' },
              { value: 'HiringManager', label: 'Hiring manager' },
              { value: 'Interviewer', label: 'Interviewer' },
            ]}
            allowDeselect={false}
          />
          <TextInput
            label="Team scope"
            value={department}
            onChange={(e) => setDepartment(e.currentTarget.value)}
          />
        </SimpleGrid>
        <Switch
          label="Account is active"
          checked={isActive}
          onChange={(e) => setIsActive(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!email.includes('@') || !displayName.trim()}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Save access
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

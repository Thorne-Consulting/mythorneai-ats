'use client';

import { useState } from 'react';
import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';

export function OrganizationSetupModal({ opened }: { opened: boolean }) {
  const [name, setName] = useState('');
  const update = useMutation({
    mutationFn: () => api.put('/api/organization', { name }),
    onSuccess: () => window.location.reload(),
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  return (
    <Modal
      opened={opened}
      onClose={() => undefined}
      closeOnEscape={false}
      closeOnClickOutside={false}
      title="Set up your organization"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          You are the first ATS user and organization owner. Give this workspace a name before
          inviting your team.
        </Text>
        <TextInput
          label="Organization name"
          placeholder="Acme Recruiting"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) update.mutate();
          }}
          autoFocus
        />
        <Button onClick={() => update.mutate()} loading={update.isPending} disabled={!name.trim()}>
          Save and continue
        </Button>
      </Stack>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import { Button, Checkbox, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';

export function OrganizationSetupModal({ opened }: { opened: boolean }) {
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [allowGoogleLogin, setAllowGoogleLogin] = useState(true);
  const [allowMicrosoftLogin, setAllowMicrosoftLogin] = useState(true);
  const [staleReminderDays, setStaleReminderDays] = useState<number | string>(3);
  const update = useMutation({
    mutationFn: () =>
      api.put('/api/organization', {
        name,
        allowedEmailDomains: domains
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        allowGoogleLogin,
        allowMicrosoftLogin,
        staleReminderDays: Number(staleReminderDays) || 3,
      }),
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
        <TextInput
          label="Allowed company email domains"
          description="Comma-separated, for example acme.com, acme.org"
          placeholder="acme.com"
          value={domains}
          onChange={(event) => setDomains(event.currentTarget.value)}
        />
        <Checkbox
          label="Allow Google sign-in"
          checked={allowGoogleLogin}
          onChange={(event) => setAllowGoogleLogin(event.currentTarget.checked)}
        />
        <NumberInput
          label="Remind about stale applications after"
          description="The recruiter and candidate receive a reminder after this many inactive days."
          value={staleReminderDays}
          min={1}
          max={30}
          suffix=" days"
          onChange={setStaleReminderDays}
        />
        <Checkbox
          label="Allow Microsoft sign-in"
          checked={allowMicrosoftLogin}
          onChange={(event) => setAllowMicrosoftLogin(event.currentTarget.checked)}
        />
        <Button onClick={() => update.mutate()} loading={update.isPending} disabled={!name.trim()}>
          Save and continue
        </Button>
      </Stack>
    </Modal>
  );
}

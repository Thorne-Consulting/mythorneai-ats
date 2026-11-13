'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Input, Modal, NumberInput, Switch, toast } from '@/components/ui';

export function OrganizationSetupModal({ opened }: { opened: boolean }) {
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [allowGoogleLogin, setAllowGoogleLogin] = useState(true);
  const [allowMicrosoftLogin, setAllowMicrosoftLogin] = useState(true);
  const [staleReminderDays, setStaleReminderDays] = useState<number | ''>(3);
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
    onError: (error: Error) => toast.error('Could not save', error.message),
  });

  return (
    <Modal
      opened={opened}
      onClose={() => undefined}
      dismissable={false}
      title="Set up your workspace"
      description="You are the first person here, so you own this workspace. Give it a name before you invite your team."
      footer={
        <Button onClick={() => update.mutate()} loading={update.isPending} disabled={!name.trim()}>
          Save and continue
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          inset
          label="Workspace name"
          placeholder="Acme Recruiting"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) update.mutate();
          }}
          autoFocus
        />
        <Input
          inset
          label="Company email domains"
          description="Only people with these email domains can sign in. Separate them with commas, for example acme.com, acme.org."
          placeholder="acme.com"
          value={domains}
          onChange={(event) => setDomains(event.currentTarget.value)}
        />
        <NumberInput
          inset
          label="Remind about stuck applications after (days)"
          description="The recruiter and candidate get a reminder after this many days with no activity."
          value={staleReminderDays}
          min={1}
          max={30}
          step={1}
          onValueChange={setStaleReminderDays}
        />
        <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle px-4">
          <Switch
            className="py-3"
            labelPosition="left"
            label="Allow Google sign-in"
            checked={allowGoogleLogin}
            onCheckedChange={setAllowGoogleLogin}
          />
          <Switch
            className="py-3"
            labelPosition="left"
            label="Allow Microsoft sign-in"
            checked={allowMicrosoftLogin}
            onCheckedChange={setAllowMicrosoftLogin}
          />
        </div>
      </div>
    </Modal>
  );
}

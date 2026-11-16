'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Input, Modal, SearchSelect, TagsInput, toast } from '@/components/ui';

const TIME_ZONES = Intl.supportedValuesOf('timeZone');

/** The owner's first step: name the workspace, set its time zone and company domains. */
export function OrganizationSetupModal({ opened }: { opened: boolean }) {
  const [name, setName] = useState('');
  const [timeZone, setTimeZone] = useState<string | null>(() =>
    typeof Intl === 'undefined' ? null : Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [domains, setDomains] = useState<string[]>([]);
  const update = useMutation({
    mutationFn: () =>
      api.put('/api/organization', { name: name.trim(), timeZone, allowedEmailDomains: domains }),
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
          label="Workspace name"
          placeholder="Acme Recruiting"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && name.trim()) update.mutate();
          }}
          autoFocus
        />
        <SearchSelect
          label="Time zone"
          description="Reminders and quiet hours use this time zone."
          placeholder="Search time zones"
          data={TIME_ZONES}
          value={timeZone}
          onChange={setTimeZone}
        />
        <TagsInput
          label="Company email domains"
          description="Only email addresses at these domains can sign in. Leave it empty to allow anyone you invite. Press Enter after each one, for example acme.com."
          placeholder="acme.com"
          value={domains}
          onChange={setDomains}
        />
      </div>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Stack,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSparkles } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  parseRequirements,
  type Requirements,
  type RequisitionWithSettings,
} from './requirements-types';

const EMPTY: Requirements = { required: [], preferred: [], minYears: null, location: '' };

export function RequisitionRequirements({
  requisition,
  canManage,
}: {
  requisition: RequisitionWithSettings;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const confirmed = parseRequirements(requisition.requirementsJson);
  const [draft, setDraft] = useState<Requirements | null>(null);
  const [fromAi, setFromAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const extract = useMutation({
    mutationFn: () =>
      api.post<Requirements>(`/api/requisitions/${requisition.id}/requirements/extract`),
    onSuccess: (result) => {
      setAiError(null);
      setFromAi(true);
      setDraft({ ...EMPTY, ...result });
    },
    onError: (error: Error) => setAiError(error.message),
  });
  const save = useMutation({
    mutationFn: (value: Requirements) =>
      api.put(`/api/requisitions/${requisition.id}/requirements`, {
        required: value.required,
        preferred: value.preferred,
        minYears: value.minYears,
        location: value.location,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisition.id] });
      notifications.show({ color: 'teal', message: 'Requirements confirmed' });
      setDraft(null);
      setFromAi(false);
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  const edit = () => {
    setFromAi(false);
    setDraft(confirmed ?? EMPTY);
  };

  const actions = canManage && !draft && (
    <Group gap="xs">
      <Button
        size="xs"
        variant="subtle"
        leftSection={<IconSparkles size={14} />}
        loading={extract.isPending}
        onClick={() => extract.mutate()}
      >
        Extract with AI
      </Button>
      <Button size="xs" variant="default" onClick={edit}>
        {confirmed ? 'Edit' : 'Add manually'}
      </Button>
    </Group>
  );

  return (
    <div>
      <div className="section-head">
        <h2 className="section-title">Requirements</h2>
        {confirmed && actions}
      </div>
      <Stack gap="md">
        {aiError && (
          <Alert color="gray" variant="light" title="AI extraction didn't run">
            {aiError}
          </Alert>
        )}
        {draft ? (
          <form
            className="panel"
            style={{ padding: 24 }}
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <Stack gap="md">
              {fromAi && (
                <Alert color="gray" variant="light">
                  AI drafted this from the role summary. Check every line, change what is wrong,
                  then confirm. Nothing is saved until you do.
                </Alert>
              )}
              <TagsInput
                label="Required"
                description="Must-haves. Press Enter after each one."
                value={draft.required}
                onChange={(required) => setDraft({ ...draft, required })}
              />
              <TagsInput
                label="Preferred"
                description="Nice to have."
                value={draft.preferred}
                onChange={(preferred) => setDraft({ ...draft, preferred })}
              />
              <Group grow align="flex-start">
                <NumberInput
                  label="Minimum years of experience"
                  min={0}
                  max={60}
                  decimalScale={1}
                  value={draft.minYears ?? ''}
                  onChange={(value) =>
                    setDraft({ ...draft, minYears: value === '' ? null : Number(value) })
                  }
                />
                <TextInput
                  label="Location rule"
                  placeholder="For example: Remote, US time zones"
                  value={draft.location}
                  onChange={(event) => setDraft({ ...draft, location: event.currentTarget.value })}
                />
              </Group>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setDraft(null)} disabled={save.isPending}>
                  Cancel
                </Button>
                <Button type="submit" loading={save.isPending}>
                  Confirm requirements
                </Button>
              </Group>
            </Stack>
          </form>
        ) : confirmed ? (
          <dl className="req-list">
            <ReqRow label="Must have">
              <Chips items={confirmed.required} filled />
            </ReqRow>
            <ReqRow label="Nice to have">
              <Chips items={confirmed.preferred} />
            </ReqRow>
            <ReqRow label="Experience">
              {confirmed.minYears != null ? `${confirmed.minYears}+ years` : 'Not set'}
            </ReqRow>
            <ReqRow label="Location">{confirmed.location || 'Not set'}</ReqRow>
          </dl>
        ) : (
          <div className="panel empty-row">
            <Text size="sm" c="dimmed">
              Nothing set yet, so candidates are ranked by keywords only.
            </Text>
            {actions}
          </div>
        )}
      </Stack>
    </div>
  );
}

function ReqRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="req-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Chips({ items, filled }: { items: string[]; filled?: boolean }) {
  if (items.length === 0) return <Text c="dimmed">None</Text>;
  return (
    <Group gap={6}>
      {items.map((item) => (
        <Badge key={item} variant={filled ? 'light' : 'default'} tt="none" fw={500}>
          {item}
        </Badge>
      ))}
    </Group>
  );
}

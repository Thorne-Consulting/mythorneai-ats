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
import { SectionCard } from '@/components/ui/Cards';
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

  return (
    <SectionCard
      title="What this job needs"
      description="Matching and ranking are made against the requirements confirmed here."
      action={
        canManage && !draft ? (
          <Group gap="xs">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconSparkles size={14} />}
              loading={extract.isPending}
              onClick={() => extract.mutate()}
            >
              Extract with AI
            </Button>
            <Button size="xs" variant="default" onClick={edit}>
              {confirmed ? 'Edit' : 'Add requirements'}
            </Button>
          </Group>
        ) : undefined
      }
      padded
    >
      <Stack gap="md">
        {aiError && (
          <Alert color="gray" variant="light" title="AI extraction didn't run">
            {aiError}
          </Alert>
        )}
        {draft ? (
          <form
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
          <Stack gap="sm">
            <ChipRow label="Required" items={confirmed.required} filled />
            <ChipRow label="Preferred" items={confirmed.preferred} />
            <Text size="sm">
              <Text span c="dimmed">
                Minimum years:{' '}
              </Text>
              {confirmed.minYears ?? 'not set'}
            </Text>
            <Text size="sm">
              <Text span c="dimmed">
                Location rule:{' '}
              </Text>
              {confirmed.location || 'not set'}
            </Text>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed" maw="60ch">
            No requirements confirmed yet. Add them, or let AI draft a list from the role summary
            for you to review. Until then, ranking candidates for this job is keyword-only.
          </Text>
        )}
      </Stack>
    </SectionCard>
  );
}

function ChipRow({ label, items, filled }: { label: string; items: string[]; filled?: boolean }) {
  return (
    <div>
      <Text size="xs" c="dimmed" mb={4}>
        {label}
      </Text>
      {items.length === 0 ? (
        <Text size="sm" c="dimmed">
          None
        </Text>
      ) : (
        <Group gap={6}>
          {items.map((item) => (
            <Badge key={item} variant={filled ? 'light' : 'default'} tt="none" fw={500}>
              {item}
            </Badge>
          ))}
        </Group>
      )}
    </div>
  );
}

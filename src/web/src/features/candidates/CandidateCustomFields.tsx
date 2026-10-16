'use client';

import { useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMailOff, IconPencil } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { formatDate } from '@/lib/format';
import type { CandidateDetail } from '@/types';

/** Fields the API returns that the shared CandidateDetail type doesn't list yet. */
export type CandidateExtras = { customFieldsJson?: string | null; emailBounced?: boolean };

interface Definition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options: string[];
}

function parseValues(json?: string | null): Record<string, string> {
  try {
    const parsed = json ? JSON.parse(json) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function EmailBouncedAlert() {
  return (
    <Alert variant="light" color="yellow" icon={<IconMailOff size={18} />} title="Email bounced">
      Emails to this address bounced, so we’ve stopped sending. Check the address.
    </Alert>
  );
}

export function CandidateCustomFields({
  candidate,
  canEdit,
}: {
  candidate: CandidateDetail & CandidateExtras;
  canEdit: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const definitions = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api.get<Definition[]>('/api/custom-fields'),
  });
  const values = parseValues(candidate.customFieldsJson);
  const save = useMutation({
    mutationFn: () => api.put(`/api/candidates/${candidate.id}/custom-fields`, { values: draft }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      notifications.show({ color: 'teal', message: 'Details saved' });
      setOpened(false);
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not save', message: error.message }),
  });
  const fields = definitions.data ?? [];
  if (fields.length === 0) return null;
  const show = (field: Definition) => {
    const value = values[field.key];
    if (!value) return 'Not provided';
    return field.type === 'date' ? formatDate(value) : value;
  };
  const edit = () => {
    setDraft(Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ''])));
    setOpened(true);
  };
  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <>
      <Paper withBorder radius="lg" p="lg">
        <Group justify="space-between" mb="md">
          <Text fw={700}>More details</Text>
          {canEdit && (
            <Button
              size="compact-sm"
              variant="subtle"
              leftSection={<IconPencil size={14} />}
              onClick={edit}
            >
              Edit
            </Button>
          )}
        </Group>
        <Stack gap="sm">
          {fields.map((field) => (
            <Group
              key={field.key}
              justify="space-between"
              gap="xl"
              wrap="nowrap"
              align="flex-start"
            >
              <Text size="sm" c="dimmed">
                {field.label}
              </Text>
              <Text
                size="sm"
                fw={values[field.key] ? 600 : 400}
                c={values[field.key] ? undefined : 'dimmed'}
                ta="right"
              >
                {show(field)}
              </Text>
            </Group>
          ))}
        </Stack>
      </Paper>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Edit details" centered>
        <Stack gap="md">
          {fields.map((field) =>
            field.type === 'select' ? (
              <Select
                key={field.key}
                label={field.label}
                clearable
                data={field.options}
                value={draft[field.key] || null}
                onChange={(value) => set(field.key, value ?? '')}
              />
            ) : field.type === 'number' ? (
              <NumberInput
                key={field.key}
                label={field.label}
                value={
                  draft[field.key] === '' || draft[field.key] === undefined
                    ? ''
                    : Number(draft[field.key])
                }
                onChange={(value) => set(field.key, value === '' ? '' : String(value))}
              />
            ) : (
              <TextInput
                key={field.key}
                type={field.type === 'date' ? 'date' : 'text'}
                label={field.label}
                value={draft[field.key] ?? ''}
                onChange={(event) => set(field.key, event.currentTarget.value)}
              />
            ),
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save details
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

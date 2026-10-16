'use client';

import {
  ActionIcon,
  Button,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  TagsInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { SettingsSection, useDraft } from './settings-shared';

export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options: string[];
}

const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function CustomFieldsSection() {
  const queryClient = useQueryClient();
  const fields = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api.get<CustomFieldDefinition[]>('/api/custom-fields'),
  });
  if (!fields.data) return <LoadingBlock rows={1} />;
  return (
    <Editor
      source={fields.data}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ['custom-fields'] })}
    />
  );
}

function Editor({ source, onSaved }: { source: CustomFieldDefinition[]; onSaved: () => void }) {
  const { draft, replace, dirty } = useDraft(source);
  const keys = draft.map((x) => x.key);
  const errors = draft.map((field, index) =>
    !KEY.test(field.key)
      ? 'Use lowercase letters, digits, - or _.'
      : keys.indexOf(field.key) !== index
        ? 'Each key must be different.'
        : !field.label.trim()
          ? 'Give this field a label.'
          : field.type === 'select' && field.options.length === 0
            ? 'Add at least one option.'
            : null,
  );
  const valid = errors.every((x) => x === null);
  const save = useMutation({
    mutationFn: () => api.put('/api/admin/custom-fields', { fields: draft }),
    onSuccess: () => {
      onSaved();
      notifications.show({ color: 'teal', message: 'Candidate fields saved' });
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not save fields', message: error.message }),
  });
  const update = (index: number, patch: Partial<CustomFieldDefinition>) =>
    replace(draft.map((field, i) => (i === index ? { ...field, ...patch } : field)));

  return (
    <SettingsSection
      id="candidate-fields"
      title="Candidate fields"
      dirty={dirty && valid}
      saving={save.isPending}
      onSave={() => save.mutate()}
    >
      <Stack gap="md">
        {draft.length === 0 && (
          <Text size="sm" c="dimmed">
            No extra fields yet. Add one if you keep asking candidates the same question.
          </Text>
        )}
        {draft.map((field, index) => (
          <Group key={index} align="flex-start" gap="sm" wrap="wrap">
            <TextInput
              label="Label"
              value={field.label}
              onChange={(event) => update(index, { label: event.currentTarget.value })}
              style={{ flex: '1 1 160px' }}
            />
            <TextInput
              label="Key"
              description="Fixed id, e.g. notice-period"
              value={field.key}
              onChange={(event) => update(index, { key: event.currentTarget.value })}
              error={dirty ? errors[index] : undefined}
              style={{ flex: '1 1 160px' }}
            />
            <Select
              label="Type"
              allowDeselect={false}
              data={[
                { value: 'text', label: 'Text' },
                { value: 'number', label: 'Number' },
                { value: 'date', label: 'Date' },
                { value: 'select', label: 'Pick one' },
              ]}
              value={field.type}
              onChange={(value) =>
                update(index, { type: (value ?? 'text') as CustomFieldDefinition['type'] })
              }
              w={130}
            />
            {field.type === 'select' && (
              <TagsInput
                label="Options"
                description="Press Enter after each"
                value={field.options}
                onChange={(value) => update(index, { options: value })}
                style={{ flex: '1 1 200px' }}
              />
            )}
            <ActionIcon
              variant="subtle"
              color="red"
              mt={26}
              aria-label={`Remove field ${field.label || index + 1}`}
              onClick={() => replace(draft.filter((_, i) => i !== index))}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        ))}
        <div>
          <Button
            variant="default"
            leftSection={<IconPlus size={16} />}
            disabled={draft.length >= 30}
            onClick={() => replace([...draft, { key: '', label: '', type: 'text', options: [] }])}
          >
            Add field
          </Button>
        </div>
      </Stack>
    </SettingsSection>
  );
}

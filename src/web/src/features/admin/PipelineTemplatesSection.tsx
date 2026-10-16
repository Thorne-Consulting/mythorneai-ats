'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { SettingsSection } from './settings-shared';

interface PipelineTemplate {
  id: string;
  name: string;
  stageNames: string[];
  isDefault: boolean;
}
interface Draft {
  id?: string;
  name: string;
  stageNames: string[];
  isDefault: boolean;
}

export function PipelineTemplatesSection() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [removing, setRemoving] = useState<PipelineTemplate | null>(null);
  const templates = useQuery({
    queryKey: ['pipeline-templates'],
    queryFn: () => api.get<PipelineTemplate[]>('/api/pipeline-templates'),
  });
  const done = (message: string) => {
    queryClient.invalidateQueries({ queryKey: ['pipeline-templates'] });
    notifications.show({ color: 'teal', message });
  };
  const fail = (error: Error) =>
    notifications.show({
      color: 'red',
      title: 'Could not save the pipeline',
      message: error.message,
    });
  const save = useMutation({
    mutationFn: (value: Draft) => {
      const body = {
        name: value.name.trim(),
        stageNames: value.stageNames.map((x) => x.trim()).filter(Boolean),
        isDefault: value.isDefault,
      };
      return value.id
        ? api.put(`/api/admin/pipeline-templates/${value.id}`, body)
        : api.post('/api/admin/pipeline-templates', body);
    },
    onSuccess: () => {
      done('Pipeline saved');
      setDraft(null);
    },
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/pipeline-templates/${id}`),
    onSuccess: () => {
      done('Pipeline deleted');
      setRemoving(null);
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not delete', message: error.message }),
  });

  const move = (index: number, by: number) => {
    if (!draft) return;
    const stages = [...draft.stageNames];
    [stages[index], stages[index + by]] = [stages[index + by], stages[index]];
    setDraft({ ...draft, stageNames: stages });
  };
  const names = draft?.stageNames.map((x) => x.trim()).filter(Boolean) ?? [];
  const valid =
    !!draft?.name.trim() &&
    names.length >= 1 &&
    names.length <= 12 &&
    new Set(names.map((x) => x.toLowerCase())).size === names.length;

  return (
    <SettingsSection
      id="pipelines"
      title="Hiring pipelines"
      description="The stages an application moves through. Pick one when you create a job. “Hired” is added automatically at the end."
    >
      <Stack gap="sm">
        {(templates.data ?? []).map((template) => (
          <Paper key={template.id} withBorder radius="md" p="md">
            <Group justify="space-between" wrap="wrap" gap="sm">
              <div style={{ flex: '1 1 260px' }}>
                <Group gap="xs">
                  <Text fw={600}>{template.name}</Text>
                  {template.isDefault && (
                    <Badge variant="light" color="gray" tt="none">
                      Default
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {[...template.stageNames, 'Hired'].join(' → ')}
                </Text>
              </div>
              <Group gap="xs">
                <Button variant="default" size="xs" onClick={() => setDraft({ ...template })}>
                  Edit
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  size="xs"
                  aria-label={`Delete ${template.name}`}
                  onClick={() => setRemoving(template)}
                >
                  Delete
                </Button>
              </Group>
            </Group>
          </Paper>
        ))}
        {templates.data?.length === 0 && (
          <Text size="sm" c="dimmed">
            No pipelines yet. Add one so new jobs start with the stages your team actually uses.
          </Text>
        )}
        <div>
          <Button
            variant="default"
            leftSection={<IconPlus size={16} />}
            onClick={() =>
              setDraft({
                name: '',
                stageNames: ['Applied', 'Screen', 'Interview', 'Offer'],
                isDefault: false,
              })
            }
          >
            Add pipeline
          </Button>
        </div>
      </Stack>

      <Modal
        opened={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit pipeline' : 'New pipeline'}
        centered
      >
        {draft && (
          <Stack gap="md">
            <TextInput
              label="Name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.currentTarget.value })}
              data-autofocus
            />
            <div>
              <Text size="sm" fw={500} mb={4}>
                Stages, in order
              </Text>
              <Stack gap={6}>
                {draft.stageNames.map((stage, index) => (
                  <Group key={index} gap={4} wrap="nowrap">
                    <TextInput
                      aria-label={`Stage ${index + 1}`}
                      value={stage}
                      onChange={(event) => {
                        const stages = [...draft.stageNames];
                        stages[index] = event.currentTarget.value;
                        setDraft({ ...draft, stageNames: stages });
                      }}
                      style={{ flex: 1 }}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={`Move stage ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <IconArrowUp size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={`Move stage ${index + 1} down`}
                      disabled={index === draft.stageNames.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <IconArrowDown size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={`Remove stage ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          stageNames: draft.stageNames.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))}
                <Group justify="space-between">
                  <Button
                    variant="subtle"
                    size="compact-sm"
                    leftSection={<IconPlus size={14} />}
                    disabled={draft.stageNames.length >= 12}
                    onClick={() => setDraft({ ...draft, stageNames: [...draft.stageNames, ''] })}
                  >
                    Add stage
                  </Button>
                  <Text size="sm" c="dimmed">
                    Then Hired, added for you
                  </Text>
                </Group>
              </Stack>
              {!valid && draft.name.trim() && (
                <Text size="sm" c="red" mt="xs">
                  Use one to twelve stages, each with a different name.
                </Text>
              )}
            </div>
            <Checkbox
              label="Use as the default for new jobs"
              checked={draft.isDefault}
              onChange={(event) => setDraft({ ...draft, isDefault: event.currentTarget.checked })}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate(draft)}>
                Save pipeline
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete this pipeline?"
        centered
      >
        <Text size="sm" mb="md">
          “{removing?.name}” won’t be offered for new jobs. Jobs already using it keep their stages.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRemoving(null)}>
            Keep it
          </Button>
          <Button
            color="red"
            loading={remove.isPending}
            onClick={() => removing && remove.mutate(removing.id)}
          >
            Delete pipeline
          </Button>
        </Group>
      </Modal>
    </SettingsSection>
  );
}

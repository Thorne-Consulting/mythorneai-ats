'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconClipboardList, IconPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { useCanManage, useRequisition } from './requisition-data';

export function RequisitionKits({ id }: { id: string }) {
  const [kitOpened, kitModal] = useDisclosure();
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);

  if (!details.data) return <LoadingBlock rows={3} />;
  const requisition = details.data;

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="md" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 280px' }}>
          <Title order={3}>Interview kits</Title>
          <Text c="dimmed" size="sm">
            Shared instructions and scoring criteria every interviewer works from.
          </Text>
        </div>
        {canManage && (
          <Button leftSection={<IconPlus size={16} />} onClick={kitModal.open}>
            Add kit
          </Button>
        )}
      </Group>
      {requisition.interviewKits.length === 0 ? (
        <EmptyState
          icon={IconClipboardList}
          title="No interview kits yet"
          description="Kits keep every interviewer on the same questions and the same scoring scale, which makes candidates comparable."
          actionLabel={canManage ? 'Add the first kit' : undefined}
          onAction={kitModal.open}
        />
      ) : (
        <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
          {requisition.interviewKits.map((kit) => (
            <Paper key={kit.id} withBorder radius="lg" p="lg">
              <Group justify="space-between" wrap="nowrap" mb={kit.instructions ? 'xs' : 'md'}>
                <Text fw={650}>{kit.name}</Text>
                <Badge variant="light" color="gray">
                  {kit.durationMinutes} min
                </Badge>
              </Group>
              {kit.instructions && (
                <Text size="sm" c="dimmed" mb="md">
                  {kit.instructions}
                </Text>
              )}
              <Text size="xs" c="dimmed" fw={650} tt="uppercase" lts={0.6} mb="xs">
                {kit.criteria.length} scored{' '}
                {kit.criteria.length === 1 ? 'competency' : 'competencies'}
              </Text>
              <Stack gap="sm">
                {kit.criteria.map((criterion) => (
                  <Paper key={criterion.id} p="md" radius="md" bg="var(--surface-sunken)">
                    <Group justify="space-between" wrap="nowrap" mb={4}>
                      <Text size="sm" fw={650}>
                        {criterion.name}
                      </Text>
                      <Badge size="xs" variant="light">
                        Weight {criterion.weight}
                      </Badge>
                    </Group>
                    <Text size="sm">{criterion.question}</Text>
                    {criterion.description && (
                      <Text size="xs" c="dimmed" mt={6}>
                        Good looks like: {criterion.description}
                      </Text>
                    )}
                  </Paper>
                ))}
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
      )}
      <InterviewKitModal requisitionId={id} opened={kitOpened} onClose={kitModal.close} />
    </>
  );
}

function InterviewKitModal({
  requisitionId,
  opened,
  onClose,
}: {
  requisitionId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [duration, setDuration] = useState<number | string>(60);
  const [instructions, setInstructions] = useState('');
  const [criteriaText, setCriteriaText] = useState(
    'Role expertise | Tell me about the most relevant work you have done for this role. | Gives specific examples and explains personal contribution. | 3\nProblem solving | Walk me through a difficult problem and the tradeoffs you made. | Frames the problem, considers alternatives, and measures the result. | 3\nCollaboration | Describe a disagreement with a teammate and how you handled it. | Listens, communicates directly, and reaches a constructive outcome. | 2',
  );
  const criteria = criteriaText
    .split('\n')
    .map((line) => {
      const [criterionName, question, description, weight] = line.split('|');
      return {
        name: criterionName.trim(),
        question: question?.trim() ?? '',
        description: description?.trim() ?? '',
        weight: Math.min(5, Math.max(1, Number(weight?.trim()) || 1)),
      };
    })
    .filter((criterion) => criterion.name);
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/requisitions/${requisitionId}/interview-kits`, {
        name,
        durationMinutes: Number(duration),
        instructions,
        criteria,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisitionId] });
      notifications.show({ color: 'teal', message: 'Interview kit created' });
      setName('');
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <Modal opened={opened} onClose={onClose} title="Add interview kit" size="lg" centered>
      <Stack>
        <TextInput
          label="Interview name"
          placeholder="Technical interview"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <NumberInput
          label="Duration in minutes"
          min={15}
          max={480}
          step={15}
          value={duration}
          onChange={setDuration}
        />
        <Textarea
          label="Interviewer instructions"
          minRows={3}
          value={instructions}
          onChange={(event) => setInstructions(event.currentTarget.value)}
        />
        <Textarea
          label="Scorecard criteria"
          description="One per line: competency | exact question | scoring guidance | weight (1–5)."
          minRows={6}
          value={criteriaText}
          onChange={(event) => setCriteriaText(event.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!name.trim() || criteria.length === 0 || Number(duration) < 15}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Create kit
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

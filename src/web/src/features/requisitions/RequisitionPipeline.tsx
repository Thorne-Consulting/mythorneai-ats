'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Divider,
  Group,
  Menu,
  Paper,
  Rating,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDots, IconMapPin } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDateTime, initials } from '@/lib/format';
import type { BoardData } from '@/types';
import type { BoardApplication } from './requisition-data';
import { useBoard, useCanManage, useRequisition } from './requisition-data';

export function RequisitionPipeline({ id, initialData }: { id: string; initialData: BoardData }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const details = useRequisition(id);
  const board = useBoard(id, initialData);
  const canManage = useCanManage(details.data);
  const [dragging, setDragging] = useState<{ id: string; from: string } | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const moveMutation = useMutation({
    mutationFn: ({ applicationId, stageId }: { applicationId: string; stageId: string }) =>
      api.patch<void>(`/api/applications/${applicationId}/stage`, {
        stageId,
        status: 'Active',
        dispositionReason: null,
      }),
    // Move the card in the cache first so a drag lands instantly, and put it
    // back if the request fails.
    onMutate: async ({ applicationId, stageId }) => {
      await queryClient.cancelQueries({ queryKey: ['board', id] });
      const previous = queryClient.getQueryData<BoardData>(['board', id]);
      queryClient.setQueryData<BoardData>(['board', id], (current) => {
        if (!current) return current;
        let moved: BoardApplication | undefined;
        const emptied = current.stages.map((stage) => ({
          ...stage,
          applications: stage.applications.filter((application) => {
            if (application.id !== applicationId) return true;
            moved = application;
            return false;
          }),
        }));
        if (!moved) return current;
        return {
          ...current,
          stages: emptied.map((stage) =>
            stage.id === stageId
              ? { ...stage, applications: [moved as BoardApplication, ...stage.applications] }
              : stage,
          ),
        };
      });
      return { previous };
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(['board', id], context.previous);
      notifications.show({ color: 'red', message: error.message });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['board', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['applicants'] });
    },
  });

  const moveTo = (stageId: string) => {
    const active = dragging;
    setDragging(null);
    setDropStage(null);
    if (!active || active.from === stageId) return;
    moveMutation.mutate({ applicationId: active.id, stageId });
  };

  if (!board.data) return <LoadingBlock rows={3} />;
  const totalActive = board.data.stages.reduce((sum, s) => sum + s.applications.length, 0);

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="md" wrap="wrap" gap="sm">
        <div>
          <Title order={3}>Hiring pipeline</Title>
          <Text c="dimmed" size="sm">
            {totalActive} active across {board.data.stages.length} stages.{' '}
            {canManage && 'Drag a card to another stage, or use the menu on the card.'}
          </Text>
        </div>
      </Group>
      <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
        <Box className="pipeline-scroll">
          <div className="pipeline-grid">
            {board.data.stages.map((stage) => (
              <section
                key={stage.id}
                className="pipeline-column"
                data-drop-target={dropStage === stage.id || undefined}
                onDragOver={(event) => {
                  if (!dragging || dragging.from === stage.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropStage(stage.id);
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                  setDropStage((current) => (current === stage.id ? null : current));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  moveTo(stage.id);
                }}
              >
                <Group justify="space-between" mb="md" className="pipeline-column-header">
                  <Group gap="xs" wrap="nowrap">
                    <Box className="stage-dot" bg={`${stage.color}.5`} />
                    <Text fw={650} size="sm" truncate>
                      {stage.name}
                    </Text>
                  </Group>
                  <Badge color="gray" variant="light" circle>
                    {stage.applications.length}
                  </Badge>
                </Group>
                <Stack gap="sm">
                  {stage.applications.map((application) => (
                    <Paper
                      key={application.id}
                      withBorder
                      radius="md"
                      p="md"
                      bg="var(--mantine-color-body)"
                      className="hover-card candidate-card"
                      draggable={canManage}
                      data-draggable={canManage || undefined}
                      data-dragging={dragging?.id === application.id || undefined}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', application.id);
                        event.dataTransfer.effectAllowed = 'move';
                        setDragging({ id: application.id, from: stage.id });
                      }}
                      onDragEnd={() => {
                        setDragging(null);
                        setDropStage(null);
                      }}
                    >
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <UnstyledButton
                          style={{ flex: 1, minWidth: 0 }}
                          onClick={() => router.push(`/applications/${application.id}`)}
                        >
                          <Group wrap="nowrap" align="flex-start" gap="sm">
                            <Avatar size={36} color={stage.color} variant="light">
                              {initials(application.candidateName)}
                            </Avatar>
                            <div style={{ minWidth: 0 }}>
                              <Text fw={650} size="sm" truncate>
                                {application.candidateName}
                              </Text>
                              <Text size="xs" c="dimmed" truncate>
                                {application.currentTitle ?? 'Candidate'}
                              </Text>
                            </div>
                          </Group>
                        </UnstyledButton>
                        {canManage && (
                          <Menu position="bottom-end" withArrow>
                            <Menu.Target>
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label={`Move ${application.candidateName}`}
                              >
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Label>Move to</Menu.Label>
                              {board.data.stages
                                .filter((target) => target.id !== stage.id)
                                .map((target) => (
                                  <Menu.Item
                                    key={target.id}
                                    onClick={() =>
                                      moveMutation.mutate({
                                        applicationId: application.id,
                                        stageId: target.id,
                                      })
                                    }
                                  >
                                    {target.name}
                                  </Menu.Item>
                                ))}
                            </Menu.Dropdown>
                          </Menu>
                        )}
                      </Group>
                      {application.location && (
                        <Group gap={5} mt="sm" wrap="nowrap">
                          <IconMapPin size={13} color="var(--mantine-color-dimmed)" />
                          <Text size="xs" c="dimmed" truncate>
                            {application.location}
                          </Text>
                        </Group>
                      )}
                      {application.rating ? (
                        <Group gap={6} mt={6} wrap="nowrap">
                          <Rating value={application.rating} readOnly size="xs" />
                          <Text size="xs" c="dimmed">
                            {application.rating.toFixed(1)}
                          </Text>
                        </Group>
                      ) : (
                        <Text size="xs" c="dimmed" mt={6}>
                          Not rated yet
                        </Text>
                      )}
                      <Divider my="sm" />
                      <Group justify="space-between" gap="xs" wrap="nowrap">
                        <Badge size="xs" variant="default">
                          {application.source}
                        </Badge>
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                          {formatDateTime(application.lastActivityAt)}
                        </Text>
                      </Group>
                    </Paper>
                  ))}
                  {stage.applications.length === 0 && (
                    <Paper withBorder radius="md" p="lg" className="empty-stage">
                      <Text size="xs" c="dimmed" ta="center">
                        No candidates
                      </Text>
                    </Paper>
                  )}
                </Stack>
              </section>
            ))}
          </div>
        </Box>
      </Paper>
    </>
  );
}

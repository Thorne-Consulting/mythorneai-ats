'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Group,
  Menu,
  Paper,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDots } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDateTime, formatRelative } from '@/lib/format';
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
      <div className="section-head">
        <h2 className="section-title">Pipeline</h2>
        <Group gap="md">
          <Text c="dimmed" size="sm">
            {totalActive} active
            {canManage && totalActive > 0 && ' · drag a card to move it'}
          </Text>
          {canManage && (
            <Anchor component={Link} href={`/candidates/find?job=${id}`} size="sm">
              Find candidates
            </Anchor>
          )}
        </Group>
      </div>
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
                  <div
                    key={application.id}
                    className="candidate-card"
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
                    <div className="candidate-card-head">
                      <UnstyledButton
                        className="candidate-card-who"
                        onClick={() => router.push(`/applications/${application.id}`)}
                      >
                        <span className="candidate-card-name">{application.candidateName}</span>
                        <span className="candidate-card-role">
                          {application.currentTitle ?? 'Candidate'}
                        </span>
                      </UnstyledButton>
                      <span className="candidate-card-score" title="Average rating">
                        {application.rating ? application.rating.toFixed(1) : '–'}
                        <small>rating</small>
                      </span>
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
                    </div>
                    <dl className="candidate-card-rows">
                      {application.nextInterviewAt && (
                        <div className="candidate-card-key">
                          <dt>Interview</dt>
                          <dd>{formatDateTime(application.nextInterviewAt)}</dd>
                        </div>
                      )}
                      {application.yearsExperience != null && (
                        <div>
                          <dt>Experience</dt>
                          <dd>{Math.round(application.yearsExperience)} yrs</dd>
                        </div>
                      )}
                      {application.skills.length > 0 && (
                        <div>
                          <dt>Skills</dt>
                          <dd title={application.skills.join(', ')}>
                            {application.skills.slice(0, 3).join(', ')}
                          </dd>
                        </div>
                      )}
                      {application.location && (
                        <div>
                          <dt>Location</dt>
                          <dd>{application.location}</dd>
                        </div>
                      )}
                      <div>
                        <dt>Applied</dt>
                        <dd>{formatRelative(application.appliedAt)}</dd>
                      </div>
                      <div>
                        <dt>Source</dt>
                        <dd>{application.source}</dd>
                      </div>
                    </dl>
                  </div>
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
    </>
  );
}

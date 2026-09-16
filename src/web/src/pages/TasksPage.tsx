import { useState } from 'react';
import { Badge, Checkbox, Group, Paper, SegmentedControl, Stack, Text, ThemeIcon } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconClipboardCheck } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { api } from '../api';
import { EmptyState, formatDate, LoadingBlock, PageHeader } from '../components/Common';
import type { TaskItem } from '../types';

export function TasksPage() {
  const [view, setView] = useState('open');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ['tasks', view], queryFn: () => api.get<TaskItem[]>(`/api/tasks?includeCompleted=${view === 'all'}`) });
  const mutation = useMutation({
    mutationFn: ({ id, isCompleted }: { id: string; isCompleted: boolean }) => api.patch<void>(`/api/tasks/${id}`, { isCompleted }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); queryClient.invalidateQueries({ queryKey: ['dashboard'] }); },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  return (
    <div>
      <PageHeader title="My tasks" description="Assignments and follow-ups that need your attention." actions={<SegmentedControl value={view} onChange={setView} data={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />} />
      {!query.data ? <LoadingBlock /> : query.data.length === 0 ? <EmptyState icon={IconClipboardCheck} title="You are all caught up" description="New hiring tasks assigned to you will appear here." /> : (
        <Paper withBorder radius="lg">
          <Stack gap={0}>
            {query.data.map((task) => {
              const overdue = !task.isCompleted && task.dueDate && task.dueDate < new Date().toISOString().slice(0, 10);
              return <Group key={task.id} className="list-row" wrap="nowrap">
                <Checkbox checked={task.isCompleted} onChange={(event) => mutation.mutate({ id: task.id, isCompleted: event.currentTarget.checked })} aria-label={`Mark ${task.title} complete`} />
                <ThemeIcon variant="light" color={task.isCompleted ? 'gray' : overdue ? 'red' : 'indigo'}><IconClipboardCheck size={17} /></ThemeIcon>
                <div style={{ flex: 1, minWidth: 0 }} onClick={() => task.applicationId && navigate({ to: '/applications/$id', params: { id: task.applicationId } })}>
                  <Text size="sm" fw={650} td={task.isCompleted ? 'line-through' : undefined}>{task.title}</Text>
                  <Text size="xs" c="dimmed">{task.candidateName ? `${task.candidateName} · ${task.requisitionTitle}` : 'General task'}</Text>
                </div>
                <Badge variant="light" color={task.isCompleted ? 'gray' : overdue ? 'red' : 'indigo'} tt="none">{task.isCompleted ? 'Completed' : task.dueDate ? `Due ${formatDate(task.dueDate)}` : 'No due date'}</Badge>
              </Group>;
            })}
          </Stack>
        </Paper>
      )}
    </div>
  );
}

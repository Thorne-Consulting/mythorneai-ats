'use client';

import { useEffect, useState } from 'react';
import { Badge, Box, Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { SectionCard } from '@/components/ui/Cards';
import { useCurrentUser } from '@/auth';
import { formatDateTime } from '@/lib/format';
import { useApplicationExtras } from './application-extras';
import { canManageRole, useInvalidateApplication } from './application-data';

/** Thread between the hiring team and the candidate. Separate from private review notes. */
export function ApplicationMessages({ id, canManage }: { id: string; canManage: boolean }) {
  const { messages } = useApplicationExtras(id);
  const invalidate = useInvalidateApplication(id);
  const [body, setBody] = useState('');
  const unread = messages.filter((item) => item.fromCandidate && !item.readAt).length;

  const markRead = useMutation({
    mutationFn: () => api.post(`/api/applications/${id}/messages/read`),
    onSuccess: invalidate,
  });
  // Opening the page counts as reading the candidate's messages.
  useEffect(() => {
    if (canManage && unread > 0 && !markRead.isPending && !markRead.isSuccess) markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, unread]);

  const send = useMutation({
    mutationFn: () => api.post(`/api/applications/${id}/messages`, { body }),
    onSuccess: () => {
      setBody('');
      invalidate();
      notifications.show({
        color: 'teal',
        message: 'Message sent. The candidate has been emailed and can reply from their portal.',
      });
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not send the message',
        message: error.message,
      }),
  });

  if (!canManage && messages.length === 0) return null;
  return (
    <SectionCard
      title="Messages with the candidate"
      action={
        unread > 0 && (
          <Badge color="blue" variant="filled">
            {unread} new
          </Badge>
        )
      }
    >
      <Stack gap={0}>
        {messages.map((item) => (
          <Box key={item.id} className="list-row">
            <Group justify="space-between" mb={5} wrap="nowrap">
              <Text size="sm" fw={650} truncate>
                {item.fromCandidate ? 'Candidate' : (item.authorEmail ?? 'Hiring team')}
              </Text>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {formatDateTime(item.createdAt)}
              </Text>
            </Group>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {item.body}
            </Text>
          </Box>
        ))}
        {messages.length === 0 && (
          <Text p="xl" c="dimmed" size="sm">
            No messages yet. Write one below and the candidate gets it by email.
          </Text>
        )}
      </Stack>
      {canManage && (
        <Stack
          gap="sm"
          p="lg"
          style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
        >
          <Textarea
            aria-label="Message to the candidate"
            placeholder="Write to the candidate…"
            minRows={2}
            autosize
            maxLength={2000}
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
          />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {body.length}/2000
            </Text>
            <Button loading={send.isPending} disabled={!body.trim()} onClick={() => send.mutate()}>
              Send to candidate
            </Button>
          </Group>
        </Stack>
      )}
    </SectionCard>
  );
}

export function ApplicationMessagesTab({ id }: { id: string }) {
  const user = useCurrentUser();
  return <ApplicationMessages id={id} canManage={canManageRole(user.role)} />;
}

'use client';

import { useState } from 'react';
import { Button, Collapse, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFileText } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { formatDateTime } from '@/lib/format';
import type { Interview } from './application-types';

type Recording = Interview['recordings'][number] & { transcript?: string | null };

/** Transcribe a recording and read the transcript. Only for people who manage the job. */
export function RecordingTranscripts({
  interview,
  onUpdated,
}: {
  interview: Interview;
  onUpdated: () => void;
}) {
  const recordings = interview.recordings as Recording[];
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const transcribe = useMutation({
    mutationFn: (id: string) =>
      api.post<{ transcript: string }>(`/api/interview-recordings/${id}/transcribe`),
    onSuccess: (_result, id) => {
      onUpdated();
      setShown((value) => ({ ...value, [id]: true }));
      notifications.show({
        color: 'teal',
        message: 'Transcript ready. Check it before relying on it.',
      });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  if (recordings.length === 0) return null;
  return (
    <Stack gap="sm" mt="md">
      {recordings.map((item) => (
        <div key={item.id}>
          <Group justify="space-between" wrap="wrap" gap="xs">
            <Text size="sm">Recording from {formatDateTime(item.recordedAt)}</Text>
            <Group gap="xs">
              {item.transcript && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  aria-expanded={!!shown[item.id]}
                  onClick={() => setShown((value) => ({ ...value, [item.id]: !value[item.id] }))}
                >
                  {shown[item.id] ? 'Hide transcript' : 'Show transcript'}
                </Button>
              )}
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconFileText size={13} />}
                loading={transcribe.isPending && transcribe.variables === item.id}
                onClick={() => transcribe.mutate(item.id)}
              >
                {item.transcript ? 'Transcribe again' : 'Transcribe'}
              </Button>
            </Group>
          </Group>
          <Collapse in={!!shown[item.id] && !!item.transcript}>
            <Text size="xs" c="dimmed" mt="xs">
              Machine transcript. It can contain mistakes.
            </Text>
            <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
              {item.transcript}
            </Text>
          </Collapse>
        </div>
      ))}
    </Stack>
  );
}

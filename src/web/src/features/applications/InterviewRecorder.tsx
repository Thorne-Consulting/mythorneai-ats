'use client';

import { useRef, useState } from 'react';
import { ActionIcon, Button, Checkbox, Group, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCopy, IconPlayerRecord, IconPlayerStop, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { formatDateTime } from '@/lib/format';
import type { Interview } from './application-types';

export function InterviewRecorder({
  interview,
  canRecord,
  canDelete,
  onUpdated,
}: {
  interview: Interview;
  canRecord: boolean;
  canDelete: boolean;
  onUpdated: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const upload = useMutation({
    mutationFn: (file: File) =>
      api.upload(`/api/interviews/${interview.id}/recordings?consentConfirmed=true`, file),
    onSuccess: () => {
      onUpdated();
      notifications.show({ color: 'teal', message: 'Recording saved to the interview record' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/interview-recordings/${id}`),
    onSuccess: () => {
      onUpdated();
      notifications.show({ color: 'teal', message: 'Recording deleted' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const copyLink = async (id: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/api/interview-recordings/${id}`);
    notifications.show({ color: 'teal', message: 'Internal recording link copied' });
  };
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const chunks: Blob[] = [];
      const media = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm',
      });
      media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        upload.mutate(
          new File(chunks, `interview-${new Date().toISOString().replaceAll(':', '-')}.webm`, {
            type: 'video/webm',
          }),
        );
        setRecording(false);
      };
      stream.getVideoTracks()[0].onended = () => media.state !== 'inactive' && media.stop();
      recorder.current = media;
      media.start(1000);
      setRecording(true);
    } catch {
      notifications.show({ color: 'red', message: 'Screen recording was not started.' });
    }
  };
  return (
    <Paper radius="md" p="md" mt="md" bg="var(--surface-sunken)">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <div>
          <Text fw={650} size="sm">
            Interview recording
          </Text>
          <Text size="xs" c="dimmed">
            Screen and shared audio stay inside this ATS.
          </Text>
        </div>
        {canRecord &&
          (recording ? (
            <Button
              color="red"
              leftSection={<IconPlayerStop size={15} />}
              onClick={() => recorder.current?.stop()}
            >
              Stop and save
            </Button>
          ) : (
            <Button
              variant="light"
              leftSection={<IconPlayerRecord size={15} />}
              disabled={!consent || upload.isPending}
              onClick={start}
            >
              Record interview
            </Button>
          ))}
      </Group>
      {canRecord && !recording && (
        <Checkbox
          mt="sm"
          checked={consent}
          onChange={(event) => setConsent(event.currentTarget.checked)}
          label="Every participant has explicitly agreed to this recording."
        />
      )}
      {interview.recordings.map((item) => (
        <Group key={item.id} justify="space-between" align="flex-end" mt="md" wrap="wrap" gap="sm">
          <video
            controls
            preload="metadata"
            src={`/api/interview-recordings/${item.id}`}
            style={{ width: 'min(100%, 520px)', borderRadius: 8 }}
          />
          <Stack gap={4} align="flex-end">
            <Text size="xs" c="dimmed">
              {formatDateTime(item.recordedAt)} · {Math.ceil(item.length / 1024 / 1024)} MB
            </Text>
            <Group gap={4}>
              <ActionIcon
                variant="subtle"
                aria-label="Copy internal recording link"
                onClick={() => copyLink(item.id)}
              >
                <IconCopy size={15} />
              </ActionIcon>
              {canDelete && (
                <ActionIcon
                  color="red"
                  variant="subtle"
                  aria-label="Delete recording"
                  loading={remove.isPending}
                  onClick={() => remove.mutate(item.id)}
                >
                  <IconTrash size={15} />
                </ActionIcon>
              )}
            </Group>
          </Stack>
        </Group>
      ))}
    </Paper>
  );
}

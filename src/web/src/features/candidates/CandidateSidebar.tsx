'use client';

import { useState, type ReactNode } from 'react';
import {
  Anchor,
  Button,
  FileButton,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconDownload,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconMail,
  IconMapPin,
  IconPhone,
  IconUpload,
  type Icon,
} from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { formatDate } from '@/lib/format';
import type { CandidateDetail } from '@/types';

export function CandidateSidebar({
  candidate,
  canUpload,
}: {
  candidate: CandidateDetail;
  canUpload: boolean;
}) {
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => api.upload(`/api/candidates/${candidate.id}/attachments`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      notifications.show({ color: 'teal', message: 'Document uploaded' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  return (
    <>
      <Stack gap="lg">
        <Paper withBorder radius="lg" p="lg">
          <Text fw={700} mb="md">
            Contact
          </Text>
          <Stack gap="md">
            <Contact icon={IconMail}>
              <Anchor href={`mailto:${candidate.email}`} size="sm">
                {candidate.email}
              </Anchor>
            </Contact>
            <Contact icon={IconPhone}>
              <Text size="sm">{candidate.phone ?? 'Not provided'}</Text>
            </Contact>
            <Contact icon={IconMapPin}>
              <Text size="sm">{candidate.location ?? 'Not provided'}</Text>
            </Contact>
            {candidate.linkedInUrl && (
              <Contact icon={IconExternalLink}>
                <Anchor href={candidate.linkedInUrl} target="_blank" size="sm">
                  LinkedIn profile
                </Anchor>
              </Contact>
            )}
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Group justify="space-between" mb="md">
            <Text fw={700}>Documents</Text>
            {canUpload && (
              <FileButton onChange={(file) => file && upload.mutate(file)} accept=".pdf,.doc,.docx">
                {(props) => (
                  <Button
                    {...props}
                    size="xs"
                    variant="light"
                    leftSection={<IconUpload size={14} />}
                    loading={upload.isPending}
                  >
                    Upload
                  </Button>
                )}
              </FileButton>
            )}
          </Group>
          <Stack gap="sm">
            {candidate.attachments.map((attachment) => (
              <Group key={attachment.id} justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap">
                  <ThemeIcon color="gray" variant="light">
                    <IconFileText size={16} />
                  </ThemeIcon>
                  <div style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} truncate>
                      {attachment.originalFileName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {Math.ceil(attachment.length / 1024)} KB ·{' '}
                      {attachment.scanStatus === 'ValidationOnly'
                        ? 'Type checked'
                        : attachment.scanStatus}
                    </Text>
                  </div>
                </Group>
                <Group gap={2} wrap="nowrap">
                  {attachment.contentType === 'application/pdf' && (
                    <Button
                      variant="subtle"
                      color="gray"
                      size="compact-sm"
                      aria-label="Preview document"
                      onClick={() =>
                        setPreview({ id: attachment.id, name: attachment.originalFileName })
                      }
                    >
                      <IconEye size={16} />
                    </Button>
                  )}
                  <ActionDownload id={attachment.id} />
                </Group>
              </Group>
            ))}
            {candidate.attachments.length === 0 && (
              <Text size="sm" c="dimmed">
                No resumes or documents.
              </Text>
            )}
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Text fw={700} mb="sm">
            Profile
          </Text>
          <Stack gap="sm">
            <Pair label="Source" value={candidate.source} />
            <Pair label="Added" value={formatDate(candidate.createdAt)} />
            <Pair label="Last updated" value={formatDate(candidate.updatedAt)} />
          </Stack>
        </Paper>
      </Stack>
      <Modal
        opened={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name}
        size="xl"
        centered
      >
        {preview && (
          <iframe
            title={`Preview ${preview.name}`}
            src={`/api/attachments/${preview.id}?inline=true`}
            style={{ width: '100%', height: '75vh', border: 0 }}
          />
        )}
      </Modal>
    </>
  );
}

function Contact({ icon: IconComponent, children }: { icon: Icon; children: ReactNode }) {
  return (
    <Group wrap="nowrap" align="flex-start">
      <ThemeIcon variant="light" color="gray" size={30}>
        <IconComponent size={15} />
      </ThemeIcon>
      {children}
    </Group>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" gap="xl">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={600}>
        {value}
      </Text>
    </Group>
  );
}

function ActionDownload({ id }: { id: string }) {
  return (
    <Button
      component="a"
      href={`/api/attachments/${id}`}
      variant="subtle"
      color="gray"
      size="compact-sm"
      aria-label="Download document"
    >
      <IconDownload size={16} />
    </Button>
  );
}

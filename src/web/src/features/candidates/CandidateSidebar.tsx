'use client';

import { useState, type ReactNode } from 'react';
import {
  Anchor,
  Badge,
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
  IconPencil,
  IconMapPin,
  IconPhone,
  IconRefresh,
  IconUpload,
  type Icon,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { formatDate } from '@/lib/format';
import type { CandidateDetail } from '@/types';
import { PotentialDuplicates } from './PotentialDuplicates';
import { ResumeProfileReviewModal } from './ResumeProfileReviewModal';

export function CandidateSidebar({
  candidate,
  canUpload,
}: {
  candidate: CandidateDetail;
  canUpload: boolean;
}) {
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);
  const [reviewOpened, reviewModal] = useDisclosure(false);
  const queryClient = useQueryClient();
  const upload = useMutation({
    mutationFn: (file: File) => api.upload(`/api/candidates/${candidate.id}/attachments`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      notifications.show({ color: 'teal', message: 'Document uploaded and queued for parsing' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const parseResume = useMutation({
    mutationFn: (attachmentId: string) =>
      api.post(`/api/candidates/${candidate.id}/attachments/${attachmentId}/parse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      queryClient.invalidateQueries({ queryKey: ['talent-search'] });
      notifications.show({ color: 'teal', message: 'Resume parsing queued' });
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not parse resume', message: error.message }),
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
                      {attachment.parseStatus === 'Parsed'
                        ? 'Resume parsed'
                        : attachment.parseStatus === 'Pending' || attachment.parseStatus === 'Processing'
                          ? 'Queued for parsing'
                        : attachment.parseStatus === 'Failed'
                          ? 'Not parsed'
                          : attachment.scanStatus === 'ValidationOnly'
                            ? 'Type checked'
                            : attachment.scanStatus}
                    </Text>
                  </div>
                </Group>
                <Group gap={2} wrap="nowrap">
                  {canUpload && attachment.parseStatus === 'Failed' && (
                    <Button
                      variant="subtle"
                      color="gray"
                      size="compact-sm"
                      aria-label={`Parse ${attachment.originalFileName}`}
                      loading={parseResume.isPending && parseResume.variables === attachment.id}
                      leftSection={<IconRefresh size={15} />}
                      onClick={() => parseResume.mutate(attachment.id)}
                    >
                      Retry
                    </Button>
                  )}
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
        {candidate.resumeParsedAt && (
          <Paper withBorder radius="lg" p="lg">
            <Group justify="space-between" mb="md">
              <Text fw={700}>Resume profile</Text>
              <Group gap="xs">
                <Badge variant="light" color="teal">
                  Parsed
                </Badge>
                {canUpload && (
                  <Button
                    size="compact-sm"
                    variant="subtle"
                    leftSection={<IconPencil size={14} />}
                    onClick={reviewModal.open}
                  >
                    Review
                  </Button>
                )}
              </Group>
            </Group>
            <Stack gap="md">
              {candidate.resumeSummary && (
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {candidate.resumeSummary}
                </Text>
              )}
              {candidate.resumeYearsExperience !== undefined && (
                <Pair
                  label="Estimated experience"
                  value={`${candidate.resumeYearsExperience} years`}
                />
              )}
              {candidate.resumeSkills.length > 0 && (
                <div>
                  <Text size="xs" fw={650} tt="uppercase" c="dimmed" mb={7}>
                    Skills
                  </Text>
                  <Group gap={5}>
                    {candidate.resumeSkills.slice(0, 12).map((skill) => (
                      <Badge key={skill} size="xs" variant="light" color="gray">
                        {skill}
                      </Badge>
                    ))}
                  </Group>
                </div>
              )}
              {candidate.resumeEducation.length > 0 && (
                <div>
                  <Text size="xs" fw={650} tt="uppercase" c="dimmed" mb={5}>
                    Education
                  </Text>
                  <Stack gap={4}>
                    {candidate.resumeEducation.map((item) => (
                      <Text key={item} size="sm">
                        {item}
                      </Text>
                    ))}
                  </Stack>
                </div>
              )}
              <Text size="xs" c="dimmed">
                Parsed {formatDate(candidate.resumeParsedAt)} · Review the source document before
                making a decision.
              </Text>
            </Stack>
          </Paper>
        )}
        {canUpload && <PotentialDuplicates candidateId={candidate.id} />}
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
      <ResumeProfileReviewModal
        candidate={candidate}
        opened={reviewOpened}
        onClose={reviewModal.close}
      />
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

'use client';

import { useState } from 'react';
import {
  Anchor,
  Avatar,
  Badge,
  Box,
  Breadcrumbs,
  Button,
  Divider,
  FileButton,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconArrowRight,
  IconBriefcase2,
  IconDownload,
  IconEye,
  IconExternalLink,
  IconFileText,
  IconMail,
  IconMapPin,
  IconPhone,
  IconPlus,
  IconUpload,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCurrentUser } from '../auth';
import { api } from '../api';
import { formatDate, initials, LoadingBlock, StatusBadge } from '../components/Common';
import type { CandidateDetail, RequisitionSummary } from '../types';

export function CandidateDetailPage({ id }: { id: string }) {
  const [opened, modal] = useDisclosure();
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null);
  const router = useRouter();
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${id}`),
  });
  const canApply = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const canUpload = ['Admin', 'Recruiter'].includes(user.role);
  const upload = useMutation({
    mutationFn: (file: File) => api.upload(`/api/candidates/${id}/attachments`, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', id] });
      notifications.show({ color: 'teal', message: 'Document uploaded' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  if (!query.data) return <LoadingBlock />;
  const candidate = query.data;

  return (
    <div>
      <Breadcrumbs mb="lg" separator="/">
        <Link href="/candidates" className="quiet-link">
          Candidates
        </Link>
        <Text size="sm" c="dimmed">
          {candidate.firstName} {candidate.lastName}
        </Text>
      </Breadcrumbs>
      <Group justify="space-between" align="flex-start" mb="xl">
        <Group align="flex-start" wrap="nowrap">
          <Avatar size={64} radius="xl" color="teal" variant="light">
            {initials(`${candidate.firstName} ${candidate.lastName}`)}
          </Avatar>
          <div>
            <Group gap="sm">
              <Title order={1} fz={{ base: 27, sm: 34 }}>
                {candidate.firstName} {candidate.lastName}
              </Title>
              {candidate.doNotContact && (
                <Badge color="red" variant="light">
                  Do not contact
                </Badge>
              )}
            </Group>
            <Text c="dimmed" mt={4}>
              {candidate.currentTitle ?? 'Candidate'}
            </Text>
            <Group gap={6} mt="sm">
              {candidate.tags.map((tag) => (
                <Badge key={tag} variant="light" color="gray" tt="none">
                  {tag}
                </Badge>
              ))}
            </Group>
          </div>
        </Group>
        {canApply && (
          <Button leftSection={<IconPlus size={17} />} onClick={modal.open}>
            Add to hiring session
          </Button>
        )}
      </Group>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
        <Stack>
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
                <FileButton
                  onChange={(file) => file && upload.mutate(file)}
                  accept=".pdf,.doc,.docx"
                >
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

        <Box style={{ gridColumn: 'span 2' }}>
          <Paper withBorder radius="lg">
            <Group justify="space-between" p="lg">
              <div>
                <Text fw={700}>Applications</Text>
                <Text size="sm" c="dimmed">
                  Every role considered for this person
                </Text>
              </div>
              <Badge variant="light" color="indigo" circle>
                {candidate.applications.length}
              </Badge>
            </Group>
            <Divider />
            <Stack gap={0}>
              {candidate.applications.map((application) => (
                <Box
                  key={application.id}
                  className="list-row"
                  onClick={() => router.push(`/applications/${application.id}`)}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Group wrap="nowrap">
                      <ThemeIcon color="indigo" variant="light">
                        <IconBriefcase2 size={17} />
                      </ThemeIcon>
                      <div>
                        <Text size="sm" fw={650}>
                          {application.requisitionTitle}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {application.requisitionCode} · Applied{' '}
                          {formatDate(application.appliedAt)}
                        </Text>
                      </div>
                    </Group>
                    <Group wrap="nowrap">
                      <Badge variant="light" color="gray" tt="none">
                        {application.stage}
                      </Badge>
                      <StatusBadge status={application.status} />
                      <IconArrowRight size={16} color="var(--mantine-color-gray-5)" />
                    </Group>
                  </Group>
                </Box>
              ))}
              {candidate.applications.length === 0 && (
                <Text c="dimmed" p="xl">
                  No applications yet.
                </Text>
              )}
            </Stack>
          </Paper>
        </Box>
      </SimpleGrid>
      <ApplyModal candidateId={candidate.id} opened={opened} onClose={modal.close} />
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
    </div>
  );
}

function ApplyModal({
  candidateId,
  opened,
  onClose,
}: {
  candidateId: string;
  opened: boolean;
  onClose: () => void;
}) {
  const [requisitionId, setRequisitionId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const requisitions = useQuery({
    queryKey: ['requisitions', 'open'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?status=Open'),
    enabled: opened,
  });
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/applications', { candidateId, requisitionId, source: 'Existing candidate' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      notifications.show({ color: 'teal', message: 'Application created' });
      setRequisitionId(null);
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={<Title order={3}>Add to hiring session</Title>}
      centered
    >
      <Stack>
        <Select
          searchable
          label="Open hiring session"
          placeholder="Choose a role"
          value={requisitionId}
          onChange={setRequisitionId}
          data={
            requisitions.data?.map((item) => ({
              value: item.id,
              label: `${item.code} · ${item.title}`,
            })) ?? []
          }
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!requisitionId}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Create application
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Contact({ icon: Icon, children }: { icon: typeof IconMail; children: React.ReactNode }) {
  return (
    <Group wrap="nowrap" align="flex-start">
      <ThemeIcon variant="light" color="gray" size={30}>
        <Icon size={15} />
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

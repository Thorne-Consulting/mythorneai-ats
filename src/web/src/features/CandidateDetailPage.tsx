'use client';

import { useState } from 'react';
import {
  Anchor,
  Avatar,
  Badge,
  Button,
  FileButton,
  Grid,
  Group,
  Modal,
  Paper,
  Select,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
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
import {
  DetailHeader,
  formatDate,
  initials,
  LoadingBlock,
  SectionCard,
  StatusBadge,
} from '../components/Common';
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
  if (!query.data) return <LoadingBlock rows={5} />;
  const candidate = query.data;

  return (
    <>
      <DetailHeader
        backHref="/candidates"
        backLabel="Candidates"
        current={`${candidate.firstName} ${candidate.lastName}`}
        avatar={
          <Avatar size={60} radius="xl" color="teal" variant="light">
            {initials(`${candidate.firstName} ${candidate.lastName}`)}
          </Avatar>
        }
        title={`${candidate.firstName} ${candidate.lastName}`}
        badges={
          candidate.doNotContact && (
            <Badge color="red" variant="light">
              Do not contact
            </Badge>
          )
        }
        subtitle={candidate.currentTitle ?? 'Candidate'}
        meta={
          candidate.tags.length > 0 && (
            <Group gap={6} mt="sm">
              {candidate.tags.map((tag) => (
                <Badge key={tag} variant="light" color="gray">
                  {tag}
                </Badge>
              ))}
            </Group>
          )
        }
        actions={
          canApply && (
            <Button leftSection={<IconPlus size={17} />} onClick={modal.open}>
              Add to a job
            </Button>
          )
        }
      />

      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, lg: 4 }}>
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
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          <SectionCard
            title="Applications"
            description="Every role considered for this person"
            action={
              <Badge variant="light" color="indigo" circle>
                {candidate.applications.length}
              </Badge>
            }
          >
            <Stack gap={0}>
              {candidate.applications.map((application) => (
                <UnstyledButton
                  key={application.id}
                  className="list-row"
                  data-interactive
                  onClick={() => router.push(`/applications/${application.id}`)}
                >
                  <Group justify="space-between" wrap="nowrap" gap="sm">
                    <Group wrap="nowrap" style={{ minWidth: 0 }}>
                      <ThemeIcon color="indigo" variant="light">
                        <IconBriefcase2 size={17} />
                      </ThemeIcon>
                      <div style={{ minWidth: 0 }}>
                        <Text size="sm" fw={650} truncate>
                          {application.requisitionTitle}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {application.requisitionCode} · Applied{' '}
                          {formatDate(application.appliedAt)}
                        </Text>
                      </div>
                    </Group>
                    <Group wrap="nowrap" gap="xs">
                      <Badge variant="light" color="gray" visibleFrom="sm">
                        {application.stage}
                      </Badge>
                      <StatusBadge status={application.status} />
                      <IconArrowRight size={16} color="var(--mantine-color-gray-5)" />
                    </Group>
                  </Group>
                </UnstyledButton>
              ))}
              {candidate.applications.length === 0 && (
                <Text c="dimmed" p="xl" size="sm">
                  No applications yet.
                </Text>
              )}
            </Stack>
          </SectionCard>
        </Grid.Col>
      </Grid>
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
    </>
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
    <Modal opened={opened} onClose={onClose} title="Add to a job" centered>
      <Stack>
        <Select
          searchable
          label="Open job"
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

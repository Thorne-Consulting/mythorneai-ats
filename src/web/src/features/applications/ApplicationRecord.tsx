'use client';

import { Badge, Box, Button, Grid, Group, Paper, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useCurrentUser } from '@/auth';
import { SectionCard } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  canManageRole,
  LoadError,
  useApplication,
  useInvalidateApplication,
} from './application-data';
import { NoteModal } from './NoteModal';

export function ApplicationRecord({ id }: { id: string }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  const [noteOpened, noteModal] = useDisclosure();
  const canManage = canManageRole(user.role);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data) return <LoadingBlock rows={3} />;
  const application = query.data.application;

  return (
    <>
      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Paper withBorder radius="lg" p="lg" h="100%">
            <Text fw={650} mb="md">
              Applicant
            </Text>
            <Stack gap="sm">
              <Pair label="Email" value={application.candidateEmail} />
              <Pair label="Phone" value={application.candidatePhone ?? '—'} />
              <Pair label="Location" value={application.candidateLocation ?? '—'} />
              <Pair label="Source" value={application.source} />
              <Pair label="Applied" value={formatDate(application.appliedAt)} />
            </Stack>
            {application.candidateTags.length > 0 && (
              <Group gap={6} mt="md">
                {application.candidateTags.map((tag) => (
                  <Badge key={tag} variant="light" color="gray">
                    {tag}
                  </Badge>
                ))}
              </Group>
            )}
            <Button
              component={Link}
              href={`/candidates/${application.candidateId}`}
              variant="light"
              fullWidth
              mt="lg"
            >
              Open resumes and full record
            </Button>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <SectionCard
            title="Review notes"
            description="Job-related facts and decision context"
            action={
              canManage && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={noteModal.open}
                >
                  Add note
                </Button>
              )
            }
          >
            <Stack gap={0}>
              {application.notes.map((note) => (
                <Box key={note.id} className="list-row">
                  <Group justify="space-between" mb={5} wrap="nowrap">
                    <Text size="sm" fw={650} truncate>
                      {note.authorEmail}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(note.createdAt)}
                    </Text>
                  </Group>
                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {note.body}
                  </Text>
                </Box>
              ))}
              {application.notes.length === 0 && (
                <Text p="xl" c="dimmed" size="sm">
                  No review notes yet.
                </Text>
              )}
            </Stack>
          </SectionCard>
        </Grid.Col>
      </Grid>
      <NoteModal
        applicationId={id}
        opened={noteOpened}
        onClose={noteModal.close}
        onSaved={invalidate}
      />
    </>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" wrap="nowrap">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={600} ta="right">
        {value}
      </Text>
    </Group>
  );
}

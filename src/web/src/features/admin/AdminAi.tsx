'use client';

import { Fragment, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Pagination,
  Paper,
  Select,
  SimpleGrid,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { EmptyState, StatCard } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDateTime } from '@/lib/format';

interface AiStatus {
  configured: boolean;
  enabled: boolean;
  model: string;
  embeddingModel: string;
  pendingResumes: number;
  calls30Days: number;
  failed30Days: number;
  promptTokens30Days: number;
  completionTokens30Days: number;
}
interface AiLogItem {
  id: number;
  purpose: string;
  model: string;
  userEmail?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  input: string;
  output: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  error?: string | null;
  createdAt: string;
}

const PAGE_SIZE = 50;
const PURPOSES: Record<string, string> = {
  'draft-message': 'Drafting a message',
  'embed-job': 'Indexing a job',
  'embed-query': 'Understanding a search',
  'embed-resume': 'Indexing a resume',
  'extract-requirements': 'Reading job requirements',
  'interview-questions': 'Suggesting interview questions',
  'job-fit': 'Scoring fit for a job',
  'resume-profile': 'Reading a resume',
  'search-filters': 'Turning a search into filters',
  'summarize-interview': 'Summarizing an interview',
  'transcribe-recording': 'Transcribing a recording',
};
const purposeLabel = (value: string) => PURPOSES[value] ?? value.replace(/-/g, ' ');

export function AdminAi() {
  const [purpose, setPurpose] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | null>(null);
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<AiStatus>('/api/admin/ai/status'),
  });
  const log = useQuery({
    queryKey: ['ai-log', purpose, page],
    queryFn: () =>
      api.get<{ items: AiLogItem[]; total: number; page: number }>(
        `/api/admin/ai/log?page=${page}${purpose ? `&purpose=${encodeURIComponent(purpose)}` : ''}`,
      ),
    placeholderData: (previous) => previous,
  });
  const s = status.data;
  // Include any purpose we see in the log that isn't in the starter list.
  const purposes = Array.from(
    new Set([...Object.keys(PURPOSES), ...(log.data?.items.map((x) => x.purpose) ?? [])]),
  );

  return (
    <>
      <Title order={3}>AI activity</Title>
      <Text c="dimmed" size="sm" mb="lg" maw={680}>
        A record of everything the AI was asked and what it answered, kept for accountability. Use
        it to check what was sent, who asked, and whether anything failed. Long entries are
        shortened here.
      </Text>
      {s && (
        <SimpleGrid cols={{ base: 2, md: 4 }} mb="lg">
          <StatCard label="AI calls, last 30 days" value={s.calls30Days} />
          <StatCard label="Failed" value={s.failed30Days} danger={s.failed30Days > 0} />
          <StatCard
            label="Tokens used"
            value={s.promptTokens30Days + s.completionTokens30Days}
            hint={`${s.promptTokens30Days.toLocaleString()} in, ${s.completionTokens30Days.toLocaleString()} out`}
          />
          <StatCard
            label="Status"
            text={!s.configured ? 'No API key on the server' : s.enabled ? 'On' : 'Turned off'}
            hint={`Model ${s.model}${s.pendingResumes ? ` · ${s.pendingResumes} resumes waiting` : ''}`}
          />
        </SimpleGrid>
      )}
      <Select
        label="Show"
        placeholder="All activity"
        clearable
        maw={280}
        mb="md"
        data={purposes.map((value) => ({ value, label: purposeLabel(value) }))}
        value={purpose}
        onChange={(value) => {
          setPurpose(value);
          setPage(1);
        }}
      />
      {!log.data ? (
        <LoadingBlock rows={4} />
      ) : log.data.items.length === 0 ? (
        <EmptyState
          icon={IconSparkles}
          title="No AI activity yet"
          description={
            purpose
              ? 'Nothing for this filter. Try showing all activity.'
              : 'When someone uses an AI feature, like reading a resume, it is recorded here.'
          }
          actionLabel={purpose ? 'Show all activity' : undefined}
          onAction={() => setPurpose(null)}
        />
      ) : (
        <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>When</Table.Th>
                  <Table.Th>What</Table.Th>
                  <Table.Th>Asked by</Table.Th>
                  <Table.Th ta="right">Tokens</Table.Th>
                  <Table.Th ta="right">Time</Table.Th>
                  <Table.Th>Result</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {log.data.items.map((item) => (
                  <Fragment key={item.id}>
                    <Table.Tr>
                      <Table.Td>{formatDateTime(item.createdAt)}</Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={600}>
                          {purposeLabel(item.purpose)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {item.model}
                          {item.subjectType ? ` · ${item.subjectType}` : ''}
                        </Text>
                      </Table.Td>
                      <Table.Td>{item.userEmail ?? 'System'}</Table.Td>
                      <Table.Td ta="right">
                        {(item.promptTokens + item.completionTokens).toLocaleString()}
                      </Table.Td>
                      <Table.Td ta="right">{(item.latencyMs / 1000).toFixed(1)}s</Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={item.error ? 'red' : 'teal'}>
                          {item.error ? 'Failed' : 'OK'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Button
                          size="compact-sm"
                          variant="subtle"
                          aria-expanded={open === item.id}
                          aria-controls={`ai-entry-${item.id}`}
                          onClick={() => setOpen(open === item.id ? null : item.id)}
                        >
                          {open === item.id ? 'Hide' : 'Read'}
                        </Button>
                      </Table.Td>
                    </Table.Tr>
                    {open === item.id && (
                      <Table.Tr id={`ai-entry-${item.id}`}>
                        <Table.Td colSpan={7} bg="var(--mantine-color-gray-0)">
                          {item.error && (
                            <>
                              <Text size="xs" fw={650} c="red" tt="uppercase">
                                Error
                              </Text>
                              <Text size="sm" c="red" mb="sm">
                                {item.error}
                              </Text>
                            </>
                          )}
                          <Text size="xs" fw={650} c="dimmed" tt="uppercase">
                            What was asked
                          </Text>
                          <Text size="sm" mb="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {item.input || '—'}
                          </Text>
                          <Text size="xs" fw={650} c="dimmed" tt="uppercase">
                            What came back
                          </Text>
                          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                            {item.output || '—'}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Fragment>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      {log.data && log.data.total > PAGE_SIZE && (
        <Group justify="center" mt="lg">
          <Pagination
            total={Math.ceil(log.data.total / PAGE_SIZE)}
            value={page}
            onChange={(value) => {
              setPage(value);
              setOpen(null);
            }}
          />
        </Group>
      )}
    </>
  );
}

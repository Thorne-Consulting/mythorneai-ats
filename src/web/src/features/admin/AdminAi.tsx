'use client';

import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Coins, Cpu, Sparkles } from 'lucide-react';
import { api } from '@/api';
import {
  Badge,
  Button,
  Card,
  CellStack,
  EmptyState,
  FilterSelect,
  Pagination,
  SkeletonRows,
  StatCard,
  StatGrid,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
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
  'embed-job': 'Preparing a job for search',
  'embed-query': 'Understanding a search',
  'embed-resume': 'Preparing a resume for search',
  'extract-requirements': 'Reading job requirements',
  'interview-questions': 'Suggesting interview questions',
  'job-fit': 'Scoring fit for a job',
  'parse-resume': 'Reading a resume',
  'search-filters': 'Turning a search into filters',
  'summarize-interview': 'Summarizing an interview',
  'transcribe-recording': 'Turning a recording into text',
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
      {s && (
        <StatGrid>
          <StatCard
            icon={Activity}
            label="AI requests, last 30 days"
            value={s.calls30Days.toLocaleString()}
          />
          <StatCard
            icon={AlertTriangle}
            tone={s.failed30Days > 0 ? 'red' : 'green'}
            label="Failed"
            value={s.failed30Days.toLocaleString()}
            hint={s.failed30Days > 0 ? 'Open a failed entry to see why' : 'Nothing failed'}
          />
          <StatCard
            icon={Coins}
            tone="amber"
            label="Text processed (tokens)"
            value={(s.promptTokens30Days + s.completionTokens30Days).toLocaleString()}
            hint={`${s.promptTokens30Days.toLocaleString()} sent, ${s.completionTokens30Days.toLocaleString()} received`}
          />
          <StatCard
            icon={Cpu}
            tone="violet"
            label="Status"
            value={!s.configured ? 'No AI key' : s.enabled ? 'On' : 'Turned off'}
            hint={`Model ${s.model}${s.pendingResumes ? ` · ${s.pendingResumes} resumes waiting` : ''}`}
          />
        </StatGrid>
      )}
      <Card className="px-5 pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <FilterSelect
            allLabel="All activity"
            aria-label="Filter by purpose"
            data={purposes.map((value) => ({ value, label: purposeLabel(value) }))}
            value={purpose}
            onChange={(value) => {
              setPurpose(value);
              setPage(1);
            }}
          />
        </div>
        {!log.data ? (
          <SkeletonRows rows={4} className="px-0" />
        ) : log.data.items.length === 0 ? (
          <EmptyState
            compact
            icon={Sparkles}
            title="No AI activity yet"
            description={
              purpose ? undefined : 'Entries show up here as soon as someone uses an AI feature.'
            }
            action={
              purpose ? (
                <Button variant="secondary" onClick={() => setPurpose(null)}>
                  Show all activity
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <TH>When</TH>
                  <TH>What</TH>
                  <TH>Asked by</TH>
                  <TH align="right">Tokens</TH>
                  <TH align="right">Duration</TH>
                  <TH>Result</TH>
                  <TH>
                    <span className="sr-only">Details</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {log.data.items.map((item) => (
                  <Fragment key={item.id}>
                    <TR selected={open === item.id}>
                      <TD className="whitespace-nowrap text-fg-muted tnum">
                        {formatDateTime(item.createdAt)}
                      </TD>
                      <TD>
                        <CellStack
                          primary={purposeLabel(item.purpose)}
                          secondary={`${item.model}${item.subjectType ? ` · ${item.subjectType}` : ''}`}
                        />
                      </TD>
                      <TD className="text-fg-muted">{item.userEmail ?? 'System'}</TD>
                      <TD align="right" className="tnum">
                        {(item.promptTokens + item.completionTokens).toLocaleString()}
                      </TD>
                      <TD align="right" className="tnum">
                        {(item.latencyMs / 1000).toFixed(1)}s
                      </TD>
                      <TD>
                        <Badge dot tone={item.error ? 'red' : 'green'}>
                          {item.error ? 'Failed' : 'OK'}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <Button
                          size="xs"
                          variant="quiet"
                          aria-expanded={open === item.id}
                          aria-controls={`ai-entry-${item.id}`}
                          onClick={() => setOpen(open === item.id ? null : item.id)}
                        >
                          {open === item.id ? 'Hide' : 'Details'}
                        </Button>
                      </TD>
                    </TR>
                    {open === item.id && (
                      <tr id={`ai-entry-${item.id}`}>
                        <td
                          colSpan={7}
                          className="border-b border-border-subtle bg-muted px-4 py-4 text-sm"
                        >
                          {item.error && (
                            <div className="mb-3">
                              <p className="font-medium text-destructive">Error</p>
                              <p className="text-destructive">{item.error}</p>
                            </div>
                          )}
                          <p className="text-xs font-medium text-fg-subtle">What was asked</p>
                          <p className="mt-1 mb-3 whitespace-pre-wrap text-fg">
                            {item.input || '—'}
                          </p>
                          <p className="text-xs font-medium text-fg-subtle">What came back</p>
                          <p className="mt-1 whitespace-pre-wrap text-fg">{item.output || '—'}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </TBody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={log.data.total}
              noun="entries"
              onPageChange={(value) => {
                setPage(value);
                setOpen(null);
              }}
            />
          </>
        )}
      </Card>
    </>
  );
}

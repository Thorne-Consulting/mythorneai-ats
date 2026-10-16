'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Pagination,
  Paper,
  Popover,
  Progress,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBookmark, IconFileSearch, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import type { RequisitionSummary } from '@/types';
import { FitDrawer } from './FitDrawer';

type RankedCandidate = {
  candidateId: string;
  name: string;
  email: string;
  location?: string | null;
  currentTitle?: string | null;
  skills: string[];
  experienceYears?: number | null;
  score: number;
  keywordScore?: number | null;
  semanticScore?: number | null;
  matched: string[];
  missing: string[];
  dismissed: boolean;
  appliedToJob: boolean;
  fitScore?: number | null;
  hasEmbedding: boolean;
};

type RankResponse = {
  items: RankedCandidate[];
  total: number;
  page: number;
  pageSize: number;
  semantic: boolean;
  note?: string | null;
  pending: number;
  dismissed: number;
};

type RankInput = { jobId: string | null; query: string; minYears: number | null; location: string };
type SavedView = { id: string; name: string; paramsJson: string };

const BLANK: RankInput = { jobId: null, query: '', minYears: null, location: '' };

export function RankForJob({
  initialJobId,
  highlightId,
}: {
  initialJobId?: string;
  highlightId?: string;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RankInput>({ ...BLANK, jobId: initialJobId ?? null });
  const [submitted, setSubmitted] = useState<RankInput | null>(
    initialJobId ? { ...BLANK, jobId: initialJobId } : null,
  );
  const [includeDismissed, setIncludeDismissed] = useState(false);
  const [page, setPage] = useState(1);
  const [fitFor, setFitFor] = useState<{ id: string; name: string } | null>(null);
  const [dismissFor, setDismissFor] = useState<RankedCandidate | null>(null);
  const [reason, setReason] = useState('');
  const [saveOpened, setSaveOpened] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [savedId, setSavedId] = useState<string | null>(null);

  const jobs = useQuery({
    queryKey: ['requisitions', 'all'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  // Only jobs you can manage; the API refuses ranking for any other job.
  const manageable = useMemo(
    () =>
      (jobs.data ?? []).filter(
        (job) => user.role !== 'HiringManager' || job.ownerEmail === user.email,
      ),
    [jobs.data, user.email, user.role],
  );
  const job = manageable.find((item) => item.id === submitted?.jobId);

  const views = useQuery({
    queryKey: ['saved-views', 'talent'],
    queryFn: () => api.get<SavedView[]>('/api/saved-views?area=talent'),
  });

  const ranking = useQuery({
    queryKey: ['talent-rank', submitted, includeDismissed, page],
    enabled: !!submitted,
    placeholderData: (previous) => previous,
    queryFn: () =>
      api.post<RankResponse>('/api/talent/rank', {
        requisitionId: submitted!.jobId,
        query: submitted!.query || null,
        minYears: submitted!.minYears,
        location: submitted!.location || null,
        includeDismissed,
        page,
        pageSize: 25,
      }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['talent-rank'] });
  const dismiss = useMutation({
    mutationFn: () =>
      api.post(`/api/requisitions/${submitted!.jobId}/dismissals`, {
        candidateId: dismissFor!.candidateId,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      notifications.show({
        color: 'teal',
        message: `${dismissFor?.name} is hidden from this shortlist. You can bring them back with "Show dismissed".`,
      });
      setDismissFor(null);
      setReason('');
      refresh();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const undo = useMutation({
    mutationFn: (candidateId: string) =>
      api.delete(`/api/requisitions/${submitted!.jobId}/dismissals/${candidateId}`),
    onSuccess: () => {
      notifications.show({ color: 'teal', message: 'Back on the shortlist' });
      refresh();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const addToJob = useMutation({
    mutationFn: (candidateId: string) =>
      api.post('/api/applications', {
        candidateId,
        requisitionId: submitted!.jobId,
        source: 'Existing candidate',
      }),
    onSuccess: () => {
      notifications.show({
        color: 'teal',
        message: 'Added to this job. Find them on its pipeline.',
      });
      queryClient.invalidateQueries({ queryKey: ['board'] });
      refresh();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const saveView = useMutation({
    mutationFn: () =>
      api.post('/api/saved-views', {
        area: 'talent',
        name: saveName.trim(),
        paramsJson: JSON.stringify(form),
      }),
    onSuccess: () => {
      notifications.show({ color: 'teal', message: `Saved "${saveName.trim()}"` });
      setSaveName('');
      setSaveOpened(false);
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'talent'] });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const deleteView = useMutation({
    mutationFn: (id: string) => api.delete(`/api/saved-views/${id}`),
    onSuccess: () => {
      setSavedId(null);
      notifications.show({ color: 'teal', message: 'Saved view removed' });
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'talent'] });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  const run = (value: RankInput) => {
    setPage(1);
    setSubmitted(value);
  };
  const loadView = (id: string | null) => {
    setSavedId(id);
    const view = views.data?.find((item) => item.id === id);
    if (!view) return;
    try {
      const value = { ...BLANK, ...(JSON.parse(view.paramsJson) as Partial<RankInput>) };
      setForm(value);
      run(value);
    } catch {
      notifications.show({ color: 'red', message: "That saved view couldn't be read." });
    }
  };

  useEffect(() => {
    if (!highlightId || !ranking.data) return;
    document.getElementById(`candidate-${highlightId}`)?.scrollIntoView({ block: 'center' });
  }, [highlightId, ranking.data]);

  const data = ranking.data;
  return (
    <Stack gap="lg">
      <Paper withBorder radius="lg" p="md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(form);
          }}
        >
          <Stack gap="sm">
            <Group align="flex-end" wrap="wrap" gap="sm">
              <Select
                label="Job"
                placeholder={jobs.isLoading ? 'Loading jobs…' : 'Pick a job'}
                searchable
                required
                value={form.jobId}
                onChange={(jobId) => setForm({ ...form, jobId })}
                data={manageable.map((item) => ({
                  value: item.id,
                  label: `${item.code} · ${item.title}`,
                }))}
                nothingFoundMessage="You don't manage any jobs yet"
                style={{ flex: '1 1 260px' }}
              />
              <TextInput
                label="What you're looking for (optional)"
                placeholder="Senior backend engineers who have built payment systems"
                value={form.query}
                onChange={(event) => setForm({ ...form, query: event.currentTarget.value })}
                style={{ flex: '2 1 320px' }}
              />
            </Group>
            <Group align="flex-end" wrap="wrap" gap="sm">
              <NumberInput
                label="Minimum years"
                description="Overrides the job's"
                min={0}
                max={60}
                w={150}
                value={form.minYears ?? ''}
                onChange={(value) =>
                  setForm({ ...form, minYears: value === '' ? null : Number(value) })
                }
              />
              <TextInput
                label="Location"
                placeholder="City or region"
                value={form.location}
                onChange={(event) => setForm({ ...form, location: event.currentTarget.value })}
              />
              <Button type="submit" disabled={!form.jobId}>
                Rank candidates
              </Button>
              <div style={{ flex: 1 }} />
              <Select
                clearable
                label="Saved views"
                placeholder={views.data?.length ? 'Choose a saved view' : 'None saved yet'}
                value={savedId}
                onChange={loadView}
                data={(views.data ?? []).map((view) => ({ value: view.id, label: view.name }))}
                w={210}
              />
              {savedId && (
                <Button
                  variant="subtle"
                  color="red"
                  loading={deleteView.isPending}
                  onClick={() => deleteView.mutate(savedId)}
                >
                  Delete view
                </Button>
              )}
              <Popover
                opened={saveOpened}
                onChange={setSaveOpened}
                position="bottom-end"
                withArrow
                width={280}
              >
                <Popover.Target>
                  <Button
                    variant="default"
                    leftSection={<IconBookmark size={15} />}
                    disabled={!form.jobId}
                    onClick={() => setSaveOpened((value) => !value)}
                  >
                    Save this view
                  </Button>
                </Popover.Target>
                <Popover.Dropdown>
                  <Stack gap="sm">
                    <TextInput
                      label="Name"
                      placeholder="e.g. Payments leads"
                      value={saveName}
                      onChange={(event) => setSaveName(event.currentTarget.value)}
                      data-autofocus
                    />
                    <Button
                      size="sm"
                      disabled={!saveName.trim()}
                      loading={saveView.isPending}
                      onClick={() => saveView.mutate()}
                    >
                      Save
                    </Button>
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            </Group>
          </Stack>
        </form>
      </Paper>

      {!submitted ? (
        <EmptyState
          icon={IconFileSearch}
          title="Build a shortlist for a job"
          description="Pick a job and we'll rank the people already in your database against what the job needs. Add a plain-language request to narrow it down."
        />
      ) : ranking.isError ? (
        <Alert color="red" title="Couldn't build the shortlist">
          {ranking.error.message}
        </Alert>
      ) : !data ? (
        <LoadingBlock rows={5} />
      ) : (
        <Stack gap="md">
          {data.note && (
            <Alert color="gray" variant="light" icon={<IconInfoCircle size={17} />}>
              {data.note}
              {job && /requirements/i.test(data.note) && (
                <>
                  {' '}
                  <Anchor component={Link} href={`/requisitions/${job.id}/details`} size="sm">
                    Open the job&apos;s details to confirm them
                  </Anchor>
                </>
              )}
            </Alert>
          )}
          {data.pending > 0 && (
            <Text size="sm" c="dimmed">
              {data.pending} {data.pending === 1 ? 'resume is' : 'resumes are'} still being indexed,
              so some people may rank lower than they should for now.
            </Text>
          )}
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Text size="sm" c="dimmed" aria-live="polite">
              {data.total} {data.total === 1 ? 'candidate' : 'candidates'}
              {job ? ` ranked for ${job.title}` : ''}. Scores are drafts to help you scan, not
              decisions.
            </Text>
            {(data.dismissed > 0 || includeDismissed) && (
              <Checkbox
                label={`Show ${data.dismissed} dismissed`}
                checked={includeDismissed}
                onChange={(event) => {
                  setIncludeDismissed(event.currentTarget.checked);
                  setPage(1);
                }}
              />
            )}
          </Group>
          {data.items.length === 0 ? (
            <EmptyState
              icon={IconFileSearch}
              title="No one to show"
              description="Try removing the minimum years or location, or describe the person in different words."
            />
          ) : (
            <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
              {data.items.map((item, index) => (
                <Row
                  key={item.candidateId}
                  item={item}
                  first={index === 0}
                  highlighted={item.candidateId === highlightId}
                  hasJob
                  busy={undo.isPending || addToJob.isPending}
                  onAssess={() => setFitFor({ id: item.candidateId, name: item.name })}
                  onDismiss={() => setDismissFor(item)}
                  onUndo={() => undo.mutate(item.candidateId)}
                  onAdd={() => addToJob.mutate(item.candidateId)}
                />
              ))}
            </Paper>
          )}
          {data.total > data.pageSize && (
            <Pagination
              ml="auto"
              value={page}
              onChange={setPage}
              total={Math.ceil(data.total / data.pageSize)}
            />
          )}
        </Stack>
      )}

      {submitted?.jobId && (
        <FitDrawer
          requisitionId={submitted.jobId}
          candidate={fitFor}
          onClose={() => setFitFor(null)}
        />
      )}
      <Modal
        opened={!!dismissFor}
        onClose={() => setDismissFor(null)}
        title={`Not a fit: ${dismissFor?.name ?? ''}`}
        centered
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim()) dismiss.mutate();
          }}
        >
          <Stack>
            <Text size="sm" c="dimmed">
              They are hidden from this job&apos;s shortlist only. Their profile and other
              applications are untouched.
            </Text>
            <Textarea
              label="Why isn't this person a fit for this job?"
              required
              autosize
              minRows={3}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
              data-autofocus
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDismissFor(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!reason.trim()} loading={dismiss.isPending}>
                Hide from shortlist
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}

function Row({
  item,
  first,
  highlighted,
  busy,
  onAssess,
  onDismiss,
  onUndo,
  onAdd,
}: {
  item: RankedCandidate;
  first: boolean;
  highlighted: boolean;
  hasJob: boolean;
  busy: boolean;
  onAssess: () => void;
  onDismiss: () => void;
  onUndo: () => void;
  onAdd: () => void;
}) {
  const detail = [
    item.currentTitle,
    item.location,
    item.experienceYears != null ? `${item.experienceYears} years` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div
      id={`candidate-${item.candidateId}`}
      style={{
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap',
        padding: 16,
        borderTop: first ? undefined : '1px solid var(--mantine-color-default-border)',
        background: highlighted ? 'var(--accent-wash, rgba(76,110,245,0.1))' : undefined,
        opacity: item.dismissed ? 0.6 : 1,
      }}
    >
      <div style={{ width: 84 }} aria-label={`Match score ${item.score} out of 100`} role="img">
        <Text fz={22} fw={650} lh={1} className="tnum">
          {item.score}
        </Text>
        <Progress value={item.score} size={4} mt={6} aria-hidden />
        <Text size="xs" c="dimmed" mt={4}>
          match
        </Text>
      </div>
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <Group gap="xs" wrap="wrap">
          <Anchor component={Link} href={`/candidates/${item.candidateId}`} fw={650} size="sm">
            {item.name}
          </Anchor>
          {item.appliedToJob && (
            <Badge size="xs" variant="default" tt="none">
              Already applied
            </Badge>
          )}
          {item.dismissed && (
            <Badge size="xs" variant="default" tt="none">
              Dismissed
            </Badge>
          )}
          {item.fitScore != null && (
            <Badge size="xs" variant="light" tt="none">
              Assessed: {item.fitScore}
            </Badge>
          )}
        </Group>
        <Text size="xs" c="dimmed">
          {detail || 'No title or location on file'}
        </Text>
        {(item.matched.length > 0 || item.missing.length > 0) && (
          <Group gap={5} mt={8}>
            {item.matched.map((term) => (
              <Badge key={`m-${term}`} size="sm" variant="light" color="gray" tt="none" fw={500}>
                {term}
              </Badge>
            ))}
          </Group>
        )}
        {item.missing.length > 0 && (
          <Text size="xs" c="dimmed" mt={4}>
            Not mentioned by name: {item.missing.join(', ')}. Run the assessment to check properly.
          </Text>
        )}
        {!item.hasEmbedding && (
          <Text size="xs" c="dimmed" mt={6}>
            No resume read yet, so this score uses keywords only.
          </Text>
        )}
      </div>
      <Group gap="xs" align="flex-start" wrap="wrap">
        <Button size="compact-sm" variant="light" onClick={onAssess}>
          Why this ranking
        </Button>
        {item.dismissed ? (
          <Button size="compact-sm" variant="default" disabled={busy} onClick={onUndo}>
            Undo dismiss
          </Button>
        ) : (
          <Button size="compact-sm" variant="default" onClick={onDismiss}>
            Not a fit
          </Button>
        )}
        {!item.appliedToJob && !item.dismissed && (
          <Button size="compact-sm" variant="default" disabled={busy} onClick={onAdd}>
            Add to this job
          </Button>
        )}
      </Group>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button, Text, TextInput } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { statusColors } from '@/components/ui/Badges';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { formatDate, formatRelative, humanize } from '@/lib/format';
import { rowLinkProps } from '@/lib/row-link-props';
import type { RequisitionSummary } from '@/types';
import { useCurrentUser } from '@/auth';

const STATUSES = ['Open', 'PendingApproval', 'Draft', 'OnHold', 'Filled', 'Closed', 'Cancelled'];
// These columns show even when empty, so the board keeps its shape.
const ALWAYS_SHOWN = ['Open', 'Draft', 'OnHold'];
const TEAM_COLORS = ['indigo', 'teal', 'grape', 'orange', 'cyan', 'pink', 'lime', 'violet'];

/** The same team always gets the same colour. */
const teamColor = (team: string) =>
  TEAM_COLORS[[...team].reduce((sum, char) => sum + char.charCodeAt(0), 0) % TEAM_COLORS.length];

/** "priya.manager@acme.com" reads as "Priya Manager". */
const nameFromEmail = (email: string) =>
  email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/** Every job on one board, a column per status. Drag a card to change its status. */
export function RequisitionsPage({ initialData }: { initialData: RequisitionSummary[] }) {
  const [search, setSearch] = useState('');
  const router = useRouter();
  const user = useCurrentUser();
  const canCreate = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const query = useQuery({
    queryKey: ['requisitions', search],
    queryFn: () =>
      api.get<RequisitionSummary[]>(`/api/requisitions?search=${encodeURIComponent(search)}`),
    initialData: !search ? initialData : undefined,
  });
  const rows = query.data ?? [];
  const columns = STATUSES.filter(
    (value) => ALWAYS_SHOWN.includes(value) || rows.some((item) => item.status === value),
  ).map((value) => ({
    value,
    color: statusColors[value] ?? 'gray',
    items: rows.filter((item) => item.status === value),
  }));
  const go = (item: RequisitionSummary) =>
    rowLinkProps(`Open ${item.title}`, () => router.push(`/requisitions/${item.id}`));

  // Drag a card to another column to change the job's status. The card moves at once and moves
  // back if the server refuses (for example, opening a job that still needs approval).
  const queryClient = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const cacheKey = ['requisitions', search];
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch<void>(`/api/requisitions/${id}/status`, { status, reason: null }),
    onMutate: ({ id, status }) => {
      const before = queryClient.getQueryData<RequisitionSummary[]>(cacheKey);
      queryClient.setQueryData<RequisitionSummary[]>(cacheKey, (list) =>
        list?.map((item) => (item.id === id ? { ...item, status } : item)),
      );
      return { before };
    },
    onError: (error: Error, _vars, context) => {
      queryClient.setQueryData(cacheKey, context?.before);
      notifications.show({ color: 'red', title: 'Could not move the job', message: error.message });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['requisitions'] }),
  });
  const dragProps = (item: RequisitionSummary) =>
    canCreate
      ? {
          draggable: true,
          'data-dragging': dragId === item.id || undefined,
          onDragStart: (event: React.DragEvent) => {
            event.dataTransfer.setData('text/plain', item.id);
            event.dataTransfer.effectAllowed = 'move';
            setDragId(item.id);
          },
          onDragEnd: () => {
            setDragId(null);
            setOver(null);
          },
        }
      : {};
  // Pending approval only comes from submitting for approval, so nothing drops there.
  const dropProps = (status: string) =>
    !canCreate || status === 'PendingApproval'
      ? {}
      : {
          'data-over': over === status || undefined,
          onDragOver: (event: React.DragEvent) => {
            if (!dragId) return;
            event.preventDefault();
            setOver(status);
          },
          onDragLeave: (event: React.DragEvent) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setOver(null);
          },
          onDrop: (event: React.DragEvent) => {
            event.preventDefault();
            setOver(null);
            const job = rows.find((item) => item.id === event.dataTransfer.getData('text/plain'));
            if (job && job.status !== status) move.mutate({ id: job.id, status });
          },
        };

  return (
    <>
      <PageHeader
        title="Jobs"
        actions={
          canCreate && (
            <Button
              leftSection={<IconPlus size={17} />}
              onClick={() => router.push('/requisitions/new')}
            >
              New job
            </Button>
          )
        }
      />
      <div className="board-bar">
        <TextInput
          className="board-search"
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          placeholder="Find a job"
          aria-label="Search jobs"
          leftSection={<IconSearch size={15} />}
          radius="xl"
        />
        <Text size="sm" c="dimmed">
          {rows.length} {rows.length === 1 ? 'job' : 'jobs'}
        </Text>
      </div>
      {!query.data ? (
        <LoadingBlock />
      ) : (
        <div className="board">
          {columns.map(({ value, color, items }) => (
            <section
              key={value}
              className="board-col"
              style={{ background: `var(--mantine-color-${color}-light)` }}
              aria-label={humanize(value)}
              {...dropProps(value)}
            >
              <div className="board-col-head">
                <span
                  className="board-dot"
                  style={{ background: `var(--mantine-color-${color}-6)` }}
                />
                {humanize(value)}
                <span className="board-count">{items.length}</span>
              </div>
              {items.length === 0 && <p className="board-empty">Drop a job here</p>}
              {items.map((item) => (
                <div
                  key={item.id}
                  {...go(item)}
                  {...dragProps(item)}
                  className="job-card clickable-row"
                >
                  <span
                    className="job-card-team"
                    style={{
                      color: `var(--mantine-color-${teamColor(item.department)}-light-color)`,
                    }}
                  >
                    {item.department}
                  </span>
                  <p className="job-card-title">{item.title}</p>
                  <span className="job-card-count">
                    <b>{item.activeApplications}</b>
                    <span>candidates</span>
                  </span>
                  <span className="job-card-place">
                    {item.location} · {item.workMode}
                  </span>
                  <dl className="job-card-facts">
                    <dt>Openings</dt>
                    <dd>{item.openings}</dd>
                    <dt>Contract</dt>
                    <dd>{item.employmentType}</dd>
                    <dt>Start</dt>
                    <dd>{formatDate(item.targetStartDate)}</dd>
                    <dt>Hiring manager</dt>
                    <dd>{nameFromEmail(item.ownerEmail)}</dd>
                    <dt>Updated</dt>
                    <dd>{formatRelative(item.updatedAt)}</dd>
                  </dl>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

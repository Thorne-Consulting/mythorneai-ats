'use client';

import { useState } from 'react';
import { Button, Text, TextInput } from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { statusColors } from '@/components/ui/Badges';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { humanize } from '@/lib/format';
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

const initials = (email: string) =>
  nameFromEmail(email)
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('');

/** "Starts in 4 months", "Started 2 weeks ago". */
function startsIn(value?: string) {
  if (!value) return 'No start date';
  const days = Math.round((new Date(value).getTime() - Date.now()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const [amount, unit]: [number, Intl.RelativeTimeFormatUnit] =
    Math.abs(days) >= 60
      ? [Math.round(days / 30), 'month']
      : Math.abs(days) >= 14
        ? [Math.round(days / 7), 'week']
        : [days, 'day'];
  return `${days >= 0 ? 'Starts' : 'Started'} ${rtf.format(amount, unit)}`;
}

/** Every job on one board, a column per status. */
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
          {STATUSES.filter(
            (value) => ALWAYS_SHOWN.includes(value) || rows.some((item) => item.status === value),
          ).map((value) => {
            const color = statusColors[value] ?? 'gray';
            const column = rows.filter((item) => item.status === value);
            return (
              <section
                key={value}
                className="board-col"
                style={{ background: `var(--mantine-color-${color}-light)` }}
                aria-label={humanize(value)}
              >
                <div className="board-col-head">
                  <span
                    className="board-dot"
                    style={{ background: `var(--mantine-color-${color}-6)` }}
                  />
                  {humanize(value)}
                  <span className="board-count">{column.length}</span>
                </div>
                {column.length === 0 && <p className="board-empty">Nothing here</p>}
                {column.map((item) => {
                  const team = teamColor(item.department);
                  return (
                    <div
                      key={item.id}
                      {...rowLinkProps(`Open ${item.title}`, () =>
                        router.push(`/requisitions/${item.id}`),
                      )}
                      className="board-card clickable-row"
                    >
                      <span
                        className="board-team"
                        style={{
                          background: `var(--mantine-color-${team}-light)`,
                          color: `var(--mantine-color-${team}-light-color)`,
                        }}
                      >
                        {item.department}
                      </span>
                      <p className="board-title">{item.title}</p>
                      <span className="board-meta">
                        {item.location} · {item.workMode}
                      </span>
                      <div className="board-foot">
                        <span>
                          <strong>{item.activeApplications}</strong> candidates
                        </span>
                        <span>{startsIn(item.targetStartDate)}</span>
                        <span
                          className="board-avatar"
                          title={nameFromEmail(item.ownerEmail)}
                          aria-hidden
                        >
                          {initials(item.ownerEmail)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

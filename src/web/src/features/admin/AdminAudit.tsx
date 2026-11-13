'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Avatar,
  Button,
  Card,
  CellStack,
  Code,
  EmptyState,
  FilterSelect,
  Pagination,
  SearchInput,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
} from '@/components/ui';
import { formatDateTime, humanize } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import { type AuditEvent, isAdmin } from './admin-data';

const PAGE_SIZE = 25;

export function AdminAudit() {
  const currentUser = useCurrentUser();
  const [entityType, setEntityType] = useState<string | null>(null);
  const [actor, setActor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search).trim().toLowerCase();
  const [page, setPage] = useState(1);
  // The API filters by entity type and returns the latest 250 events.
  const audit = useQuery({
    queryKey: ['audit', entityType],
    queryFn: () =>
      api.get<AuditEvent[]>(
        `/api/admin/audit${entityType ? `?entityType=${encodeURIComponent(entityType)}` : ''}`,
      ),
    enabled: isAdmin(currentUser.role),
    placeholderData: (previous) => previous,
  });
  // Remember every type we've seen so the filter keeps its options while filtered.
  const [types, setTypes] = useState<string[]>([]);
  const events = audit.data ?? [];
  const seen = [...new Set(events.map((e) => e.entityType))];
  if (seen.some((t) => !types.includes(t))) setTypes([...new Set([...types, ...seen])].sort());
  const actors = [...new Set(events.map((e) => e.actorEmail))].sort();
  const filtered = events.filter(
    (e) =>
      (!actor || e.actorEmail === actor) &&
      (!q ||
        humanize(e.action).toLowerCase().includes(q) ||
        e.entityId.toLowerCase().includes(q) ||
        e.actorEmail.toLowerCase().includes(q)),
  );
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const reset = () => {
    setEntityType(null);
    setActor(null);
    setSearch('');
    setPage(1);
  };

  return (
    <Card className="px-5 pb-2">
      <div className="flex flex-wrap items-center gap-2 py-4">
        <SearchInput
          value={search}
          onValueChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search events, ids or people"
          className="w-full sm:w-72"
        />
        <FilterSelect
          value={entityType}
          onChange={(v) => {
            setEntityType(v);
            setActor(null);
            setPage(1);
          }}
          data={types}
          allLabel="All records"
          aria-label="Filter by record type"
        />
        <FilterSelect
          value={actor}
          onChange={(v) => {
            setActor(v);
            setPage(1);
          }}
          data={actors}
          allLabel="Anyone"
          aria-label="Filter by person"
        />
      </div>
      {!audit.data ? (
        <SkeletonRows rows={5} className="px-0" />
      ) : filtered.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title={events.length ? 'No events match these filters' : 'Nothing recorded yet'}
          description={
            events.length
              ? undefined
              : 'Sign-ins, role changes and other important actions appear here.'
          }
          action={
            events.length || entityType ? (
              <Button variant="secondary" onClick={reset}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Table className="min-w-[760px]">
            <THead>
              <tr>
                <TH>Event</TH>
                <TH>Record</TH>
                <TH>Done by</TH>
                <TH>Time</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((event) => (
                <TR key={event.id}>
                  <TD className="font-medium">{humanize(event.action)}</TD>
                  <TD>
                    <span className="text-fg">{event.entityType}</span>{' '}
                    <Code className="text-2xs text-fg-subtle">{event.entityId.slice(0, 12)}</Code>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={event.actorEmail} size="xs" />
                      <CellStack
                        primary={<span className="font-normal">{event.actorEmail}</span>}
                      />
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-fg-muted tnum">
                    {formatDateTime(event.occurredAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
            noun="events"
          />
        </>
      )}
    </Card>
  );
}

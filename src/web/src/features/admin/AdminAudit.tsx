'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Download, ScrollText, X } from 'lucide-react';
import { api } from '@/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  DescriptionList,
  Drawer,
  EmptyState,
  FilterSelect,
  Input,
  SearchSelect,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tooltip,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import type { AuditEvent, AuditPage } from './admin-data';
import {
  DENIAL_REASONS,
  auditVerb,
  parseChanges,
  parseDetails,
  spaced,
  typeLabel,
} from './audit-text';
import { SettingsHeader } from './SettingsShell';

type Filters = {
  actor: string | null;
  type: string | null;
  action: string | null;
  from: string;
  to: string;
  entityId: string | null;
};

const exact = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function query(filters: Filters, cursor?: string | null, limit?: number) {
  const params = new URLSearchParams();
  if (filters.actor) params.set('actor', filters.actor);
  if (filters.type) params.set('type', filters.type);
  if (filters.action) params.set('action', filters.action);
  if (filters.entityId) params.set('entityId', filters.entityId);
  // Whole days in the reader's time zone.
  if (filters.from) params.set('from', new Date(`${filters.from}T00:00`).toISOString());
  if (filters.to) {
    const end = new Date(`${filters.to}T00:00`);
    end.setDate(end.getDate() + 1);
    params.set('to', end.toISOString());
  }
  if (cursor) params.set('cursor', cursor);
  if (limit) params.set('limit', String(limit));
  return params.toString();
}

/** Recent activity, newest first, for the Members drawer. */
export function useAuditEvents(filters: Partial<Filters>, limit: number) {
  const full: Filters = {
    actor: null,
    type: null,
    action: null,
    from: '',
    to: '',
    entityId: null,
    ...filters,
  };
  return useQuery({
    queryKey: ['audit', 'recent', full, limit],
    queryFn: () => api.get<AuditPage>(`/api/admin/audit?${query(full, null, limit)}`),
  });
}

/** Settings → Activity history: who did what, as sentences, filtered and paged on the server. */
export function AdminAudit() {
  const params = useSearchParams();
  // A link to one record's history (?type=&entityId=) starts the filters over.
  return <ActivityHistory key={params?.toString() ?? ''} params={params} />;
}

function ActivityHistory({ params }: { params: ReturnType<typeof useSearchParams> }) {
  const [filters, setFilters] = useState<Filters>(() => ({
    actor: params?.get('actor') ?? null,
    type: params?.get('type') ?? null,
    action: null,
    from: '',
    to: '',
    entityId: params?.get('entityId') ?? null,
  }));
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const set = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));
  const facets = useQuery({
    queryKey: ['audit', 'facets'],
    queryFn: () =>
      api.get<{
        types: string[];
        actions: string[];
        actors: { email: string; name?: string | null }[];
      }>('/api/admin/audit/facets'),
  });
  const audit = useInfiniteQuery({
    queryKey: ['audit', filters],
    queryFn: ({ pageParam }) => api.get<AuditPage>(`/api/admin/audit?${query(filters, pageParam)}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: (previous) => previous,
  });
  const events = useMemo(() => audit.data?.pages.flatMap((page) => page.items) ?? [], [audit.data]);
  const filtered =
    !!filters.actor ||
    !!filters.type ||
    !!filters.action ||
    !!filters.from ||
    !!filters.to ||
    !!filters.entityId;
  const reset = () =>
    setFilters({ actor: null, type: null, action: null, from: '', to: '', entityId: null });
  const badRange = !!filters.from && !!filters.to && filters.from > filters.to;

  return (
    <>
      <SettingsHeader
        actions={
          <Button asChild variant="secondary" leftIcon={<Download />}>
            <a href={`/api/admin/audit/export?${query(filters)}`} download>
              Export spreadsheet (CSV)
            </a>
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end gap-2 border-b border-border-subtle px-4 py-3 sm:px-5">
          <SearchSelect
            className="w-full sm:w-56"
            placeholder="Anyone"
            data={(facets.data?.actors ?? []).map((a) => ({
              value: a.email,
              label: a.name ? `${a.name} (${a.email})` : a.email,
            }))}
            value={filters.actor}
            onChange={(actor) => set({ actor })}
          />
          <FilterSelect
            value={filters.type}
            onChange={(type) => set({ type, entityId: null })}
            data={(facets.data?.types ?? []).map((t) => ({ value: t, label: typeLabel(t) }))}
            allLabel="Any record"
            aria-label="Filter by record type"
          />
          <FilterSelect
            value={filters.action}
            onChange={(action) => set({ action })}
            data={(facets.data?.actions ?? []).map((a) => ({ value: a, label: spaced(a) }))}
            allLabel="Any action"
            aria-label="Filter by action"
          />
          <div className="flex items-center gap-2">
            <Input
              type="date"
              aria-label="From date"
              className="w-[150px]"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => set({ from: event.currentTarget.value })}
            />
            <span className="text-sm text-fg-subtle">to</span>
            <Input
              type="date"
              aria-label="To date"
              className="w-[150px]"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => set({ to: event.currentTarget.value })}
            />
          </div>
          {filtered && (
            <Button variant="quiet" leftIcon={<X />} onClick={reset}>
              Clear filters
            </Button>
          )}
        </div>
        {filters.entityId && (
          <p className="border-b border-border-subtle bg-muted px-5 py-2 text-sm text-fg-muted">
            Showing the history of one {typeLabel(filters.type ?? '').toLowerCase()}.
          </p>
        )}
        {badRange ? (
          <EmptyState
            compact
            icon={ScrollText}
            title="The start date is after the end date"
            description="Pick dates in order."
          />
        ) : !audit.data ? (
          <SkeletonRows rows={6} />
        ) : events.length === 0 ? (
          <EmptyState
            compact
            icon={ScrollText}
            title={filtered ? 'Nothing matches these filters' : 'Nothing recorded yet'}
            description={
              filtered
                ? 'Try another person, record or date.'
                : 'Sign-ins, invitations, role changes and edits show up here as they happen.'
            }
            action={
              filtered ? (
                <Button variant="secondary" onClick={reset}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border-subtle">
              {events.map((event) => (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(event)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none sm:px-5"
                  >
                    <Avatar name={event.actorName ?? event.actorEmail} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-fg-muted">
                        <AuditSentence event={event} />
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
                        {auditVerb(event.action).record !== false && (
                          <>
                            <span>{typeLabel(event.entityType)}</span>
                            <span aria-hidden>·</span>
                          </>
                        )}
                        <Tooltip label={exact.format(new Date(event.occurredAt))}>
                          <time dateTime={event.occurredAt}>
                            {formatRelative(event.occurredAt)}
                          </time>
                        </Tooltip>
                        {event.changes && (
                          <>
                            <span aria-hidden>·</span>
                            <span>
                              {parseChanges(event.changes).length}{' '}
                              {parseChanges(event.changes).length === 1 ? 'field' : 'fields'}{' '}
                              changed
                            </span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {audit.hasNextPage && (
              <div className="border-t border-border-subtle px-5 py-3 text-center">
                <Button
                  variant="secondary"
                  loading={audit.isFetchingNextPage}
                  onClick={() => audit.fetchNextPage()}
                >
                  Show older activity
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      <AuditDrawer event={open} onClose={() => setOpen(null)} />
    </>
  );
}

function Strong({ children, href }: { children: ReactNode; href?: string | null }) {
  return href ? (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
      className="font-medium text-fg hover:text-accent-foreground hover:underline"
    >
      {children}
    </Link>
  ) : (
    <span className="font-medium text-fg">{children}</span>
  );
}

/** "Avery Admin moved Blake Rivera from Review to Interview on Data analyst." */
export function AuditSentence({ event, link = false }: { event: AuditEvent; link?: boolean }) {
  const { verb, record } = auditVerb(event.action);
  const actor =
    event.actorEmail === 'system' ? 'MyThorneAI' : (event.actorName ?? event.actorEmail);
  const label =
    event.label ?? `a ${typeLabel(event.entityType).toLowerCase()} that no longer exists`;
  const reason =
    event.action === 'SignInDenied'
      ? (() => {
          const details = parseDetails(event.details);
          const code = Array.isArray(details) ? details.find(([k]) => k === 'Reason')?.[1] : null;
          return code ? ` (${DENIAL_REASONS[code] ?? code})` : '';
        })()
      : '';
  return (
    <>
      <span className="font-medium text-fg">{actor}</span> {verb}
      {record !== false && (
        <>
          {' '}
          <Strong href={link ? event.href : null}>{label}</Strong>
        </>
      )}
      {event.fromStage && ` from ${event.fromStage}`}
      {event.toStage && ` to ${event.toStage}`}
      {event.job && (
        <>
          {' on '}
          <Strong href={link ? event.jobHref : null}>{event.job}</Strong>
        </>
      )}
      {reason}
    </>
  );
}

function AuditDrawer({ event, onClose }: { event: AuditEvent | null; onClose: () => void }) {
  const changes = parseChanges(event?.changes);
  const details = parseDetails(event?.details);
  return (
    <Drawer opened={event !== null} onClose={onClose} title="Activity" size="md">
      {event && (
        <div className="flex flex-col gap-5">
          <p className="text-base text-fg-muted">
            <AuditSentence event={event} link />
          </p>
          <DescriptionList
            columns={2}
            items={[
              { label: 'When', value: exact.format(new Date(event.occurredAt)) },
              {
                label: 'Who',
                value: event.actorName
                  ? `${event.actorName} (${event.actorEmail})`
                  : event.actorEmail,
              },
              {
                label: 'Record',
                value: event.href ? (
                  <Link href={event.href} className="text-accent-foreground hover:underline">
                    {event.label ?? typeLabel(event.entityType)}
                  </Link>
                ) : (
                  (event.label ?? typeLabel(event.entityType))
                ),
              },
              { label: 'Type', value: typeLabel(event.entityType) },
            ]}
          />
          {changes.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-semibold text-fg">What changed</h3>
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <Table>
                  <THead>
                    <tr>
                      <TH>Field</TH>
                      <TH>Before</TH>
                      <TH>After</TH>
                    </tr>
                  </THead>
                  <TBody>
                    {changes.map((change) => (
                      <TR key={change.field}>
                        <TD className="font-medium">{change.field}</TD>
                        <TD className="text-fg-subtle line-through decoration-fg-subtle/50">
                          {change.from}
                        </TD>
                        <TD>{change.to}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </section>
          )}
          {details && (
            <details className="group rounded-lg border border-border-subtle">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-fg-muted select-none hover:text-fg">
                More details
              </summary>
              <div className="border-t border-border-subtle px-4 py-3">
                {typeof details === 'string' ? (
                  <p className="text-sm text-fg-muted">{details}</p>
                ) : (
                  <DescriptionList items={details.map(([label, value]) => ({ label, value }))} />
                )}
              </div>
            </details>
          )}
          {event.href && (
            <Link
              href={`/settings/activity?type=${encodeURIComponent(event.entityType)}&entityId=${encodeURIComponent(event.entityId)}`}
              onClick={onClose}
              className={cn('text-sm font-medium text-accent-foreground hover:underline')}
            >
              See all activity on this {typeLabel(event.entityType).toLowerCase()}
            </Link>
          )}
          <Badge tone="gray" className="self-start">
            {spaced(event.action)}
          </Badge>
        </div>
      )}
    </Drawer>
  );
}

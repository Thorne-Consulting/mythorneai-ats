'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Anchor,
  Box,
  Button,
  Group,
  NavLink,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconChartBar,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconFileTypePdf,
  IconInfoCircle,
  IconLock,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ApiError, api } from '@/api';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { formatDate } from '@/lib/format';
import type { RequisitionSummary } from '@/types';
import { type ReportChart, ReportChartView } from './ReportChartView';

interface ReportInfo {
  key: string;
  title: string;
}
type Cell = string | number | null;
interface ReportTable {
  key: string;
  title: string;
  description: string;
  columns: string[];
  rows: Cell[][];
  note?: string | null;
  stats?: { label: string; value: string }[] | null;
  charts?: ReportChart[] | null;
}
interface SavedView {
  id: string;
  name: string;
  paramsJson: string;
}
interface Filters {
  requisitionId: string;
  source: string;
  from: string;
  to: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
const cellText = (cell: Cell) =>
  cell === null || cell === ''
    ? '—'
    : typeof cell === 'number'
      ? String(Math.round(cell * 10) / 10)
      : ISO_DATE.test(cell)
        ? formatDate(cell.slice(0, 10))
        : cell;

function queryString(filters: Filters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries({ ...filters, ...extra }))
    if (value) params.set(name, value);
  return params.toString();
}

export function ReportsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const queryClient = useQueryClient();
  const [sort, setSort] = useState<{ column: number; desc: boolean } | null>(null);
  const filters: Filters = {
    requisitionId: search.get('requisitionId') ?? '',
    source: search.get('source') ?? '',
    from: search.get('from') ?? '',
    to: search.get('to') ?? '',
  };
  const reports = useQuery({
    queryKey: ['reports'],
    queryFn: () => api.get<ReportInfo[]>('/api/reports'),
    retry: false,
  });
  const key = search.get('report') ?? reports.data?.[0]?.key ?? '';
  const jobs = useQuery({
    queryKey: ['requisitions-list'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  const table = useQuery({
    queryKey: ['report', key, filters],
    queryFn: () => api.get<ReportTable>(`/api/reports/${key}?${queryString(filters)}`),
    enabled: !!key,
    retry: false,
  });
  const views = useQuery({
    queryKey: ['saved-views', 'reports'],
    queryFn: () => api.get<SavedView[]>('/api/saved-views?area=reports'),
  });
  const [viewName, setViewName] = useState('');
  const saveView = useMutation({
    mutationFn: () =>
      api.post('/api/saved-views', {
        area: 'reports',
        name: viewName.trim(),
        paramsJson: JSON.stringify({ report: key, ...filters }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'reports'] });
      notifications.show({ color: 'teal', message: `Saved view “${viewName.trim()}”` });
      setViewName('');
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not save the view',
        message: error.message,
      }),
  });
  const deleteView = useMutation({
    mutationFn: (id: string) => api.delete(`/api/saved-views/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'reports'] });
      notifications.show({ color: 'teal', message: 'Saved view removed' });
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not remove the view',
        message: error.message,
      }),
  });

  const go = (next: Partial<Filters> & { report?: string }) => {
    const merged = { report: key, ...filters, ...next };
    const qs = queryString(merged as Filters, { report: merged.report });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    if (next.report) setSort(null);
  };
  const applyView = (view: SavedView) => {
    try {
      const saved = JSON.parse(view.paramsJson) as Partial<Filters> & { report?: string };
      go({
        report: saved.report ?? key,
        requisitionId: saved.requisitionId ?? '',
        source: saved.source ?? '',
        from: saved.from ?? '',
        to: saved.to ?? '',
      });
    } catch {
      notifications.show({ color: 'red', message: 'That saved view could not be opened.' });
    }
  };

  const forbidden =
    (reports.error instanceof ApiError && reports.error.status === 403) ||
    (table.error instanceof ApiError && table.error.status === 403);
  const data = table.data;
  const rows = useMemo(() => {
    if (!data || !sort) return data?.rows ?? [];
    const sorted = [...data.rows].sort((a, b) => {
      const x = a[sort.column];
      const y = b[sort.column];
      if (x === y) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true });
    });
    return sort.desc ? sorted.reverse() : sorted;
  }, [data, sort]);
  const numeric = (column: number) =>
    !!data && data.rows.some((row) => typeof row[column] === 'number');

  if (forbidden)
    return (
      <>
        <PageHeader title="Reports" />
        <EmptyState icon={IconLock} title="You don’t have access to reports" />
      </>
    );

  const isHires = key === 'hires';
  const csvHref = `/api/reports/${key}?${queryString(filters, { format: 'csv' })}`;
  const hasFilters = Object.values(filters).some(Boolean);
  // Printed at the top of the PDF so the reader knows what the numbers cover.
  const filterSummary = [
    filters.requisitionId &&
      (jobs.data?.find((job) => job.id === filters.requisitionId)?.title ?? 'One job'),
    filters.source && `Source: ${filters.source}`,
    (filters.from || filters.to) &&
      `Applied ${filters.from ? `from ${formatDate(filters.from)}` : ''} ${filters.to ? `to ${formatDate(filters.to)}` : ''}`.trim(),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <PageHeader title="Reports" />
      <Group className="reports" align="flex-start" gap="xl" wrap="wrap">
        <Stack className="reports-side" gap="lg">
          <Box component="nav" className="reports-nav" aria-label="Reports">
            {(reports.data ?? []).map((report) => (
              <NavLink
                key={report.key}
                label={report.title}
                active={report.key === key}
                onClick={() => go({ report: report.key })}
                aria-current={report.key === key ? 'page' : undefined}
                style={{ borderRadius: 8 }}
              />
            ))}
          </Box>
          <div className="reports-views">
            <Text fw={650} size="sm" mb={6}>
              Saved views
            </Text>
            {(views.data ?? []).length === 0 ? (
              <Text size="sm" c="dimmed" mb="xs">
                Save the report and filters you check often, then reopen them in one click.
              </Text>
            ) : (
              <Stack gap={2} mb="xs">
                {views.data!.map((view) => (
                  <Group key={view.id} justify="space-between" wrap="nowrap" gap={4}>
                    <Anchor
                      component="button"
                      type="button"
                      size="sm"
                      ta="left"
                      onClick={() => applyView(view)}
                    >
                      {view.name}
                    </Anchor>
                    <Button
                      variant="subtle"
                      color="gray"
                      size="compact-sm"
                      aria-label={`Remove saved view ${view.name}`}
                      onClick={() => deleteView.mutate(view.id)}
                    >
                      <IconTrash size={15} />
                    </Button>
                  </Group>
                ))}
              </Stack>
            )}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (viewName.trim() && key) saveView.mutate();
              }}
            >
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  aria-label="Name for this view"
                  placeholder="Name this view"
                  value={viewName}
                  onChange={(event) => setViewName(event.currentTarget.value)}
                  style={{ flex: 1 }}
                />
                <Button
                  type="submit"
                  variant="default"
                  loading={saveView.isPending}
                  disabled={!viewName.trim()}
                >
                  Save
                </Button>
              </Group>
            </form>
          </div>
        </Stack>

        <Stack className="reports-main" gap="lg">
          <Paper className="reports-filters" withBorder radius="lg" p="sm">
            <Group gap="sm" wrap="wrap" align="flex-end">
              <Select
                label="Job"
                placeholder="All jobs"
                clearable
                searchable
                data={(jobs.data ?? []).map((job) => ({
                  value: job.id,
                  label: `${job.title} (${job.code})`,
                }))}
                value={filters.requisitionId || null}
                onChange={(value) => go({ requisitionId: value ?? '' })}
                style={{ flex: '1 1 220px' }}
              />
              <TextInput
                label="Source"
                placeholder="Any source"
                value={filters.source}
                onChange={(event) => go({ source: event.currentTarget.value })}
                style={{ flex: '1 1 140px' }}
              />
              <TextInput
                type="date"
                label="Applied from"
                value={filters.from}
                onChange={(event) => go({ from: event.currentTarget.value })}
              />
              <TextInput
                type="date"
                label="Applied to"
                value={filters.to}
                onChange={(event) => go({ to: event.currentTarget.value })}
              />
              {hasFilters && (
                <Button
                  variant="subtle"
                  color="gray"
                  onClick={() => go({ requisitionId: '', source: '', from: '', to: '' })}
                >
                  Clear filters
                </Button>
              )}
            </Group>
          </Paper>

          {table.isLoading || (reports.isLoading && !key) ? (
            <LoadingBlock rows={4} />
          ) : table.error ? (
            <Alert color="red" title="This report didn’t load">
              {table.error.message} Try again, or change the filters.
            </Alert>
          ) : data ? (
            <>
              <Group
                className="reports-head"
                justify="space-between"
                align="flex-start"
                wrap="wrap"
                gap="md"
              >
                <div style={{ flex: '1 1 320px' }}>
                  <Text className="reports-title" fw={650} fz="lg">
                    {data.title}
                  </Text>
                  <Text className="reports-desc" c="dimmed" size="sm" maw={640}>
                    {data.description}
                  </Text>
                  {isHires && (
                    <Text size="sm" mt={6}>
                      This list is for the HR and payroll hand-off. Export it as a CSV and send it
                      on when someone has been hired.
                    </Text>
                  )}
                </div>
                <Group className="reports-actions" gap="xs">
                  <Button
                    variant="default"
                    leftSection={<IconFileTypePdf size={16} />}
                    onClick={() => window.print()}
                  >
                    Download PDF
                  </Button>
                  <Button
                    component="a"
                    href={csvHref}
                    variant={isHires ? 'filled' : 'default'}
                    leftSection={<IconDownload size={16} />}
                  >
                    Export CSV
                  </Button>
                </Group>
                <p className="reports-print-meta">
                  {filterSummary || 'All jobs and sources'} · Printed{' '}
                  {formatDate(new Date().toISOString())}
                </p>
              </Group>

              {(data.stats?.length ?? 0) > 0 && (
                <dl className="reports-stats">
                  {data.stats!.map((stat) => (
                    <div key={stat.label}>
                      <dt>{stat.label}</dt>
                      <dd>{stat.value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {data.note && (
                <Alert variant="light" color="gray" icon={<IconInfoCircle size={18} />}>
                  {data.note}
                </Alert>
              )}

              {data.rows.length === 0 ? (
                <EmptyState
                  icon={IconChartBar}
                  title="Nothing to report yet"
                  actionLabel={hasFilters ? 'Clear filters' : undefined}
                  onAction={() => go({ requisitionId: '', source: '', from: '', to: '' })}
                />
              ) : (
                <>
                  {(data.charts?.length ?? 0) > 0 && (
                    <div className="reports-charts">
                      {data.charts!.map((item) => (
                        <ReportChartView key={item.title} chart={item} />
                      ))}
                    </div>
                  )}
                  <Paper className="reports-table" withBorder radius="lg">
                    <Table.ScrollContainer minWidth={560}>
                      <Table>
                        <Table.Thead>
                          <Table.Tr>
                            {data.columns.map((column, index) => (
                              <Table.Th
                                key={column}
                                ta={numeric(index) ? 'right' : 'left'}
                                aria-sort={
                                  sort?.column === index
                                    ? sort.desc
                                      ? 'descending'
                                      : 'ascending'
                                    : undefined
                                }
                              >
                                <UnstyledButton
                                  fz="inherit"
                                  fw="inherit"
                                  tt="inherit"
                                  onClick={() =>
                                    setSort({
                                      column: index,
                                      desc: sort?.column === index && !sort.desc,
                                    })
                                  }
                                  aria-label={`Sort by ${column}`}
                                >
                                  <Group
                                    gap={4}
                                    wrap="nowrap"
                                    justify={numeric(index) ? 'flex-end' : 'flex-start'}
                                  >
                                    {column}
                                    {sort?.column === index &&
                                      (sort.desc ? (
                                        <IconChevronDown size={13} />
                                      ) : (
                                        <IconChevronUp size={13} />
                                      ))}
                                  </Group>
                                </UnstyledButton>
                              </Table.Th>
                            ))}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {rows.map((row, rowIndex) => (
                            <Table.Tr key={rowIndex}>
                              {row.map((cell, index) => (
                                <Table.Td key={index} ta={numeric(index) ? 'right' : 'left'}>
                                  {cellText(cell)}
                                </Table.Td>
                              ))}
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    </Table.ScrollContainer>
                  </Paper>
                </>
              )}
            </>
          ) : null}
        </Stack>
      </Group>
    </>
  );
}

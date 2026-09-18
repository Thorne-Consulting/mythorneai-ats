'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Badge, Box, Checkbox, Group, Pagination, Paper, Rating, Table, Text } from '@mantine/core';
import { IconUserSearch } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { StageBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate } from '@/lib/format';
import { rowLinkProps } from '@/lib/row-link-props';
import type { ApplicantPage } from '@/types';

export function ApplicantResults({
  data,
  selected,
  setSelected,
  page,
  setPage,
}: {
  data?: ApplicantPage;
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  page: number;
  setPage: (page: number) => void;
}) {
  const router = useRouter();
  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((item) => selected.includes(item.id));

  if (!data) return <LoadingBlock rows={6} />;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={IconUserSearch}
        title="No applicants match these filters"
        description="Clear a filter or widen the search to see more people."
      />
    );
  }

  return (
    <>
      <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={1100}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={44}>
                  <Checkbox
                    aria-label="Select all applicants on this page"
                    checked={allSelected}
                    indeterminate={selected.length > 0 && !allSelected}
                    onChange={(event) =>
                      setSelected(event.currentTarget.checked ? items.map((item) => item.id) : [])
                    }
                  />
                </Table.Th>
                <Table.Th>Applicant</Table.Th>
                <Table.Th>Job</Table.Th>
                <Table.Th>Stage</Table.Th>
                <Table.Th>Source</Table.Th>
                <Table.Th>Resume</Table.Th>
                <Table.Th>Rating</Table.Th>
                <Table.Th>Applied</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr
                  key={item.id}
                  {...rowLinkProps(`Open ${item.candidateName}`, () =>
                    router.push(`/applications/${item.id}`),
                  )}
                >
                  <Table.Td onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select ${item.candidateName}`}
                      checked={selected.includes(item.id)}
                      onChange={(event) => {
                        const { checked } = event.currentTarget;
                        setSelected((current) =>
                          checked ? [...current, item.id] : current.filter((id) => id !== item.id),
                        );
                      }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Text fw={650} size="sm">
                      {item.candidateName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {item.currentTitle ?? item.email} · {item.location ?? 'No location'}
                    </Text>
                    <Group gap={4} mt={4}>
                      {item.tags.slice(0, 4).map((value) => (
                        <Badge key={value} size="xs" variant="light" color="gray">
                          {value}
                        </Badge>
                      ))}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.requisitionTitle}</Text>
                    <Text size="xs" c="dimmed">
                      {item.requisitionCode} · {item.team}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <StageBadge stage={item.stage} />
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{item.source}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      variant="default"
                      leftSection={
                        <Box className="status-dot" bg={item.hasResume ? 'teal.6' : 'orange.6'} />
                      }
                    >
                      {item.hasResume
                        ? `${item.resumeCount} file${item.resumeCount === 1 ? '' : 's'}`
                        : 'Missing'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {item.rating ? (
                      <Rating value={item.rating} readOnly size="xs" />
                    ) : (
                      <Text c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{formatDate(item.appliedAt)}</Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
      {data.total > data.pageSize && (
        <Group justify="space-between" mt="lg">
          <Text size="sm" c="dimmed">
            {data.total} applicants
          </Text>
          <Pagination
            value={page}
            onChange={setPage}
            total={Math.ceil(data.total / data.pageSize)}
          />
        </Group>
      )}
    </>
  );
}

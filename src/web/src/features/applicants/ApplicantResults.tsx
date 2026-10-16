'use client';

import type { Dispatch, SetStateAction } from 'react';
import { Checkbox, Group, Pagination, Table, Text, Tooltip } from '@mantine/core';
import { IconUserSearch } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { StageBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate, formatRelative } from '@/lib/format';
import { rowLinkProps } from '@/lib/row-link-props';
import type { ApplicantPage } from '@/types';

type Item = ApplicantPage['items'][number];

/** What needs a recruiter's eye on this application, in words, most urgent first. */
function signals(item: Item) {
  const out: Array<{ label: string; tone: 'accent' | 'warn' | 'quiet' }> = [];
  if (item.unreadMessages > 0)
    out.push({
      label: item.unreadMessages === 1 ? '1 new message' : `${item.unreadMessages} new messages`,
      tone: 'accent',
    });
  if (item.stalled)
    out.push({
      label: `Quiet for ${formatRelative(item.lastActivityAt).replace(' ago', '')}`,
      tone: 'warn',
    });
  if (!item.hasResume) out.push({ label: 'No resume', tone: 'quiet' });
  return out;
}

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
    return <EmptyState icon={IconUserSearch} title="No applications match these filters" />;
  }

  const pages = Math.ceil(data.total / data.pageSize);

  return (
    <>
      <div className="panel">
        <Table.ScrollContainer minWidth={860}>
          <Table className="inbox-table" verticalSpacing={10} highlightOnHover={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th w={48}>
                  <Checkbox
                    aria-label="Select all applications on this page"
                    checked={allSelected}
                    indeterminate={selected.length > 0 && !allSelected}
                    onChange={(event) =>
                      setSelected(event.currentTarget.checked ? items.map((item) => item.id) : [])
                    }
                  />
                </Table.Th>
                <Table.Th>Applicant</Table.Th>
                <Table.Th w="26%">Job</Table.Th>
                <Table.Th w={140}>Stage</Table.Th>
                <Table.Th w={84} ta="right">
                  AI fit
                </Table.Th>
                <Table.Th w={120} ta="right">
                  Applied
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => {
                const flags = signals(item);
                const isSelected = selected.includes(item.id);
                return (
                  <Table.Tr
                    key={item.id}
                    data-selected={isSelected || undefined}
                    {...rowLinkProps(`Open ${item.candidateName}`, () =>
                      router.push(`/applications/${item.id}`),
                    )}
                  >
                    <Table.Td onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label={`Select ${item.candidateName}`}
                        checked={isSelected}
                        onChange={(event) => {
                          const { checked } = event.currentTarget;
                          setSelected((current) =>
                            checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id),
                          );
                        }}
                      />
                    </Table.Td>
                    <Table.Td>
                      <div className="cell-stack">
                        <span className="cell-title">{item.candidateName}</span>
                        <span className="cell-meta">
                          {[item.currentTitle, item.location, item.source]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                        {flags.length > 0 && (
                          <span className="signals">
                            {flags.map((flag) => (
                              <span key={flag.label} className="signal" data-tone={flag.tone}>
                                {flag.label}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                    </Table.Td>
                    <Table.Td>
                      <div className="cell-stack">
                        <span className="cell-text">{item.requisitionTitle}</span>
                        <span className="cell-meta">{item.requisitionCode}</span>
                      </div>
                    </Table.Td>
                    <Table.Td>
                      <StageBadge stage={item.stage} />
                    </Table.Td>
                    <Table.Td ta="right">
                      {item.fitScore != null ? (
                        <Text
                          size="sm"
                          fw={650}
                          className="tnum"
                          aria-label={`AI fit ${item.fitScore} out of 100`}
                        >
                          {item.fitScore}
                        </Text>
                      ) : (
                        <Text size="sm" c="dimmed" aria-label="Not assessed">
                          –
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td ta="right">
                      <Tooltip label={formatDate(item.appliedAt)} openDelay={300}>
                        <Text size="sm" c="dimmed" className="tnum nowrap">
                          {formatRelative(item.appliedAt)}
                        </Text>
                      </Tooltip>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>
      <Group justify="space-between" mt="md">
        <Text size="sm" c="dimmed" className="tnum">
          {data.total === 1 ? '1 application' : `${data.total} applications`}
        </Text>
        {pages > 1 && <Pagination value={page} onChange={setPage} total={pages} size="sm" />}
      </Group>
    </>
  );
}

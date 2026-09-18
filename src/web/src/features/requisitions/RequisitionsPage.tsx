'use client';

import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  Table,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowRight, IconBriefcase2, IconPlus, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { StatusBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { PageHeader } from '@/components/ui/PageHeaders';
import { formatDate } from '@/lib/format';
import { rowLinkProps } from '@/lib/row-link-props';
import type { RequisitionSummary } from '@/types';
import { useCurrentUser } from '@/auth';
import { CreateRequisitionModal } from './CreateRequisitionModal';

export function RequisitionsPage({ initialData }: { initialData: RequisitionSummary[] }) {
  const [opened, modal] = useDisclosure();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const router = useRouter();
  const user = useCurrentUser();
  const canCreate = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const query = useQuery({
    queryKey: ['requisitions', search, status],
    queryFn: () =>
      api.get<RequisitionSummary[]>(
        `/api/requisitions?search=${encodeURIComponent(search)}${status ? `&status=${status}` : ''}`,
      ),
    initialData: !search && !status ? initialData : undefined,
  });

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Open roles, who owns them, and how full each pipeline is."
        actions={
          canCreate && (
            <Button leftSection={<IconPlus size={17} />} onClick={modal.open}>
              New job
            </Button>
          )
        }
      />
      <Paper withBorder radius="lg" p="sm" mb="lg">
        <Group gap="sm" wrap="wrap">
          <TextInput
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder="Search role, code, or team"
            aria-label="Search jobs"
            leftSection={<IconSearch size={16} />}
            style={{ flex: '1 1 260px' }}
          />
          <Select
            value={status}
            onChange={setStatus}
            clearable
            placeholder="All statuses"
            aria-label="Filter by status"
            data={['Draft', 'Open', 'OnHold', 'Filled', 'Closed', 'Cancelled']}
            style={{ flex: '0 1 180px' }}
          />
          {query.data && (
            <Text size="sm" c="dimmed" ml="auto" pr="xs">
              {query.data.length} {query.data.length === 1 ? 'job' : 'jobs'}
            </Text>
          )}
        </Group>
      </Paper>

      {!query.data ? (
        <LoadingBlock />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={IconBriefcase2}
          title="No jobs found"
          description={
            search || status
              ? 'Try a different filter.'
              : 'Create the first job to start reviewing applicants.'
          }
          actionLabel={canCreate && !search && !status ? 'Create job' : undefined}
          onAction={modal.open}
        />
      ) : (
        <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
          <Table.ScrollContainer minWidth={920}>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Location</Table.Th>
                  <Table.Th>Pipeline</Table.Th>
                  <Table.Th>Owner</Table.Th>
                  <Table.Th>Target start</Table.Th>
                  <Table.Th w={48} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {query.data.map((item) => (
                  <Table.Tr
                    key={item.id}
                    {...rowLinkProps(`Open ${item.title}`, () =>
                      router.push(`/requisitions/${item.id}`),
                    )}
                  >
                    <Table.Td>
                      <Text fw={650} size="sm">
                        {item.title}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {item.code} · {item.department}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <StatusBadge status={item.status} />
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{item.location}</Text>
                      <Text size="xs" c="dimmed">
                        {item.workMode}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light" color={item.activeApplications ? 'indigo' : 'gray'}>
                        {item.activeApplications} active
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" truncate maw={180}>
                        {item.ownerEmail}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatDate(item.targetStartDate)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <ActionIcon variant="subtle" color="gray">
                        <IconArrowRight size={17} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      )}
      <CreateRequisitionModal opened={opened} onClose={modal.close} />
    </>
  );
}

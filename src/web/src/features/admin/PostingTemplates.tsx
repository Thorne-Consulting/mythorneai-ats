'use client';

import { Button, Group, Paper, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { IconPlus } from '@tabler/icons-react';
import { api } from '@/api';

type Template = { id: string; name: string; version: number };

export function PostingTemplates() {
  const router = useRouter();
  const templates = useQuery({
    queryKey: ['posting-templates'],
    queryFn: () => api.get<Template[]>('/api/posting-templates'),
  });

  return (
    <>
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={3}>Posting templates</Title>
          <Text c="dimmed" size="sm">
            Reusable company-ready content for new jobs.
          </Text>
        </div>
        <Button
          leftSection={<IconPlus size={17} />}
          onClick={() => router.push('/admin/templates/new')}
        >
          New template
        </Button>
      </Group>
      <Paper withBorder radius="lg" style={{ overflow: 'hidden' }}>
        <Table.ScrollContainer minWidth={520}>
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Version</Table.Th>
                <Table.Th>Updated</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(templates.data ?? []).map((template) => (
                <Table.Tr key={template.id}>
                  <Table.Td>{template.name}</Table.Td>
                  <Table.Td>v{template.version}</Table.Td>
                  <Table.Td>Ready to use</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>
    </>
  );
}

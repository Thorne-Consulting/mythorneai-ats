'use client';

import { useState } from 'react';
import { Anchor, Badge, Collapse, Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/api';
import { humanize } from '@/lib/format';

type Suggested = {
  items: Array<{
    id: string;
    name: string;
    currentTitle?: string | null;
    score: number;
    previousJob: string;
    previousStatus: string;
    previousStage: string;
  }>;
  reason?: string | null;
};

export function SuggestedCandidates({ requisitionId }: { requisitionId: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['suggested-candidates', requisitionId],
    queryFn: () => api.get<Suggested>(`/api/requisitions/${requisitionId}/suggested-candidates`),
    enabled: open,
  });
  return (
    <Paper withBorder radius="lg" mb="lg">
      <UnstyledButton
        w="100%"
        p="md"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <Group gap="xs">
          {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
          <Text fw={650}>Past candidates who might fit</Text>
          <Text size="sm" c="dimmed">
            People who applied to other jobs and look close to this one
          </Text>
        </Group>
      </UnstyledButton>
      <Collapse in={open}>
        <Stack gap={0} px="md" pb="md">
          {query.isLoading && (
            <Text size="sm" c="dimmed">
              Looking through past candidates…
            </Text>
          )}
          {query.isError && (
            <Text size="sm" c="red">
              {query.error.message}
            </Text>
          )}
          {query.data && query.data.items.length === 0 && (
            <Text size="sm" c="dimmed">
              {query.data.reason ?? 'No past candidates look like a close match yet.'}
            </Text>
          )}
          {query.data?.items.map((item) => (
            <Group
              key={item.id}
              justify="space-between"
              wrap="wrap"
              gap="sm"
              py="xs"
              style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
            >
              <div style={{ minWidth: 0 }}>
                <Anchor component={Link} href={`/candidates/${item.id}`} fw={600} size="sm">
                  {item.name}
                </Anchor>
                <Text size="xs" c="dimmed">
                  {item.currentTitle ? `${item.currentTitle} · ` : ''}
                  Applied for {item.previousJob} ({humanize(item.previousStatus)},{' '}
                  {item.previousStage})
                </Text>
              </div>
              <Group gap="sm">
                <Badge
                  variant="default"
                  tt="none"
                  aria-label={`Similarity ${item.score} out of 100`}
                >
                  {item.score}% similar
                </Badge>
                <Anchor
                  component={Link}
                  size="sm"
                  href={`/talent?job=${requisitionId}&highlight=${item.id}`}
                >
                  See in shortlist
                </Anchor>
              </Group>
            </Group>
          ))}
          {query.data && query.data.items.length > 0 && (
            <Text size="xs" c="dimmed" mt="xs">
              Suggestions only, based on resume similarity. You decide who to contact.
            </Text>
          )}
        </Stack>
      </Collapse>
    </Paper>
  );
}

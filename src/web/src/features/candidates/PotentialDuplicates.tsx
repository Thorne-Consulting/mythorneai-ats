'use client';

import { Anchor, Badge, Group, Paper, Stack, Text } from '@mantine/core';
import { IconCopy } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';

type Duplicate = {
  id: string;
  name: string;
  email: string;
  currentTitle?: string;
  reasons: string[];
};

export function PotentialDuplicates({ candidateId }: { candidateId: string }) {
  const duplicates = useQuery({
    queryKey: ['candidate-duplicates', candidateId],
    queryFn: () => api.get<Duplicate[]>(`/api/candidates/${candidateId}/duplicates`),
  });
  if (duplicates.isLoading || duplicates.isError || !duplicates.data?.length) return null;

  return (
    <Paper withBorder radius="lg" p="lg">
      <Group gap="sm" mb="xs">
        <IconCopy size={17} />
        <Text fw={700}>Possible duplicates</Text>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        Review these records before creating another candidate. Records are never merged automatically.
      </Text>
      <Stack gap="sm">
        {duplicates.data.map((duplicate) => (
          <div key={duplicate.id}>
            <Anchor href={`/candidates/${duplicate.id}`} fw={600} size="sm">
              {duplicate.name}
            </Anchor>
            <Text size="xs" c="dimmed">
              {duplicate.currentTitle ?? duplicate.email}
            </Text>
            <Group gap={5} mt={5}>
              {duplicate.reasons.map((reason) => (
                <Badge key={reason} size="xs" variant="outline" color="gray">
                  {reason}
                </Badge>
              ))}
            </Group>
          </div>
        ))}
      </Stack>
    </Paper>
  );
}

'use client';

import { Badge, Group, Stack, Text, ThemeIcon, UnstyledButton } from '@mantine/core';
import { IconArrowRight, IconBriefcase2 } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/Badges';
import { SectionCard } from '@/components/ui/Cards';
import { formatDate } from '@/lib/format';
import type { CandidateDetail } from '@/types';

export function CandidateApplications({
  applications,
}: {
  applications: CandidateDetail['applications'];
}) {
  const router = useRouter();
  return (
    <SectionCard
      title="Applications"
      description="Every role considered for this person"
      action={
        <Badge variant="light" color="indigo" circle>
          {applications.length}
        </Badge>
      }
    >
      <Stack gap={0}>
        {applications.map((application) => (
          <UnstyledButton
            key={application.id}
            className="list-row"
            data-interactive
            onClick={() => router.push(`/applications/${application.id}`)}
          >
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Group wrap="nowrap" style={{ minWidth: 0 }}>
                <ThemeIcon color="indigo" variant="light">
                  <IconBriefcase2 size={17} />
                </ThemeIcon>
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={650} truncate>
                    {application.requisitionTitle}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {application.requisitionCode} · Applied {formatDate(application.appliedAt)}
                  </Text>
                </div>
              </Group>
              <Group wrap="nowrap" gap="xs">
                <Badge variant="light" color="gray" visibleFrom="sm">
                  {application.stage}
                </Badge>
                <StatusBadge status={application.status} />
                <IconArrowRight size={16} color="var(--mantine-color-gray-5)" />
              </Group>
            </Group>
          </UnstyledButton>
        ))}
        {applications.length === 0 && (
          <Text c="dimmed" p="xl" size="sm">
            No applications yet.
          </Text>
        )}
      </Stack>
    </SectionCard>
  );
}

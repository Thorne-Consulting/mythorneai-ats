'use client';

import { Box, Button, Group, Stack, Text } from '@mantine/core';
import Link from 'next/link';
import { IconArrowRight } from '@tabler/icons-react';
import { SectionCard } from '@/components/ui/Cards';
import { PageHeader } from '@/components/ui/PageHeaders';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { DashboardData } from '@/types';

/** Feedback this person owes, newest-first would hide the oldest, so the longest overdue comes first. */
export function ScorecardsDueCard({ items }: { items: DashboardData['scorecardsDue'] }) {
  return (
    <SectionCard title="Scorecards waiting on you">
      {items.length === 0 ? (
        <Text c="dimmed" size="sm" p={24}>
          You're all caught up. After an interview, the feedback you owe shows up here.
        </Text>
      ) : (
        <Stack gap={0} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
          {items.map((item) => (
            <Box component="li" key={item.id} className="list-row">
              <Group wrap="nowrap" justify="space-between" gap="md">
                <Box style={{ minWidth: 0 }}>
                  <Text fw={650} size="sm" truncate>
                    {item.candidateName} · {item.title}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {item.requisitionTitle} · ended {formatRelative(item.endsAt)}
                  </Text>
                </Box>
                <Button
                  component={Link}
                  href={`/applications/${item.applicationId}/interviews?scorecard=${item.id}`}
                  size="xs"
                  rightSection={<IconArrowRight size={14} />}
                  style={{ flex: 'none' }}
                  aria-label={`Write scorecard for ${item.candidateName}, ${item.title}`}
                >
                  Write scorecard
                </Button>
              </Group>
            </Box>
          ))}
        </Stack>
      )}
    </SectionCard>
  );
}

/** What an occasional interviewer needs on arrival: feedback they owe, and what's coming up. */
export function InterviewerHome({
  data,
  firstName,
  greeting,
}: {
  data: DashboardData;
  firstName: string;
  greeting: string;
}) {
  return (
    <>
      <PageHeader title={`${greeting}, ${firstName}`} />
      <Stack gap="xl">
        <ScorecardsDueCard items={data.scorecardsDue} />
        <SectionCard title="Your upcoming interviews">
          {data.upcomingInterviews.length === 0 ? (
            <Text c="dimmed" size="sm" p={24}>
              Nothing scheduled this week. When someone books you, it appears here with a link to
              prepare.
            </Text>
          ) : (
            <Stack gap={0} component="ul" m={0} p={0} style={{ listStyle: 'none' }}>
              {data.upcomingInterviews.map((interview) => (
                <Box component="li" key={interview.id} className="list-row">
                  <Group wrap="nowrap" justify="space-between" gap="md">
                    <Group wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
                      <Box className="date-chip">
                        <Text size="xs">
                          {new Date(interview.startsAt).toLocaleDateString(undefined, {
                            month: 'short',
                          })}
                        </Text>
                        <Text fw={750} className="tnum" lh={1.15}>
                          {new Date(interview.startsAt).getDate()}
                        </Text>
                      </Box>
                      <Box style={{ minWidth: 0 }}>
                        <Text fw={650} size="sm" truncate>
                          {interview.candidateName} · {interview.title}
                        </Text>
                        <Text size="xs" c="dimmed" truncate>
                          {interview.requisitionTitle} · {formatDateTime(interview.startsAt)}
                        </Text>
                      </Box>
                    </Group>
                    <Button
                      component={Link}
                      href={`/applications/${interview.applicationId}/interviews`}
                      size="xs"
                      variant="default"
                      style={{ flex: 'none' }}
                      aria-label={`Prepare for ${interview.candidateName}, ${interview.title}`}
                    >
                      Prepare
                    </Button>
                  </Group>
                </Box>
              ))}
            </Stack>
          )}
        </SectionCard>
      </Stack>
    </>
  );
}

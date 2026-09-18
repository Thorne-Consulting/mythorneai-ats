'use client';

import { Avatar, Badge, Button, Grid, Group } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/auth';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { DetailHeader } from '@/components/ui/PageHeaders';
import { initials } from '@/lib/format';
import type { CandidateDetail } from '@/types';
import { ApplyModal } from './ApplyModal';
import { CandidateApplications } from './CandidateApplications';
import { CandidateSidebar } from './CandidateSidebar';

export function CandidateDetailPage({
  id,
  initialData,
}: {
  id: string;
  initialData: CandidateDetail;
}) {
  const [opened, modal] = useDisclosure();
  const user = useCurrentUser();
  const query = useQuery({
    queryKey: ['candidate', id],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${id}`),
    initialData,
  });
  const canApply = ['Admin', 'Recruiter', 'HiringManager'].includes(user.role);
  const canUpload = ['Admin', 'Recruiter'].includes(user.role);
  if (!query.data) return <LoadingBlock rows={5} />;
  const candidate = query.data;

  return (
    <>
      <DetailHeader
        backHref="/candidates"
        backLabel="Candidates"
        current={`${candidate.firstName} ${candidate.lastName}`}
        avatar={
          <Avatar size={60} radius="xl" color="teal" variant="light">
            {initials(`${candidate.firstName} ${candidate.lastName}`)}
          </Avatar>
        }
        title={`${candidate.firstName} ${candidate.lastName}`}
        badges={
          candidate.doNotContact && (
            <Badge color="red" variant="light">
              Do not contact
            </Badge>
          )
        }
        subtitle={candidate.currentTitle ?? 'Candidate'}
        meta={
          candidate.tags.length > 0 && (
            <Group gap={6} mt="sm">
              {candidate.tags.map((tag) => (
                <Badge key={tag} variant="light" color="gray">
                  {tag}
                </Badge>
              ))}
            </Group>
          )
        }
        actions={
          canApply && (
            <Button leftSection={<IconPlus size={17} />} onClick={modal.open}>
              Add to a job
            </Button>
          )
        }
      />

      <Grid gutter="xl">
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <CandidateSidebar candidate={candidate} canUpload={canUpload} />
        </Grid.Col>

        <Grid.Col span={{ base: 12, lg: 8 }}>
          <CandidateApplications applications={candidate.applications} />
        </Grid.Col>
      </Grid>
      <ApplyModal candidateId={candidate.id} opened={opened} onClose={modal.close} />
    </>
  );
}

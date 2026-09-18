'use client';

import { Badge, Grid, Group, Stack, Text } from '@mantine/core';
import { SectionCard } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate, formatDateTime } from '@/lib/format';
import { useRequisition } from './requisition-data';

export function RequisitionDetails({ id }: { id: string }) {
  const details = useRequisition(id);
  if (!details.data) return <LoadingBlock rows={3} />;
  const requisition = details.data;

  return (
    <Grid gutter="xl">
      <Grid.Col span={{ base: 12, lg: 7 }}>
        <SectionCard title="Role summary" padded>
          <Text
            c={requisition.description ? undefined : 'dimmed'}
            style={{ whiteSpace: 'pre-wrap', maxWidth: '68ch' }}
          >
            {requisition.description || 'No role summary has been added.'}
          </Text>
        </SectionCard>
      </Grid.Col>
      <Grid.Col span={{ base: 12, lg: 5 }}>
        <Stack gap="xl">
          <SectionCard title="Job details" padded>
            <Stack gap="sm">
              <Field label="Job code" value={requisition.code} />
              <Field label="Team" value={requisition.department} />
              <Field label="Location" value={requisition.location} />
              <Field label="Work mode" value={requisition.workMode} />
              <Field label="Employment type" value={requisition.employmentType} />
              <Field label="Openings" value={String(requisition.openings)} />
              <Field label="Target start" value={formatDate(requisition.targetStartDate)} />
            </Stack>
          </SectionCard>
          <SectionCard title="People and dates" padded>
            <Stack gap="sm">
              <Field label="Hiring manager" value={requisition.ownerEmail} />
              <Field label="Recruiter" value={requisition.recruiterEmail} />
              <Field label="Created" value={formatDate(requisition.createdAt)} />
              <Field label="Last updated" value={formatDateTime(requisition.updatedAt)} />
            </Stack>
          </SectionCard>
          <SectionCard
            title="Pipeline stages"
            description={`${requisition.stages.length} stages in order`}
            padded
          >
            <Group gap="xs">
              {requisition.stages.map((stage, index) => (
                <Badge key={stage.id} variant="light" color={stage.color} leftSection={index + 1}>
                  {stage.name}
                </Badge>
              ))}
            </Group>
          </SectionCard>
        </Stack>
      </Grid.Col>
    </Grid>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="lg" align="flex-start">
      <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
        {label}
      </Text>
      <Text size="sm" fw={600} ta="right" style={{ minWidth: 0, wordBreak: 'break-word' }}>
        {value}
      </Text>
    </Group>
  );
}

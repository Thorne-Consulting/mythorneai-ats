'use client';

import { useState } from 'react';
import { Select, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import type { RequisitionSummary } from '@/types';
import { EmailTemplateEditor } from './EmailTemplateEditor';

export function AdminEmailTemplates() {
  const [jobId, setJobId] = useState<string | null>(null);
  const jobs = useQuery({
    queryKey: ['requisitions-list'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  return (
    <>
      <Title order={3}>Email templates</Title>
      <Text c="dimmed" size="sm" mb="lg" maw={680}>
        The wording of the emails candidates and your team receive. Change it for everyone, or give
        one job its own version.
      </Text>
      <Select
        label="Edit for"
        allowDeselect={false}
        searchable
        mb="lg"
        maw={360}
        data={[
          { value: '', label: 'Everyone' },
          ...(jobs.data ?? []).map((job) => ({
            value: job.id,
            label: `${job.title} (${job.code})`,
          })),
        ]}
        value={jobId ?? ''}
        onChange={(value) => setJobId(value || null)}
      />
      <EmailTemplateEditor requisitionId={jobId ?? undefined} />
    </>
  );
}

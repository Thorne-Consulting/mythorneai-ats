'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Card, Select } from '@/components/ui';
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
      <Card className="flex flex-wrap items-center gap-4 p-4">
        <Select
          inset
          label="Edit for"
          className="w-full sm:w-96"
          data={[
            { value: '__all__', label: 'Everyone' },
            ...(jobs.data ?? []).map((job) => ({
              value: job.id,
              label: `${job.title} (${job.code})`,
            })),
          ]}
          value={jobId ?? '__all__'}
          onChange={(value) => setJobId(value && value !== '__all__' ? value : null)}
        />
        <p className="min-w-0 flex-1 basis-64 text-sm text-fg-subtle">
          Change the wording for everyone, or pick a job to give it its own version.
        </p>
      </Card>
      <EmailTemplateEditor requisitionId={jobId ?? undefined} />
    </>
  );
}

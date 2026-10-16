'use client';

import { Alert, Box, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { SectionCard } from '@/components/ui/Cards';
import { useInvalidateApprovals, type ApprovalView } from '@/features/approvals/approval-data';
import {
  ApprovalTimeline,
  ApproverPicker,
  DecideControls,
} from '@/features/approvals/ApprovalParts';

interface JobApproval {
  required: boolean;
  defaultApprovers: string[];
  sequential: boolean;
  approvals: ApprovalView[];
}

/** Submit a draft job for approval, or show who still has to approve it. Renders nothing otherwise. */
export function RequisitionApproval({
  id,
  status,
  canManage,
}: {
  id: string;
  status: string;
  canManage: boolean;
}) {
  const invalidate = useInvalidateApprovals();
  const relevant = canManage && (status === 'Draft' || status === 'PendingApproval');
  const query = useQuery({
    queryKey: ['requisition-approval', id],
    queryFn: () => api.get<JobApproval>(`/api/requisitions/${id}/approval`),
    enabled: relevant,
    retry: false,
  });
  const submit = useMutation({
    mutationFn: (input: { approvers: string[]; sequential: boolean }) =>
      api.post(`/api/requisitions/${id}/submit-for-approval`, input),
    onSuccess: () => {
      invalidate();
      notifications.show({
        color: 'teal',
        message:
          'Sent for approval. Approvers have been emailed, and the job opens when they agree.',
      });
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not submit the job',
        message: error.message,
      }),
  });

  if (!relevant || !query.data) return null;
  const { approvals, required } = query.data;
  const rejected = approvals.filter((item) => item.decision === 'Rejected');
  const mine = approvals.find((item) => item.canDecide);

  if (status === 'PendingApproval') {
    const waiting = approvals.filter((item) => item.decision === 'Pending');
    return (
      <Box mb="xl">
        <SectionCard
          title="Waiting for approval"
          description={
            waiting.length
              ? `Still needed from ${waiting.map((item) => item.approverName).join(', ')}. The job opens as soon as everyone agrees.`
              : 'Everyone has answered. The job should open shortly.'
          }
        >
          <ApprovalTimeline approvals={approvals} />
          {mine && (
            <Group p="lg">
              <DecideControls approvalId={mine.id} subject="Open this job" />
            </Group>
          )}
        </SectionCard>
      </Box>
    );
  }

  if (!required && rejected.length === 0) return null;
  return (
    <Stack gap="md" mb="xl">
      {rejected.map((item) => (
        <Alert
          key={item.id}
          color="red"
          variant="light"
          title={`${item.approverName} did not approve this job`}
        >
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {item.comment}
          </Text>
          <Text size="sm" mt={4}>
            Make the change they asked for, then submit it again.
          </Text>
        </Alert>
      ))}
      {required && (
        <SectionCard
          title="This job needs approval before it opens"
          description="Pick who signs off. Candidates cannot apply until they do."
          padded
        >
          <ApproverPicker
            defaultApprovers={query.data.defaultApprovers}
            defaultSequential={query.data.sequential}
            required
            submitLabel="Submit for approval"
            loading={submit.isPending}
            onSubmit={(approvers, sequential) => submit.mutate({ approvers, sequential })}
          />
        </SectionCard>
      )}
    </Stack>
  );
}

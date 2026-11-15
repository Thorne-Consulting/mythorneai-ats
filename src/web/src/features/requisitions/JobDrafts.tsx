'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FilePen, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  MenuItem,
  RowActions,
  toast,
} from '@/components/ui';
import { formatRelative } from '@/lib/format';

type JobDraft = { id: string; title: string; step: number; updatedAt: string };

/** The wizard's steps, for "Stopped at Pipeline". Keep in step with CreateRequisitionPage. */
const STEPS = [
  'Start',
  'Location and pay',
  'Posting and questions',
  'Requirements',
  'Pipeline',
  'Hiring team',
  'Review',
];

/** Jobs you started in the create-job wizard and have not created yet. Hidden when there are none. */
export function JobDrafts() {
  const queryClient = useQueryClient();
  const [discarding, setDiscarding] = useState<JobDraft | null>(null);
  const drafts = useQuery({
    queryKey: ['job-drafts'],
    queryFn: () => api.get<JobDraft[]>('/api/requisitions/drafts'),
  });
  const discard = useMutation({
    mutationFn: (id: string) => api.delete(`/api/requisitions/drafts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-drafts'] });
      toast.success('Draft discarded');
    },
    onError: (error: Error) => toast.error('Could not discard the draft', error.message),
  });
  if (!drafts.data?.length) return null;
  return (
    <Card className="mb-5">
      <CardHeader
        title="Unfinished jobs"
        description="Jobs you started creating. Only you see these until you create them."
      />
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {drafts.data.map((draft) => (
          <li key={draft.id} className="flex items-center gap-3 px-5 py-3">
            <FilePen className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-fg">
                {draft.title || 'Untitled job'}
              </p>
              <p className="truncate text-xs text-fg-subtle">
                Stopped at {STEPS[draft.step] ?? STEPS[0]} · Saved {formatRelative(draft.updatedAt)}
              </p>
            </div>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/jobs/new?draft=${draft.id}`}>Continue</Link>
            </Button>
            <RowActions label={`Actions for ${draft.title || 'this draft'}`}>
              <MenuItem icon={<Trash2 />} danger onSelect={() => setDiscarding(draft)}>
                Discard draft
              </MenuItem>
            </RowActions>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        opened={discarding !== null}
        onClose={() => setDiscarding(null)}
        title={`Discard ${discarding?.title || 'this draft'}?`}
        message="What you wrote in the wizard is deleted. You cannot undo this."
        confirmLabel="Discard draft"
        onConfirm={() =>
          discard.mutateAsync(discarding!.id).then(
            () => undefined,
            () => undefined,
          )
        }
      />
    </Card>
  );
}

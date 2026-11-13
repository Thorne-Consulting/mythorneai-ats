'use client';

import Link from 'next/link';
import { ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, SkeletonRows } from '@/components/ui';
import { useCanManage, useRequisition } from './requisition-data';

export function RequisitionKits({ id }: { id: string }) {
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);

  if (!details.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  const kits = details.data.interviewKits;
  const newKit = (label: string) => (
    <Button asChild variant="secondary" size="sm">
      <Link href={`/jobs/${id}/kits/new`}>
        <Plus />
        {label}
      </Link>
    </Button>
  );

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Interview kits"
        description="Every interviewer gets the same questions and scoring scale."
        action={canManage && kits.length > 0 ? newKit('New kit') : undefined}
      />
      {kits.length === 0 ? (
        <EmptyState
          compact
          icon={ClipboardList}
          title="No interview kits yet"
          description="Add a kit before you schedule interviews for this job."
          action={canManage ? newKit('Add a kit') : undefined}
        />
      ) : (
        <ul className="border-t border-border-subtle">
          {kits.map((kit) => (
            <li key={kit.id} className="border-b border-border-subtle last:border-b-0">
              <Link
                href={`/jobs/${id}/kits/${kit.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted focus-visible:bg-accent focus-visible:outline-none"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-medium text-fg">{kit.name}</p>
                  <p className="mt-0.5 truncate text-xs text-fg-subtle">
                    {kit.durationMinutes} minutes · {kit.criteria.length}{' '}
                    {kit.criteria.length === 1 ? 'question' : 'questions'}
                    {kit.criteria.length > 0 &&
                      ` · ${kit.criteria.map((criterion) => criterion.name).join(', ')}`}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

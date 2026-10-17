'use client';

import { Button, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { useCanManage, useRequisition } from './requisition-data';

export function RequisitionKits({ id }: { id: string }) {
  const router = useRouter();
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);

  if (!details.data) return <LoadingBlock rows={3} />;
  const requisition = details.data;

  return (
    <>
      <div className="section-head">
        <h2 className="section-title">Interview kits</h2>
        {canManage && requisition.interviewKits.length > 0 && (
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPlus size={14} />}
            onClick={() => router.push(`/requisitions/${id}/kits/new`)}
          >
            New kit
          </Button>
        )}
      </div>
      {requisition.interviewKits.length === 0 ? (
        <div className="panel empty-row">
          <Text size="sm" c="dimmed">
            No kits yet. A kit gives every interviewer the same questions and scoring scale.
          </Text>
          {canManage && (
            <Button
              size="xs"
              variant="default"
              onClick={() => router.push(`/requisitions/${id}/kits/new`)}
            >
              Add a kit
            </Button>
          )}
        </div>
      ) : (
        <div className="kl3">
          {requisition.interviewKits.map((kit, index) => (
            <details key={kit.id} className="kl3-kit" open={index === 0}>
              <summary className="kl3-summary">
                <span className="kl3-title">{kit.name}</span>
                <span className="kl3-meta">
                  {kit.durationMinutes} min · {kit.criteria.length}{' '}
                  {kit.criteria.length === 1 ? 'competency' : 'competencies'}
                </span>
              </summary>
              <div className="kl3-body">
                {kit.instructions && <p className="kl3-prose">{kit.instructions}</p>}
                <ul className="kl-crit">
                  {kit.criteria.map((criterion) => (
                    <li key={criterion.id}>
                      <span className="kl-crit-head">
                        <span className="kl-crit-name">{criterion.name}</span>
                        <span className="kl-crit-weight">weight {criterion.weight}</span>
                      </span>
                      <span className="kl-crit-q">{criterion.question}</span>
                      {criterion.description && (
                        <span className="kl-crit-good">
                          Good looks like: {criterion.description}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {canManage && (
                  <button
                    type="button"
                    className="text-action"
                    onClick={() => router.push(`/requisitions/${id}/kits/${kit.id}/edit`)}
                  >
                    Edit
                  </button>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}

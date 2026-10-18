'use client';

import { Button, Text } from '@mantine/core';
import { IconChevronRight, IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
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
        <ul className="kit-lines">
          {requisition.interviewKits.map((kit) => (
            <li key={kit.id}>
              <Link href={`/requisitions/${id}/kits/${kit.id}`} className="kit-line">
                <span className="kit-line-title">{kit.name}</span>
                <span className="kit-line-meta">
                  {kit.durationMinutes} min · {kit.criteria.length}{' '}
                  {kit.criteria.length === 1 ? 'competency' : 'competencies'}
                </span>
                <span className="kit-line-names">
                  {kit.criteria.map((criterion) => criterion.name).join(', ')}
                </span>
                <IconChevronRight size={16} className="kit-line-go" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

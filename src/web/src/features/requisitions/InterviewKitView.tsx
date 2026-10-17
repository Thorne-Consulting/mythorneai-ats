'use client';

import Link from 'next/link';
import { Text } from '@mantine/core';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { useCanManage, useRequisition } from './requisition-data';

/** One interview kit, read in full as a document. */
export function InterviewKitView({
  requisitionId,
  kitId,
}: {
  requisitionId: string;
  kitId: string;
}) {
  const job = useRequisition(requisitionId);
  const canManage = useCanManage(job.data);
  if (!job.data) return <LoadingBlock rows={4} />;
  const kit = job.data.interviewKits.find((item) => item.id === kitId);
  if (!kit) return <Text c="dimmed">This kit no longer exists.</Text>;
  const criteria = [...kit.criteria].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <article className="kit-read">
      <p className="kit-read-crumb">
        <Link href={`/requisitions/${requisitionId}/kits`} className="text-action">
          All kits
        </Link>
      </p>
      <header className="kit-read-head">
        <h1 className="kit-read-title">{kit.name}</h1>
        {canManage && (
          <Link href={`/requisitions/${requisitionId}/kits/${kit.id}/edit`} className="text-action">
            Edit
          </Link>
        )}
      </header>
      <p className="kit-read-meta">
        {kit.durationMinutes} min · {criteria.length}{' '}
        {criteria.length === 1 ? 'competency' : 'competencies'}
      </p>

      <ReadSection title="Interviewer instructions" body={kit.instructions} />

      <section className="kit-read-section">
        <h2 className="kit-read-h">Scorecard</h2>
        <ol className="kl-crit kit-read-crit">
          {criteria.map((criterion) => (
            <li key={criterion.id}>
              <span className="kl-crit-head">
                <span className="kl-crit-name">{criterion.name}</span>
                <span className="kl-crit-weight">weight {criterion.weight}</span>
              </span>
              <span className="kl-crit-q">{criterion.question}</span>
              {criterion.description && (
                <span className="kl-crit-good">Good looks like: {criterion.description}</span>
              )}
            </li>
          ))}
        </ol>
      </section>

      <ReadSection title="Candidate booking message" body={kit.candidateMessage} />
      <ReadSection title="Interviewer assignment message" body={kit.interviewerMessage} />
    </article>
  );
}

function ReadSection({ title, body }: { title: string; body?: string }) {
  return (
    <section className="kit-read-section">
      <h2 className="kit-read-h">{title}</h2>
      {body?.trim() ? (
        <p className="kit-read-prose">{body}</p>
      ) : (
        <p className="kit-read-prose kit-read-empty">Not written yet.</p>
      )}
    </section>
  );
}

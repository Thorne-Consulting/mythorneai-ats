'use client';

import { Stack, Text } from '@mantine/core';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate, formatRelative } from '@/lib/format';
import { useCanManage, useRequisition } from './requisition-data';
import { RequisitionRequirements } from './RequisitionRequirements';
import { RequisitionSettings } from './RequisitionSettings';
import type { RequisitionWithSettings } from './requirements-types';

/** What the job is and what it asks for, with the facts alongside. */
export function RequisitionDetails({ id }: { id: string }) {
  const details = useRequisition(id);
  const canManage = useCanManage(details.data);
  if (!details.data) return <LoadingBlock rows={3} />;
  const requisition = details.data as RequisitionWithSettings;

  const people = (
    <>
      <Fact label="Hiring manager" value={requisition.ownerEmail} />
      <Fact label="Recruiter" value={requisition.recruiterEmail} />
    </>
  );
  const dates = (
    <>
      <Fact label="Target start" value={formatDate(requisition.targetStartDate)} />
      <Fact label="Created" value={formatDate(requisition.createdAt)} />
      <Fact label="Last updated" value={formatRelative(requisition.updatedAt)} />
    </>
  );
  const stages = (
    <div className="fact">
      <dt>Stages</dt>
      <dd>
        <ol className="stage-timeline">
          {requisition.stages.map((stage) => (
            <li key={stage.id}>{stage.name}</li>
          ))}
        </ol>
      </dd>
    </div>
  );

  return (
    <div className="record-grid">
      <Stack gap={48} style={{ minWidth: 0 }}>
        <section id="details" className="record-section">
          <div className="section-head">
            <h2 className="section-title">About the role</h2>
          </div>
          <Text
            className="prose"
            c={requisition.description ? undefined : 'dimmed'}
            style={{ whiteSpace: 'pre-wrap', maxWidth: '68ch' }}
          >
            {requisition.description || 'No role summary has been added.'}
          </Text>
        </section>

        <section id="requirements" className="record-section">
          <RequisitionRequirements requisition={requisition} canManage={canManage} />
        </section>
      </Stack>

      <aside className="record-rail" aria-label="Job details">
        <div className="panel">
          <dl className="facts facts-grid">
            <Fact
              label="To fill"
              value={`${requisition.openings} ${requisition.openings === 1 ? 'position' : 'positions'}`}
            />
            <Fact label="Contract type" value={requisition.employmentType} />
            <PersonFact label="Hiring manager" email={requisition.ownerEmail} />
            <PersonFact label="Recruiter" email={requisition.recruiterEmail} />
            {dates}
            {stages}
          </dl>
        </div>
      </aside>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** "priya.manager@acme.com" reads as "Priya Manager". */
function nameFromEmail(email: string) {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** A person as a mention: their name on a soft chip, with the address on hover. */
function PersonFact({ label, email }: { label: string; email: string }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>
        <span className="mention" title={email}>
          {nameFromEmail(email)}
        </span>
      </dd>
    </div>
  );
}

export function RequisitionVisibility({ id }: { id: string }) {
  const details = useRequisition(id);
  if (!details.data) return <LoadingBlock rows={3} />;
  return (
    <div style={{ maxWidth: 760 }}>
      <RequisitionSettings requisition={details.data as RequisitionWithSettings} />
    </div>
  );
}

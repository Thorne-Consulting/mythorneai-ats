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

  return (
    <div className="record-grid">
      <Stack gap={48} style={{ minWidth: 0 }}>
        <section id="details" className="record-section">
          <div className="section-head">
            <h2 className="section-title">About the role</h2>
          </div>
          <Text
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
          <div className="panel-head">
            <h2 className="panel-title">Job</h2>
          </div>
          <dl className="facts">
            <Fact
              label="Openings"
              value={`${requisition.openings} · ${requisition.employmentType}`}
            />
            <Fact label="Hiring manager" value={requisition.ownerEmail} />
            <Fact label="Recruiter" value={requisition.recruiterEmail} />
            <Fact label="Target start" value={formatDate(requisition.targetStartDate)} />
            <Fact label="Created" value={formatDate(requisition.createdAt)} />
            <Fact label="Last updated" value={formatRelative(requisition.updatedAt)} />
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

export function RequisitionVisibility({ id }: { id: string }) {
  const details = useRequisition(id);
  if (!details.data) return <LoadingBlock rows={3} />;
  return (
    <div style={{ maxWidth: 760 }}>
      <RequisitionSettings requisition={details.data as RequisitionWithSettings} />
    </div>
  );
}

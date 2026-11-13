'use client';

import { Card, CardBody, CardHeader, DescriptionList, SkeletonRows } from '@/components/ui';
import { StageBadge } from '@/components/status';
import { cn } from '@/lib/cn';
import { formatDate, formatRelative } from '@/lib/format';
import { nameFromEmail, useRequisition } from './requisition-data';
import { RequisitionSettings } from './RequisitionSettings';
import type { RequisitionWithSettings } from './requirements-types';

function Loading() {
  return (
    <Card>
      <SkeletonRows rows={3} />
    </Card>
  );
}

/** A person as a name, with the address on hover. */
function Person({ email }: { email: string }) {
  return <span title={email}>{nameFromEmail(email)}</span>;
}

/** What the job is, with the facts alongside. Requirements have their own section. */
export function RequisitionDetails({ id }: { id: string }) {
  const details = useRequisition(id);
  if (!details.data) return <Loading />;
  const requisition = details.data as RequisitionWithSettings;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card id="details">
          <CardHeader title="About the role" />
          <CardBody>
            <p
              className={cn(
                'max-w-[68ch] whitespace-pre-wrap text-base',
                requisition.description ? 'text-fg' : 'text-fg-subtle',
              )}
            >
              {requisition.description || 'No job summary yet.'}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Job details" />
        <CardBody>
          <DescriptionList
            columns={2}
            items={[
              {
                label: 'Openings',
                value: `${requisition.openings} ${requisition.openings === 1 ? 'position' : 'positions'}`,
              },
              { label: 'Employment type', value: requisition.employmentType },
              { label: 'Hiring manager', value: <Person email={requisition.ownerEmail} /> },
              { label: 'Recruiter', value: <Person email={requisition.recruiterEmail} /> },
              { label: 'Target start', value: formatDate(requisition.targetStartDate) },
              { label: 'Created', value: formatDate(requisition.createdAt) },
              { label: 'Last updated', value: formatRelative(requisition.updatedAt) },
            ]}
          />
          <div className="mt-5 border-t border-border-subtle pt-4">
            <p className="text-xs text-fg-subtle">Stages</p>
            <ol className="mt-2 flex flex-wrap gap-1.5">
              {requisition.stages.map((stage) => (
                <li key={stage.id}>
                  <StageBadge stage={stage.name} size="sm" />
                </li>
              ))}
            </ol>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export function RequisitionSettingsTab({ id }: { id: string }) {
  const details = useRequisition(id);
  if (!details.data) return <Loading />;
  return (
    <div className="max-w-[920px]">
      <RequisitionSettings requisition={details.data as RequisitionWithSettings} />
    </div>
  );
}

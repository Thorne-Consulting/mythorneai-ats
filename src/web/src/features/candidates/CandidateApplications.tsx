'use client';

import Link from 'next/link';
import { statusColors } from '@/components/ui/Badges';
import { formatDate, humanize } from '@/lib/format';
import type { CandidateDetail } from '@/types';

/** Where this person is in hiring: one line per application, the whole line a link. */
export function CandidateApplications({
  applications,
}: {
  applications: CandidateDetail['applications'];
}) {
  return (
    <>
      <div className="section-head">
        <h2 id="applications-title" className="section-title">
          Applications
        </h2>
        {applications.length > 0 && <span className="section-count">{applications.length}</span>}
      </div>
      {applications.length === 0 ? (
        <p className="record-empty">Not in any job yet.</p>
      ) : (
        <ul className="apps">
          {applications.map((application) => (
            <li key={application.id}>
              <Link href={`/applications/${application.id}`} className="apps-row">
                <span className="apps-job">
                  <span className="apps-title">{application.requisitionTitle}</span>
                  <span className="apps-sub">
                    {application.requisitionCode} · applied {formatDate(application.appliedAt)}
                  </span>
                </span>
                <span className="apps-stage">{application.stage}</span>
                <StatusText status={application.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** A status as a coloured dot and the word, never a pill: the colour is the data, the word reads it. */
export function StatusText({ status }: { status: string }) {
  const color = statusColors[status] ?? 'gray';
  return (
    <span className="status-text">
      <span className="status-dot" style={{ background: `var(--mantine-color-${color}-6)` }} />
      {humanize(status)}
    </span>
  );
}

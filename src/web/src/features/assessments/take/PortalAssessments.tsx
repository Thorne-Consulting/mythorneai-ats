'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardCheck, ExternalLink } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader } from '@/components/ui';
import { when } from '@/features/candidate-portal/portal';
import { plural } from '../scoring';
import { takeHref, type PortalAssessment } from './take-api';

/** The signed-in candidate's assessments, loaded once per page. */
function usePortalAssessments() {
  const [rows, setRows] = useState<PortalAssessment[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/public/assessments')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PortalAssessment[]) => live && setRows(data))
      .catch(() => live && setRows([]));
    return () => {
      live = false;
    };
  }, []);
  return rows;
}

const open = (a: PortalAssessment) => a.status === 'NotStarted' || a.status === 'InProgress';

function detail(a: PortalAssessment) {
  if (a.status === 'InProgress')
    return a.deadlineAt
      ? `Started. Time runs out ${when(a.deadlineAt)}`
      : `Started. Finish by ${when(a.expiresAt)}`;
  const length =
    a.kind === 'External'
      ? `On ${a.providerName ?? 'another website'}`
      : `${a.timed ? `${a.minutes} minutes` : 'No time limit'} · ${plural(a.questions, 'question')}`;
  return `${length} · Finish by ${when(a.expiresAt)}`;
}

/**
 * Assessments to take, styled like the portal's to-do rows. On Home it lists every open one; on
 * an application page (`applicationId`) it also shows the ones already sent. Renders nothing when
 * there is nothing to show.
 */
export function PortalAssessments({ applicationId }: { applicationId?: string }) {
  const rows = usePortalAssessments();
  if (!rows) return null;
  const mine = rows.filter((a) => !applicationId || a.applicationId === applicationId);
  const shown = applicationId
    ? mine.filter((a) => open(a) || a.status === 'Submitted')
    : mine.filter(open);
  if (shown.length === 0) return null;
  return (
    <Card>
      <CardHeader title={applicationId ? 'Assessments' : 'Assessments to take'} />
      <CardBody className="pt-0">
        <ul className="flex flex-col gap-2">
          {shown.map((a) => (
            <li key={a.id}>
              <Link
                href={takeHref(a.id)}
                className="group flex items-center gap-3 rounded-lg border border-border-subtle px-4 py-3 transition-colors hover:border-border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tone-amber-bg text-tone-amber-dot">
                  {a.kind === 'External' ? (
                    <ExternalLink className="size-[18px]" aria-hidden />
                  ) : (
                    <ClipboardCheck className="size-[18px]" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-base font-medium text-fg">
                    {open(a)
                      ? a.status === 'InProgress'
                        ? `Finish ${a.name}`
                        : `Take ${a.name}`
                      : a.name}
                    {a.status === 'Submitted' && (
                      <Badge size="sm" tone="green">
                        Sent
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-fg-subtle">
                    {a.status === 'Submitted'
                      ? `Sent ${when(a.submittedAt ?? a.invitedAt)}`
                      : `${applicationId ? '' : `${a.jobTitle} · `}${detail(a)}`}
                  </span>
                </span>
                <ArrowRight
                  className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

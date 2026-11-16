'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck, Plus } from 'lucide-react';
import { useAbility } from '@/lib/ability';
import { Button, Card, CardBody, CardHeader, RowActions, SkeletonRows } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { resultHref, useApplicationAssessments } from './api';
import { reminderText, useInviteActions } from './invite-actions';
import { InviteStatusBadge, scoreText } from './parts';
import { SendAssessmentModal } from './SendAssessmentModal';

/**
 * Assessments on one application, next to the scorecards: each attempt with its status, score and
 * decision, plus "Send assessment". Renders nothing for interviewers (they never see tests).
 * Place it on the application's Overview and Feedback tabs: `<AssessmentResultsCard applicationId={id} />`.
 */
export function AssessmentResultsCard({ applicationId }: { applicationId: string }) {
  const allowed = useAbility().can('read', 'Assessment');
  const query = useApplicationAssessments(applicationId, allowed);
  const actions = useInviteActions();
  const [sending, setSending] = useState(false);
  if (!allowed || query.isError) return null;
  const data = query.data;
  const rows = (data?.invites ?? []).filter((r) => !r.replaced);
  const canSend = !!data?.canManage && data.active;
  // Nothing sent and nothing to do here: stay out of the way.
  if (data && rows.length === 0 && !canSend) return null;

  return (
    <Card>
      <CardHeader
        title="Assessments"
        action={
          canSend && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Plus />}
              onClick={() => setSending(true)}
            >
              Send assessment
            </Button>
          )
        }
      />
      {!data ? (
        <CardBody className="pt-0">
          <SkeletonRows rows={2} />
        </CardBody>
      ) : rows.length === 0 ? (
        <CardBody className="flex items-start gap-3 pt-0">
          <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          <p className="text-base text-fg-muted">
            No assessment sent yet. Send a quiz, a written task or a take-home; the result shows
            here.
          </p>
        </CardBody>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {rows.map((r) => {
            const score = scoreText(r);
            const detail =
              r.status === 'Submitted'
                ? `Finished ${formatDate(r.submittedAt ?? undefined)}${r.flags ? ` · ${r.flags} ${r.flags === 1 ? 'check' : 'checks'} noted` : ''}`
                : r.status === 'Expired'
                  ? `Link closed ${formatDate(r.expiresAt)}`
                  : [`Due ${formatDate(r.expiresAt)}`, reminderText(r)].filter(Boolean).join(' · ');
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    {r.status === 'Submitted' ? (
                      <Link
                        href={resultHref(r.assessmentId, r.id)}
                        className="text-base font-medium text-fg hover:underline"
                      >
                        {r.assessmentName}
                      </Link>
                    ) : (
                      <span className="text-base font-medium text-fg">{r.assessmentName}</span>
                    )}
                    <InviteStatusBadge row={r} />
                  </p>
                  <p className="mt-0.5 text-sm text-fg-subtle">
                    {r.attempt > 1 ? `Attempt ${r.attempt} · ` : ''}
                    {detail}
                  </p>
                </div>
                {score && (
                  <span
                    className={
                      r.percent !== null
                        ? 'text-md font-semibold text-fg tnum'
                        : 'text-sm text-fg-muted tnum'
                    }
                  >
                    {score}
                  </span>
                )}
                {data.canManage && (
                  <RowActions label={`Actions for ${r.assessmentName}`}>
                    {actions.menu(r)}
                  </RowActions>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {actions.dialogs}
      <SendAssessmentModal
        opened={sending}
        onClose={() => setSending(false)}
        applicationIds={[applicationId]}
      />
    </Card>
  );
}

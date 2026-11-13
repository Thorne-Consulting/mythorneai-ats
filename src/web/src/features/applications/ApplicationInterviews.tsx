'use client';

import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { useCurrentUser } from '@/auth';
import { Button, Card, EmptyState, SkeletonRows } from '@/components/ui';
import {
  canManageRole,
  LoadError,
  useApplication,
  useInvalidateApplication,
} from './application-data';
import { InterviewCard } from './InterviewCard';
import { InterviewModal } from './InterviewModal';

export function ApplicationInterviews({ id }: { id: string }) {
  const user = useCurrentUser();
  const query = useApplication(id);
  const invalidate = useInvalidateApplication(id);
  const [interviewOpened, setInterviewOpened] = useState(false);
  const canManage = canManageRole(user.role);

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;
  if (!query.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  const application = query.data.application;
  // The person who came here to run an interview sees theirs first.
  const orderedInterviews = [...application.interviews].sort((a, b) => {
    const mine =
      Number(b.interviewerEmails.includes(user.email)) -
      Number(a.interviewerEmails.includes(user.email));
    if (mine !== 0) return mine;
    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
  });

  // ponytail: "Schedule interview" for a page with interviews lives in the record header.
  return (
    <div className="space-y-4">
      {orderedInterviews.map((interview) => (
        <InterviewCard
          key={interview.id}
          interview={interview}
          applicationId={id}
          candidateName={application.candidateName}
          currentEmail={user.email}
          canManage={canManage}
          interviewKits={application.interviewKits}
          onUpdated={invalidate}
        />
      ))}
      {application.interviews.length === 0 && (
        <Card>
          <EmptyState
            icon={CalendarPlus}
            title="No interviews yet"
            description="Scheduling the first one starts structured feedback."
            action={
              canManage && (
                <Button leftIcon={<CalendarPlus />} onClick={() => setInterviewOpened(true)}>
                  Schedule interview
                </Button>
              )
            }
          />
        </Card>
      )}
      <InterviewModal
        applicationId={id}
        interviewKits={application.interviewKits}
        opened={interviewOpened}
        onClose={() => setInterviewOpened(false)}
        onSaved={invalidate}
      />
    </div>
  );
}

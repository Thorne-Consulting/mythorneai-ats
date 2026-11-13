'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarX2, ExternalLink, FileText, PanelRightOpen, X } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import { StatusBadge } from '@/components/status';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  EmptyState,
  IconButton,
  PageHeader,
  SkeletonRows,
  SplitView,
  Textarea,
} from '@/components/ui';
import { LoadError, useApplication } from '@/features/applications/application-data';
import type { Interview } from '@/features/applications/application-types';
import { InterviewQuestions } from '@/features/applications/InterviewQuestions';
import { formatDateTime } from '@/lib/format';
import { useLocalStorageState } from '@/lib/hooks';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail } from '@/types';

const crumbs = [{ label: 'Interviews', href: '/interviews' }];

/**
 * The interviewer's page for one interview: when, where and who; the kit's questions; the
 * candidate's resume beside them; private notes kept in this browser; and the way to the scorecard.
 */
export function InterviewPrep({ id, applicationId }: { id: string; applicationId?: string }) {
  if (!applicationId)
    return (
      <>
        <PageHeader breadcrumbs={[...crumbs, { label: 'Interview' }]} title="Interview" />
        <Card>
          <EmptyState
            icon={CalendarX2}
            title="Open this interview from the calendar"
            description="This link is missing some details."
            action={
              <Button asChild variant="secondary">
                <Link href="/interviews">Go to interviews</Link>
              </Button>
            }
          />
        </Card>
      </>
    );
  return <Prep id={id} applicationId={applicationId} />;
}

function Prep({ id, applicationId }: { id: string; applicationId: string }) {
  const user = useCurrentUser();
  const query = useApplication(applicationId);
  const [resumeOpen, setResumeOpen] = useLocalStorageState('interview-prep:resume-open', true);
  const [notes, setNotes] = useLocalStorageState(`interview-notes:${id}`, '');

  if (query.isError)
    return (
      <>
        <PageHeader breadcrumbs={[...crumbs, { label: 'Interview' }]} title="Interview" />
        <LoadError error={query.error} onRetry={query.refetch} />
      </>
    );
  if (!query.data)
    return (
      <>
        <PageHeader breadcrumbs={[...crumbs, { label: 'Interview' }]} title="Interview" />
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </>
    );

  const application = query.data.application;
  const interview = application.interviews.find((item) => item.id === id);
  if (!interview)
    return (
      <>
        <PageHeader breadcrumbs={[...crumbs, { label: 'Interview' }]} title="Interview" />
        <Card>
          <EmptyState
            icon={CalendarX2}
            title="This interview is no longer available"
            description="It may have been deleted, or you are no longer one of its interviewers."
            action={
              <Button asChild variant="secondary">
                <Link href={`/applications/${applicationId}/interviews`}>See all interviews</Link>
              </Button>
            }
          />
        </Card>
      </>
    );

  const cancelled = interview.status === 'Cancelled';
  const assigned = interview.interviewerEmails.includes(user.email);
  const submitted = interview.scorecards.some((card) => card.interviewerEmail === user.email);
  const owes = assigned && !submitted && !cancelled;
  const scorecardHref = `/applications/${applicationId}/scorecards?interview=${id}`;
  const meetingUrl = safeWebUrl(interview.meetingLink);
  const resume = (onClose?: () => void) => (
    <ResumeSummary candidateId={application.candidateId} onClose={onClose} />
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[
          ...crumbs,
          { label: application.candidateName, href: `/applications/${applicationId}` },
          { label: interview.title },
        ]}
        title={interview.title}
        description={`For the ${application.requisitionTitle} job`}
        actions={
          <>
            {!resumeOpen && (
              <Button
                variant="secondary"
                className="hidden lg:inline-flex"
                leftIcon={<PanelRightOpen />}
                onClick={() => setResumeOpen(true)}
              >
                Show resume
              </Button>
            )}
            {meetingUrl && !cancelled && (
              <Button asChild variant="secondary">
                <a href={meetingUrl} target="_blank" rel="noreferrer">
                  Join meeting
                  <ExternalLink />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            )}
            {owes ? (
              <Button asChild>
                <Link href={scorecardHref}>Write scorecard</Link>
              </Button>
            ) : (
              <Button asChild variant="secondary">
                <Link href={`/applications/${applicationId}/scorecards`}>View scorecards</Link>
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={interview.status} />
          {assigned && submitted && (
            <Badge tone="green" dot>
              Scorecard submitted
            </Badge>
          )}
          {owes && new Date(interview.startsAt) < new Date() && (
            <Badge tone="amber" dot>
              Scorecard due
            </Badge>
          )}
        </div>
      </PageHeader>

      <SplitView
        storageKey="interview-prep"
        sideOpen={resumeOpen}
        defaultWidth={400}
        main={
          <div className="space-y-5">
            <Card>
              <CardHeader title="When and where" />
              <CardBody>
                <DescriptionList
                  columns={2}
                  items={[
                    {
                      label: 'When',
                      value: `${formatDateTime(interview.startsAt)}–${new Date(interview.endsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
                    },
                    { label: 'Time zone', value: interview.timeZone },
                    {
                      label: 'Where',
                      value: meetingUrl ? (
                        <a
                          href={meetingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-accent-foreground hover:underline"
                        >
                          {meetingUrl}
                        </a>
                      ) : (
                        'No meeting link yet'
                      ),
                    },
                    { label: 'Interview kit', value: interview.interviewKitName ?? 'None' },
                  ]}
                />
                <h3 className="mt-5 text-xs text-fg-subtle">Who</h3>
                <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                  <li className="flex items-center gap-2 text-sm text-fg">
                    <Avatar name={application.candidateName} size="sm" />
                    {application.candidateName}
                    <span className="text-fg-subtle">candidate</span>
                  </li>
                  {interview.interviewerEmails.map((email) => (
                    <li key={email} className="flex items-center gap-2 text-sm text-fg">
                      <Avatar name={email} size="sm" />
                      {email}
                      {email === user.email && <span className="text-fg-subtle">you</span>}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>

            <KitCard
              interview={interview}
              applicationId={applicationId}
              candidateName={application.candidateName}
            />

            <Card>
              <CardHeader
                title="Private notes"
                description="Only you can see these. They are saved in this browser. Copy what matters into your scorecard."
              />
              <CardBody>
                <Textarea
                  aria-label="Private notes"
                  minRows={6}
                  placeholder="What they said, examples they gave, follow-ups to ask…"
                  value={notes}
                  onChange={(event) => setNotes(event.currentTarget.value)}
                />
              </CardBody>
            </Card>

            <div className="lg:hidden">{resume()}</div>
          </div>
        }
        side={resume(() => setResumeOpen(false))}
      />
    </>
  );
}

function KitCard({
  interview,
  applicationId,
  candidateName,
}: {
  interview: Interview;
  applicationId: string;
  candidateName: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Questions to cover"
        description={
          interview.criteria.length ? 'You score each of these on your scorecard.' : undefined
        }
        action={
          interview.status !== 'Cancelled' && (
            <InterviewQuestions
              applicationId={applicationId}
              interviewKitId={interview.interviewKitId}
              candidateName={candidateName}
            />
          )
        }
      />
      <CardBody className="space-y-3">
        {interview.interviewKitInstructions && (
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs font-medium text-fg-subtle">Interviewer instructions</p>
            <p className="mt-1 whitespace-pre-wrap text-base text-fg">
              {interview.interviewKitInstructions}
            </p>
          </div>
        )}
        {interview.criteria.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            This interview has no kit. Use Suggest questions, or ask the recruiter to add a kit so
            every interviewer scores the same things.
          </p>
        ) : (
          <ol className="space-y-2">
            {interview.criteria.map((criterion, index) => (
              <li key={criterion.id} className="rounded-lg border border-border-subtle p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-sm font-semibold text-fg">
                    <span className="text-fg-subtle tnum">{index + 1}.</span> {criterion.name}
                  </p>
                  <span className="text-xs text-fg-subtle tnum">Weight {criterion.weight}</span>
                </div>
                <p className="mt-1 text-base text-fg">{criterion.question}</p>
                {criterion.description && (
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    What good looks like: {criterion.description}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

/** The parsed resume in brief, for reading beside the questions. */
function ResumeSummary({ candidateId, onClose }: { candidateId: string; onClose?: () => void }) {
  const query = useQuery({
    queryKey: ['candidate', candidateId],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${candidateId}`),
  });
  const candidate = query.data;
  const groups: [string, string[]][] = candidate
    ? [
        ['Recent roles', candidate.resumeJobTitles.slice(0, 5)],
        ['Education', candidate.resumeEducation],
        ['Certifications', candidate.resumeCertifications],
        ['Languages', candidate.resumeLanguages],
      ]
    : [];
  const empty =
    candidate &&
    !candidate.resumeSummary &&
    candidate.resumeSkills.length === 0 &&
    candidate.resumeJobTitles.length === 0;
  return (
    <Card>
      <CardHeader
        title="Resume"
        description={
          candidate &&
          [
            candidate.currentTitle,
            candidate.location,
            candidate.resumeYearsExperience != null &&
              `${candidate.resumeYearsExperience} years of experience`,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        action={
          onClose && (
            <IconButton label="Hide resume" size="sm" variant="quiet" onClick={onClose}>
              <X />
            </IconButton>
          )
        }
      />
      <CardBody className="space-y-4">
        {query.isError ? (
          <p className="text-sm text-fg-subtle">Could not load the resume.</p>
        ) : !candidate ? (
          <SkeletonRows rows={4} />
        ) : empty ? (
          <EmptyState
            compact
            icon={FileText}
            title="No resume details yet"
            description="Open the full profile to see the original file."
          />
        ) : (
          <>
            {candidate.resumeSummary && (
              <p className="whitespace-pre-wrap text-sm text-fg">{candidate.resumeSummary}</p>
            )}
            {candidate.resumeSkills.length > 0 && (
              <section>
                <h3 className="text-xs text-fg-subtle">Skills</h3>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {candidate.resumeSkills.slice(0, 24).map((skill) => (
                    <Badge key={skill} size="sm">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </section>
            )}
            {groups
              .filter(([, items]) => items.length > 0)
              .map(([title, items]) => (
                <section key={title}>
                  <h3 className="text-xs text-fg-subtle">{title}</h3>
                  <ul className="mt-1 space-y-0.5 text-sm text-fg">
                    {items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
          </>
        )}
        <Link
          href={`/candidates/${candidateId}`}
          className="inline-block text-sm font-medium text-accent-foreground hover:underline"
        >
          Full resume and profile
        </Link>
      </CardBody>
    </Card>
  );
}

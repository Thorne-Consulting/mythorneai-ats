'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { api } from '@/api';
import { Avatar, Button, Card, IconButton, SkeletonRows, toast } from '@/components/ui';
import { StageBadge, StatusBadge } from '@/components/status';
import { formatDate } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail, ResumeProfile } from '@/types';
import type { Filters } from './candidate-filters';

/** What the list knows about a person; the panel loads the rest. */
export type PreviewPerson = {
  id: string;
  name: string;
  email: string;
  currentTitle?: string | null;
  location?: string | null;
  skills: string[];
  matchedTerms: string[];
  doNotContact?: boolean;
  /** Rating and fit per application, when the list has them. */
  applications?: { id: string; rating?: number | null; fitScore?: number | null }[];
};

type Scores = { rating?: number | null; fitScore?: number | null } | undefined;

function scoresFor(person: PreviewPerson, applicationId: string): Scores {
  return person.applications?.find((app) => app.id === applicationId);
}

/** "Rated 4.0 · AI match 72%", or empty when neither is known. */
function scoreText(scores: Scores) {
  return [
    scores?.rating ? `Rated ${scores.rating.toFixed(1)}` : null,
    scores?.fitScore != null ? `AI match ${scores.fitScore}%` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Skills that matched the search come first, in bold. */
export function SkillText({ person, limit }: { person: PreviewPerson; limit: number }) {
  const matched = person.matchedTerms.filter((term) => person.skills.includes(term));
  const rest = person.skills.filter((skill) => !matched.includes(skill));
  return [...matched, ...rest].slice(0, limit).map((skill, index) => (
    <span key={skill}>
      {index > 0 && ', '}
      {matched.includes(skill) ? <b>{skill}</b> : skill}
    </span>
  ));
}

type OnFilter = (patch: Partial<Filters>) => void;

/** A parsed value that narrows the list to people like this one, when the list allows it. */
function FilterLink({
  patch,
  onFilter,
  children,
}: {
  patch: Partial<Filters>;
  onFilter?: OnFilter;
  children: ReactNode;
}) {
  if (!onFilter) return <>{children}</>;
  return (
    <button
      type="button"
      className="rounded-sm text-left underline decoration-border decoration-dotted underline-offset-2 hover:text-accent-foreground hover:decoration-current"
      title="Show people like this"
      onClick={() => onFilter(patch)}
    >
      {children}
    </button>
  );
}

/** "2021 – now · 4 years" for a job on the parsed resume. */
function span(role: ResumeProfile['work'][number]) {
  const years = role.durationMonths ? Math.round(role.durationMonths / 1.2) / 10 : null;
  return [
    [role.startYear, role.isCurrent ? 'now' : role.endYear].filter(Boolean).join(' – '),
    years ? `${years} ${years === 1 ? 'year' : 'years'}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

const SENIORITY_FILTERS = ['Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Director', 'Executive'];
const DEGREE_LABELS: Record<string, string> = {
  HighSchool: 'High school',
  Associate: 'Associate',
  Bachelor: "Bachelor's",
  Master: "Master's",
  Doctorate: 'Doctorate',
};

/** A short fact sheet about one person; the profile has the rest. */
export function CandidatePreview({
  person,
  onFilter,
  onClose,
}: {
  person: PreviewPerson;
  onFilter?: OnFilter;
  onClose?: () => void;
}) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['candidate', person.id],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${person.id}`),
  });
  const detail = query.data?.id === person.id ? query.data : undefined;
  const linkedIn = safeWebUrl(detail?.linkedInUrl);
  // The parsed resume; null while it loads or when there is none to show.
  const resumeQuery = useQuery({
    queryKey: ['candidate-resume', person.id],
    queryFn: () => api.get<ResumeProfile>(`/api/candidates/${person.id}/resume`),
    retry: false,
  });
  const resume =
    resumeQuery.data?.id === person.id && resumeQuery.data.parsedAt ? resumeQuery.data : null;
  const seniorityLink =
    resume && SENIORITY_FILTERS.includes(resume.seniority) ? resume.seniority : null;
  const degreeLink =
    resume && DEGREE_LABELS[resume.highestDegreeLevel] ? resume.highestDegreeLevel : null;

  const heading = (text: string) => (
    <h4 className="mt-5 mb-2 text-xs font-medium text-fg-subtle">{text}</h4>
  );

  return (
    <Card
      className="flex max-h-[calc(100dvh-117px)] flex-col overflow-y-auto p-5"
      role="complementary"
      aria-label={`About ${person.name}`}
    >
      <div className="flex items-center gap-3">
        <Avatar name={person.name} size="lg" />
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-fg">{person.name}</h3>
          <p className="truncate text-sm text-fg-muted">
            {[person.currentTitle ?? 'No title on file', person.location]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {onClose && (
          <IconButton
            label="Close preview"
            variant="quiet"
            className="ml-auto self-start"
            onClick={onClose}
          >
            <X />
          </IconButton>
        )}
      </div>
      {query.isError ? (
        <p className="mt-4 text-sm text-destructive">
          Could not load this candidate. Try again soon.
        </p>
      ) : !detail ? (
        <SkeletonRows rows={3} className="px-0" />
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-3 divide-x divide-border-subtle rounded-lg bg-muted py-3 text-center">
            {[
              [resume?.yearsExperience ?? detail.resumeYearsExperience ?? '–', 'years'],
              [seniorityLink ?? '–', 'level'],
              [degreeLink ? DEGREE_LABELS[degreeLink] : '–', 'degree'],
            ].map(([value, label]) => (
              <div key={label} className="min-w-0 px-2">
                <dd className="truncate text-base font-semibold text-fg tnum">{value}</dd>
                <dt className="text-2xs text-fg-subtle">{label}</dt>
              </div>
            ))}
          </dl>
          {heading('Where they are')}
          {detail.applications.length === 0 ? (
            <p className="text-sm text-fg-subtle">Not in any job yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {detail.applications.map((app) => (
                <li key={app.id} className={app.status !== 'Active' ? 'opacity-70' : undefined}>
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/applications/${app.id}`}
                      className="min-w-0 truncate text-base font-medium text-accent-foreground hover:underline"
                    >
                      {app.requisitionTitle}
                    </Link>
                    {app.status === 'Active' ? (
                      <StageBadge
                        stage={app.stage}
                        type={app.stageType}
                        color={app.stageColor}
                        size="sm"
                      />
                    ) : (
                      <StatusBadge status={app.status} size="sm" />
                    )}
                  </div>
                  <p className="text-xs text-fg-subtle">
                    Applied {formatDate(app.appliedAt)}
                    {scoreText(scoresFor(person, app.id)) &&
                      ` · ${scoreText(scoresFor(person, app.id))}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {resume && resume.work.length > 0 && (
            <>
              {heading('Experience')}
              <ul className="space-y-2">
                {resume.work.slice(0, 4).map((role) => (
                  <li key={role.id} className="text-sm">
                    <p className="font-medium text-fg">{role.title}</p>
                    <p className="text-fg-muted">
                      <FilterLink patch={{ company: role.company }} onFilter={onFilter}>
                        {role.company}
                      </FilterLink>
                      {span(role) ? ` · ${span(role)}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {resume && resume.education.length > 0 && (
            <>
              {heading('Education')}
              <ul className="space-y-2">
                {resume.education.slice(0, 2).map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <p className="font-medium text-fg">
                      {entry.degree ?? entry.field ?? 'Studied'}
                    </p>
                    <p className="text-fg-muted">
                      <FilterLink patch={{ school: entry.school }} onFilter={onFilter}>
                        {entry.school}
                      </FilterLink>
                      {entry.isInProgress
                        ? ' · in progress'
                        : entry.endYear
                          ? ` · ${entry.endYear}`
                          : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
          {heading('About')}
          <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm [&_dd]:text-fg [&_dt]:text-fg-subtle">
            {person.skills.length > 0 && (
              <>
                <dt>Skills</dt>
                <dd>
                  {person.skills.slice(0, 10).map((skill, index) => (
                    <span key={skill}>
                      {index > 0 && ', '}
                      <FilterLink patch={{ skills: [skill], skillMode: 'any' }} onFilter={onFilter}>
                        {person.matchedTerms.includes(skill) ? <b>{skill}</b> : skill}
                      </FilterLink>
                    </span>
                  ))}
                </dd>
              </>
            )}
            {resume && resume.certifications.length > 0 && (
              <>
                <dt>Certificates</dt>
                <dd>
                  {resume.certifications
                    .slice(0, 3)
                    .map((cert) => cert.name)
                    .join(', ')}
                </dd>
              </>
            )}
            {resume && resume.languages.length > 0 && (
              <>
                <dt>Languages</dt>
                <dd>{resume.languages.map((item) => item.language).join(', ')}</dd>
              </>
            )}
            <dt>Email</dt>
            <dd className="truncate">
              <a className="text-accent-foreground hover:underline" href={`mailto:${person.email}`}>
                {person.email}
              </a>
            </dd>
            {detail.phone && (
              <>
                <dt>Phone</dt>
                <dd>{detail.phone}</dd>
              </>
            )}
            {linkedIn && (
              <>
                <dt>LinkedIn</dt>
                <dd>
                  <a
                    className="text-accent-foreground hover:underline"
                    href={linkedIn}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on LinkedIn
                  </a>
                </dd>
              </>
            )}
            <dt>Source</dt>
            <dd>{detail.source}</dd>
          </dl>
        </>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => router.push(`/candidates/${person.id}`)}>Open profile</Button>
        <Button
          variant="secondary"
          onClick={() => {
            navigator.clipboard.writeText(person.email);
            toast(`Copied ${person.email}`);
          }}
        >
          Copy email
        </Button>
      </div>
    </Card>
  );
}

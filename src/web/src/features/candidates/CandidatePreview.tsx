'use client';

import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate, formatRelative } from '@/lib/format';
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

/** "Rated 4.0 · fit 72", or empty when neither is known. */
function scoreText(scores: Scores) {
  return [
    scores?.rating ? `Rated ${scores.rating.toFixed(1)}` : null,
    scores?.fitScore != null ? `fit ${scores.fitScore}` : null,
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
  children: React.ReactNode;
}) {
  if (!onFilter) return <>{children}</>;
  return (
    <button
      type="button"
      className="people-filter"
      title="Show people like this"
      onClick={() => onFilter(patch)}
    >
      {children}
    </button>
  );
}

/** "2021 – now · 4 yrs" for a job on the parsed resume. */
function span(role: ResumeProfile['work'][number]) {
  const years = role.durationMonths ? Math.round(role.durationMonths / 1.2) / 10 : null;
  return [
    [role.startYear, role.isCurrent ? 'now' : role.endYear].filter(Boolean).join(' – '),
    years ? `${years} yrs` : null,
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
}: {
  person: PreviewPerson;
  onFilter?: OnFilter;
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

  return (
    <aside className="people-panel" aria-label={`About ${person.name}`}>
      <h3 className="people-pname">{person.name}</h3>
      <p className="people-prole">
        {[person.currentTitle ?? 'No title on file', person.location].filter(Boolean).join(' · ')}
      </p>
      {query.isError ? (
        <Text size="sm" c="red" mt="md">
          Could not load the full record.
        </Text>
      ) : !detail ? (
        <LoadingBlock rows={3} />
      ) : (
        <>
          <div className="people-stats">
            <span>
              <b>{resume?.yearsExperience ?? detail.resumeYearsExperience ?? '–'}</b>
              <span>years</span>
            </span>
            <span>
              <b>{seniorityLink ?? '–'}</b>
              <span>level</span>
            </span>
            <span>
              <b>{degreeLink ? DEGREE_LABELS[degreeLink] : '–'}</b>
              <span>degree</span>
            </span>
          </div>
          <h4 className="people-h">Where they are</h4>
          {detail.applications.length === 0 ? (
            <p className="people-none">Not applied to any job yet.</p>
          ) : (
            <ul className="people-where">
              {detail.applications.map((app) => (
                <li key={app.id} data-closed={app.status !== 'Active' || undefined}>
                  <a href={`/applications/${app.id}`}>{app.requisitionTitle}</a>
                  <span className="people-sub">
                    {app.status === 'Active' ? app.stage : app.status} · applied{' '}
                    {formatDate(app.appliedAt)}
                  </span>
                  {scoreText(scoresFor(person, app.id)) && (
                    <span className="people-sub">{scoreText(scoresFor(person, app.id))}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {resume && resume.work.length > 0 && (
            <>
              <h4 className="people-h">Experience</h4>
              <ul className="people-roles">
                {resume.work.slice(0, 4).map((role) => (
                  <li key={role.id}>
                    <b>{role.title}</b>
                    <span>
                      <FilterLink patch={{ company: role.company }} onFilter={onFilter}>
                        {role.company}
                      </FilterLink>
                      {span(role) ? ` · ${span(role)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {resume && resume.education.length > 0 && (
            <>
              <h4 className="people-h">Education</h4>
              <ul className="people-roles">
                {resume.education.slice(0, 2).map((entry) => (
                  <li key={entry.id}>
                    <b>{entry.degree ?? entry.field ?? 'Studied'}</b>
                    <span>
                      <FilterLink patch={{ school: entry.school }} onFilter={onFilter}>
                        {entry.school}
                      </FilterLink>
                      {entry.isInProgress
                        ? ' · in progress'
                        : entry.endYear
                          ? ` · ${entry.endYear}`
                          : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h4 className="people-h">About</h4>
          <dl className="people-sheet">
            {person.skills.length > 0 && (
              <>
                <dt>Skills</dt>
                <dd>
                  <span className="people-wrap">
                    {person.skills.slice(0, 10).map((skill, index) => (
                      <span key={skill}>
                        {index > 0 && ', '}
                        <FilterLink
                          patch={{ skills: [skill], skillMode: 'any' }}
                          onFilter={onFilter}
                        >
                          {person.matchedTerms.includes(skill) ? <b>{skill}</b> : skill}
                        </FilterLink>
                      </span>
                    ))}
                  </span>
                </dd>
              </>
            )}
            {resume && resume.certifications.length > 0 && (
              <>
                <dt>Certificates</dt>
                <dd>
                  {resume.certifications.slice(0, 3).map((cert) => (
                    <span key={cert.id} className="people-wrap">
                      {cert.name}
                    </span>
                  ))}
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
            <dd>
              <span>
                <a className="people-link" href={`mailto:${person.email}`}>
                  {person.email}
                </a>
              </span>
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
                    className="people-link"
                    href={linkedIn}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                  </a>
                </dd>
              </>
            )}
            <dt>Source</dt>
            <dd>{detail.source}</dd>
          </dl>
        </>
      )}
      <Group gap="sm" mt="lg">
        <Button onClick={() => router.push(`/candidates/${person.id}`)}>Open profile</Button>
        <Button
          variant="default"
          onClick={() => {
            navigator.clipboard.writeText(person.email);
            notifications.show({ message: `Copied ${person.email}` });
          }}
        >
          Copy email
        </Button>
      </Group>
    </aside>
  );
}

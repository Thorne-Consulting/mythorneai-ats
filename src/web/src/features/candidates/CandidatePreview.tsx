'use client';

import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatDate, formatRelative } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail } from '@/types';

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

/** A short fact sheet about one person; the profile has the rest. */
export function CandidatePreview({ person }: { person: PreviewPerson }) {
  const router = useRouter();
  const query = useQuery({
    queryKey: ['candidate', person.id],
    queryFn: () => api.get<CandidateDetail>(`/api/candidates/${person.id}`),
  });
  const detail = query.data?.id === person.id ? query.data : undefined;
  const linkedIn = safeWebUrl(detail?.linkedInUrl);

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
              <b>{detail.resumeYearsExperience ?? '–'}</b>
              <span>years</span>
            </span>
            <span>
              <b>{detail.applications.filter((app) => app.status === 'Active').length}</b>
              <span>active jobs</span>
            </span>
            <span>
              <b>{detail.attachments.length}</b>
              <span>{detail.attachments.length === 1 ? 'file' : 'files'}</span>
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
          <h4 className="people-h">About</h4>
          <dl className="people-sheet">
            {detail.resumeJobTitles.length > 0 && (
              <>
                <dt>Roles</dt>
                <dd>
                  {detail.resumeJobTitles.slice(0, 3).map((title) => (
                    <span key={title}>{title}</span>
                  ))}
                </dd>
              </>
            )}
            {detail.resumeEducation.length > 0 && (
              <>
                <dt>Education</dt>
                <dd>
                  <span>{detail.resumeEducation[0]}</span>
                </dd>
              </>
            )}
            {person.skills.length > 0 && (
              <>
                <dt>Skills</dt>
                <dd>
                  <div>
                    <SkillText person={person} limit={10} />
                  </div>
                </dd>
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
            <dt>Added</dt>
            <dd>
              {formatDate(detail.createdAt)} · updated {formatRelative(detail.updatedAt)}
            </dd>
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

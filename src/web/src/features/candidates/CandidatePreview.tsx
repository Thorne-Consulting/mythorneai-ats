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
};

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

/** Everything about one person: their numbers, where they are, what they bring, how to reach them. */
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
              <span>active</span>
            </span>
            <span>
              <b>{detail.attachments.length}</b>
              <span>{detail.attachments.length === 1 ? 'file' : 'files'}</span>
            </span>
          </div>
          <h4 className="people-h">Where they are</h4>
          {detail.applications.length === 0 ? (
            <p className="people-text">Not applied to any job yet.</p>
          ) : (
            <ul className="people-where">
              {detail.applications.map((app) => (
                <li key={app.id} data-closed={app.status !== 'Active' || undefined}>
                  <a href={`/applications/${app.id}`}>{app.requisitionTitle}</a>
                  <span className="people-sub">
                    {app.requisitionCode} · {app.stage}
                    {app.status !== 'Active' ? ` · ${app.status}` : ''}
                  </span>
                  <span className="people-sub">
                    Applied {formatDate(app.appliedAt)} · active{' '}
                    {formatRelative(app.lastActivityAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <h4 className="people-h">Highlights</h4>
          <p className="people-text">{detail.resumeSummary ?? 'No resume summary yet.'}</p>
          {person.skills.length > 0 && (
            <p className="people-text people-text-more">
              <SkillText person={person} limit={30} />
            </p>
          )}
          {(detail.resumeJobTitles.length > 0 ||
            detail.resumeEducation.length > 0 ||
            detail.resumeCertifications.length > 0 ||
            detail.resumeLanguages.length > 0) && (
            <>
              <h4 className="people-h">Background</h4>
              <div className="people-lines">
                {detail.resumeJobTitles.length > 0 && (
                  <p className="people-text">
                    <span className="people-label">Past roles</span>
                    {detail.resumeJobTitles.slice(0, 5).join('; ')}
                  </p>
                )}
                {detail.resumeEducation.length > 0 && (
                  <p className="people-text">
                    <span className="people-label">Education</span>
                    {detail.resumeEducation.join('; ')}
                  </p>
                )}
                {detail.resumeCertifications.length > 0 && (
                  <p className="people-text">
                    <span className="people-label">Certifications</span>
                    {detail.resumeCertifications.join(', ')}
                  </p>
                )}
                {detail.resumeLanguages.length > 0 && (
                  <p className="people-text">
                    <span className="people-label">Languages</span>
                    {detail.resumeLanguages.join(', ')}
                  </p>
                )}
              </div>
            </>
          )}
          {detail.attachments.length > 0 && (
            <>
              <h4 className="people-h">Files</h4>
              <ul className="people-files">
                {detail.attachments.map((file) => (
                  <li key={file.id}>
                    {file.originalFileName}
                    <span className="people-sub">
                      Uploaded {formatRelative(file.uploadedAt)} ·{' '}
                      {file.parseStatus === 'Parsed' || file.parsedAt
                        ? 'read'
                        : file.parseError
                          ? 'could not be read'
                          : 'not read yet'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="people-contact">
            <a href={`mailto:${person.email}`}>{person.email}</a>
            {detail.phone && <> · {detail.phone}</>}
            {linkedIn && (
              <>
                {' · '}
                <a href={linkedIn} target="_blank" rel="noopener noreferrer">
                  LinkedIn
                </a>
              </>
            )}
            <br />
            <span className="people-sub">
              From {detail.source}
              {detail.tags.length ? ` · ${detail.tags.join(', ')}` : ''}
              {detail.doNotContact ? ' · Do not contact' : ''}
            </span>
            <span className="people-sub">
              Added {formatDate(detail.createdAt)} · updated {formatRelative(detail.updatedAt)}
              {detail.resumeParsedAt
                ? ` · resume read ${formatRelative(detail.resumeParsedAt)}`
                : ''}
            </span>
          </div>
        </>
      )}
      <Group gap="sm" mt="md">
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

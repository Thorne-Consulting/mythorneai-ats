'use client';

import { useState, type ReactNode } from 'react';
import { Code } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { formatRelative } from '@/lib/format';
import { safeWebUrl } from '@/lib/safe-url';
import type { ResumeProfile } from '@/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function when(year?: number | null, month?: number | null) {
  if (!year) return null;
  return month ? `${MONTHS[month - 1]} ${year}` : String(year);
}

function span(item: {
  startYear?: number | null;
  startMonth?: number | null;
  endYear?: number | null;
  endMonth?: number | null;
  isCurrent: boolean;
}) {
  const start = when(item.startYear, item.startMonth);
  const end = item.isCurrent ? 'Present' : when(item.endYear, item.endMonth);
  if (!start && !end) return null;
  return `${start ?? '?'} – ${end ?? '?'}`;
}

function duration(months?: number | null) {
  if (!months) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return [years ? `${years} yr${years === 1 ? '' : 's'}` : null, rest ? `${rest} mo` : null]
    .filter(Boolean)
    .join(' ');
}

/** "ComputerScience" reads as "Computer Science". */
function pretty(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** The parser wrote this but could not find it in the document: the text itself gets the amber mark. */
function Mark({ verified, children }: { verified: boolean; children: ReactNode }) {
  if (verified) return <>{children}</>;
  return (
    <span className="unverified" title="Not found in the document. Check the original.">
      {children}
    </span>
  );
}

/** A value the parser judged rather than copied: seniority, contract type, degree level. */
function Inferred({ children }: { children: ReactNode }) {
  return (
    <span className="inferred" title="The parser's judgement, not stated in the resume">
      {children}
    </span>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="resume-h">{children}</h3>;
}

/** Pieces joined with " · ", skipping the empty ones. */
function Dots({ parts }: { parts: ReactNode[] }) {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== false);
  return (
    <>
      {shown.map((part, index) => (
        <span key={index}>
          {index > 0 && ' · '}
          {part}
        </span>
      ))}
    </>
  );
}

/**
 * The resume as a document to read, not a form that was filled in. Experience and education as
 * dated entries, skills by kind, the rest as plain lines. Read-only: it comes only from the file.
 */
export function ResumeDocument({
  candidateId,
  canReparse,
}: {
  candidateId: string;
  canReparse: boolean;
}) {
  const [compare, setCompare] = useState(false);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['candidate-resume', candidateId],
    queryFn: () => api.get<ResumeProfile>(`/api/candidates/${candidateId}/resume`),
    refetchInterval: (result) =>
      result.state.data?.attachment?.parseStatus === 'Pending' ||
      result.state.data?.attachment?.parseStatus === 'Processing'
        ? 2_000
        : false,
  });
  const reparse = useMutation({
    mutationFn: (attachmentId: string) =>
      api.post(`/api/candidates/${candidateId}/attachments/${attachmentId}/parse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate-resume', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      notifications.show({ color: 'teal', message: 'Re-parse queued' });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  const profile = query.data;
  const attachment = profile?.attachment;
  const parsing = attachment?.parseStatus === 'Pending' || attachment?.parseStatus === 'Processing';
  const isPdf = attachment?.contentType === 'application/pdf';

  const head = (
    <div className="section-head">
      <h2 id="resume-title" className="section-title">
        Resume
      </h2>
      {attachment && (
        <span className="text-actions">
          <a
            className="text-action"
            href={`/api/attachments/${attachment.id}${isPdf ? '?inline=true' : ''}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open original
          </a>
          {profile?.parsedAt && (
            <button type="button" className="text-action" onClick={() => setCompare((on) => !on)}>
              {compare ? 'Hide the original' : 'Compare with the original'}
            </button>
          )}
          {canReparse && (
            <button
              type="button"
              className="text-action"
              disabled={parsing || reparse.isPending}
              onClick={() => reparse.mutate(attachment.id)}
            >
              {parsing ? 'Reading…' : 'Read it again'}
            </button>
          )}
        </span>
      )}
    </div>
  );

  if (query.isError)
    return (
      <>
        {head}
        <p className="record-empty">Could not load the resume.</p>
      </>
    );
  if (!profile) return <LoadingBlock rows={6} />;
  if (!attachment)
    return (
      <>
        {head}
        <p className="record-empty">No resume yet. Upload one under Documents.</p>
      </>
    );

  let body: ReactNode;
  if (!profile.parsedAt) {
    body = (
      <p className="record-empty">
        {parsing
          ? 'Reading the resume…'
          : attachment.parseStatus === 'NeedsOcr'
            ? 'This file has no text layer, so nothing could be read from it. It needs OCR.'
            : (attachment.parseError ?? 'Nothing has been read from this file.')}
      </p>
    );
  } else {
    body = <Document profile={profile} />;
  }

  return (
    <>
      {head}
      {attachment.parseError && profile.parsedAt && (
        <p className="resume-warning">{attachment.parseError}</p>
      )}
      {compare ? (
        <div className="resume-compare">
          {isPdf ? (
            <iframe
              title={`Original ${attachment.originalFileName}`}
              src={`/api/attachments/${attachment.id}?inline=true`}
            />
          ) : (
            <div className="resume-original">
              <p className="record-empty">
                Word documents can't be shown here.{' '}
                <a className="text-action" href={`/api/attachments/${attachment.id}`}>
                  Download {attachment.originalFileName}
                </a>
              </p>
            </div>
          )}
          {body}
        </div>
      ) : (
        body
      )}
    </>
  );
}

function Document({ profile }: { profile: ResumeProfile }) {
  const place = [profile.city, profile.region, profile.country].filter(Boolean).join(', ');
  const links = [
    ['LinkedIn', profile.linkedInUrl],
    ['GitHub', profile.gitHubUrl],
    ['Portfolio', profile.portfolioUrl],
    ...profile.otherUrls.map((url) => ['Link', url] as const),
  ]
    .map(([label, url]) => [label, safeWebUrl(url ?? undefined)] as const)
    .filter((item): item is readonly [string, string] => Boolean(item[1]));
  const skillsByCategory = Object.entries(
    profile.skills.reduce<Record<string, ResumeProfile['skills']>>((groups, skill) => {
      (groups[skill.category] ??= []).push(skill);
      return groups;
    }, {}),
  );

  return (
    <article className="resume-doc">
      <header>
        <p className="resume-who">
          <Dots
            parts={[
              [profile.currentTitle, profile.currentEmployer].filter(Boolean).join(' at ') || null,
              place || null,
            ]}
          />
        </p>
        <p className="resume-facts">
          <Dots
            parts={[
              profile.yearsExperience != null && `${profile.yearsExperience} yrs experience`,
              profile.seniority !== 'Unknown' && <Inferred>{profile.seniority}</Inferred>,
              profile.highestDegreeLevel !== 'Unknown' && (
                <Inferred>{pretty(profile.highestDegreeLevel)}</Inferred>
              ),
              profile.yearsManagement ? `${profile.yearsManagement} yrs managing` : null,
              profile.openToRemote && 'open to remote',
              profile.willingToRelocate && 'will relocate',
            ]}
          />
        </p>
        {links.length > 0 && (
          <p className="resume-facts">
            <Dots
              parts={links.map(([label, url]) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ))}
            />
          </p>
        )}
      </header>

      {profile.summary && (
        <>
          <Heading>Summary</Heading>
          <p className="resume-prose">{profile.summary}</p>
        </>
      )}

      {profile.work.length > 0 && (
        <>
          <Heading>Experience</Heading>
          {profile.work.map((job) => (
            <div key={job.id} className="resume-item">
              <div className="resume-item-head">
                <div>
                  <span className="resume-item-title">
                    <Mark verified={job.verified}>{job.title || 'Untitled role'}</Mark>
                  </span>
                  <span className="resume-item-sub">
                    <Dots
                      parts={[
                        job.company,
                        [job.city, job.region].filter(Boolean).join(', ') || null,
                        job.isRemote && 'Remote',
                      ]}
                    />
                  </span>
                </div>
                <span className="resume-dates">
                  {span(job)}
                  {duration(job.durationMonths) && (
                    <>
                      <br />
                      {duration(job.durationMonths)}
                    </>
                  )}
                </span>
              </div>
              {(job.seniority !== 'Unknown' ||
                job.employmentType !== 'Unknown' ||
                job.managedPeople) && (
                <p className="resume-meta">
                  <Dots
                    parts={[
                      job.seniority !== 'Unknown' && <Inferred>{job.seniority}</Inferred>,
                      job.employmentType !== 'Unknown' && (
                        <Inferred>{pretty(job.employmentType)}</Inferred>
                      ),
                      job.managedPeople ? `managed ${job.managedPeople}` : null,
                    ]}
                  />
                </p>
              )}
              {job.bullets.length > 0 && (
                <ul className="resume-bullets">
                  {job.bullets.map((bullet, index) => (
                    <li key={index}>{bullet}</li>
                  ))}
                </ul>
              )}
              {job.skills.length > 0 && <p className="resume-meta">Used {job.skills.join(', ')}</p>}
            </div>
          ))}
        </>
      )}

      {profile.education.length > 0 && (
        <>
          <Heading>Education</Heading>
          {profile.education.map((entry) => (
            <div key={entry.id} className="resume-item">
              <div className="resume-item-head">
                <div>
                  <span className="resume-item-title">
                    <Mark verified={entry.verified}>
                      {[entry.degree, entry.field].filter(Boolean).join(', ') || 'Program'}
                    </Mark>
                  </span>
                  <span className="resume-item-sub">{entry.school}</span>
                </div>
                <span className="resume-dates">
                  {[
                    entry.startYear,
                    entry.endYear
                      ? `${entry.isInProgress ? 'expected ' : ''}${entry.endYear}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' – ')}
                </span>
              </div>
              {(entry.degreeLevel !== 'Unknown' ||
                entry.fieldNormalized !== 'Unknown' ||
                entry.gpa != null ||
                entry.honors) && (
                <p className="resume-meta">
                  <Dots
                    parts={[
                      entry.degreeLevel !== 'Unknown' && (
                        <Inferred>{pretty(entry.degreeLevel)}</Inferred>
                      ),
                      entry.fieldNormalized !== 'Unknown' && (
                        <Inferred>{pretty(entry.fieldNormalized)}</Inferred>
                      ),
                      entry.gpa != null &&
                        `GPA ${entry.gpa}${entry.gpaScale ? ` / ${entry.gpaScale}` : ''}`,
                      entry.honors,
                    ]}
                  />
                </p>
              )}
            </div>
          ))}
        </>
      )}

      {skillsByCategory.length > 0 && (
        <>
          <Heading>Skills</Heading>
          <dl className="resume-skills">
            {skillsByCategory.map(([category, skills]) => (
              <div key={category}>
                <dt>{pretty(category)}</dt>
                <dd>
                  {skills.map((skill, index) => (
                    <span key={skill.name}>
                      {index > 0 && ', '}
                      <span
                        className={skill.verified ? undefined : 'unverified'}
                        title={[
                          skill.source === 'Both'
                            ? 'In the skills section and a job'
                            : skill.source === 'JobDescription'
                              ? 'Mentioned in a job'
                              : 'In the skills section',
                          skill.yearsUsed ? `${skill.yearsUsed} yrs` : null,
                          skill.lastUsedYear ? `last ${skill.lastUsedYear}` : null,
                          skill.verified ? null : 'Not found in the document',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      >
                        {skill.name}
                      </span>
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {profile.certifications.length > 0 && (
        <>
          <Heading>Certifications</Heading>
          <ul className="resume-lines">
            {profile.certifications.map((item) => (
              <li key={item.id}>
                <Mark verified={item.verified}>
                  <Dots parts={[item.name, item.issuer, item.year]} />
                </Mark>
              </li>
            ))}
          </ul>
        </>
      )}

      {profile.languages.length > 0 && (
        <>
          <Heading>Languages</Heading>
          <p className="resume-prose">
            {profile.languages
              .map((item) =>
                item.proficiency !== 'Unknown'
                  ? `${item.language} (${item.proficiency.toLowerCase()})`
                  : item.language,
              )
              .join(', ')}
          </p>
        </>
      )}

      {profile.projects.length > 0 && (
        <>
          <Heading>Projects</Heading>
          {profile.projects.map((item) => {
            const url = safeWebUrl(item.url ?? undefined);
            return (
              <div key={item.id} className="resume-item">
                <div className="resume-item-head">
                  <span className="resume-item-title">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        {item.name}
                      </a>
                    ) : (
                      item.name
                    )}
                  </span>
                  {item.year && <span className="resume-dates">{item.year}</span>}
                </div>
                {item.description && <p className="resume-prose">{item.description}</p>}
                {item.skills.length > 0 && (
                  <p className="resume-meta">Used {item.skills.join(', ')}</p>
                )}
              </div>
            );
          })}
        </>
      )}

      {profile.publications.length > 0 && (
        <>
          <Heading>Publications</Heading>
          <ul className="resume-lines">
            {profile.publications.map((item) => (
              <li key={item.id}>
                <Dots parts={[item.title, item.venue, item.year]} />
              </li>
            ))}
          </ul>
        </>
      )}

      {profile.awards.length > 0 && (
        <>
          <Heading>Awards</Heading>
          <ul className="resume-lines">
            {profile.awards.map((item) => (
              <li key={item.id}>
                <Dots parts={[item.name, item.issuer, item.year]} />
              </li>
            ))}
          </ul>
        </>
      )}

      {profile.unassignedText.length > 0 && (
        <details className="resume-details">
          <summary>{profile.unassignedText.length} lines the parser could not place</summary>
          <Code block style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {profile.unassignedText.join('\n')}
          </Code>
        </details>
      )}
      {profile.resumeText && (
        <details className="resume-details">
          <summary>Text read from the file</summary>
          <Code block style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {profile.resumeText}
          </Code>
        </details>
      )}

      <p className="resume-note">
        Dotted amber text was written by the parser but not found in the document. Grey italic
        values are its judgement, not quotes.
        {profile.parsedAt && ` Read ${formatRelative(profile.parsedAt)}`}
        {profile.model && ` with ${profile.model}`}.
      </p>
    </article>
  );
}

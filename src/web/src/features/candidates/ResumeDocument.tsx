'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, Card, CardBody, CardHeader, SkeletonRows, toast } from '@/components/ui';
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

/** "ComputerScience" reads as "Computer Science". */
function pretty(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/** "https://linkedin.com/in/jane/" reads as "linkedin.com/in/jane", the way a resume prints it. */
function bare(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

/** Dotted amber underline: written by the parser but not found in the document. */
const unverified =
  'cursor-help underline decoration-tone-amber-dot decoration-dotted decoration-[1.5px] underline-offset-[3px]';

/** The parser wrote this but could not find it in the document: the text itself gets the amber mark. */
function Mark({ verified, children }: { verified: boolean; children: ReactNode }) {
  if (verified) return <>{children}</>;
  return (
    <span className={unverified} title="Not found in the document. Check the original.">
      {children}
    </span>
  );
}

/** Pieces joined with a separator, skipping the empty ones. */
function Joined({ parts, sep = ' · ' }: { parts: ReactNode[]; sep?: ReactNode }) {
  const shown = parts.filter((part) => part !== null && part !== undefined && part !== false);
  return (
    <>
      {shown.map((part, index) => (
        <span key={index}>
          {index > 0 && <span className="text-fg-subtle">{sep}</span>}
          {part}
        </span>
      ))}
    </>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 border-b border-fg pb-0.5 text-md leading-tight font-normal tracking-[0.02em] [font-variant-caps:small-caps]">
      {children}
    </h3>
  );
}

const entries = 'space-y-2.5 pl-3.5';
const bullets = 'mt-1 list-disc space-y-px pl-5 text-sm leading-[1.4] marker:text-[0.8em]';
const right = 'flex-none whitespace-nowrap tnum';

/** The two-row entry head of a typeset resume: bold title with the date flush right, then an italic line. */
function Entry({
  title,
  right: rightText,
  sub,
  subRight,
  children,
}: {
  title: ReactNode;
  right?: ReactNode;
  sub?: ReactNode;
  subRight?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-4 *:min-w-0">
        <span className="font-bold">{title}</span>
        {rightText && <span className={right}>{rightText}</span>}
      </div>
      {(sub || subRight) && (
        <div className="flex items-baseline justify-between gap-4 text-sm italic *:min-w-0">
          <span>{sub}</span>
          {subRight && <span className={right}>{subRight}</span>}
        </div>
      )}
      {children}
    </li>
  );
}

/**
 * The resume, typeset the way a LaTeX resume is: a serif, a centered name over a contact line,
 * small-caps section heads over a hairline, two-row entries with the dates flush right, tight
 * bullets. Read-only: it comes only from the file.
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
      toast.success('Re-parse queued');
    },
    onError: (error: Error) => toast.error('Could not re-parse', error.message),
  });

  const profile = query.data;
  const attachment = profile?.attachment;
  const parsing = attachment?.parseStatus === 'Pending' || attachment?.parseStatus === 'Processing';
  const isPdf = attachment?.contentType === 'application/pdf';

  const shell = (body: ReactNode) => (
    <Card>
      <CardHeader
        title="Resume"
        action={
          attachment && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Button variant="link" size="sm" asChild>
                <a
                  href={`/api/attachments/${attachment.id}${isPdf ? '?inline=true' : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open original
                </a>
              </Button>
              {profile?.parsedAt && (
                <Button variant="link" size="sm" onClick={() => setCompare((on) => !on)}>
                  {compare ? 'Hide the original' : 'Compare with the original'}
                </Button>
              )}
              {canReparse && (
                <Button
                  variant="link"
                  size="sm"
                  disabled={parsing || reparse.isPending}
                  onClick={() => reparse.mutate(attachment.id)}
                >
                  {parsing ? 'Reading…' : 'Read it again'}
                </Button>
              )}
            </div>
          )
        }
      />
      <CardBody className="px-5 pb-8 sm:px-10">{body}</CardBody>
    </Card>
  );
  const empty = (text: ReactNode) => <p className="text-base text-fg-subtle">{text}</p>;

  if (query.isError) return shell(empty('Could not load the resume.'));
  if (!profile) return shell(<SkeletonRows rows={6} className="p-0" />);
  if (!attachment) return shell(empty('No resume yet. Upload one under Documents.'));

  const body = !profile.parsedAt ? (
    empty(
      parsing
        ? 'Reading the resume…'
        : attachment.parseStatus === 'NeedsOcr'
          ? 'This file has no text layer, so nothing could be read from it. It needs OCR.'
          : (attachment.parseError ?? 'Nothing has been read from this file.'),
    )
  ) : (
    <Document profile={profile} />
  );
  const sticky = 'w-full rounded-lg border border-border h-[60vh] lg:sticky lg:top-6 lg:h-[80vh]';

  return shell(
    <>
      {attachment.parseError && profile.parsedAt && (
        <p className="mb-4 text-sm text-tone-amber-fg">{attachment.parseError}</p>
      )}
      {compare ? (
        <div className="grid items-start gap-8 lg:grid-cols-2">
          {isPdf ? (
            <iframe
              title={`Original ${attachment.originalFileName}`}
              src={`/api/attachments/${attachment.id}?inline=true`}
              className={sticky}
            />
          ) : (
            <div className={`${sticky} p-5`}>
              <p className="text-base text-fg-subtle">
                Word documents can&apos;t be shown here.{' '}
                <a
                  className="text-accent-foreground hover:underline"
                  href={`/api/attachments/${attachment.id}`}
                >
                  Download {attachment.originalFileName}
                </a>
              </p>
            </div>
          )}
          <div className="min-w-0">{body}</div>
        </div>
      ) : (
        body
      )}
    </>,
  );
}

function Document({ profile }: { profile: ResumeProfile }) {
  const place = [profile.city, profile.region, profile.country].filter(Boolean).join(', ');
  const links = [profile.linkedInUrl, profile.gitHubUrl, profile.portfolioUrl, ...profile.otherUrls]
    .map((url) => safeWebUrl(url ?? undefined))
    .filter((url): url is string => Boolean(url));
  const skillsByCategory = Object.entries(
    profile.skills.reduce<Record<string, ResumeProfile['skills']>>((groups, skill) => {
      (groups[skill.category] ??= []).push(skill);
      return groups;
    }, {}),
  );

  return (
    <>
      <article className="mx-auto max-w-[816px] font-serif text-[15px] leading-[1.4] text-fg [&_a]:underline [&_a]:underline-offset-2">
        <header className="mb-5 text-center">
          <p className="text-[28px] leading-tight font-bold tracking-[-0.01em]">{profile.name}</p>
          <p className="mt-1 text-sm leading-relaxed">
            <Joined
              sep=" | "
              parts={[
                place || null,
                profile.phone,
                profile.email && <a href={`mailto:${profile.email}`}>{profile.email}</a>,
                ...links.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    {bare(url)}
                  </a>
                )),
              ]}
            />
          </p>
        </header>

        {profile.summary && (
          <>
            <Heading>Summary</Heading>
            <p className="text-sm leading-[1.45] whitespace-pre-wrap">{profile.summary}</p>
          </>
        )}

        {profile.work.length > 0 && (
          <>
            <Heading>Experience</Heading>
            <ul className={entries}>
              {profile.work.map((job) => (
                <Entry
                  key={job.id}
                  title={<Mark verified={job.verified}>{job.title || 'Untitled role'}</Mark>}
                  right={span(job)}
                  sub={job.company}
                  subRight={
                    [job.city, job.region].filter(Boolean).join(', ') ||
                    (job.isRemote ? 'Remote' : null)
                  }
                >
                  {job.bullets.length > 0 && (
                    <ul className={bullets}>
                      {job.bullets.map((bullet, index) => (
                        <li key={index}>{bullet}</li>
                      ))}
                    </ul>
                  )}
                  {(job.skills.length > 0 || job.managedPeople) && (
                    <p className="mt-0.5 text-sm text-fg-muted italic">
                      <Joined
                        parts={[
                          job.managedPeople ? `Managed ${job.managedPeople} people` : null,
                          job.skills.length > 0 && job.skills.join(', '),
                        ]}
                      />
                    </p>
                  )}
                </Entry>
              ))}
            </ul>
          </>
        )}

        {profile.projects.length > 0 && (
          <>
            <Heading>Projects</Heading>
            <ul className={entries}>
              {profile.projects.map((item) => {
                const url = safeWebUrl(item.url ?? undefined);
                return (
                  <Entry
                    key={item.id}
                    title={
                      <>
                        {item.name}
                        {item.skills.length > 0 && (
                          <span className="font-normal italic">
                            <span className="text-fg-subtle"> | </span>
                            {item.skills.join(', ')}
                          </span>
                        )}
                      </>
                    }
                    right={
                      url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {bare(url).split('/')[0]}
                        </a>
                      ) : (
                        item.year
                      )
                    }
                  >
                    {item.description && (
                      <ul className={bullets}>
                        <li>{item.description}</li>
                      </ul>
                    )}
                  </Entry>
                );
              })}
            </ul>
          </>
        )}

        {profile.education.length > 0 && (
          <>
            <Heading>Education</Heading>
            <ul className={entries}>
              {profile.education.map((entry) => (
                <Entry
                  key={entry.id}
                  title={<Mark verified={entry.verified}>{entry.school}</Mark>}
                  right={[
                    entry.startYear,
                    entry.endYear
                      ? `${entry.isInProgress ? 'Expected ' : ''}${entry.endYear}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' – ')}
                  sub={
                    <Joined
                      sep=", "
                      parts={[
                        [entry.degree, entry.field].filter(Boolean).join(' in ') || null,
                        entry.honors,
                      ]}
                    />
                  }
                  subRight={
                    entry.gpa != null
                      ? `GPA ${entry.gpa}${entry.gpaScale ? ` / ${entry.gpaScale}` : ''}`
                      : null
                  }
                />
              ))}
            </ul>
          </>
        )}

        {(skillsByCategory.length > 0 || profile.languages.length > 0) && (
          <>
            <Heading>Skills</Heading>
            <dl className="pl-3.5 text-sm leading-normal [&_dd]:inline [&_dt]:inline [&_dt]:font-bold [&_dt]:after:content-[':_']">
              {skillsByCategory.map(([category, skills]) => (
                <div key={category}>
                  <dt>{pretty(category)}</dt>
                  <dd>
                    {skills.map((skill, index) => (
                      <span key={skill.name}>
                        {index > 0 && ', '}
                        <span
                          className={skill.verified ? undefined : unverified}
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
              {profile.languages.length > 0 && (
                <div>
                  <dt>Languages</dt>
                  <dd>
                    {profile.languages
                      .map((item) =>
                        item.proficiency !== 'Unknown'
                          ? `${item.language} (${item.proficiency.toLowerCase()})`
                          : item.language,
                      )
                      .join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          </>
        )}

        {profile.certifications.length > 0 && (
          <>
            <Heading>Certifications</Heading>
            <ul className={entries}>
              {profile.certifications.map((item) => (
                <Entry
                  key={item.id}
                  title={<Mark verified={item.verified}>{item.name}</Mark>}
                  right={item.year}
                  sub={item.issuer}
                  subRight={item.expiresYear ? `Expires ${item.expiresYear}` : null}
                />
              ))}
            </ul>
          </>
        )}

        {profile.publications.length > 0 && (
          <>
            <Heading>Publications</Heading>
            <ul className={entries}>
              {profile.publications.map((item) => {
                const url = safeWebUrl(item.url ?? undefined);
                return (
                  <Entry
                    key={item.id}
                    title={
                      url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )
                    }
                    right={item.year}
                    sub={item.venue}
                  />
                );
              })}
            </ul>
          </>
        )}

        {profile.awards.length > 0 && (
          <>
            <Heading>Awards</Heading>
            <ul className={entries}>
              {profile.awards.map((item) => (
                <Entry key={item.id} title={item.name} right={item.year} sub={item.issuer} />
              ))}
            </ul>
          </>
        )}
      </article>

      {profile.unassignedText.length > 0 && (
        <details className="mt-7 text-sm">
          <summary className="cursor-pointer text-fg-subtle hover:text-fg">
            {profile.unassignedText.length} lines the parser could not place
          </summary>
          <pre className="mt-2.5 rounded-md bg-secondary p-3 font-mono text-xs whitespace-pre-wrap text-fg">
            {profile.unassignedText.join('\n')}
          </pre>
        </details>
      )}
      {profile.resumeText && (
        <details className="mt-7 text-sm">
          <summary className="cursor-pointer text-fg-subtle hover:text-fg">
            Text read from the file
          </summary>
          <pre className="mt-2.5 rounded-md bg-secondary p-3 font-mono text-xs whitespace-pre-wrap text-fg">
            {profile.resumeText}
          </pre>
        </details>
      )}

      <p className="mt-8 text-sm text-fg-subtle">
        Dotted amber text was written by the parser but not found in the document.
        {profile.parsedAt && ` Read ${formatRelative(profile.parsedAt)}`}
        {profile.model && ` with ${profile.model}`}.
      </p>
    </>
  );
}

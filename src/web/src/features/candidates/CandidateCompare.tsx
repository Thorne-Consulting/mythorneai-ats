'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GitCompareArrows, UserPlus, X } from 'lucide-react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Autocomplete,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  SearchSelect,
  SkeletonRows,
  Switch,
} from '@/components/ui';
import { StageBadge, StatusBadge } from '@/components/status';
import { asJob, useAbility } from '@/lib/ability';
import { formatDate } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import type { CandidateDetail, RequisitionSummary, ResumeProfile } from '@/types';
import { sameAcross, skillOverlap } from './compare';

const DEGREES: Record<string, string> = {
  HighSchool: 'High school',
  Associate: 'Associate',
  Bachelor: "Bachelor's",
  Master: "Master's",
  Doctorate: 'Doctorate',
};

const none = <span className="text-fg-subtle">–</span>;

type FitRow = { requirement: string; kind: string; status: string; evidence: string };
/** GET /api/requisitions/{id}/compare */
type JobCompare = {
  job: { id: string; title: string };
  requirements: { required: string[]; preferred: string[] };
  people: {
    candidateId: string;
    name: string;
    match: { score: number; matched: string[]; missing: string[] } | null;
    application: {
      id: string;
      stage: string;
      stageType?: string | null;
      stageColor?: string | null;
      status: string;
      appliedAt: string;
    } | null;
    fit: { score: number; createdAt: string; result: { requirements: FitRow[] } } | null;
    feedback: {
      hidden: boolean;
      count: number;
      average: number | null;
      recommendations: { interviewer: string; recommendation: string }[];
      criteria: { name: string; average: number; count: number }[];
    } | null;
  }[];
};

const STATUS_TEXT: Record<string, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' }> = {
  met: { label: 'Met', tone: 'green' },
  partial: { label: 'Partly', tone: 'amber' },
  missing: { label: 'Not met', tone: 'red' },
  unknown: { label: 'Not clear', tone: 'gray' },
};

type Row<P> = {
  label: string;
  /** Plain text of the cell, to spot rows that read the same for everyone. */
  text: (p: P) => string;
  cell: (p: P) => ReactNode;
};

/**
 * Two to four people side by side, one column each, the same facts on the same row so the
 * differences read across. With a job chosen, the job's requirements, the match, where each person
 * is in it and the panel's feedback come first. Skills everyone shares are green, some share blue.
 */
export function CandidateCompare({ ids, jobId }: { ids: string[]; jobId: string | null }) {
  const router = useRouter();
  const details = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['candidate', id],
      queryFn: () => api.get<CandidateDetail>(`/api/candidates/${id}`),
    })),
  });
  const resumes = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['candidate-resume', id],
      queryFn: () => api.get<ResumeProfile>(`/api/candidates/${id}/resume`),
      retry: false,
    })),
  });
  const jobs = useQuery({
    queryKey: ['requisitions'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions'),
  });
  // Without a job in the link, use one everyone has applied to.
  // An empty list is not "loaded": with nobody chosen there is no first person to read from.
  const loaded = details.length > 0 && details.every((query) => query.data);
  const sharedJob = loaded
    ? details[0]
        .data!.applications.map((app) => app.requisitionId)
        .find((job) =>
          details.every((query) =>
            query.data!.applications.some((app) => app.requisitionId === job),
          ),
        )
    : undefined;
  const job = jobId ?? sharedJob ?? null;
  // The job's side-by-side (stage, scorecards, fit) is for people who work on that job.
  const ability = useAbility();
  const jobRow = jobs.data?.find((row) => row.id === job);
  const compare = useQuery({
    queryKey: ['compare', job, ids.join(',')],
    queryFn: () =>
      api.get<JobCompare>(`/api/requisitions/${job}/compare?candidateIds=${ids.join(',')}`),
    enabled: Boolean(jobRow) && ability.can('read', asJob(jobRow!)) && ids.length >= 2,
  });
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [adding, setAdding] = useState('');
  const debounced = useDebouncedValue(adding, 250);
  const found = useQuery({
    queryKey: ['compare-search', debounced],
    queryFn: () =>
      api.get<{ candidates: { id: string; name: string; currentTitle?: string | null }[] }>(
        `/api/search?q=${encodeURIComponent(debounced)}`,
      ),
    enabled: debounced.trim().length >= 2,
  });
  const href = (next: string[], nextJob = job) =>
    `/candidates/compare?ids=${next.join(',')}${nextJob ? `&job=${nextJob}` : ''}`;

  const header = (
    <PageHeader
      breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: 'Compare' }]}
      title="Compare candidates"
    />
  );
  if (ids.length < 2)
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="Pick two to four people to compare"
            description="Check the boxes next to them in the list, then choose Compare."
            action={
              <Button variant="secondary" asChild>
                <Link href="/candidates">Go to candidates</Link>
              </Button>
            }
          />
        </Card>
      </>
    );

  const people = ids.map((id, index) => ({
    id,
    detail: details[index].data,
    error: details[index].isError,
    resume: resumes[index].data?.parsedAt ? resumes[index].data : undefined,
    forJob: compare.data?.people.find((person) => person.candidateId === id),
  }));
  type Person = (typeof people)[number];
  const overlap = skillOverlap(
    people.map((p) => p.resume?.skills.map((skill) => skill.name) ?? p.detail?.resumeSkills ?? []),
  );
  const without = (id: string) => href(ids.filter((x) => x !== id));

  // ---- Rows for the chosen job ----
  const requirement = (p: Person, text: string) => {
    const fitRow = p.forJob?.fit?.result.requirements.find(
      (row) => row.requirement.toLowerCase() === text.toLowerCase(),
    );
    if (fitRow)
      return { ...(STATUS_TEXT[fitRow.status] ?? STATUS_TEXT.unknown), evidence: fitRow.evidence };
    if (p.forJob?.match?.matched.includes(text))
      return { label: 'On the resume', tone: 'green' as const, evidence: '' };
    return p.forJob?.match ? { label: 'Not found', tone: 'gray' as const, evidence: '' } : null;
  };
  const criteria = [
    ...new Set(compare.data?.people.flatMap((p) => p.feedback?.criteria.map((c) => c.name) ?? [])),
  ];
  const jobRows: Row<Person>[] = compare.data
    ? [
        {
          label: 'Match',
          text: (p) => String(p.forJob?.match?.score ?? ''),
          cell: (p) =>
            p.forJob?.match ? (
              <span>
                <span className="text-md font-semibold text-fg tnum">{p.forJob.match.score}%</span>
                <span className="ml-2 text-xs text-fg-subtle">
                  meets {p.forJob.match.matched.length} of{' '}
                  {p.forJob.match.matched.length + p.forJob.match.missing.length}
                </span>
              </span>
            ) : (
              none
            ),
        },
        {
          label: 'In this job',
          text: (p) => p.forJob?.application?.stage ?? 'none',
          cell: (p) =>
            p.forJob?.application ? (
              <Link href={`/applications/${p.forJob.application.id}`} className="inline-flex">
                {p.forJob.application.status === 'Active' ? (
                  <StageBadge
                    stage={p.forJob.application.stage}
                    type={p.forJob.application.stageType}
                    color={p.forJob.application.stageColor}
                    size="sm"
                  />
                ) : (
                  <StatusBadge status={p.forJob.application.status} size="sm" />
                )}
              </Link>
            ) : (
              <span className="text-fg-subtle">Not in this job</span>
            ),
        },
        ...[...compare.data.requirements.required, ...compare.data.requirements.preferred].map(
          (text): Row<Person> => ({
            label: text,
            text: (p) => requirement(p, text)?.label ?? '',
            cell: (p) => {
              const value = requirement(p, text);
              if (!value) return none;
              return (
                <span className="flex flex-col items-start gap-1">
                  <Badge size="sm" tone={value.tone}>
                    {value.label}
                  </Badge>
                  {value.evidence && (
                    <span className="text-xs text-fg-muted">{value.evidence}</span>
                  )}
                </span>
              );
            },
          }),
        ),
        ...(compare.data.people.some((person) => person.fit)
          ? ([
              {
                label: 'AI fit check',
                text: (p) => String(p.forJob?.fit?.score ?? ''),
                cell: (p) =>
                  p.forJob?.fit ? (
                    <span>
                      <span className="font-medium tnum">{p.forJob.fit.score}%</span>
                      <span className="ml-2 text-xs text-fg-subtle">
                        {formatDate(p.forJob.fit.createdAt)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-fg-subtle">Not checked</span>
                  ),
              },
            ] as Row<Person>[])
          : []),
        {
          label: 'Feedback',
          text: (p) => JSON.stringify(p.forJob?.feedback?.recommendations ?? []),
          cell: (p) => {
            const feedback = p.forJob?.feedback;
            if (!feedback) return <span className="text-fg-subtle">Not in this job</span>;
            if (feedback.hidden)
              return (
                <span className="text-fg-subtle">Submit your feedback to see the panel's</span>
              );
            if (!feedback.count) return <span className="text-fg-subtle">No feedback yet</span>;
            return (
              <ul className="space-y-1">
                {feedback.recommendations.map((item, index) => (
                  <li key={index}>
                    <span className="font-medium text-fg">{item.recommendation}</span>
                    <span className="text-fg-muted"> · {item.interviewer}</span>
                  </li>
                ))}
              </ul>
            );
          },
        },
        ...criteria.map((name): Row<Person> => ({
          label: name,
          text: (p) =>
            String(p.forJob?.feedback?.criteria.find((c) => c.name === name)?.average ?? ''),
          cell: (p) => {
            const value = p.forJob?.feedback?.criteria.find((c) => c.name === name);
            return value ? (
              <span className="tnum">
                <span className="font-medium">{value.average}</span>
                <span className="text-fg-subtle"> of 5</span>
              </span>
            ) : (
              none
            );
          },
        })),
      ]
    : [];

  const resumeRows: Row<Person>[] = [
    {
      label: 'Current role',
      text: (p) => p.resume?.currentTitle ?? p.detail?.currentTitle ?? '',
      cell: (p) =>
        [p.resume?.currentTitle ?? p.detail?.currentTitle, p.resume?.currentEmployer]
          .filter(Boolean)
          .join(' at ') || none,
    },
    {
      label: 'Location',
      text: (p) => p.detail?.location ?? '',
      cell: (p) => p.detail?.location ?? none,
    },
    {
      label: 'Experience',
      text: (p) => String(p.resume?.yearsExperience ?? p.detail?.resumeYearsExperience ?? ''),
      cell: (p) => {
        const years = p.resume?.yearsExperience ?? p.detail?.resumeYearsExperience;
        const level = p.resume && p.resume.seniority !== 'Unknown' ? p.resume.seniority : null;
        return years != null || level
          ? [years != null ? `${years} years` : null, level].filter(Boolean).join(' · ')
          : none;
      },
    },
    {
      label: 'Highest degree',
      text: (p) => p.resume?.highestDegreeLevel ?? '',
      cell: (p) => (p.resume && DEGREES[p.resume.highestDegreeLevel]) || none,
    },
    { label: 'Source', text: (p) => p.detail?.source ?? '', cell: (p) => p.detail?.source ?? none },
    {
      label: 'Skills',
      text: (p) =>
        (p.resume?.skills.map((skill) => skill.name) ?? p.detail?.resumeSkills ?? []).join(),
      cell: (p) => {
        const skills = p.resume?.skills.map((skill) => skill.name) ?? p.detail?.resumeSkills ?? [];
        if (!skills.length) return none;
        // Shared skills first, then the rest, capped so a long list stays readable.
        const rank = (s: string) => {
          const shared = overlap.get(s.toLowerCase());
          return shared === 'all' ? 0 : shared === 'some' ? 1 : 2;
        };
        return (
          <div className="flex flex-wrap gap-1.5">
            {[...skills]
              .sort((a, b) => rank(a) - rank(b))
              .slice(0, 16)
              .map((skill) => {
                const shared = overlap.get(skill.toLowerCase());
                return (
                  <Badge
                    key={skill}
                    size="sm"
                    tone={shared === 'all' ? 'green' : shared === 'some' ? 'blue' : undefined}
                  >
                    {skill}
                  </Badge>
                );
              })}
          </div>
        );
      },
    },
    {
      label: 'Work history',
      text: (p) => JSON.stringify(p.resume?.work ?? p.detail?.resumeJobTitles ?? []),
      cell: (p) =>
        p.resume?.work.length ? (
          <ul className="space-y-2">
            {p.resume.work.slice(0, 4).map((role) => (
              <li key={role.id}>
                <p className="font-medium text-fg">{role.title}</p>
                <p className="text-fg-muted">
                  {role.company}
                  {(role.startYear || role.isCurrent) &&
                    ` · ${[role.startYear, role.isCurrent ? 'now' : role.endYear].filter(Boolean).join(' – ')}`}
                </p>
              </li>
            ))}
          </ul>
        ) : p.detail?.resumeJobTitles.length ? (
          p.detail.resumeJobTitles.slice(0, 4).join(', ')
        ) : (
          none
        ),
    },
    {
      label: 'Education',
      text: (p) => JSON.stringify(p.resume?.education ?? p.detail?.resumeEducation ?? []),
      cell: (p) =>
        p.resume?.education.length ? (
          <ul className="space-y-2">
            {p.resume.education.slice(0, 3).map((entry) => (
              <li key={entry.id}>
                <p className="font-medium text-fg">{entry.degree ?? entry.field ?? 'Studied'}</p>
                <p className="text-fg-muted">
                  {entry.school}
                  {entry.isInProgress
                    ? ' · in progress'
                    : entry.endYear
                      ? ` · ${entry.endYear}`
                      : ''}
                </p>
              </li>
            ))}
          </ul>
        ) : p.detail?.resumeEducation.length ? (
          p.detail.resumeEducation.slice(0, 3).join('; ')
        ) : (
          none
        ),
    },
    {
      label: 'Certificates',
      text: (p) => p.detail?.resumeCertifications.join() ?? '',
      cell: (p) => p.detail?.resumeCertifications.slice(0, 4).join(', ') || none,
    },
    {
      label: 'Languages',
      text: (p) => p.detail?.resumeLanguages.join() ?? '',
      cell: (p) => p.detail?.resumeLanguages.join(', ') || none,
    },
    {
      label: 'Applications',
      text: (p) => JSON.stringify(p.detail?.applications.map((app) => [app.id]) ?? []),
      cell: (p) =>
        p.detail?.applications.length ? (
          <ul className="space-y-2.5">
            {p.detail.applications.map((app) => (
              <li key={app.id}>
                <Link
                  href={`/applications/${app.id}`}
                  className="font-medium text-accent-foreground hover:underline"
                >
                  {app.requisitionTitle}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
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
                  Applied {formatDate(app.appliedAt)}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-fg-subtle">Not in any job</span>
        ),
    },
  ];

  const visible = (rows: Row<Person>[]) =>
    onlyDifferences && loaded ? rows.filter((row) => !sameAcross(people.map(row.text))) : rows;
  const section = (title: string, rows: Row<Person>[]) =>
    rows.length > 0 && (
      <tbody key={title}>
        <tr>
          <th
            scope="colgroup"
            colSpan={people.length + 2}
            className="bg-muted px-4 py-2 text-left text-xs font-semibold tracking-[0.04em] text-fg-subtle uppercase"
          >
            {title}
          </th>
        </tr>
        {rows.map((row) => (
          <tr key={row.label}>
            <th
              scope="row"
              className="border-b border-border-subtle p-4 text-left align-top text-xs font-medium text-fg-muted"
            >
              {row.label}
            </th>
            {people.map((p) => (
              <td
                key={p.id}
                className="border-b border-border-subtle p-4 align-top break-words text-fg"
              >
                {p.detail ? row.cell(p) : <SkeletonRows rows={1} className="px-0" />}
              </td>
            ))}
            {ids.length < 4 && <td className="border-b border-border-subtle" />}
          </tr>
        ))}
      </tbody>
    );
  const jobTitle = compare.data?.job.title ?? jobs.data?.find((item) => item.id === job)?.title;

  return (
    <>
      {header}
      <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <SearchSelect
          label="Compare for a job"
          placeholder="Choose a job"
          className="w-full sm:w-80"
          value={job}
          onChange={(value) => router.replace(href(ids, value))}
          data={(jobs.data ?? []).map((item) => ({ value: item.id, label: item.title }))}
        />
        <Switch
          label="Show only differences"
          checked={onlyDifferences}
          onCheckedChange={setOnlyDifferences}
          className="pb-2"
        />
      </div>
      <Card className="max-md:overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col className="w-28 sm:w-40" />
            {people.map((p) => (
              <col key={p.id} />
            ))}
            {ids.length < 4 && <col className="w-56" />}
          </colgroup>
          <thead className="md:sticky md:top-0 md:z-10">
            <tr>
              <th scope="col" className="rounded-tl-xl bg-card">
                <span className="sr-only">Fact</span>
              </th>
              {people.map((p) => {
                const name = p.detail ? `${p.detail.firstName} ${p.detail.lastName}` : '';
                return (
                  <th
                    key={p.id}
                    scope="col"
                    className="border-b border-border-subtle bg-card p-4 text-left align-top font-normal"
                  >
                    {p.error ? (
                      <p className="text-destructive">Could not load this candidate.</p>
                    ) : !p.detail ? (
                      <SkeletonRows rows={1} className="px-0" />
                    ) : (
                      <div className="flex items-start gap-3">
                        <Avatar name={name} />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/candidates/${p.id}`}
                            className="block truncate text-md font-semibold text-fg hover:underline"
                          >
                            {name}
                          </Link>
                          {p.detail.currentTitle && (
                            <p className="truncate text-xs text-fg-subtle">
                              {p.detail.currentTitle}
                            </p>
                          )}
                        </div>
                        {ids.length > 2 && (
                          <IconButton label={`Remove ${name}`} variant="quiet" size="sm" asChild>
                            <Link href={without(p.id)}>
                              <X />
                            </Link>
                          </IconButton>
                        )}
                      </div>
                    )}
                  </th>
                );
              })}
              {ids.length < 4 && (
                <th
                  scope="col"
                  className="rounded-tr-xl border-b border-border-subtle bg-card p-4 align-top font-normal"
                >
                  <Autocomplete
                    aria-label="Add a person"
                    placeholder="Add a person"
                    leftSection={<UserPlus />}
                    value={adding}
                    onChange={setAdding}
                    data={(found.data?.candidates ?? [])
                      .filter((person) => !ids.includes(person.id))
                      .map((person) => ({ value: person.id, label: person.name }))}
                    onOptionSubmit={(id) => {
                      setAdding('');
                      router.replace(href([...ids, id]));
                    }}
                  />
                </th>
              )}
            </tr>
          </thead>
          {compare.isLoading && (
            <tbody>
              <tr>
                <td colSpan={people.length + 2} className="p-4">
                  <SkeletonRows rows={3} className="px-0" />
                </td>
              </tr>
            </tbody>
          )}
          {section(`For ${jobTitle ?? 'this job'}`, visible(jobRows))}
          {section('From the resume', visible(resumeRows))}
        </table>
        <p className="flex flex-wrap items-center gap-3 p-4 text-xs text-fg-subtle">
          <Badge size="sm" tone="green">
            Skill
          </Badge>
          everyone has it
          <Badge size="sm" tone="blue">
            Skill
          </Badge>
          more than one has it
        </p>
      </Card>
    </>
  );
}

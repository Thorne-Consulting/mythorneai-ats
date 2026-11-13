'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { GitCompareArrows, X } from 'lucide-react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  SkeletonRows,
} from '@/components/ui';
import { StageBadge, StatusBadge } from '@/components/status';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import type { CandidateDetail, CandidateListPage, ResumeProfile } from '@/types';
import { skillOverlap } from './compare';

const DEGREES: Record<string, string> = {
  HighSchool: 'High school',
  Associate: 'Associate',
  Bachelor: "Bachelor's",
  Master: "Master's",
  Doctorate: 'Doctorate',
};

const none = <span className="text-fg-subtle">–</span>;

/**
 * Two or three people side by side, one column each, the same facts on the same row so the
 * differences read across. Skills everyone shares are green, skills some share are blue.
 */
export function CandidateCompare({ ids }: { ids: string[] }) {
  const queryClient = useQueryClient();
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
  // Fit and rating live on the list rows, not the record: use them when the list is cached.
  const listRows = queryClient
    .getQueriesData<CandidateListPage>({ queryKey: ['candidates'] })
    .flatMap(([, page]) => page?.items ?? []);
  const scoresFor = (applicationId: string) =>
    listRows.flatMap((row) => row.applications).find((app) => app.id === applicationId);

  const header = (
    <PageHeader
      breadcrumbs={[{ label: 'Candidates', href: '/candidates' }, { label: 'Compare' }]}
      title="Compare candidates"
      description="The same facts for each person, side by side."
    />
  );
  if (ids.length < 2)
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={GitCompareArrows}
            title="Pick two or three people to compare"
            description="Tick them in the candidates list, then choose Compare."
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
  }));
  const overlap = skillOverlap(
    people.map((p) => p.resume?.skills.map((skill) => skill.name) ?? p.detail?.resumeSkills ?? []),
  );
  const without = (id: string) =>
    `/candidates/compare?ids=${ids.filter((x) => x !== id).join(',')}`;
  const anyFit = people.some((p) =>
    p.detail?.applications.some((app) => scoresFor(app.id)?.fitScore != null),
  );

  const rows: { label: string; cell: (p: (typeof people)[number]) => ReactNode }[] = [
    {
      label: 'Current role',
      cell: (p) =>
        [p.resume?.currentTitle ?? p.detail?.currentTitle, p.resume?.currentEmployer]
          .filter(Boolean)
          .join(' at ') || none,
    },
    { label: 'Location', cell: (p) => p.detail?.location ?? none },
    {
      label: 'Experience',
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
      cell: (p) => (p.resume && DEGREES[p.resume.highestDegreeLevel]) || none,
    },
    { label: 'Source', cell: (p) => p.detail?.source ?? none },
    {
      label: 'Skills',
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
      cell: (p) => p.detail?.resumeCertifications.slice(0, 4).join(', ') || none,
    },
    { label: 'Languages', cell: (p) => p.detail?.resumeLanguages.join(', ') || none },
    {
      label: 'Applications',
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
                    <StageBadge stage={app.stage} size="sm" />
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
    ...(anyFit
      ? [
          {
            label: 'AI match',
            cell: (p: (typeof people)[number]) => {
              const scored = (p.detail?.applications ?? [])
                .map((app) => ({ app, fit: scoresFor(app.id)?.fitScore }))
                .filter((x) => x.fit != null);
              return scored.length ? (
                <ul className="space-y-1">
                  {scored.map(({ app, fit }) => (
                    <li key={app.id}>
                      <span className={cn('font-medium tnum', fit! >= 75 && 'text-tone-green-fg')}>
                        {fit}%
                      </span>{' '}
                      <span className="text-fg-muted">for {app.requisitionTitle}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                none
              );
            },
          },
        ]
      : []),
  ];

  return (
    <>
      {header}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col className="w-36" />
            {people.map((p) => (
              <col key={p.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Fact
              </th>
              {people.map((p) => {
                const name = p.detail ? `${p.detail.firstName} ${p.detail.lastName}` : '';
                return (
                  <th
                    key={p.id}
                    scope="col"
                    className="border-b border-border-subtle p-4 text-left align-top font-normal"
                  >
                    {p.error ? (
                      <p className="text-destructive">Could not load this person.</p>
                    ) : !p.detail ? (
                      <SkeletonRows rows={1} className="px-0" />
                    ) : (
                      <div className="flex items-start gap-3">
                        <Avatar name={name} size="lg" />
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/candidates/${p.id}`}
                            className="block truncate text-md font-semibold text-fg hover:underline"
                          >
                            {name}
                          </Link>
                          <p className="truncate text-sm text-fg-muted">
                            {p.detail.currentTitle ?? 'No title on file'}
                          </p>
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-b border-border-subtle p-4 text-left align-top text-xs font-medium text-fg-subtle"
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
              </tr>
            ))}
          </tbody>
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

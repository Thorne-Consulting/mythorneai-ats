'use client';

import { useState } from 'react';
import {
  AvatarGroup,
  Button,
  Card,
  CardHeader,
  CellStack,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { PreviewAlert } from './preview-ui';
import { sampleJobs, sampleTeams, type JobAccess } from './sample-admin';

const columns: { key: keyof JobAccess; label: string }[] = [
  { key: 'view', label: 'View candidates' },
  { key: 'pipeline', label: 'Move stages' },
  { key: 'offers', label: 'See offers' },
];

export function TeamAccessPage() {
  const [teams, setTeams] = useState(sampleTeams);
  const [teamId, setTeamId] = useState(sampleTeams[0].id);
  const team = teams.find((t) => t.id === teamId) ?? teams[0];

  const setAccess = (jobId: string, key: keyof JobAccess, on: boolean) =>
    setTeams((all) =>
      all.map((t) => {
        if (t.id !== team.id) return t;
        const cur = t.access[jobId];
        // Moving stages or seeing offers needs view access; turning view off removes the rest.
        const next: JobAccess =
          key === 'view' && !on
            ? { view: false, pipeline: false, offers: false }
            : { ...cur, [key]: on, view: cur.view || on };
        return { ...t, access: { ...t.access, [jobId]: next } };
      }),
    );

  const jobsWithAccess = (access: Record<string, JobAccess>) =>
    sampleJobs.filter((j) => access[j.id]?.view).length;

  return (
    <>
      <PreviewAlert />

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden">
          <CardHeader title="Teams" description={`${teams.length} teams`} />
          <ul className="pb-2">
            {teams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTeamId(t.id)}
                  aria-current={t.id === team.id || undefined}
                  className={cn(
                    'flex w-full items-center gap-3 border-l-2 border-l-transparent px-5 py-3 text-left transition-colors hover:bg-muted',
                    t.id === team.id && 'border-l-primary bg-accent hover:bg-accent',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium text-fg">{t.name}</span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {t.members.length} members · {jobsWithAccess(t.access)} of {sampleJobs.length}{' '}
                      jobs
                    </span>
                  </span>
                  <AvatarGroup names={t.members} />
                </button>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title={`${team.name} · job access`}
            description={team.description}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTeams((all) =>
                    all.map((t) =>
                      t.id === team.id
                        ? {
                            ...t,
                            access: Object.fromEntries(
                              sampleJobs.map((j) => [
                                j.id,
                                { view: true, pipeline: true, offers: true },
                              ]),
                            ),
                          }
                        : t,
                    ),
                  );
                  toast.success('Full access given', `${team.name} can now work on every job.`);
                }}
              >
                Give access to all jobs
              </Button>
            }
          />
          <div className="px-5 pb-4">
            <Table>
              <THead>
                <tr>
                  <TH>Job</TH>
                  {columns.map((c) => (
                    <TH key={c.key} align="center">
                      {c.label}
                    </TH>
                  ))}
                </tr>
              </THead>
              <TBody>
                {sampleJobs.map((j) => (
                  <TR key={j.id}>
                    <TD>
                      <CellStack primary={j.title} secondary={`${j.department} · ${j.code}`} />
                    </TD>
                    {columns.map((c) => (
                      <TD key={c.key} align="center">
                        <span className="inline-flex">
                          <Switch
                            aria-label={`${c.label} for ${j.title}`}
                            checked={team.access[j.id]?.[c.key] ?? false}
                            onCheckedChange={(on) => setAccess(j.id, c.key, on)}
                          />
                        </span>
                      </TD>
                    ))}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </Card>
      </div>
    </>
  );
}

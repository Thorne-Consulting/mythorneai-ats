'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Pencil, UserPlus, X } from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  CopyButton,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  RadioGroup,
  SearchSelect,
  Select,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { PostingPreview } from '@/components/careers/PostingPreview';
import { imageProblem } from '@/components/editor/images';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { asJob, useAbility } from '@/lib/ability';
import type { RequisitionMember } from '@/types';
import { useSources } from '../sources/sources-data';
import { useRequisition, useUpdateJob, useUpdateJobSettings } from './requisition-data';
import { JobQuestions } from './JobQuestions';
import { RequisitionRequirements } from './RequisitionRequirements';
import type { RequisitionWithSettings } from './requirements-types';

function Loading() {
  return (
    <Card>
      <SkeletonRows rows={4} />
    </Card>
  );
}

export function JobRequirements({ id }: { id: string }) {
  const details = useRequisition(id);
  const canManage = useAbility().can('update', asJob(details.data ?? {}));
  if (!details.data) return <Loading />;
  return (
    <Card>
      <RequisitionRequirements
        requisition={details.data as RequisitionWithSettings}
        canManage={canManage}
      />
    </Card>
  );
}

type TeamRole = RequisitionMember['role'];
type Person = { id: string; email: string; displayName: string; role: string };

export const ROLES: { value: TeamRole; label: string; note: string }[] = [
  {
    value: 'HiringManager',
    label: 'Hiring manager',
    note: 'Owns the hire and makes the final call.',
  },
  { value: 'Recruiter', label: 'Recruiter', note: 'Runs the process and moves candidates.' },
  { value: 'Interviewer', label: 'Interviewer', note: 'Interviews candidates for this job.' },
  {
    value: 'Viewer',
    label: 'Can view',
    note: 'Sees the job and its candidates, but can’t change them.',
  },
];
const roleInfo = (role: TeamRole) => ROLES.find((r) => r.value === role)!;
// People with an interviewer account can interview or view, not run a job.
export const rolesFor = (userRole: string) =>
  ROLES.filter(
    (r) => userRole !== 'Interviewer' || r.value === 'Interviewer' || r.value === 'Viewer',
  );

/**
 * Who works on this job, as people with accounts, in one place. Managers add someone with a role,
 * change a role in the row, remove someone, and make the job confidential.
 */
export function JobTeam({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const details = useRequisition(id);
  const canManage = useAbility().can('update', asJob(details.data ?? {}));
  const saveSettings = useUpdateJobSettings(id);
  const people = useQuery({
    queryKey: ['requisition-people'],
    queryFn: () => api.get<Person[]>('/api/requisitions/people'),
    enabled: canManage,
    staleTime: 60_000,
  });
  const [adding, setAdding] = useState<{ userId: string | null; role: TeamRole } | null>(null);
  const [removing, setRemoving] = useState<RequisitionMember | null>(null);
  const save = useMutation({
    mutationFn: (members: { userId: string; role: TeamRole }[]) =>
      api.put(`/api/requisitions/${id}/members`, { members }),
    onSuccess: () => {
      setAdding(null);
      toast.success('Team saved');
    },
    onError: (error: Error) => toast.error('Could not save the team', error.message),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', id] });
      queryClient.invalidateQueries({ queryKey: ['requisitions'] });
    },
  });
  if (!details.data) return <Loading />;
  const job = details.data as RequisitionWithSettings;
  const members = job.members ?? [];
  const managers = members.filter((m) => m.role === 'HiringManager').length;
  const current = members.map((m) => ({ userId: m.userId, role: m.role }));
  const candidates = (people.data ?? []).filter((p) => !members.some((m) => m.userId === p.id));
  const addingPerson = people.data?.find((p) => p.id === adding?.userId);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <Card className="overflow-hidden">
        <CardHeader
          title="Hiring team"
          action={
            canManage &&
            !adding && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<UserPlus />}
                onClick={() => setAdding({ userId: null, role: 'Viewer' })}
              >
                Add someone
              </Button>
            )
          }
        />
        {adding && (
          <div className="border-t border-border-subtle bg-muted px-5 py-4">
            <div className="flex flex-wrap items-end gap-2">
              <SearchSelect
                className="min-w-0 flex-1 basis-60"
                label="Person"
                placeholder="Search by name or email"
                value={adding.userId}
                data={candidates.map((p) => ({
                  value: p.id,
                  label: `${p.displayName} · ${p.email}`,
                }))}
                onChange={(userId) => {
                  const person = people.data?.find((p) => p.id === userId);
                  setAdding({
                    userId,
                    role: person?.role === 'Interviewer' ? 'Interviewer' : adding.role,
                  });
                }}
              />
              <Select
                className="w-44"
                label="Role on this job"
                value={adding.role}
                data={rolesFor(addingPerson?.role ?? '').map((r) => ({
                  value: r.value,
                  label: r.label,
                }))}
                onChange={(role) => role && setAdding({ ...adding, role: role as TeamRole })}
              />
              <Button
                disabled={!adding.userId}
                loading={save.isPending}
                onClick={() =>
                  adding.userId &&
                  save.mutate([...current, { userId: adding.userId, role: adding.role }])
                }
              >
                Add to team
              </Button>
              <Button variant="quiet" onClick={() => setAdding(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        {members.length === 0 ? (
          <p className="border-t border-border-subtle px-5 py-6 text-sm text-fg-muted">
            Nobody is on this job yet. Add a hiring manager first.
          </p>
        ) : (
          <ul className="border-t border-border-subtle">
            {members.map((person) => {
              const info = roleInfo(person.role);
              const onlyManager = person.role === 'HiringManager' && managers === 1;
              return (
                <li
                  key={person.userId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle px-5 py-3.5 last:border-b-0"
                >
                  <Avatar name={person.displayName} size="md" />
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="flex flex-wrap items-center gap-2 text-base font-medium text-fg">
                      <span className="truncate">{person.displayName}</span>
                      {!canManage && (
                        <Badge tone={person.role === 'Viewer' ? 'gray' : 'blue'} size="sm">
                          {info.label}
                        </Badge>
                      )}
                      {!person.isActive && (
                        <Badge tone="amber" size="sm">
                          No longer has access
                        </Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-fg-subtle">
                      <a
                        href={`mailto:${person.email}`}
                        className="hover:text-accent-foreground hover:underline"
                      >
                        {person.email}
                      </a>
                      <span className="hidden sm:inline"> · {info.note}</span>
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Select
                        aria-label={`Role of ${person.displayName}`}
                        className="w-40"
                        size="sm"
                        value={person.role}
                        disabled={onlyManager || save.isPending}
                        data={rolesFor(person.userRole).map((r) => ({
                          value: r.value,
                          label: r.label,
                        }))}
                        onChange={(role) =>
                          role &&
                          role !== person.role &&
                          save.mutate(
                            current.map((m) =>
                              m.userId === person.userId ? { ...m, role: role as TeamRole } : m,
                            ),
                          )
                        }
                      />
                      <IconButton
                        label={`Remove ${person.displayName}`}
                        variant="quiet"
                        size="sm"
                        disabled={onlyManager}
                        onClick={() => setRemoving(person)}
                      >
                        <X />
                      </IconButton>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {canManage && managers === 1 && members.length > 1 && (
          <p className="border-t border-border-subtle px-5 py-2.5 text-xs text-fg-subtle">
            A job always has a hiring manager. Add another before you change or remove this one.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Who can see this job" />
        <CardBody>
          {canManage ? (
            <RadioGroup
              aria-label="Who can see this job"
              value={job.isConfidential ? 'confidential' : 'team'}
              onValueChange={(next) =>
                saveSettings.mutate({ isConfidential: next === 'confidential' })
              }
              options={[
                {
                  value: 'team',
                  label: 'Everyone who can see jobs',
                  description: 'The usual setting.',
                },
                {
                  value: 'confidential',
                  label: 'Confidential',
                  description: 'Only the people in the hiring team, and admins.',
                },
              ]}
            />
          ) : (
            <p className="text-sm text-fg-muted">
              {job.isConfidential
                ? 'Confidential: only the people in the hiring team, and admins.'
                : 'Everyone who can see jobs.'}
            </p>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.displayName ?? ''}?`}
        message="They will no longer be on this job. You can add them again later."
        confirmLabel="Remove from team"
        onConfirm={() => {
          if (removing) save.mutate(current.filter((m) => m.userId !== removing.userId));
        }}
      />
    </div>
  );
}

/**
 * "Copy link for…": the job link with `?src=<code>` for each source that has a link code, so an
 * applicant from that link gets that source. Hidden until a source has a code.
 */
function CopyTaggedLink({ url }: { url: string }) {
  const sources = (useSources().data ?? []).filter((s) => s.active && s.codes.length > 0);
  if (!sources.length) return null;
  async function copy(name: string, code: string) {
    try {
      await navigator.clipboard.writeText(`${url}?src=${encodeURIComponent(code)}`);
      toast.success(`Link for ${name} copied`);
    } catch {
      toast.error('Could not copy the link');
    }
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="quiet" size="sm" rightIcon={<ChevronDown />}>
          Copy link for…
        </Button>
      </MenuTrigger>
      <MenuContent>
        {sources.map((s) => (
          <MenuItem key={s.id} onSelect={() => copy(s.name, s.codes[0])}>
            {s.name}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}

/**
 * The careers page as applicants see it, the link to share, and the place to write the posting.
 * Title, team, location and the other facts come from Settings.
 */
export function JobPosting({ id }: { id: string }) {
  const details = useRequisition(id);
  const canManage = useAbility().can('update', asJob(details.data ?? {}));
  const save = useUpdateJob(id);
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // The public link starts with "Web address of this app" (Settings, General), the careers host,
  // not the staff host this page runs on. Until it is set, fall back to this browser's origin,
  // which is only known in the browser; render the path first to keep hydration stable.
  const organization = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<{ publicUrl?: string | null }>('/api/organization'),
  });
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  if (!details.data) return <Loading />;
  const job = details.data;
  const base = organization.data?.publicUrl?.trim().replace(/\/+$/, '') || origin;
  const path = `/careers/${id}`;
  const isPublic = job.status === 'Open';
  const editing = draft !== null;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader title="Public link" description="Share it anywhere you advertise the job." />
        <CardBody className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-input bg-muted px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-sm text-fg">{base + path}</code>
            <CopyButton value={base + path} label="Copy link" />
            <CopyTaggedLink url={base + path} />
            {isPublic && (
              <Button asChild variant="quiet" size="sm">
                <a href={path} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Open
                </a>
              </Button>
            )}
          </div>
          {!isPublic && (
            <Alert tone="warning" title="Not public yet">
              Only open jobs show on your careers site. Until this job opens, the link shows a
              &ldquo;not found&rdquo; page.
            </Alert>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title={editing ? 'Edit the job description' : 'Posting'}
          description={
            editing
              ? 'Use headings, lists and links. Applicants see it the way it looks here.'
              : 'The description and details as applicants read them.'
          }
          action={
            canManage &&
            !editing && (
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Pencil />}
                onClick={() => setDraft(job.description ?? '')}
              >
                Edit posting
              </Button>
            )
          }
        />
        <CardBody>
          {editing ? (
            <div className="flex flex-col gap-4">
              <PlateMarkdownEditor
                value={draft}
                onChange={(next) => {
                  setDraft(next);
                  setProblem(null);
                }}
                placeholder="What the job is, what the person will do, and what you offer"
                invalid={!!problem}
              />
              {problem && <p className="text-sm text-destructive">{problem}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setDraft(null);
                    setProblem(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  loading={save.isPending}
                  onClick={() => {
                    const found = imageProblem(draft);
                    if (found) return setProblem(found);
                    save.mutate(
                      { description: draft.trim() },
                      {
                        onSuccess: () => {
                          setDraft(null);
                          toast.success('Posting saved');
                        },
                      },
                    );
                  }}
                >
                  Save posting
                </Button>
              </div>
            </div>
          ) : (
            // The real public page; remounted after a save so it shows the new text.
            <PostingPreview key={job.updatedAt} jobId={id} />
          )}
        </CardBody>
      </Card>
      <JobQuestions id={id} canManage={canManage} />
    </div>
  );
}

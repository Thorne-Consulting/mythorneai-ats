'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarCheck,
  Check,
  ChevronRight,
  Copy,
  Minus,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  CellStack,
  EmptyState,
  Input,
  MenuItem,
  Modal,
  RadioGroup,
  RowActions,
  Select,
  SkeletonRows,
  Switch,
  Textarea,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  roleKeyFromSlug,
  roleSlug,
  useAdminUsers,
  useRoleOptions,
  useRoles,
  type RoleInfo,
} from './admin-data';
import {
  ALL_PERMISSIONS,
  JOB_SCOPES,
  PERMISSION_TEXT,
  jobScopeOf,
  setJobScope,
  summarizePermissions,
  togglePermission,
  type JobScope,
  type Permission,
} from './role-permissions';
import { SettingsHeader } from './SettingsShell';
import { SettingsLoading, SettingsSection, useDraft } from './settings-shared';

const SCOPE_ICONS: Record<JobScope, LucideIcon> = {
  interviews: CalendarCheck,
  jobs: Users,
  all_jobs: Briefcase,
};
const iconFor = (role: RoleInfo) =>
  role.permissions.includes('workspace') ? ShieldCheck : SCOPE_ICONS[jobScopeOf(role.permissions)];
const people = (n: number) => `${n} ${n === 1 ? 'member' : 'members'}`;

function useRefreshRoles() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };
}

/** /settings/roles: the four built-in roles, then the ones your team made from them. */
export function RolePermissionsSection() {
  const roles = useRoles();
  const [from, setFrom] = useState<RoleInfo | null>(null);
  const [creating, setCreating] = useState(false);
  // From a role: duplicate it. Without one: a new role that starts from Hiring manager.
  const open = (role: RoleInfo | null) => {
    setFrom(role);
    setCreating(true);
  };
  const builtIn = roles.data?.filter((r) => r.builtIn) ?? [];
  const custom = roles.data?.filter((r) => !r.builtIn) ?? [];
  return (
    <>
      <SettingsHeader
        actions={
          <Button leftIcon={<Plus />} onClick={() => open(null)}>
            New role
          </Button>
        }
      />
      <Card>
        <CardHeader
          title="Built-in roles"
          description="These can’t be changed. Duplicate one to make your own version."
        />
        {!roles.data ? <SkeletonRows rows={4} /> : <RoleList roles={builtIn} onDuplicate={open} />}
      </Card>
      <Card>
        <CardHeader
          title="Your roles"
          description="Roles your team made, for people who need something in between."
        />
        {!roles.data ? (
          <SkeletonRows rows={2} />
        ) : custom.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            title="No roles of your own yet"
            description="For example, a coordinator who schedules interviews on every job but doesn’t add candidates."
            action={
              <Button variant="secondary" leftIcon={<Plus />} onClick={() => open(null)}>
                New role
              </Button>
            }
          />
        ) : (
          <RoleList roles={custom} onDuplicate={open} />
        )}
      </Card>
      <NewRoleModal
        opened={creating}
        from={from}
        roles={roles.data ?? []}
        onClose={() => setCreating(false)}
      />
    </>
  );
}

function RoleList({
  roles,
  onDuplicate,
}: {
  roles: RoleInfo[];
  onDuplicate: (role: RoleInfo) => void;
}) {
  return (
    <ul className="divide-y divide-border-subtle border-t border-border-subtle">
      {roles.map((role) => {
        const Icon = iconFor(role);
        const href = `/settings/roles/${roleSlug(role.key)}`;
        return (
          <li key={role.key} className="group flex items-center gap-2 pr-3 hover:bg-accent/50">
            <Link
              href={href}
              className="flex min-w-0 flex-1 items-center gap-4 py-4 pl-5 focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 font-medium text-fg">
                  {role.name}
                  <ChevronRight
                    className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
                <span className="block text-sm text-fg-muted">
                  {summarizePermissions(role.permissions)}
                </span>
                {role.description && (
                  <span className="mt-0.5 block text-xs text-fg-subtle">{role.description}</span>
                )}
              </span>
              <span className="shrink-0 text-sm whitespace-nowrap text-fg-subtle tnum max-sm:hidden">
                {people(role.members)}
              </span>
            </Link>
            <RowActions label={`Actions for ${role.name}`}>
              <MenuItem icon={<Copy />} onSelect={() => onDuplicate(role)}>
                Duplicate
              </MenuItem>
            </RowActions>
          </li>
        );
      })}
    </ul>
  );
}

/** Name the new role and pick the role it starts from; then it opens to choose what it can do. */
function NewRoleModal({
  opened,
  from,
  roles,
  onClose,
}: {
  opened: boolean;
  from: RoleInfo | null;
  roles: RoleInfo[];
  onClose: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={from ? `Duplicate ${from.name}` : 'New role'}
      description="It starts with what the role you pick can do. Change it on the next page."
    >
      {opened && <NewRoleForm key={from?.key} from={from} roles={roles} onClose={onClose} />}
    </Modal>
  );
}

function NewRoleForm({
  from,
  roles,
  onClose,
}: {
  from: RoleInfo | null;
  roles: RoleInfo[];
  onClose: () => void;
}) {
  const router = useRouter();
  const refresh = useRefreshRoles();
  const [name, setName] = useState(from ? `${from.name} (copy)` : '');
  const [start, setStart] = useState(from?.key ?? 'HiringManager');
  const [description, setDescription] = useState(from?.description ?? '');
  const [submitted, setSubmitted] = useState(false);
  const base = roles.find((r) => r.key === start);
  const create = useMutation({
    mutationFn: () =>
      api.post<{ key: string }>('/api/admin/roles', {
        name: name.trim(),
        description: description.trim() || null,
        permissions: base?.permissions ?? [],
      }),
    onSuccess: (result) => {
      refresh();
      onClose();
      toast.success(
        `Made the ${name.trim()} role`,
        'Choose what it can do, then give it to people.',
      );
      router.push(`/settings/roles/${result.key}`);
    },
    onError: (e: Error) => toast.error('The role wasn’t made', e.message),
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (name.trim()) create.mutate();
      }}
    >
      <Input
        label="Name"
        value={name}
        maxLength={60}
        autoFocus
        onChange={(e) => setName(e.currentTarget.value)}
        error={submitted && !name.trim() ? 'Give the role a name.' : undefined}
      />
      <Select
        label="Start from"
        data={roles.map((r) => ({ value: r.key, label: r.name }))}
        value={start}
        onChange={(value) => value && setStart(value)}
        description={base ? summarizePermissions(base.permissions) : undefined}
      />
      <Textarea
        label="Description (optional)"
        placeholder="For example: schedules interviews for every job"
        rows={2}
        maxLength={300}
        value={description}
        onChange={(e) => setDescription(e.currentTarget.value)}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Make role
        </Button>
      </div>
    </form>
  );
}

/** /settings/roles/[role]: what a role can do (changeable for your own roles) and who has it. */
export function RoleDetail({ slug }: { slug: string }) {
  const key = roleKeyFromSlug(slug);
  const roles = useRoles();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const role = roles.data?.find((r) => r.key === key);
  if (!roles.data) return <SettingsLoading rows={6} />;
  if (!role)
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="There is no such role"
          description="It may have been deleted. Pick a role from the list."
          action={
            <Button asChild variant="secondary">
              <Link href="/settings/roles">All roles</Link>
            </Button>
          }
        />
      </Card>
    );
  return (
    <>
      <SettingsHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {role.name}
            {role.builtIn && <Badge tone="gray">Built-in</Badge>}
          </span>
        }
        crumbs={[{ label: role.name }]}
        actions={
          <>
            {!role.builtIn && (
              <Button
                variant="danger-quiet"
                leftIcon={<Trash2 />}
                onClick={() => setDeleting(true)}
              >
                Delete role
              </Button>
            )}
            <Button variant="secondary" leftIcon={<Copy />} onClick={() => setCreating(true)}>
              Duplicate
            </Button>
          </>
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          {role.builtIn ? <BuiltInPermissions role={role} /> : <RoleEditor role={role} />}
        </div>
        <RoleMembers role={role} />
      </div>
      <NewRoleModal
        opened={creating}
        from={role}
        roles={roles.data}
        onClose={() => setCreating(false)}
      />
      {!role.builtIn && (
        <DeleteRoleModal
          opened={deleting}
          role={role}
          roles={roles.data}
          onClose={() => setDeleting(false)}
        />
      )}
    </>
  );
}

/** A built-in role: each capability with a tick or a dash, nothing to switch. */
function BuiltInPermissions({ role }: { role: RoleInfo }) {
  return (
    <Card>
      <CardHeader
        title="What this role can do"
        description="Built-in roles can’t be changed. Duplicate this one to make a version you can change."
      />
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {ALL_PERMISSIONS.map((p) => {
          const has = role.permissions.includes(p);
          return (
            <li key={p} className="flex items-start gap-3 px-5 py-3.5">
              {has ? (
                <Check className="mt-0.5 size-4 shrink-0 text-tone-green-fg" aria-hidden />
              ) : (
                <Minus className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
              )}
              <span className="min-w-0">
                <span className={cn('block text-base', has ? 'text-fg' : 'text-fg-subtle')}>
                  {PERMISSION_TEXT[p].label}
                  <span className="sr-only">{has ? ': included' : ': not included'}</span>
                </span>
                <span className="mt-0.5 block text-xs text-fg-subtle">
                  {PERMISSION_TEXT[p].text}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-border-subtle px-5 py-3.5 text-sm text-fg-subtle">
        Everyone sees the interviews they are on and gives feedback on them.
      </p>
    </Card>
  );
}

/** A role your team made: its name and every capability, saved together. */
function RoleEditor({ role }: { role: RoleInfo }) {
  const me = useCurrentUser();
  const refresh = useRefreshRoles();
  const users = useAdminUsers();
  const source = {
    name: role.name,
    description: role.description ?? '',
    permissions: role.permissions,
  };
  const { draft, set, dirty, reset } = useDraft(source);
  const p = draft.permissions;
  const workspace = p.includes('workspace');
  const scope = jobScopeOf(p);
  // The server refuses to take "manage the workspace" from your own role or the owner's.
  const holders = (users.data ?? []).filter((u) => u.roleKey === role.key && u.isActive);
  const locked =
    role.permissions.includes('workspace') && holders.some((u) => u.id === me.id || u.isOwner);
  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/admin/roles/${role.key}`, {
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        permissions: draft.permissions,
      }),
    onSuccess: () => {
      refresh();
      toast.success(
        `Saved the ${draft.name.trim()} role`,
        'It applies to everyone with the role right away.',
      );
    },
    onError: (e: Error) => toast.error('The role wasn’t saved', e.message),
  });
  const toggle = (permission: Permission, on: boolean) =>
    set({ permissions: togglePermission(p, permission, on) });
  return (
    <SettingsSection
      id="role"
      title="Name and what it can do"
      description={summarizePermissions(p)}
      dirty={dirty}
      saving={save.isPending}
      onSave={() => (draft.name.trim() ? save.mutate() : toast.error('Give the role a name.'))}
      onDiscard={reset}
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
          <Input
            label="Name"
            value={draft.name}
            maxLength={60}
            onChange={(e) => set({ name: e.currentTarget.value })}
            error={!draft.name.trim() ? 'Give the role a name.' : undefined}
          />
          <Input
            label="Description (optional)"
            placeholder="For example: schedules interviews for every job"
            maxLength={300}
            value={draft.description}
            onChange={(e) => set({ description: e.currentTarget.value })}
          />
        </div>

        <Group title="Workspace">
          <Switch
            labelPosition="left"
            label={PERMISSION_TEXT.workspace.label}
            description={
              locked
                ? `${PERMISSION_TEXT.workspace.text} You can’t turn this off while you or the workspace owner have this role.`
                : PERMISSION_TEXT.workspace.text
            }
            checked={workspace}
            disabled={locked}
            // On keeps the other choices underneath, so turning it off again restores them.
            onCheckedChange={(on) =>
              set({
                permissions: on
                  ? [...p.filter((x) => x !== 'workspace'), 'workspace']
                  : togglePermission(p, 'workspace', false),
              })
            }
          />
        </Group>

        {workspace ? (
          <p className="rounded-lg bg-muted px-4 py-3 text-sm text-fg-muted">
            People with this role can do everything, so there is nothing else to choose.
          </p>
        ) : (
          <>
            <Group title="Jobs">
              <RadioGroup
                aria-label="Which jobs they work on"
                value={scope}
                onValueChange={(value) => set({ permissions: setJobScope(p, value as JobScope) })}
                options={JOB_SCOPES.map((s) => ({
                  value: s.value,
                  label: s.label,
                  description: s.text,
                }))}
                className="gap-4"
              />
            </Group>

            <Group title="Candidates">
              {scope === 'interviews' ? (
                <p className="text-sm text-fg-subtle">
                  Adding candidates needs a role that works on jobs. Pick one under Jobs.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <Switch
                    labelPosition="left"
                    label={PERMISSION_TEXT.candidates.label}
                    description={PERMISSION_TEXT.candidates.text}
                    checked={p.includes('candidates')}
                    onCheckedChange={(on) => toggle('candidates', on)}
                  />
                  {p.includes('candidates') && (
                    <Switch
                      labelPosition="left"
                      label={PERMISSION_TEXT.import.label}
                      description={PERMISSION_TEXT.import.text}
                      checked={p.includes('import')}
                      onCheckedChange={(on) => toggle('import', on)}
                      className="border-l-2 border-border-subtle pl-4"
                    />
                  )}
                </div>
              )}
            </Group>

            <Group title="Reports and templates">
              <div className="flex flex-col gap-4">
                <Switch
                  labelPosition="left"
                  label={PERMISSION_TEXT.reports.label}
                  description={PERMISSION_TEXT.reports.text}
                  checked={p.includes('reports')}
                  onCheckedChange={(on) => toggle('reports', on)}
                />
                {scope !== 'interviews' && (
                  <Switch
                    labelPosition="left"
                    label={PERMISSION_TEXT.templates.label}
                    description={PERMISSION_TEXT.templates.text}
                    checked={p.includes('templates')}
                    onCheckedChange={(on) => toggle('templates', on)}
                  />
                )}
              </div>
            </Group>
          </>
        )}
      </div>
    </SettingsSection>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-border-subtle pt-5">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="mb-3 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
        {title}
      </p>
      {children}
    </fieldset>
  );
}

/** Deleting a role moves everyone who has it to another role first, in the same step. */
function DeleteRoleModal({
  opened,
  role,
  roles,
  onClose,
}: {
  opened: boolean;
  role: RoleInfo;
  roles: RoleInfo[];
  onClose: () => void;
}) {
  const router = useRouter();
  const refresh = useRefreshRoles();
  const holders = (useAdminUsers().data ?? []).filter((u) => u.roleKey === role.key);
  const others = useRoleOptions().options.filter((o) => o.value !== role.key);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () =>
      api.delete(
        `/api/admin/roles/${role.key}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`,
      ),
    onSuccess: () => {
      refresh();
      onClose();
      toast.success(`Deleted the ${role.name} role`);
      router.push('/settings/roles');
    },
    onError: (e: Error) => toast.error('The role wasn’t deleted', e.message),
  });
  const needsMove = holders.length > 0;
  const target = roles.find((r) => r.key === moveTo);
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="sm"
      title={`Delete ${role.name}?`}
      description={
        needsMove
          ? `${holders.length === 1 ? '1 person has' : `${holders.length} people have`} this role. Pick the role they get instead.`
          : 'Nobody has this role. This can’t be undone.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={needsMove && !moveTo}
            loading={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Delete role
          </Button>
        </>
      }
    >
      {needsMove && (
        <Select
          label="Their new role"
          placeholder="Pick a role"
          data={others}
          value={moveTo}
          onChange={setMoveTo}
          description={target ? summarizePermissions(target.permissions) : undefined}
        />
      )}
    </Modal>
  );
}

function RoleMembers({ role }: { role: RoleInfo }) {
  const users = useAdminUsers();
  const members = (users.data ?? []).filter((u) => u.roleKey === role.key);
  return (
    <Card>
      <CardHeader
        title="People with this role"
        description={users.data ? people(members.filter((m) => m.isActive).length) : undefined}
        action={
          <Button asChild variant="link" size="sm">
            <Link href="/settings/members">Change roles</Link>
          </Button>
        }
      />
      {!users.data ? (
        <SkeletonRows rows={3} />
      ) : members.length === 0 ? (
        <EmptyState
          compact
          icon={UserPlus}
          title="Nobody has this role yet"
          description="Give it to someone under Members, or when you invite them."
        />
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {members.map((user) => (
            <li key={user.id}>
              <Link
                href={`/settings/members?member=${user.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <Avatar name={user.displayName} tone={user.avatarTone ?? undefined} size="sm" />
                <CellStack primary={user.displayName} secondary={user.email} className="flex-1" />
                {!user.isActive && <Badge tone="gray">Access removed</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

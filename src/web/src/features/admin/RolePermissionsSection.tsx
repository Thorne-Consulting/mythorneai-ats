'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarCheck,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  CellStack,
  SkeletonRows,
  Switch,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  toast,
} from '@/components/ui';
import type { Role } from '@/types';
import { ROLE_LABELS, ROLE_SLUG, roleFromSlug, useAdminUsers } from './admin-data';
import { SettingsLoading, SettingsSection, useDraft } from './settings-shared';

interface RolePermissions {
  available: string[];
  roles: Record<string, string[]>;
}

const DESCRIPTIONS: Record<string, { label: string; text: string }> = {
  reports: { label: 'Reports', text: 'See hiring reports and export them.' },
  import: { label: 'Import', text: 'Add many candidates at once from a spreadsheet (CSV) file.' },
  templates: { label: 'Templates', text: 'Edit the wording of emails sent to candidates.' },
};
const ROLE_CARDS: Record<Role, { icon: LucideIcon; text: string }> = {
  Admin: { icon: ShieldCheck, text: 'Workspace and security' },
  Recruiter: { icon: Briefcase, text: 'All recruiting activity' },
  HiringManager: { icon: Users, text: 'Their own jobs and candidates' },
  Interviewer: { icon: CalendarCheck, text: 'Only interviews assigned to them' },
};
const roleLabel = (role: string) => ROLE_LABELS[role as Role] ?? role;
const permLabel = (p: string) => DESCRIPTIONS[p]?.label ?? p;

export function RolePermissionsSection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => api.get<RolePermissions>('/api/admin/role-permissions'),
  });
  return (
    <>
      <RoleCards />
      {!query.data ? (
        <SettingsLoading rows={3} />
      ) : (
        <Editor
          source={query.data}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['role-permissions'] })}
        />
      )}
    </>
  );
}

function RoleCards() {
  const users = useAdminUsers();
  const count = (role: Role) => users.data?.filter((u) => u.role === role && u.isActive).length;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(ROLE_CARDS) as Role[]).map((role) => {
        const { icon: Icon, text } = ROLE_CARDS[role];
        const n = count(role);
        return (
          <Link
            key={role}
            href={`/admin/roles/${ROLE_SLUG[role]}`}
            className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="h-full p-4 transition-colors group-hover:border-border">
              <div className="flex items-start justify-between gap-3">
                <Icon className="size-5 text-accent-foreground" strokeWidth={1.75} aria-hidden />
                {n !== undefined && (
                  <span className="text-xs text-fg-subtle tnum">
                    {n} {n === 1 ? 'member' : 'members'}
                  </span>
                )}
              </div>
              <p className="mt-3 flex items-center gap-1 text-md font-semibold text-fg">
                {ROLE_LABELS[role]}
                <ChevronRight
                  className="size-4 text-fg-subtle transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </p>
              <p className="mt-1 text-xs text-fg-subtle">{text}</p>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function Editor({ source, onSaved }: { source: RolePermissions; onSaved: () => void }) {
  const { draft, replace, dirty, reset } = useDraft(source);
  const changes = draft.available.reduce(
    (n, p) =>
      n +
      Object.keys(draft.roles).filter(
        (r) => draft.roles[r].includes(p) !== (source.roles[r] ?? []).includes(p),
      ).length,
    0,
  );
  const save = useMutation({
    // The API reads the matrix from a field called "permissions".
    mutationFn: () => api.put('/api/admin/role-permissions', { permissions: draft.roles }),
    onSuccess: () => {
      onSaved();
      toast.success('Roles and permissions saved');
    },
    onError: (error: Error) => toast.error('Could not save permissions', error.message),
  });
  const toggle = (role: string, permission: string, on: boolean) =>
    replace({
      ...draft,
      roles: {
        ...draft.roles,
        [role]: on
          ? [...draft.roles[role], permission]
          : draft.roles[role].filter((x) => x !== permission),
      },
    });
  const roles = Object.keys(draft.roles);
  return (
    <>
      <Alert
        tone="info"
        icon={ShieldCheck}
        title="Admin permissions are locked"
        action={
          changes > 0 ? (
            <Badge tone="amber">
              {changes} unsaved {changes === 1 ? 'change' : 'changes'}
            </Badge>
          ) : undefined
        }
      >
        Admins always have full workspace access. To change someone’s role, edit them under Members.
      </Alert>
      <SettingsSection
        id="roles"
        title="Extra permissions"
        description="Each role has its own basic access. Turn on extras for the roles that need them."
        dirty={dirty}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onDiscard={reset}
      >
        <Table className="min-w-[640px]">
          <THead>
            <tr>
              <TH>Permission</TH>
              <TH>{ROLE_LABELS.Admin}</TH>
              {roles.map((role) => (
                <TH key={role}>{roleLabel(role)}</TH>
              ))}
            </tr>
          </THead>
          <TBody>
            {draft.available.map((permission) => (
              <TR key={permission}>
                <TD>
                  <p className="font-medium text-fg">{permLabel(permission)}</p>
                  {DESCRIPTIONS[permission] && (
                    <p className="mt-0.5 text-xs text-fg-subtle">{DESCRIPTIONS[permission].text}</p>
                  )}
                </TD>
                <TD>
                  <Switch
                    checked
                    disabled
                    onCheckedChange={() => undefined}
                    label="Always on"
                    aria-label={`Admin: ${permLabel(permission)}, always on`}
                  />
                </TD>
                {roles.map((role) => {
                  const on = draft.roles[role].includes(permission);
                  return (
                    <TD key={role}>
                      <Switch
                        checked={on}
                        onCheckedChange={(v) => toggle(role, permission, v)}
                        label={on ? 'On' : 'Off'}
                        aria-label={`${roleLabel(role)}: ${permLabel(permission)}`}
                      />
                    </TD>
                  );
                })}
              </TR>
            ))}
          </TBody>
        </Table>
      </SettingsSection>
    </>
  );
}

/** /admin/roles/[role]: one role's extras as switches, and who has the role. */
export function RoleDetail({ slug }: { slug: string }) {
  const queryClient = useQueryClient();
  const role = roleFromSlug(slug);
  const query = useQuery({
    queryKey: ['role-permissions'],
    queryFn: () => api.get<RolePermissions>('/api/admin/role-permissions'),
  });
  if (!role)
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="There is no such role"
          description="Pick one of the four roles to see what it can do."
          action={
            <Button asChild variant="secondary">
              <Link href="/admin/roles">All roles</Link>
            </Button>
          }
        />
      </Card>
    );
  const { icon: Icon, text } = ROLE_CARDS[role];
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[1fr_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="flex items-start gap-3 p-4">
          <Icon
            className="mt-0.5 size-5 shrink-0 text-accent-foreground"
            strokeWidth={1.75}
            aria-hidden
          />
          <div>
            <p className="font-medium text-fg">Basic access: {text.toLowerCase()}</p>
            <p className="mt-0.5 text-sm text-fg-subtle">
              {role === 'Admin'
                ? 'Admins always have every permission. Nothing here can be turned off.'
                : 'This role always has this. The extras below add to it.'}
            </p>
          </div>
        </Card>
        {!query.data ? (
          <SettingsLoading rows={3} />
        ) : (
          <RoleEditor
            role={role}
            source={query.data}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['role-permissions'] })}
          />
        )}
      </div>
      <RoleMembers role={role} />
    </div>
  );
}

function RoleEditor({
  role,
  source,
  onSaved,
}: {
  role: Role;
  source: RolePermissions;
  onSaved: () => void;
}) {
  const { draft, replace, dirty, reset } = useDraft(source);
  const locked = role === 'Admin' || !(role in draft.roles);
  const granted = draft.roles[role] ?? [];
  const save = useMutation({
    mutationFn: () => api.put('/api/admin/role-permissions', { permissions: draft.roles }),
    onSuccess: () => {
      onSaved();
      toast.success(`${ROLE_LABELS[role]} permissions saved`);
    },
    onError: (error: Error) => toast.error('Could not save permissions', error.message),
  });
  const toggle = (permission: string, on: boolean) =>
    replace({
      ...draft,
      roles: {
        ...draft.roles,
        [role]: on ? [...granted, permission] : granted.filter((x) => x !== permission),
      },
    });
  return (
    <SettingsSection
      id="role-permissions"
      title="Extra permissions"
      description={
        role === 'Admin'
          ? undefined
          : locked
            ? 'Always on for this role.'
            : `${granted.length} of ${draft.available.length} turned on.`
      }
      dirty={dirty}
      saving={save.isPending}
      onSave={locked ? undefined : () => save.mutate()}
      onDiscard={reset}
    >
      <div className="divide-y divide-border-subtle [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        {draft.available.map((permission) => (
          <Switch
            key={permission}
            labelPosition="left"
            label={permLabel(permission)}
            description={DESCRIPTIONS[permission]?.text}
            checked={locked || granted.includes(permission)}
            disabled={locked}
            onCheckedChange={(on) => toggle(permission, on)}
          />
        ))}
      </div>
    </SettingsSection>
  );
}

function RoleMembers({ role }: { role: Role }) {
  const users = useAdminUsers();
  const members = (users.data ?? []).filter((u) => u.role === role);
  return (
    <Card>
      <CardHeader
        title="People with this role"
        description={
          users.data ? `${members.length} ${members.length === 1 ? 'person' : 'people'}` : undefined
        }
        action={
          <Button asChild variant="link" size="sm">
            <Link href="/admin">Change roles</Link>
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
          description="Give someone this role under Members."
        />
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {members.map((user) => (
            <li key={user.email} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={user.displayName} size="sm" />
              <CellStack primary={user.displayName} secondary={user.email} className="flex-1" />
              {!user.isActive && <Badge tone="gray">Deactivated</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

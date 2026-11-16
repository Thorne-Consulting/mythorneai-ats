'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  Inbox,
  MailPlus,
  PanelRightOpen,
  RotateCw,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CellStack,
  Checkbox,
  ConfirmDialog,
  DescriptionList,
  Drawer,
  EmptyState,
  FilterSelect,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Modal,
  Pagination,
  RowActions,
  SearchInput,
  Select,
  SelectionBar,
  SkeletonRows,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Tabs,
  toast,
} from '@/components/ui';
import { formatRelative } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import { AuditSentence, useAuditEvents } from './AdminAudit';
import {
  isInvited,
  useAdminUsers,
  useDepartments,
  useRoleOptions,
  type Member,
} from './admin-data';
import { InviteMembersModal, TeamsField } from './InviteMembersModal';
import { SettingsHeader, useAccessRequests, type PendingAccessRequest } from './SettingsShell';

const PAGE_SIZE = 25;
const exact = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** `role` is a role key: a built-in name or a custom role's id. */
type Patch = { role?: string; isActive?: boolean; departments?: string[]; displayName?: string };

/** One request for one or many people; the server applies all of it or none. */
function useUpdateMembers() {
  const queryClient = useQueryClient();
  const { nameOf } = useRoleOptions();
  return useMutation({
    mutationFn: (input: { members: Member[]; patch: Patch }) =>
      api.patch('/api/admin/users', { ids: input.members.map((m) => m.id), ...input.patch }),
    onSuccess: (_, { members, patch }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'roles'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      const n = members.length;
      const who = n === 1 ? members[0].displayName : `${n} members`;
      toast.success(
        patch.role
          ? `${who} now ${n === 1 ? 'has' : 'have'} the ${nameOf(patch.role)} role`
          : patch.isActive === true
            ? `${who} can sign in again`
            : patch.isActive === false
              ? `${who} can no longer sign in`
              : 'Changes saved',
      );
    },
    // The server explains refusals in plain words, for example "At least one active admin must remain."
    onError: (error: Error) => toast.error('Access wasn’t changed', error.message),
  });
}

/** What a member's teams mean for the jobs they see. */
export const teamsText = (member: Pick<Member, 'role' | 'departments'>) =>
  member.role === 'Interviewer'
    ? 'Their interviews'
    : member.role !== 'Admin' && member.departments.length > 0
      ? member.departments.join(', ')
      : member.role === 'HiringManager'
        ? 'Their own jobs'
        : 'All teams';

const lastSignIn = (member: Member) =>
  member.lastSignInAt ? formatRelative(member.lastSignInAt) : 'Never';

/** Settings → Members: everyone with access, people invited, and people asking to join. */
export function MembersPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '/settings/members';
  const users = useAdminUsers();
  const requests = useAccessRequests();
  const [inviting, setInviting] = useState(false);
  const list = useMemo(() => users.data ?? [], [users.data]);
  const invited = list.filter(isInvited);
  const members = list.filter((m) => !isInvited(m));
  const teams = useDepartments().data ?? [];
  const tab = (['invited', 'requests'] as const).find((t) => t === params?.get('tab')) ?? 'members';
  const memberId = params?.get('member');
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params?.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const search = next.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  };

  return (
    <>
      <SettingsHeader
        actions={
          <Button leftIcon={<UserPlus />} onClick={() => setInviting(true)}>
            Invite people
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="px-4 sm:px-5">
          <Tabs
            aria-label="People"
            value={tab}
            onValueChange={(value) => setParam('tab', value === 'members' ? null : value)}
            items={[
              { value: 'members', label: 'Members', count: members.length },
              { value: 'invited', label: 'Invited', count: invited.length },
              { value: 'requests', label: 'Requests', count: requests.data?.length ?? 0 },
            ]}
          />
        </div>
        {!users.data ? (
          <SkeletonRows rows={5} />
        ) : tab === 'members' ? (
          <MembersTab members={members} teams={teams} onOpen={(m) => setParam('member', m.id)} />
        ) : tab === 'invited' ? (
          <InvitedTab invited={invited} everyone={list} onInvite={() => setInviting(true)} />
        ) : (
          <RequestsTab requests={requests.data} teams={teams} />
        )}
      </Card>
      <InviteMembersModal opened={inviting} onClose={() => setInviting(false)} teams={teams} />
      <MemberDrawer
        member={list.find((m) => m.id === memberId) ?? null}
        everyone={list}
        teams={teams}
        onClose={() => setParam('member', null)}
      />
    </>
  );
}

function MemberBadges({ member }: { member: Member }) {
  const me = useCurrentUser();
  return (
    <>
      {member.id === me.id && <Badge tone="gray">You</Badge>}
      {member.isOwner && <Badge tone="violet">Owner</Badge>}
    </>
  );
}

function MembersTab({
  members,
  teams,
  onOpen,
}: {
  members: Member[];
  teams: string[];
  onOpen: (member: Member) => void;
}) {
  const me = useCurrentUser();
  const update = useUpdateMembers();
  const { options: roleOptions } = useRoleOptions();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search).trim().toLowerCase();
  const [role, setRole] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [removing, setRemoving] = useState<Member[] | null>(null);

  const filtered = members.filter(
    (m) =>
      (!q || m.displayName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)) &&
      (!role || m.roleKey === role) &&
      (!status || (status === 'active') === m.isActive) &&
      (!team || m.departments.includes(team)),
  );
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // You can't change your own access, so you can't lock yourself out by accident.
  const selectable = rows.filter((m) => m.id !== me.id);
  const allOnPage = selectable.length > 0 && selectable.every((m) => selected.includes(m.id));
  const someOnPage = selectable.some((m) => selected.includes(m.id));
  const chosen = members.filter((m) => selected.includes(m.id));
  const change = (list: Member[], patch: Patch) =>
    update.mutate({ members: list, patch }, { onSuccess: () => setSelected([]) });
  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };
  const clear = () => {
    setSearch('');
    setRole(null);
    setStatus(null);
    setTeam(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
        <SearchInput
          value={search}
          onValueChange={filter(setSearch)}
          placeholder="Search by name or email"
          className="w-full sm:w-64"
        />
        <FilterSelect
          value={role}
          onChange={filter(setRole)}
          data={roleOptions}
          allLabel="All roles"
          aria-label="Filter by role"
        />
        {teams.length > 0 && (
          <FilterSelect
            value={team}
            onChange={filter(setTeam)}
            data={teams}
            allLabel="All teams"
            aria-label="Filter by team"
          />
        )}
        <FilterSelect
          value={status}
          onChange={filter(setStatus)}
          data={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Access removed' },
          ]}
          allLabel="Any status"
          aria-label="Filter by status"
        />
      </div>

      <div className="px-4 sm:px-5">
        <SelectionBar count={selected.length} noun="member" onClear={() => setSelected([])}>
          <Menu>
            <MenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<ChevronDown />}
                disabled={update.isPending}
              >
                Change role
              </Button>
            </MenuTrigger>
            <MenuContent>
              {roleOptions.map((r) => (
                <MenuItem key={r.value} onSelect={() => change(chosen, { role: r.value })}>
                  {r.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          {chosen.some((m) => !m.isActive) && (
            <Button
              size="sm"
              variant="secondary"
              disabled={update.isPending}
              onClick={() =>
                change(
                  chosen.filter((m) => !m.isActive),
                  { isActive: true },
                )
              }
            >
              Give access back
            </Button>
          )}
          {chosen.some((m) => m.isActive) && (
            <Button
              size="sm"
              variant="danger-quiet"
              onClick={() => setRemoving(chosen.filter((m) => m.isActive))}
            >
              Remove access
            </Button>
          )}
        </SelectionBar>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          compact
          icon={Users}
          title={members.length ? 'No members match these filters' : 'No members yet'}
          description={
            members.length
              ? 'Try another name, role or team.'
              : 'Invite the recruiters, hiring managers and interviewers who need access.'
          }
          action={
            members.length ? (
              <Button variant="secondary" onClick={clear}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Phone: one card per person, nothing cut off. */}
          <ul className="divide-y divide-border-subtle border-t border-border-subtle sm:hidden">
            {rows.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onOpen(m)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted"
                >
                  <Avatar name={m.displayName} tone={m.avatarTone ?? undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-medium text-fg">{m.displayName}</span>
                      <MemberBadges member={m} />
                    </span>
                    <span className="block truncate text-xs text-fg-subtle">{m.email}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                      <Badge tone={m.role === 'Admin' ? 'blue' : 'gray'}>{m.roleName}</Badge>
                      {!m.isActive && (
                        <Badge dot tone="gray">
                          Access removed
                        </Badge>
                      )}
                      <span>
                        {m.lastSignInAt
                          ? `Signed in ${formatRelative(m.lastSignInAt)}`
                          : 'Never signed in'}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="max-sm:hidden overflow-x-auto px-5">
            <Table className="min-w-[760px]">
              <THead>
                <tr>
                  <TH className="w-10">
                    <Checkbox
                      aria-label="Select all members on this page"
                      checked={allOnPage ? true : someOnPage ? 'indeterminate' : false}
                      disabled={selectable.length === 0}
                      onCheckedChange={(on) =>
                        setSelected((cur) =>
                          on
                            ? [...new Set([...cur, ...selectable.map((m) => m.id)])]
                            : cur.filter((id) => !selectable.some((m) => m.id === id)),
                        )
                      }
                    />
                  </TH>
                  <TH>Member</TH>
                  <TH className="w-44">Role</TH>
                  <TH>Teams</TH>
                  <TH>Last signed in</TH>
                  <TH>Status</TH>
                  <TH className="w-12">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((m) => {
                  const isMe = m.id === me.id;
                  const on = selected.includes(m.id);
                  return (
                    <TR key={m.id} selected={on} interactive onClick={() => onOpen(m)}>
                      <TD onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={
                            isMe ? 'You can’t change your own access' : `Select ${m.displayName}`
                          }
                          checked={on}
                          disabled={isMe}
                          onCheckedChange={(v) =>
                            setSelected((cur) =>
                              v ? [...cur, m.id] : cur.filter((id) => id !== m.id),
                            )
                          }
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={m.displayName} tone={m.avatarTone ?? undefined} />
                          <CellStack
                            primary={
                              <span className="flex flex-wrap items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onOpen(m);
                                  }}
                                  className="rounded-sm font-medium text-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                >
                                  {m.displayName}
                                </button>
                                <MemberBadges member={m} />
                              </span>
                            }
                            secondary={m.email}
                          />
                        </div>
                      </TD>
                      <TD onClick={(e) => e.stopPropagation()}>
                        {isMe || m.isOwner || !m.isActive ? (
                          <span className="text-fg-muted">{m.roleName}</span>
                        ) : (
                          <Select
                            size="sm"
                            aria-label={`Role for ${m.displayName}`}
                            data={roleOptions}
                            value={m.roleKey}
                            disabled={update.isPending}
                            onChange={(value) =>
                              value && value !== m.roleKey && change([m], { role: value })
                            }
                          />
                        )}
                      </TD>
                      <TD className="max-w-56 truncate text-fg-muted">{teamsText(m)}</TD>
                      <TD className="whitespace-nowrap text-fg-muted">
                        <span
                          title={
                            m.lastSignInAt ? exact.format(new Date(m.lastSignInAt)) : undefined
                          }
                        >
                          {lastSignIn(m)}
                        </span>
                      </TD>
                      <TD>
                        <Badge dot tone={m.isActive ? 'green' : 'gray'}>
                          {m.isActive ? 'Active' : 'Access removed'}
                        </Badge>
                      </TD>
                      <TD align="right" onClick={(e) => e.stopPropagation()}>
                        <RowActions label={`Actions for ${m.displayName}`}>
                          <MenuItem icon={<PanelRightOpen />} onSelect={() => onOpen(m)}>
                            Open details
                          </MenuItem>
                          {!isMe &&
                            !m.isOwner &&
                            (m.isActive ? (
                              <MenuItem icon={<UserX />} danger onSelect={() => setRemoving([m])}>
                                Remove access
                              </MenuItem>
                            ) : (
                              <MenuItem
                                icon={<UserCheck />}
                                onSelect={() => change([m], { isActive: true })}
                              >
                                Give access back
                              </MenuItem>
                            ))}
                        </RowActions>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
          <div className="px-4 sm:px-5">
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
              noun="members"
            />
          </div>
        </>
      )}
      <ConfirmDialog
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title={
          removing?.length === 1
            ? `Remove access for ${removing[0].displayName}?`
            : `Remove access for ${removing?.length} members?`
        }
        message="They won’t be able to sign in. Their jobs, notes and feedback stay, and you can give access back later."
        confirmLabel="Remove access"
        onConfirm={async () => {
          if (!removing) return;
          await update
            .mutateAsync({ members: removing, patch: { isActive: false } })
            .then(() => setSelected([]))
            .catch(() => undefined);
        }}
      />
    </>
  );
}

function InvitedTab({
  invited,
  everyone,
  onInvite,
}: {
  invited: Member[];
  everyone: Member[];
  onInvite: () => void;
}) {
  const queryClient = useQueryClient();
  const [withdrawing, setWithdrawing] = useState<Member | null>(null);
  const nameOf = (email?: string | null) =>
    everyone.find((m) => m.email === email)?.displayName ?? email ?? 'Someone';
  const resend = useMutation({
    mutationFn: (m: Member) => api.post(`/api/admin/invitations/${m.id}/resend`),
    onSuccess: (_, m) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(`Sent the invitation to ${m.email} again`);
    },
    onError: (e: Error) => toast.error('The invitation wasn’t sent', e.message),
  });
  const withdraw = useMutation({
    mutationFn: (m: Member) => api.delete(`/api/admin/invitations/${m.id}`),
    onSuccess: (_, m) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(`Withdrew the invitation for ${m.email}`);
    },
    onError: (e: Error) => toast.error('The invitation wasn’t withdrawn', e.message),
  });
  if (invited.length === 0)
    return (
      <EmptyState
        compact
        icon={MailPlus}
        title="No open invitations"
        description="People you invite show up here until they sign in for the first time."
        action={
          <Button variant="secondary" leftIcon={<UserPlus />} onClick={onInvite}>
            Invite people
          </Button>
        }
      />
    );
  return (
    <>
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {invited.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
            <Avatar name={m.displayName} tone={m.avatarTone ?? undefined} />
            <div className="min-w-0 flex-1 basis-56">
              <p className="truncate font-medium text-fg">{m.email}</p>
              <p className="text-xs text-fg-subtle">
                {m.roleName}
                {m.departments.length ? ` · ${m.departments.join(', ')}` : ''} · invited by{' '}
                {nameOf(m.invitedByEmail)} {m.invitedAt ? formatRelative(m.invitedAt) : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RotateCw />}
                loading={resend.isPending && resend.variables?.id === m.id}
                onClick={() => resend.mutate(m)}
              >
                Send again
              </Button>
              <Button size="sm" variant="danger-quiet" onClick={() => setWithdrawing(m)}>
                Withdraw
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        opened={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        title={`Withdraw the invitation for ${withdrawing?.email}?`}
        message="They won’t be able to sign in with it. You can invite them again later."
        confirmLabel="Withdraw invitation"
        onConfirm={async () => {
          if (withdrawing) await withdraw.mutateAsync(withdrawing).catch(() => undefined);
        }}
      />
    </>
  );
}

function RequestsTab({
  requests,
  teams,
}: {
  requests: PendingAccessRequest[] | undefined;
  teams: string[];
}) {
  const queryClient = useQueryClient();
  const [approving, setApproving] = useState<PendingAccessRequest | null>(null);
  const [declining, setDeclining] = useState<PendingAccessRequest | null>(null);
  const { options: roleOptions, kindOf } = useRoleOptions();
  const [role, setRole] = useState('Interviewer');
  const [departments, setDepartments] = useState<string[]>([]);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin', 'access-requests'] });
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  };
  const approve = useMutation({
    mutationFn: (r: PendingAccessRequest) =>
      api.post(`/api/admin/access-requests/${r.id}/approve`, {
        role,
        departments,
      }),
    onSuccess: (_, r) => {
      refresh();
      setApproving(null);
      toast.success(`${r.name} can now sign in`, 'We emailed them to say so.');
    },
    onError: (e: Error) => toast.error('The request wasn’t approved', e.message),
  });
  const decline = useMutation({
    mutationFn: (r: PendingAccessRequest) => api.post(`/api/admin/access-requests/${r.id}/decline`),
    onSuccess: (_, r) => {
      refresh();
      toast.success(`Declined ${r.name}’s request`);
    },
    onError: (e: Error) => toast.error('The request wasn’t declined', e.message),
  });
  if (!requests) return <SkeletonRows rows={3} />;
  if (requests.length === 0)
    return (
      <EmptyState
        compact
        icon={Inbox}
        title="Nobody is waiting"
        description="When someone with a company email address signs in without an invitation, they show up here for you to approve."
      />
    );
  return (
    <>
      <ul className="divide-y divide-border-subtle border-t border-border-subtle">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
            <Avatar name={r.name} />
            <div className="min-w-0 flex-1 basis-56">
              <p className="font-medium text-fg">
                {r.name} <span className="font-normal text-fg-subtle">{r.email}</span>
              </p>
              <p className="text-xs text-fg-subtle">Asked {formatRelative(r.createdAt)}</p>
              {r.note && (
                <p className="mt-1.5 max-w-prose rounded-md bg-muted px-3 py-2 text-sm text-fg-muted">
                  {r.note}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="danger-quiet" onClick={() => setDeclining(r)}>
                Decline
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setRole('Interviewer');
                  setDepartments([]);
                  setApproving(r);
                }}
              >
                Approve
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Modal
        opened={approving !== null}
        onClose={() => setApproving(null)}
        title={`Let ${approving?.name} in`}
        description="Pick what they can do. We email them when you approve."
        footer={
          <>
            <Button variant="secondary" onClick={() => setApproving(null)}>
              Cancel
            </Button>
            <Button
              loading={approve.isPending}
              onClick={() => approving && approve.mutate(approving)}
            >
              Approve
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Role"
            data={roleOptions}
            value={role}
            onChange={(value) => value && setRole(value)}
          />
          <TeamsField
            role={kindOf(role)}
            data={teams}
            value={departments}
            onChange={setDepartments}
          />
        </div>
      </Modal>
      <ConfirmDialog
        opened={declining !== null}
        onClose={() => setDeclining(null)}
        title={`Decline ${declining?.name}’s request?`}
        message="They can’t sign in, and they can ask again after 7 days. We don’t email them."
        confirmLabel="Decline request"
        onConfirm={async () => {
          if (declining) await decline.mutateAsync(declining).catch(() => undefined);
        }}
      />
    </>
  );
}

/** Opens from a member's row: their details, access and recent activity. */
function MemberDrawer({
  member,
  everyone,
  teams,
  onClose,
}: {
  member: Member | null;
  everyone: Member[];
  teams: string[];
  onClose: () => void;
}) {
  return (
    <Drawer
      opened={member !== null}
      onClose={onClose}
      title={member?.displayName ?? 'Member'}
      description={member?.email}
      size="md"
    >
      {member && (
        <MemberDetails
          key={member.id + member.updatedAt}
          member={member}
          everyone={everyone}
          teams={teams}
        />
      )}
    </Drawer>
  );
}

function MemberDetails({
  member,
  everyone,
  teams,
}: {
  member: Member;
  everyone: Member[];
  teams: string[];
}) {
  const me = useCurrentUser();
  const update = useUpdateMembers();
  const isMe = member.id === me.id;
  const [name, setName] = useState(member.displayName);
  const { options: roleOptions, kindOf } = useRoleOptions();
  const [role, setRole] = useState(member.roleKey);
  const [departments, setDepartments] = useState(member.departments);
  const [removing, setRemoving] = useState(false);
  const activity = useAuditEvents({ actor: member.email }, 6);
  const dirty =
    name.trim() !== member.displayName ||
    role !== member.roleKey ||
    departments.join('\n') !== member.departments.join('\n');
  const inviter =
    everyone.find((m) => m.email === member.invitedByEmail)?.displayName ?? member.invitedByEmail;
  const save = () =>
    update.mutate({
      members: [member],
      patch: {
        displayName: name.trim(),
        ...(role !== member.roleKey ? { role } : {}),
        departments,
      },
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-1.5">
        <MemberBadges member={member} />
        <Badge dot tone={member.isActive ? 'green' : 'gray'}>
          {member.isActive ? (isInvited(member) ? 'Invited' : 'Active') : 'Access removed'}
        </Badge>
      </div>
      <section className="flex flex-col gap-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        <Select
          label="Role"
          description={
            isMe
              ? 'You can’t change your own role. Ask another admin.'
              : member.isOwner
                ? 'The workspace owner is always an admin.'
                : undefined
          }
          data={roleOptions}
          value={role}
          disabled={isMe || member.isOwner || !member.isActive}
          onChange={(value) => value && setRole(value)}
        />
        <TeamsField
          role={kindOf(role)}
          data={teams}
          value={departments}
          onChange={setDepartments}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isMe &&
            !member.isOwner &&
            (member.isActive ? (
              <Button
                variant="danger-quiet"
                className="mr-auto"
                leftIcon={<UserX />}
                onClick={() => setRemoving(true)}
              >
                Remove access
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="mr-auto"
                leftIcon={<UserCheck />}
                onClick={() => update.mutate({ members: [member], patch: { isActive: true } })}
              >
                Give access back
              </Button>
            ))}
          <Button disabled={!dirty || !name.trim()} loading={update.isPending} onClick={save}>
            Save changes
          </Button>
        </div>
      </section>
      <DescriptionList
        columns={2}
        className="border-t border-border-subtle pt-5"
        items={[
          {
            label: 'Last signed in',
            value: member.lastSignInAt ? exact.format(new Date(member.lastSignInAt)) : 'Never',
          },
          {
            label: 'Invited',
            value: member.invitedAt
              ? `${exact.format(new Date(member.invitedAt))}${inviter ? ` by ${inviter}` : ''}`
              : 'Not set',
          },
        ]}
      />
      <section className="border-t border-border-subtle pt-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-fg">Recent activity</h3>
          <Link
            href={`/settings/activity?actor=${encodeURIComponent(member.email)}`}
            className="text-sm font-medium text-accent-foreground hover:underline"
          >
            See all
          </Link>
        </div>
        {!activity.data ? (
          <SkeletonRows rows={3} className="px-0" />
        ) : activity.data.items.length === 0 ? (
          <p className="text-sm text-fg-subtle">Nothing yet.</p>
        ) : (
          <ul className="space-y-3">
            {activity.data.items.map((event) => (
              <li key={event.id} className="text-sm text-fg-muted">
                <AuditSentence event={event} link />
                <span className="block text-xs text-fg-subtle">
                  {formatRelative(event.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <ConfirmDialog
        opened={removing}
        onClose={() => setRemoving(false)}
        title={`Remove access for ${member.displayName}?`}
        message="They won’t be able to sign in. Their jobs, notes and feedback stay, and you can give access back later."
        confirmLabel="Remove access"
        onConfirm={async () => {
          await update
            .mutateAsync({ members: [member], patch: { isActive: false } })
            .catch(() => undefined);
        }}
      />
    </div>
  );
}

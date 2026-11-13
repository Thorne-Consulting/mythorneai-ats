'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, PenLine, Plus, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardLink,
  CellStack,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  FilterSelect,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Pagination,
  RowActions,
  SearchInput,
  SelectionBar,
  SkeletonRows,
  StatCard,
  StatGrid,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  toast,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import type { AdminUser } from '@/types';
import { ROLE_LABELS, ROLE_OPTIONS, useAdminUsers } from './admin-data';
import { UserModal } from './UserModal';

const PAGE_SIZE = 25;

export function AdminUsers() {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const users = useAdminUsers();
  const list = useMemo(() => users.data ?? [], [users.data]);
  const [modal, setModal] = useState<{ user: AdminUser | null } | null>(null);
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search).trim().toLowerCase();
  const [role, setRole] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [team, setTeam] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [deactivating, setDeactivating] = useState<AdminUser[] | null>(null);

  const active = list.filter((u) => u.isActive).length;
  const roles = new Set(list.map((u) => u.role)).size;
  const admins = list.filter((u) => u.role === 'Admin' && u.isActive).length;
  const teams = [...new Set(list.map((u) => u.department).filter((d): d is string => !!d))].sort();

  const filtered = list.filter(
    (u) =>
      (!q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
      (!role || u.role === role) &&
      (!status || (status === 'active') === u.isActive) &&
      (!team || u.department === team),
  );
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // You can't bulk-change your own access, so you can't lock yourself out by accident.
  const selectable = pageRows.filter((u) => u.id !== me.id);
  const allOnPage = selectable.length > 0 && selectable.every((u) => selected.includes(u.id));
  const someOnPage = selectable.some((u) => selected.includes(u.id));
  const chosen = list.filter((u) => selected.includes(u.id));

  const update = useMutation({
    mutationFn: (input: {
      users: AdminUser[];
      patch: Partial<Pick<AdminUser, 'role' | 'isActive'>>;
    }) =>
      Promise.all(
        input.users.map((u) =>
          api.post('/api/admin/users', {
            email: u.email,
            displayName: u.displayName,
            role: input.patch.role ?? u.role,
            department: u.department || null,
            isActive: input.patch.isActive ?? u.isActive,
          }),
        ),
      ),
    onSuccess: (_, input) => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setSelected([]);
      const n = input.users.length;
      const who = n === 1 ? input.users[0].displayName : `${n} members`;
      toast.success(
        input.patch.role
          ? `${who} now ${n === 1 ? 'has' : 'have'} the ${ROLE_LABELS[input.patch.role]} role`
          : input.patch.isActive
            ? `${who} can sign in again`
            : `${who} can no longer sign in`,
      );
    },
    onError: (error: Error) => toast.error('Could not change access', error.message),
  });

  const filter =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPage(1);
    };

  return (
    <>
      <StatGrid>
        <StatCard
          icon={Users}
          label="Active members"
          value={`${active} / ${list.length}`}
          hint={`${list.length - active} deactivated`}
        />
        <StatCard
          icon={ShieldCheck}
          tone="violet"
          label="Workspace roles"
          value={roles}
          hint={`${admins} active ${admins === 1 ? 'admin' : 'admins'}`}
        />
        <StatCard
          icon={UserCheck}
          tone="green"
          label="Interviewers"
          value={list.filter((u) => u.role === 'Interviewer' && u.isActive).length}
          hint="See only their own interviews"
        />
        <StatCard
          icon={Users}
          tone="amber"
          label="Teams"
          value={teams.length}
          hint={teams.length ? 'Members scoped to a team' : 'Everyone sees all teams'}
        />
      </StatGrid>

      <Card className="px-5 pb-2">
        <div className="flex flex-wrap items-center gap-2 py-4">
          <SearchInput
            value={search}
            onValueChange={filter(setSearch)}
            placeholder="Search members by name or email"
            className="w-full sm:w-72"
          />
          <FilterSelect
            value={role}
            onChange={filter(setRole)}
            data={ROLE_OPTIONS}
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
              { value: 'inactive', label: 'Deactivated' },
            ]}
            allLabel="Any status"
            aria-label="Filter by status"
          />
          <Button
            className="sm:ml-auto"
            leftIcon={<Plus />}
            onClick={() => setModal({ user: null })}
          >
            Add member
          </Button>
        </div>

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
              {ROLE_OPTIONS.map((r) => (
                <MenuItem
                  key={r.value}
                  onSelect={() => update.mutate({ users: chosen, patch: { role: r.value } })}
                >
                  {r.label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          {chosen.some((u) => !u.isActive) && (
            <Button
              size="sm"
              variant="secondary"
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  users: chosen.filter((u) => !u.isActive),
                  patch: { isActive: true },
                })
              }
            >
              Reactivate
            </Button>
          )}
          {chosen.some((u) => u.isActive) && (
            <Button
              size="sm"
              variant="secondary"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeactivating(chosen.filter((u) => u.isActive))}
            >
              Remove access
            </Button>
          )}
        </SelectionBar>

        {!users.data ? (
          <SkeletonRows rows={5} className="px-0" />
        ) : filtered.length === 0 ? (
          <EmptyState
            compact
            icon={Users}
            title={list.length ? 'No members match these filters' : 'No members yet'}
            description={
              list.length
                ? 'Try another name, role or team.'
                : 'Add the recruiters, hiring managers and interviewers who need access.'
            }
            action={
              list.length ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setRole(null);
                    setStatus(null);
                    setTeam(null);
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
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
                            ? [...new Set([...cur, ...selectable.map((u) => u.id)])]
                            : cur.filter((id) => !selectable.some((u) => u.id === id)),
                        )
                      }
                    />
                  </TH>
                  <TH>Member</TH>
                  <TH>Workspace role</TH>
                  <TH>Team</TH>
                  <TH>Status</TH>
                  <TH>Last updated</TH>
                  <TH className="w-12">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {pageRows.map((u) => {
                  const isMe = u.id === me.id;
                  const on = selected.includes(u.id);
                  return (
                    <TR key={u.id} selected={on}>
                      <TD>
                        <Checkbox
                          aria-label={
                            isMe
                              ? 'You cannot change your own access here'
                              : `Select ${u.displayName}`
                          }
                          checked={on}
                          disabled={isMe}
                          onCheckedChange={(v) =>
                            setSelected((cur) =>
                              v ? [...cur, u.id] : cur.filter((id) => id !== u.id),
                            )
                          }
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-3">
                          <Avatar name={u.displayName} />
                          <CellStack
                            primary={isMe ? `${u.displayName} (you)` : u.displayName}
                            secondary={u.email}
                          />
                        </div>
                      </TD>
                      <TD>
                        <Badge variant="outline" tone={u.role === 'Admin' ? 'blue' : 'gray'}>
                          {ROLE_LABELS[u.role]}
                        </Badge>
                      </TD>
                      <TD className="text-fg-muted">{u.department ?? 'All teams'}</TD>
                      <TD>
                        <Badge dot tone={u.isActive ? 'green' : 'gray'}>
                          {u.isActive ? 'Active' : 'Deactivated'}
                        </Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-fg-muted tnum">
                        {formatDateTime(u.updatedAt)}
                      </TD>
                      <TD align="right">
                        <RowActions label={`Actions for ${u.displayName}`}>
                          <MenuItem icon={<PenLine />} onSelect={() => setModal({ user: u })}>
                            Edit access
                          </MenuItem>
                          {!isMe &&
                            (u.isActive ? (
                              <MenuItem
                                icon={<UserX />}
                                danger
                                onSelect={() => setDeactivating([u])}
                              >
                                Remove access
                              </MenuItem>
                            ) : (
                              <MenuItem
                                icon={<UserCheck />}
                                onSelect={() =>
                                  update.mutate({ users: [u], patch: { isActive: true } })
                                }
                              >
                                Reactivate
                              </MenuItem>
                            ))}
                        </RowActions>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={filtered.length}
              onPageChange={setPage}
              noun="members"
            />
          </>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-subtle">
        <p>Role changes apply immediately and are recorded in the audit log.</p>
        <CardLink href="/admin/audit">View audit log</CardLink>
      </div>

      <UserModal
        key={modal?.user?.id ?? 'new'}
        opened={modal !== null}
        onClose={() => setModal(null)}
        user={modal?.user}
      />
      <ConfirmDialog
        opened={deactivating !== null}
        onClose={() => setDeactivating(null)}
        title={
          deactivating?.length === 1
            ? `Remove access for ${deactivating[0].displayName}?`
            : `Remove access for ${deactivating?.length} members?`
        }
        message="They won’t be able to sign in. Their jobs, notes and feedback stay, and you can reactivate them later."
        confirmLabel="Remove access"
        onConfirm={async () => {
          if (!deactivating) return;
          // onError already shows a toast; close the dialog either way.
          await update
            .mutateAsync({ users: deactivating, patch: { isActive: false } })
            .catch(() => undefined);
        }}
      />
    </>
  );
}

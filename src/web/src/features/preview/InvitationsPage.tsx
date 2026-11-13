'use client';

import { useState } from 'react';
import { MailX, RotateCw, UserPlus, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CellStack,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  MenuItem,
  RowActions,
  SelectionBar,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@/components/ui';
import { StatusBadge } from '@/components/status';
import { InviteMembersModal } from './InviteMembersModal';
import { PreviewAlert, useSelection } from './preview-ui';
import { sampleInvitations, type Invitation } from './sample-admin';

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function InvitationsPage() {
  const [invitations, setInvitations] = useState(sampleInvitations);
  const [revoking, setRevoking] = useState<string[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const sel = useSelection(invitations.map((i) => i.id));

  const resend = (ids: string[]) => {
    setInvitations((list) =>
      list.map((i) => (ids.includes(i.id) ? { ...i, status: 'Pending', sent: 'Just now' } : i)),
    );
    toast.success(`${plural(ids.length, 'invite')} resent`, 'The new link is valid for 7 days.');
  };

  return (
    <>
      {/* Title and Preview badge come from the Settings shell (AdminShell). */}
      <div className="-mt-1 mb-4 flex justify-end gap-2">
        <Button leftIcon={<UserPlus />} onClick={() => setInviting(true)}>
          Invite members
        </Button>
      </div>
      <PreviewAlert />

      <Card className="p-4">
        {invitations.length === 0 ? (
          <EmptyState
            icon={MailX}
            title="No open invitations"
            description="Everyone you invited has joined. Invite more people when you need them."
            action={
              <Button leftIcon={<UserPlus />} onClick={() => setInviting(true)}>
                Invite members
              </Button>
            }
          />
        ) : (
          <>
            <SelectionBar count={sel.selected.length} noun="invitation" onClear={sel.clear}>
              <Button
                size="sm"
                variant="soft"
                leftIcon={<RotateCw />}
                onClick={() => resend(sel.selected)}
              >
                Resend
              </Button>
              <Button
                size="sm"
                variant="danger-quiet"
                leftIcon={<X />}
                onClick={() => setRevoking(sel.selected)}
              >
                Revoke
              </Button>
            </SelectionBar>
            <Table>
              <THead>
                <tr>
                  <TH className="w-10">
                    <Checkbox
                      aria-label="Select all invitations"
                      checked={sel.allState}
                      onCheckedChange={sel.toggleAll}
                    />
                  </TH>
                  <TH>Invitee</TH>
                  <TH>Role</TH>
                  <TH>Sent</TH>
                  <TH>Status</TH>
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {invitations.map((i: Invitation) => (
                  <TR key={i.id} selected={sel.has(i.id)}>
                    <TD>
                      <Checkbox
                        aria-label={`Select ${i.email}`}
                        checked={sel.has(i.id)}
                        onCheckedChange={(on) => sel.toggle(i.id, on)}
                      />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={i.email.split('@')[0].replace(/[._]/g, ' ')} />
                        <CellStack primary={i.email} secondary={`Invited by ${i.invitedBy}`} />
                      </div>
                    </TD>
                    <TD>
                      <Badge>{i.role}</Badge>
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">{i.sent}</TD>
                    <TD>
                      <StatusBadge status={i.status} />
                    </TD>
                    <TD align="right">
                      <RowActions label={`Actions for ${i.email}`}>
                        <MenuItem icon={<RotateCw />} onSelect={() => resend([i.id])}>
                          Resend invite
                        </MenuItem>
                        <MenuItem icon={<X />} danger onSelect={() => setRevoking([i.id])}>
                          Revoke
                        </MenuItem>
                      </RowActions>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </Card>

      <ConfirmDialog
        opened={!!revoking}
        onClose={() => setRevoking(null)}
        title={
          revoking?.length === 1
            ? 'Revoke this invitation?'
            : `Revoke ${plural(revoking?.length ?? 0, 'invitation')}?`
        }
        message="The invite link stops working. You can invite them again later."
        confirmLabel="Revoke"
        onConfirm={() => {
          if (!revoking) return;
          setInvitations((list) => list.filter((i) => !revoking.includes(i.id)));
          toast.success(`${plural(revoking.length, 'invitation')} revoked`);
        }}
      />
      <InviteMembersModal
        opened={inviting}
        onClose={() => setInviting(false)}
        onInvite={(emails, role) => {
          const known = new Set(invitations.map((i) => i.email));
          const fresh = emails.filter((e) => !known.has(e));
          setInvitations((list) => [
            ...fresh.map((email) => ({
              id: crypto.randomUUID(),
              email,
              role,
              invitedBy: 'You',
              sent: 'Just now',
              status: 'Pending' as const,
            })),
            ...list,
          ]);
          toast.success(
            `${plural(fresh.length, 'invite')} sent`,
            fresh.length < emails.length ? 'Some addresses already had an invite.' : undefined,
          );
        }}
      />
    </>
  );
}

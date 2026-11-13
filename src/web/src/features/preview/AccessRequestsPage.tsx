'use client';

import { useState } from 'react';
import { Check, Inbox, UserPlus, X } from 'lucide-react';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CellStack,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  SelectionBar,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  toast,
} from '@/components/ui';
import { InviteMembersModal } from './InviteMembersModal';
import { PreviewAlert, useSelection } from './preview-ui';
import { sampleAccessRequests } from './sample-admin';

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

export function AccessRequestsPage() {
  const [requests, setRequests] = useState(sampleAccessRequests);
  const [declining, setDeclining] = useState<string[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const sel = useSelection(requests.map((r) => r.id));

  const remove = (ids: string[]) => setRequests((list) => list.filter((r) => !ids.includes(r.id)));
  const approve = (ids: string[]) => {
    const names = requests.filter((r) => ids.includes(r.id)).map((r) => r.name);
    remove(ids);
    toast.success(
      ids.length === 1 ? `${names[0]} approved` : `${plural(ids.length, 'request')} approved`,
      'They can sign in now.',
    );
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
        {requests.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No pending access requests"
            description="When someone asks to join, their request shows up here. You can also invite people directly."
            action={
              <Button leftIcon={<UserPlus />} onClick={() => setInviting(true)}>
                Invite members
              </Button>
            }
          />
        ) : (
          <>
            <SelectionBar count={sel.selected.length} noun="request" onClear={sel.clear}>
              <Button
                size="sm"
                variant="soft"
                leftIcon={<Check />}
                onClick={() => approve(sel.selected)}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="danger-quiet"
                leftIcon={<X />}
                onClick={() => setDeclining(sel.selected)}
              >
                Decline
              </Button>
            </SelectionBar>
            <Table>
              <THead>
                <tr>
                  <TH className="w-10">
                    <Checkbox
                      aria-label="Select all requests"
                      checked={sel.allState}
                      onCheckedChange={sel.toggleAll}
                    />
                  </TH>
                  <TH>Member</TH>
                  <TH>Requested role</TH>
                  <TH>Team</TH>
                  <TH>Requested</TH>
                  <TH align="right">
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {requests.map((r) => (
                  <TR key={r.id} selected={sel.has(r.id)}>
                    <TD>
                      <Checkbox
                        aria-label={`Select ${r.name}`}
                        checked={sel.has(r.id)}
                        onCheckedChange={(on) => sel.toggle(r.id, on)}
                      />
                    </TD>
                    <TD>
                      <div className="flex items-center gap-3">
                        <Avatar name={r.name} />
                        <CellStack primary={r.name} secondary={r.email} />
                      </div>
                    </TD>
                    <TD>
                      <Badge>{r.role}</Badge>
                    </TD>
                    <TD>
                      <CellStack
                        primary={<span className="font-normal">{r.team}</span>}
                        secondary={r.note}
                        className="max-w-64"
                      />
                    </TD>
                    <TD className="whitespace-nowrap text-fg-muted">{r.requested}</TD>
                    <TD align="right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="soft"
                          onClick={() => approve([r.id])}
                          aria-label={`Approve ${r.name}`}
                        >
                          Approve
                        </Button>
                        <Button
                          size="xs"
                          variant="danger-quiet"
                          onClick={() => setDeclining([r.id])}
                          aria-label={`Decline ${r.name}`}
                        >
                          Decline
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        )}
      </Card>

      <ConfirmDialog
        opened={!!declining}
        onClose={() => setDeclining(null)}
        title={
          declining?.length === 1
            ? 'Decline this request?'
            : `Decline ${plural(declining?.length ?? 0, 'request')}?`
        }
        message="They will not get access. They can ask again later."
        confirmLabel="Decline"
        onConfirm={() => {
          if (!declining) return;
          remove(declining);
          toast.success(`${plural(declining.length, 'request')} declined`);
        }}
      />
      <InviteMembersModal
        opened={inviting}
        onClose={() => setInviting(false)}
        onInvite={(emails, role) =>
          toast.success(
            `${plural(emails.length, 'invite')} sent`,
            `As ${role}. Track them under Invitations.`,
          )
        }
      />
    </>
  );
}

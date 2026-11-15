'use client';

import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2, UserRoundCheck } from 'lucide-react';
import { api } from '@/api';
import {
  Button,
  ConfirmDialog,
  IconButton,
  NumberInput,
  SearchSelect,
  SegmentedControl,
  SortableList,
  Switch,
  TagsInput,
  toast,
} from '@/components/ui';
import { SettingsLoading, SettingsSection, useDraft } from '@/features/admin/settings-shared';
import { MODE_LABEL, useApproverOptions, type ApprovalMode } from './approval-data';

type Policy = {
  /** Set on a team's chain; null on the organization's chain. */
  id: string | null;
  subjectType: 'Requisition' | 'Offer';
  /** The teams (job departments) a chain is for; empty on the organization's chain. */
  departments: string[];
  required: boolean;
  mode: ApprovalMode;
  approvers: string[];
  reminderDays: number;
};

const HIRING_MANAGER = 'hiring-manager';

const COPY: Record<Policy['subjectType'], { title: string; required: string; detail: string }> = {
  Requisition: {
    title: 'Opening a job',
    required: 'Approve new jobs before they open',
    detail: 'A job stays a draft until it is approved.',
  },
  Offer: {
    title: 'Offers',
    required: 'Approve offers before they are sent',
    detail: 'Someone other than the requester signs off before a candidate hears about it.',
  },
};

const MODE_HELP: Record<ApprovalMode, string> = {
  Sequential: 'Each person is asked after the one above approves.',
  Parallel: 'Everyone is asked at once, and everyone must approve.',
  AnyOne: 'Everyone is asked at once. The first approval from this list is enough.',
};

/**
 * Settings, Approvals: who signs off on new jobs and on offers, in what order. Each kind has the
 * organization's chain, and teams can have their own chain that their jobs use instead.
 */
export function ApprovalPolicies() {
  const policies = useQuery({
    queryKey: ['approval-policies'],
    queryFn: () => api.get<Policy[]>('/api/approval-policies'),
  });
  const values = useQuery({
    queryKey: ['requisition-values'],
    queryFn: () => api.get<{ departments: string[] }>('/api/requisitions/values'),
    staleTime: 60_000,
  });
  // New team chains, not saved yet, per kind.
  const [adding, setAdding] = useState<Record<string, number[]>>({});
  if (!policies.data) return <SettingsLoading rows={4} />;
  const teams = values.data?.departments ?? [];
  return (
    <div className="flex flex-col gap-5">
      {(['Requisition', 'Offer'] as const).map((subject) => {
        const all = policies.data.filter((p) => p.subjectType === subject);
        const main = all.find((p) => p.id === null);
        const fresh = adding[subject] ?? [];
        const drop = (key: number) =>
          setAdding((a) => ({ ...a, [subject]: (a[subject] ?? []).filter((k) => k !== key) }));
        return (
          <Fragment key={subject}>
            {main && <PolicyCard policy={main} teams={teams} />}
            {all
              .filter((p) => p.id !== null)
              .map((policy) => (
                <PolicyCard key={policy.id} policy={policy} teams={teams} />
              ))}
            {fresh.map((key) => (
              <PolicyCard
                key={`new-${key}`}
                policy={{
                  ...(main ?? { required: true, mode: 'Sequential', reminderDays: 2 }),
                  id: null,
                  subjectType: subject,
                  departments: [],
                  approvers: [],
                }}
                teams={teams}
                isNew
                onDone={() => drop(key)}
              />
            ))}
            <div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Plus />}
                onClick={() => setAdding((a) => ({ ...a, [subject]: [...fresh, Date.now()] }))}
              >
                Use a different chain for some teams
              </Button>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function PolicyCard({
  policy,
  teams,
  isNew,
  onDone,
}: {
  policy: Policy;
  teams: string[];
  /** A team chain not saved yet; onDone removes it from the page. */
  isNew?: boolean;
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const { draft, set, dirty, reset } = useDraft(policy);
  const [removing, setRemoving] = useState(false);
  const team = isNew || policy.departments.length > 0;
  const options = useApproverOptions();
  const names = new Map(options.map((option) => [option.value, option.label]));
  const nameOf = (key: string) =>
    key === HIRING_MANAGER ? 'Hiring manager of the job' : (names.get(key) ?? key);
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['approval-policies'] });
    queryClient.invalidateQueries({ queryKey: ['requisition-approval'] });
  };
  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/approval-policies/${policy.subjectType}`, {
        required: draft.required,
        mode: draft.mode,
        approvers: draft.approvers,
        reminderDays: draft.reminderDays,
        id: policy.id,
        departments: team ? draft.departments : null,
      }),
    onSuccess: async () => {
      // A new team chain comes back in the list; drop the unsaved card once it is there.
      await queryClient.invalidateQueries({ queryKey: ['approval-policies'] });
      queryClient.invalidateQueries({ queryKey: ['requisition-approval'] });
      onDone?.();
      toast.success('Approval chain saved');
    },
    onError: (error: Error) => toast.error('Could not save the approval chain', error.message),
  });
  const remove = async () => {
    if (!policy.id) return onDone?.();
    try {
      await api.delete(`/api/approval-policies/${policy.id}`);
      refresh();
      toast.success('Team chain removed');
    } catch (error) {
      toast.error('Could not remove the chain', (error as Error).message);
    }
  };
  const copy = COPY[policy.subjectType];
  const teamList = policy.departments.join(', ');
  const move = (index: number, delta: -1 | 1) => {
    const next = [...draft.approvers];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    set({ approvers: next });
  };
  const addable = [
    ...(draft.approvers.includes(HIRING_MANAGER)
      ? []
      : [{ value: HIRING_MANAGER, label: 'Hiring manager of the job' }]),
    ...options.filter((option) => !draft.approvers.includes(option.value)),
  ];

  return (
    <SettingsSection
      id={`approvals-${policy.subjectType.toLowerCase()}${policy.id ? `-${policy.id}` : isNew ? '-new' : ''}`}
      title={team ? `${copy.title}: ${isNew ? 'a new team chain' : teamList}` : copy.title}
      description={
        team
          ? `Jobs in ${isNew ? 'these teams' : teamList} use this chain instead of the organization’s.`
          : copy.detail
      }
      action={
        team && (
          <Button
            variant="danger-quiet"
            size="sm"
            leftIcon={<Trash2 />}
            onClick={() => (isNew ? onDone?.() : setRemoving(true))}
          >
            Remove
          </Button>
        )
      }
      dirty={dirty || !!isNew}
      saving={save.isPending}
      onSave={() =>
        team && draft.departments.length === 0
          ? toast.error('Choose at least one team for this chain')
          : save.mutate()
      }
      onDiscard={isNew ? onDone : reset}
      saveLabel={isNew ? 'Save chain' : undefined}
    >
      <div className="flex flex-col gap-5">
        {team ? (
          <TagsInput
            label="Teams"
            description="The job’s team decides which chain it uses. Each team can have one chain."
            placeholder="Choose or type a team"
            data={teams}
            value={draft.departments}
            onChange={(departments) => set({ departments })}
          />
        ) : (
          <Switch
            labelPosition="left"
            label={copy.required}
            checked={draft.required}
            onCheckedChange={(required) => set({ required })}
          />
        )}

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-fg">Approvers, in order</p>
          <p className="text-xs text-fg-subtle">
            Requesters can add people but cannot remove these. Only an admin or the approver can
            hand a step to someone else.
          </p>
          {draft.approvers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-fg-subtle">
              No one yet. The person asking picks the approvers each time.
            </p>
          ) : (
            <SortableList
              id={`approvers-${policy.subjectType}`}
              items={draft.approvers}
              getKey={(key) => key}
              getLabel={nameOf}
              onReorder={(approvers) => set({ approvers })}
              itemClassName="px-2 py-1.5"
              renderItem={(key, handle, index) => (
                <div className="flex items-center gap-2">
                  {handle}
                  <span className="w-5 text-right text-xs text-fg-subtle tnum" aria-hidden>
                    {index + 1}
                  </span>
                  {key === HIRING_MANAGER && (
                    <UserRoundCheck className="size-4 text-fg-subtle" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-fg">{nameOf(key)}</span>
                  <IconButton
                    size="sm"
                    variant="quiet"
                    label={`Move ${nameOf(key)} up`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="quiet"
                    label={`Move ${nameOf(key)} down`}
                    disabled={index === draft.approvers.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown />
                  </IconButton>
                  <IconButton
                    size="sm"
                    variant="quiet"
                    label={`Remove ${nameOf(key)}`}
                    onClick={() => set({ approvers: draft.approvers.filter((x) => x !== key) })}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              )}
            />
          )}
          {draft.approvers.length < 10 && (
            <SearchSelect
              label="Add an approver"
              className="max-w-sm"
              placeholder="Search by name"
              data={addable}
              value={null}
              onChange={(value) => value && set({ approvers: [...draft.approvers, value] })}
              nothingFound="No one matches that name"
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-fg">How they decide</p>
          <SegmentedControl
            aria-label="How they decide"
            value={draft.mode}
            onValueChange={(mode) => set({ mode: mode as ApprovalMode })}
            items={(Object.keys(MODE_LABEL) as ApprovalMode[]).map((value) => ({
              value,
              label: MODE_LABEL[value],
            }))}
          />
          <p className="text-xs text-fg-subtle">{MODE_HELP[draft.mode]}</p>
        </div>

        <NumberInput
          label="Remind approvers after"
          description="Days without an answer, then again every that many days. Use 0 to turn reminders off."
          rightSection={<span className="pr-3 text-sm text-fg-subtle">days</span>}
          className="max-w-[240px]"
          min={0}
          max={30}
          step={1}
          value={draft.reminderDays}
          onValueChange={(value) => set({ reminderDays: value === '' ? 0 : Math.round(value) })}
        />
      </div>
      <ConfirmDialog
        opened={removing}
        onClose={() => setRemoving(false)}
        title={`Remove the chain for ${teamList}?`}
        message="Their jobs use the organization’s chain again. Requests already sent keep their approvers."
        confirmLabel="Remove chain"
        onConfirm={remove}
      />
    </SettingsSection>
  );
}

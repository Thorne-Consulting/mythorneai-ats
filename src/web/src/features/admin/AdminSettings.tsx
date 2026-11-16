'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { api } from '@/api';
import { useCurrentUser } from '@/auth';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardLink,
  DescriptionList,
  Input,
  Modal,
  NumberInput,
  SearchSelect,
  Switch,
  TagsInput,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { useAdminUsers } from './admin-data';
import { ReminderSettings } from '@/features/workflows/ReminderSettings';
import { TeamChannelSettings } from '@/features/notification-settings/TeamChannelSettings';
import { SettingsLoading, SettingsSection, useDraft } from './settings-shared';

export interface Organization {
  name: string;
  ownerEmail: string;
  ownerName?: string | null;
  authMode: 'WorkOS' | 'Oidc' | 'Development';
  emailReady: boolean;
  timeZone?: string | null;
  allowedEmailDomains: string[];
  allowGoogleLogin: boolean;
  allowMicrosoftLogin: boolean;
  staleReminderDays: number;
  requireOfferApproval: boolean;
  requireRequisitionApproval: boolean;
  approvalsSequential: boolean;
  defaultApproverEmails: string[];
  bookReminderDays: number;
  scorecardReminderDays: number;
  maxReminders: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  notificationWebhookUrl?: string | null;
  publicUrl?: string | null;
  aiEnabled: boolean;
  aiModel?: string | null;
}
interface AiStatus {
  configured: boolean;
  enabled: boolean;
  model: string;
  embeddingModel: string;
  pendingResumes: number;
  calls30Days: number;
  failed30Days: number;
  promptTokens30Days: number;
  completionTokens30Days: number;
}

const number = new Intl.NumberFormat();

function useOrganization() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['organization'],
    queryFn: () => api.get<Organization>('/api/organization'),
  });
  // The API takes partial updates: only the fields in the patch change.
  const save = useMutation({
    mutationFn: (patch: Partial<Organization>) => api.put('/api/organization', patch),
    onError: (error: Error) => toast.error('Could not save', error.message),
  });
  const saveSection = (patch: Partial<Organization>, message: string) =>
    save.mutate(patch, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['organization'] });
        // Same key as the dashboard's "Finish setting up" card.
        queryClient.invalidateQueries({ queryKey: ['admin', 'setup-checklist'] });
        queryClient.invalidateQueries({ queryKey: ['ai-status'] });
        toast.success(message);
      },
    });
  return { org: query.data, saveSection, saving: save.isPending };
}

export type OrganizationSection = 'general' | 'alerts' | 'ai';

const SECTIONS = {
  general: GeneralSettings,
  alerts: AlertsSettings,
  ai: AiSection,
};

/** One organization-wide setting group, on its own settings page. */
export function OrganizationSettings({ section }: { section: OrganizationSection }) {
  const { org, saveSection, saving } = useOrganization();
  if (!org) return <SettingsLoading rows={4} />;
  const Section = SECTIONS[section];
  return <Section org={org} saveSection={saveSection} saving={saving} />;
}

/** Switch rows separated by hairlines, the Figma settings list. */
function SwitchList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'divide-y divide-border-subtle [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0',
        className,
      )}
    >
      {children}
    </div>
  );
}

interface SectionProps {
  org: Organization;
  saveSection: (patch: Partial<Organization>, message: string) => void;
  saving: boolean;
}

/** Quiet hours, for every reminder and workflow email. The reminders themselves are ReminderSettings. */
function RemindersSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty, reset } = useDraft({
    quietHoursStart: org.quietHoursStart,
    quietHoursEnd: org.quietHoursEnd,
  });
  const num = (value: number | '', fallback: number) =>
    value === '' ? fallback : Math.round(value);
  const hour = (value: number) => `${String(value).padStart(2, '0')}:00`;
  return (
    <>
      <SettingsSection
        id="quiet-hours"
        title="Quiet hours"
        dirty={dirty}
        saving={saving}
        onSave={() => saveSection(draft, 'Quiet hours saved')}
        onDiscard={reset}
      >
        <div>
          <p className="max-w-3xl text-sm text-fg-subtle">
            We hold reminder and workflow emails during these hours and send them when quiet hours
            end. Times use your workspace time zone{org.timeZone ? ` (${org.timeZone})` : ''}. Use
            hours 0 to 23. For example, 20 to 8 means 8 pm to 8 am. Set both to the same hour to
            turn quiet hours off.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <NumberInput
              inset
              label="Quiet from (hour)"
              min={0}
              max={23}
              step={1}
              className="w-40"
              value={draft.quietHoursStart}
              onValueChange={(value) => set({ quietHoursStart: num(value, 20) })}
            />
            <NumberInput
              inset
              label="Quiet until (hour)"
              min={0}
              max={23}
              step={1}
              className="w-40"
              value={draft.quietHoursEnd}
              onValueChange={(value) => set({ quietHoursEnd: num(value, 8) })}
            />
            <Badge
              tone={draft.quietHoursStart === draft.quietHoursEnd ? 'gray' : 'blue'}
              className="mb-4"
            >
              {draft.quietHoursStart === draft.quietHoursEnd
                ? 'No quiet hours'
                : `Quiet ${hour(draft.quietHoursStart)} to ${hour(draft.quietHoursEnd)}`}
            </Badge>
          </div>
        </div>
      </SettingsSection>
    </>
  );
}

const TIME_ZONES = Intl.supportedValuesOf('timeZone');

/** General: the workspace, who can sign in, and the candidate portal address, on one page. */
function GeneralSettings(props: SectionProps) {
  return (
    <>
      <WorkspaceSection {...props} />
      <SignInSection {...props} />
      <CandidatePortalSection {...props} />
    </>
  );
}

function WorkspaceSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty, reset } = useDraft({
    name: org.name,
    timeZone: org.timeZone ?? '',
  });
  const noName = !draft.name.trim();
  const zones =
    draft.timeZone && !TIME_ZONES.includes(draft.timeZone)
      ? [draft.timeZone, ...TIME_ZONES]
      : TIME_ZONES;
  return (
    <SettingsSection
      id="workspace"
      title="Name and time zone"
      dirty={dirty && !noName}
      saving={saving}
      onSave={() =>
        saveSection(
          { name: draft.name.trim(), timeZone: draft.timeZone || null },
          'Workspace saved',
        )
      }
      onDiscard={reset}
    >
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Input
          label="Workspace name"
          description="Candidates see this in emails and on the candidate portal."
          value={draft.name}
          onChange={(event) => set({ name: event.currentTarget.value })}
          error={noName ? 'Give the workspace a name.' : undefined}
        />
        <SearchSelect
          label="Time zone"
          description="Reminders and quiet hours use this time zone."
          placeholder="Search time zones"
          data={zones}
          value={draft.timeZone || null}
          onChange={(value) => set({ timeZone: value ?? '' })}
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
        <DescriptionList
          items={[
            {
              label: 'Owner',
              value: org.ownerName ? `${org.ownerName} (${org.ownerEmail})` : org.ownerEmail,
            },
          ]}
        />
        <TransferOwnership org={org} />
      </div>
    </SettingsSection>
  );
}

/** The owner hands the workspace to another active admin. Only the owner sees this. */
function TransferOwnership({ org }: { org: Organization }) {
  const me = useCurrentUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const admins = (useAdminUsers().data ?? []).filter(
    (m) => m.role === 'Admin' && m.isActive && m.email !== org.ownerEmail,
  );
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<string | null>(null);
  const transfer = useMutation({
    mutationFn: () => api.post('/api/organization/transfer-ownership', { userId: to }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setOpen(false);
      toast.success('Ownership moved', 'You are still an admin.');
      router.refresh();
    },
    onError: (e: Error) => toast.error('Ownership didn’t move', e.message),
  });
  if (me.email !== org.ownerEmail) return null;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Transfer ownership
      </Button>
      <Modal
        opened={open}
        onClose={() => setOpen(false)}
        title="Transfer ownership"
        description="The owner always stays an admin and can’t be removed. You stay an admin after this."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!to} loading={transfer.isPending} onClick={() => transfer.mutate()}>
              Make them the owner
            </Button>
          </>
        }
      >
        {admins.length === 0 ? (
          <p className="text-base text-fg-muted">
            There is no other active admin yet. Make someone an admin under Members first.
          </p>
        ) : (
          <SearchSelect
            label="New owner"
            placeholder="Pick an admin"
            data={admins.map((m) => ({ value: m.id, label: `${m.displayName} (${m.email})` }))}
            value={to}
            onChange={setTo}
          />
        )}
      </Modal>
    </>
  );
}

function SignInSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty, reset } = useDraft({
    allowedEmailDomains: org.allowedEmailDomains,
  });
  return (
    <SettingsSection
      id="sign-in"
      title="Who can sign in"
      description={
        org.authMode === 'Oidc' ? undefined : (
          <>
            Sign-in methods and single sign-on are under{' '}
            <Link href="/settings/sso" className="text-accent-foreground hover:underline">
              Single sign-on
            </Link>
            .
          </>
        )
      }
      dirty={dirty}
      saving={saving}
      onSave={() => saveSection(draft, 'Sign-in settings saved')}
      onDiscard={reset}
    >
      <TagsInput
        className="max-w-3xl"
        label="Company email domains"
        description={
          draft.allowedEmailDomains.length
            ? 'Only email addresses at these domains can sign in. Someone at one of them who was not invited can ask for access.'
            : 'Empty means anyone you invite can sign in, whatever their email address. Press Enter after each domain, for example acme.com.'
        }
        placeholder="acme.com"
        value={draft.allowedEmailDomains}
        onChange={(value) => set({ allowedEmailDomains: value })}
      />
    </SettingsSection>
  );
}

function CandidatePortalSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty, reset } = useDraft({ publicUrl: org.publicUrl ?? '' });
  const url = draft.publicUrl.trim();
  const invalid = url.length > 0 && !/^https?:\/\/\S+$/.test(url);
  return (
    <SettingsSection
      id="candidate-portal"
      title="Candidates"
      dirty={dirty && !invalid}
      saving={saving}
      onSave={() =>
        saveSection({ publicUrl: url }, url ? 'Portal address saved' : 'Portal address cleared')
      }
      onDiscard={reset}
    >
      <div className="flex max-w-3xl flex-col gap-5">
        <Input
          label="Web address of this app"
          description="Emails to candidates link to their portal at this address. Without it, emails mention the portal but cannot link to it."
          placeholder="https://ats.yourcompany.com"
          value={draft.publicUrl}
          onChange={(event) => set({ publicUrl: event.currentTarget.value })}
          error={invalid ? 'Use the full address, starting with https://.' : undefined}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-4">
          <div className="min-w-0">
            <p className="text-base font-medium text-fg">Candidate email</p>
            <p className="mt-0.5 text-sm text-fg-subtle">
              {org.emailReady
                ? 'Candidates get their confirmations, interview invitations and updates.'
                : 'Candidates get no emails until whoever runs MyThorneAI for you turns email on.'}
            </p>
          </div>
          <Badge dot tone={org.emailReady ? 'green' : 'red'}>
            {org.emailReady ? 'Ready' : 'Off'}
          </Badge>
        </div>
      </div>
    </SettingsSection>
  );
}

/** Reminders and the Slack or Teams channel, on one page. */
function AlertsSettings(props: SectionProps) {
  return (
    <>
      <ReminderSettings />
      <RemindersSection {...props} />
      <TeamChannelSettings />
    </>
  );
}

function AiSection({ org, saveSection, saving }: SectionProps) {
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<AiStatus>('/api/admin/ai/status'),
  });
  const { draft, set, dirty, reset } = useDraft({
    aiEnabled: org.aiEnabled,
    aiModel: org.aiModel ?? '',
  });
  const s = status.data;
  return (
    <>
      <SettingsSection
        id="ai"
        title="AI assistance"
        description="AI reads resumes, checks job fit, sums up interviews and drafts messages."
        dirty={dirty}
        saving={saving}
        onSave={() => saveSection(draft, 'AI settings saved')}
        onDiscard={reset}
      >
        <SwitchList>
          <Switch
            labelPosition="left"
            label="Turn on AI assistance"
            description="When this is off, we send nothing to the AI service and hide AI features."
            checked={draft.aiEnabled}
            onCheckedChange={(v) => set({ aiEnabled: v })}
          />
          <Input
            inset
            label="Model"
            description="Leave this empty to use the model set on the server."
            placeholder={s?.model ?? 'Server default'}
            className="max-w-md"
            value={draft.aiModel}
            onChange={(event) => set({ aiModel: event.currentTarget.value })}
          />
          <Alert tone="neutral" icon={Info}>
            The AI key is kept on the server. It is never shown or saved here.
          </Alert>
        </SwitchList>
      </SettingsSection>
      {s && (
        <Card aria-label="AI status" className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge dot tone={s.configured && s.enabled ? 'green' : 'gray'}>
              {!s.configured ? 'No AI key on the server' : s.enabled ? 'Working' : 'Turned off'}
            </Badge>
            <p className="text-sm text-fg-subtle">
              Model {s.model} · Matching model {s.embeddingModel}
            </p>
            <span className="ml-auto">
              <CardLink href="/settings/ai/activity">See everything the AI was asked</CardLink>
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="AI requests, last 30 days" value={s.calls30Days} />
            <Stat label="Failed" value={s.failed30Days} />
            <Stat
              label="Text processed (tokens)"
              value={s.promptTokens30Days + s.completionTokens30Days}
            />
            <Stat label="Resumes waiting to be read" value={s.pendingResumes} />
          </dl>
        </Card>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-fg tnum">{number.format(value)}</dd>
    </div>
  );
}

'use client';

import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardLink,
  Input,
  MultiSelect,
  NumberInput,
  SearchSelect,
  Switch,
  TagsInput,
  toast,
} from '@/components/ui';
import { SettingsLoading, SettingsSection, useDraft } from './settings-shared';

export interface Organization {
  name: string;
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
interface ChecklistItem {
  key: string;
  title: string;
  detail: string;
  done: boolean;
  href: string;
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
  const save = useMutation({
    mutationFn: (patch: Partial<Organization>) => {
      const org = query.data!;
      // The API always expects these six, so send the current values with every save.
      return api.put('/api/organization', {
        name: org.name,
        timeZone: org.timeZone,
        allowedEmailDomains: org.allowedEmailDomains,
        allowGoogleLogin: org.allowGoogleLogin,
        allowMicrosoftLogin: org.allowMicrosoftLogin,
        staleReminderDays: org.staleReminderDays,
        ...patch,
      });
    },
    onError: (error: Error) => toast.error('Could not save', error.message),
  });
  const saveSection = (patch: Partial<Organization>, message: string) =>
    save.mutate(patch, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['organization'] });
        queryClient.invalidateQueries({ queryKey: ['setup-checklist'] });
        queryClient.invalidateQueries({ queryKey: ['ai-status'] });
        toast.success(message);
      },
    });
  return { org: query.data, saveSection, saving: save.isPending };
}

export type OrganizationSection =
  'general' | 'approvals' | 'reminders' | 'notifications' | 'portal' | 'ai' | 'email';

const SECTIONS = {
  general: GeneralSection,
  approvals: ApprovalsSection,
  reminders: RemindersSection,
  notifications: NotificationsSection,
  portal: PortalAddressSection,
  ai: AiSection,
  email: EmailSection,
};

/** One organization-wide setting group, on its own settings page. */
export function OrganizationSettings({ section }: { section: OrganizationSection }) {
  const { org, saveSection, saving } = useOrganization();
  if (!org) return <SettingsLoading rows={4} />;
  const Section = SECTIONS[section];
  return <Section org={org} saveSection={saveSection} saving={saving} />;
}

/** Switch rows separated by hairlines, the Figma settings list. */
function SwitchList({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-border-subtle [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
      {children}
    </div>
  );
}

function EmailSection(_: SectionProps) {
  const checklist = useQuery({
    queryKey: ['setup-checklist'],
    queryFn: () => api.get<ChecklistItem[]>('/api/admin/setup-checklist'),
  });
  const emailItem = checklist.data?.find((item) => item.key === 'email');
  return (
    <SettingsSection
      id="email"
      title="Candidate email"
      action={
        emailItem && (
          <Badge dot tone={emailItem.done ? 'green' : 'red'}>
            {emailItem.done ? 'On' : 'Off'}
          </Badge>
        )
      }
    >
      {!emailItem ? (
        <p className="text-sm text-fg-subtle">Checking…</p>
      ) : emailItem.done ? (
        <Alert tone="success" title="Candidate email is on">
          Confirmations, interview invitations and updates reach candidates.
        </Alert>
      ) : (
        <Alert tone="danger" title="Candidate email is off">
          Candidates won’t receive anything until this is fixed. Add the Resend API key and sender
          address to the server settings, then restart the API.
        </Alert>
      )}
    </SettingsSection>
  );
}

interface SectionProps {
  org: Organization;
  saveSection: (patch: Partial<Organization>, message: string) => void;
  saving: boolean;
}

function ApprovalsSection({ org, saveSection, saving }: SectionProps) {
  const people = useQuery({
    queryKey: ['directory-users'],
    queryFn: () =>
      api.get<Array<{ email: string; displayName: string; role: string }>>('/api/directory/users'),
  });
  const { draft, set, dirty, reset } = useDraft({
    requireOfferApproval: org.requireOfferApproval,
    requireRequisitionApproval: org.requireRequisitionApproval,
    approvalsSequential: org.approvalsSequential,
    defaultApproverEmails: org.defaultApproverEmails,
  });
  const options = (people.data ?? []).map((person) => ({
    value: person.email,
    label: `${person.displayName} (${person.email})`,
  }));
  for (const email of draft.defaultApproverEmails)
    if (!options.some((option) => option.value === email))
      options.push({ value: email, label: email });
  return (
    <SettingsSection
      id="approvals"
      title="Approval rules"
      description="Applies to every job and acceptance unless someone picks different approvers."
      dirty={dirty}
      saving={saving}
      onSave={() => saveSection(draft, 'Approval settings saved')}
      onDiscard={reset}
    >
      <SwitchList>
        <Switch
          labelPosition="left"
          label="Approve acceptances before they are sent"
          description="Someone other than the requester signs off before a candidate is told they are accepted."
          checked={draft.requireOfferApproval}
          onCheckedChange={(v) => set({ requireOfferApproval: v })}
        />
        <Switch
          labelPosition="left"
          label="Approve new jobs before they open"
          description="A job stays a draft until an approver agrees it can be opened."
          checked={draft.requireRequisitionApproval}
          onCheckedChange={(v) => set({ requireRequisitionApproval: v })}
        />
        <Switch
          labelPosition="left"
          label="Approvers go one after another"
          description="Off means everyone is asked at once. On means each person is asked only after the one before them agrees."
          checked={draft.approvalsSequential}
          onCheckedChange={(v) => set({ approvalsSequential: v })}
        />
        <MultiSelect
          label="Default approvers"
          description="Asked whenever an approval is needed, in the order shown."
          placeholder="Pick people"
          data={options}
          value={draft.defaultApproverEmails}
          onChange={(value) => set({ defaultApproverEmails: value })}
        />
      </SwitchList>
    </SettingsSection>
  );
}

function RemindersSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty, reset } = useDraft({
    staleReminderDays: org.staleReminderDays,
    bookReminderDays: org.bookReminderDays,
    scorecardReminderDays: org.scorecardReminderDays,
    maxReminders: org.maxReminders,
    quietHoursStart: org.quietHoursStart,
    quietHoursEnd: org.quietHoursEnd,
  });
  const num = (value: number | '', fallback: number) =>
    value === '' ? fallback : Math.round(value);
  const hour = (value: number) => `${String(value).padStart(2, '0')}:00`;
  return (
    <>
      <SettingsSection
        id="reminders"
        title="Reminders"
        description="If something sits too long, we remind the person who can move it."
        dirty={dirty}
        saving={saving}
        onSave={() => saveSection(draft, 'Reminder settings saved')}
        onDiscard={reset}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberInput
            inset
            label="Remind about stuck applications after (days)"
            description="If an application sits in one stage this long, the job owner is reminded."
            min={1}
            max={60}
            step={1}
            value={draft.staleReminderDays}
            onValueChange={(value) => set({ staleReminderDays: num(value, 3) })}
          />
          <NumberInput
            inset
            label="Remind candidates to book after (days)"
            description="Sent when a candidate was invited to pick an interview time and hasn’t."
            min={1}
            max={30}
            step={1}
            value={draft.bookReminderDays}
            onValueChange={(value) => set({ bookReminderDays: num(value, 2) })}
          />
          <NumberInput
            inset
            label="Remind interviewers about feedback after (days)"
            description="Sent when an interview is done and the scorecard is still empty."
            min={1}
            max={30}
            step={1}
            value={draft.scorecardReminderDays}
            onValueChange={(value) => set({ scorecardReminderDays: num(value, 2) })}
          />
          <NumberInput
            inset
            label="Most reminders per item"
            description="After this many, we stop asking."
            min={0}
            max={10}
            step={1}
            value={draft.maxReminders}
            onValueChange={(value) => set({ maxReminders: num(value, 3) })}
          />
        </div>
        <div className="mt-6 border-t border-border-subtle pt-5">
          <h3 className="text-base font-medium text-fg">Quiet hours</h3>
          <p className="mt-1 max-w-3xl text-sm text-fg-subtle">
            Reminder emails are held back during these hours, in your organization’s time zone
            {org.timeZone ? ` (${org.timeZone})` : ''}, and sent when they end. Hours are 0 to 23.
            The window can cross midnight: 20 to 8 means 8 pm until 8 am. Use the same number for
            both to turn quiet hours off.
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

function GeneralSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty, reset } = useDraft({
    name: org.name,
    timeZone: org.timeZone ?? '',
    allowedEmailDomains: org.allowedEmailDomains,
    allowGoogleLogin: org.allowGoogleLogin,
    allowMicrosoftLogin: org.allowMicrosoftLogin,
  });
  const noName = !draft.name.trim();
  // Turning both off would lock everyone out, including you.
  const noLogin = !draft.allowGoogleLogin && !draft.allowMicrosoftLogin;
  const zones =
    draft.timeZone && !TIME_ZONES.includes(draft.timeZone)
      ? [draft.timeZone, ...TIME_ZONES]
      : TIME_ZONES;
  return (
    <SettingsSection
      id="general"
      title="Workspace"
      description="Shown in emails to candidates and on the candidate portal."
      dirty={dirty && !noName && !noLogin}
      saving={saving}
      onSave={() =>
        saveSection(
          { ...draft, name: draft.name.trim(), timeZone: draft.timeZone || null },
          'Workspace saved',
        )
      }
      onDiscard={reset}
    >
      <div className="flex max-w-xl flex-col gap-4">
        <Input
          inset
          label="Workspace name"
          value={draft.name}
          onChange={(event) => set({ name: event.currentTarget.value })}
          error={noName ? 'Give the workspace a name.' : undefined}
        />
        <SearchSelect
          label="Time zone"
          description="Quiet hours and reminder times follow this zone."
          placeholder="Search time zones"
          data={zones}
          value={draft.timeZone || null}
          onChange={(value) => set({ timeZone: value ?? '' })}
        />
        <TagsInput
          label="Allowed company email domains"
          description="Only people with these addresses can sign in. Press Enter after each, for example acme.com."
          value={draft.allowedEmailDomains}
          onChange={(value) => set({ allowedEmailDomains: value })}
        />
        <SwitchList>
          <Switch
            labelPosition="left"
            label="Sign in with Google"
            checked={draft.allowGoogleLogin}
            onCheckedChange={(on) => set({ allowGoogleLogin: on })}
          />
          <Switch
            labelPosition="left"
            label="Sign in with Microsoft"
            checked={draft.allowMicrosoftLogin}
            onCheckedChange={(on) => set({ allowMicrosoftLogin: on })}
          />
        </SwitchList>
        {noLogin && (
          <Alert tone="danger" title="Keep at least one way to sign in">
            With both turned off, nobody could sign in, including you.
          </Alert>
        )}
      </div>
    </SettingsSection>
  );
}

function PortalAddressSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty, reset } = useDraft({ publicUrl: org.publicUrl ?? '' });
  const url = draft.publicUrl.trim();
  const invalid = url.length > 0 && !/^https?:\/\/\S+$/.test(url);
  return (
    <SettingsSection
      id="portal-address"
      title="Candidate portal address"
      description="Emails link candidates here so they can follow their applications."
      dirty={dirty && !invalid}
      saving={saving}
      onSave={() =>
        saveSection({ publicUrl: url }, url ? 'Portal address saved' : 'Portal address cleared')
      }
      onDiscard={reset}
    >
      <Input
        inset
        label="Where this app is reachable"
        description="For example https://ats.yourcompany.com. Without it, emails tell candidates to use the portal but can’t link to it."
        placeholder="https://ats.yourcompany.com"
        className="max-w-xl"
        value={draft.publicUrl}
        onChange={(event) => set({ publicUrl: event.currentTarget.value })}
        error={invalid ? 'Use the full address, starting with https://.' : undefined}
      />
    </SettingsSection>
  );
}

function NotificationsSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty, reset } = useDraft({
    notificationWebhookUrl: org.notificationWebhookUrl ?? '',
  });
  const url = draft.notificationWebhookUrl.trim();
  const invalid = url.length > 0 && !url.startsWith('https://');
  const test = useMutation({
    mutationFn: () => api.post('/api/admin/notifications/test'),
    onSuccess: () =>
      toast.success('Test queued', 'It should appear in the channel within a few seconds.'),
    onError: (error: Error) => toast.error('Could not send the test', error.message),
  });
  return (
    <SettingsSection
      id="notifications"
      title="Slack or Teams channel"
      description="Short one-line messages go to the channel when an approval is waiting, a candidate messages you or withdraws, an interview needs attention, or an email to a candidate bounces. They never include resumes or scorecard notes."
      action={
        <Button
          variant="secondary"
          size="sm"
          disabled={!org.notificationWebhookUrl || dirty}
          loading={test.isPending}
          onClick={() => test.mutate()}
          title={
            !org.notificationWebhookUrl ? 'Save an address first, then send a test.' : undefined
          }
        >
          Send a test message
        </Button>
      }
      dirty={dirty && !invalid}
      saving={saving}
      onSave={() =>
        saveSection(
          { notificationWebhookUrl: url },
          url ? 'Team notifications saved' : 'Team notifications turned off',
        )
      }
      onDiscard={reset}
    >
      <Input
        inset
        label="Incoming webhook URL"
        description="Create an incoming webhook in Slack or Teams and paste its https address here. Leave empty to turn this off."
        placeholder="https://hooks.slack.com/services/…"
        className="max-w-2xl"
        value={draft.notificationWebhookUrl}
        onChange={(event) => set({ notificationWebhookUrl: event.currentTarget.value })}
        error={invalid ? 'Use the https address Slack or Teams gave you.' : undefined}
      />
      {!org.notificationWebhookUrl && (
        <p className="mt-3 text-xs text-fg-subtle">Save an address first, then send a test.</p>
      )}
    </SettingsSection>
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
        description="Resume reading, job fit, interview summaries and message drafts."
        dirty={dirty}
        saving={saving}
        onSave={() => saveSection(draft, 'AI settings saved')}
        onDiscard={reset}
      >
        <SwitchList>
          <Switch
            labelPosition="left"
            label="Turn on AI assistance"
            description="When off, nothing is sent to the AI provider and AI features are hidden."
            checked={draft.aiEnabled}
            onCheckedChange={(v) => set({ aiEnabled: v })}
          />
          <Input
            inset
            label="Model"
            description="Leave blank to use the server default."
            placeholder={s?.model ?? 'Server default'}
            className="max-w-md"
            value={draft.aiModel}
            onChange={(event) => set({ aiModel: event.currentTarget.value })}
          />
          <Alert tone="neutral" icon={Info}>
            The AI API key lives in the server settings and is never shown or stored here.
          </Alert>
        </SwitchList>
      </SettingsSection>
      {s && (
        <Card aria-label="AI status" className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Badge dot tone={s.configured && s.enabled ? 'green' : 'gray'}>
              {!s.configured ? 'No API key on the server' : s.enabled ? 'Working' : 'Turned off'}
            </Badge>
            <p className="text-sm text-fg-subtle">
              Model {s.model} · embeddings {s.embeddingModel}
            </p>
            <span className="ml-auto">
              <CardLink href="/admin/ai">See everything the AI was asked</CardLink>
            </span>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="AI calls, 30 days" value={s.calls30Days} />
            <Stat label="Failed" value={s.failed30Days} />
            <Stat label="Tokens used" value={s.promptTokens30Days + s.completionTokens30Days} />
            <Stat label="Resumes waiting" value={s.pendingResumes} />
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

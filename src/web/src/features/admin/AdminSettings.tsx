'use client';

import { useEffect } from 'react';

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCircleCheck, IconCircleDashed, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/api';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
import { CustomFieldsSection } from './CustomFieldsSection';
import { PipelineTemplatesSection } from './PipelineTemplatesSection';
import { RolePermissionsSection } from './RolePermissionsSection';
import { SettingsSection, useDraft } from './settings-shared';

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
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not save', message: error.message }),
  });
  const saveSection = (patch: Partial<Organization>, message: string) =>
    save.mutate(patch, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['organization'] });
        queryClient.invalidateQueries({ queryKey: ['setup-checklist'] });
        queryClient.invalidateQueries({ queryKey: ['ai-status'] });
        notifications.show({ color: 'teal', message });
      },
    });
  return { org: query.data, saveSection, saving: save.isPending };
}

const SECTIONS = [
  { id: 'approvals', label: 'Approvals' },
  { id: 'reminders', label: 'Reminders' },
  { id: 'notifications', label: 'Team notifications' },
  { id: 'portal-address', label: 'Candidate portal' },
  { id: 'ai', label: 'AI' },
  { id: 'email', label: 'Email' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'candidate-fields', label: 'Candidate fields' },
  { id: 'roles', label: 'Roles' },
];

export function AdminSettings() {
  const { org, saveSection, saving } = useOrganization();
  const checklist = useQuery({
    queryKey: ['setup-checklist'],
    queryFn: () => api.get<ChecklistItem[]>('/api/admin/setup-checklist'),
  });
  // Links from the checklist land on "#approvals" and the like, but the sections only exist once
  // the organization has loaded, so the browser's own anchor scroll has already missed.
  const loaded = Boolean(org);
  useEffect(() => {
    if (!loaded || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [loaded]);
  if (!org) return <LoadingBlock rows={4} />;
  const emailItem = checklist.data?.find((item) => item.key === 'email');
  const pending = (checklist.data ?? []).filter((item) => !item.done);

  return (
    <Stack gap="lg">
      <Group gap="xs" component="nav" aria-label="Settings sections">
        {SECTIONS.map((section) => (
          <Anchor key={section.id} href={`#${section.id}`} size="sm" className="section-pill">
            {section.label}
          </Anchor>
        ))}
      </Group>
      {pending.length > 0 && checklist.data && (
        <Paper withBorder radius="lg" p="lg">
          <Text fw={650}>Get set up</Text>
          <Text size="sm" c="dimmed" mb="sm">
            {checklist.data.length - pending.length} of {checklist.data.length} done. Each of these
            makes the tool work better for your team.
          </Text>
          <Stack gap="xs">
            {checklist.data.map((item) => (
              <Group key={item.key} gap="sm" wrap="nowrap" align="flex-start">
                {item.done ? (
                  <IconCircleCheck size={18} color="var(--mantine-color-teal-6)" aria-hidden />
                ) : (
                  <IconCircleDashed size={18} color="var(--mantine-color-gray-6)" aria-hidden />
                )}
                <div>
                  <Text size="sm" fw={600}>
                    {item.done ? (
                      item.title
                    ) : (
                      <Anchor component={Link} href={item.href} fw={600}>
                        {item.title}
                      </Anchor>
                    )}
                    <Text span size="xs" c="dimmed" ml={6}>
                      {item.done ? 'Done' : 'To do'}
                    </Text>
                  </Text>
                  <Text size="sm" c="dimmed">
                    {item.detail}
                  </Text>
                </div>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
      <ApprovalsSection org={org} saveSection={saveSection} saving={saving} />
      <RemindersSection org={org} saveSection={saveSection} saving={saving} />
      <NotificationsSection org={org} saveSection={saveSection} saving={saving} />
      <PortalAddressSection org={org} saveSection={saveSection} saving={saving} />
      <AiSection org={org} saveSection={saveSection} saving={saving} />
      <SettingsSection
        id="email"
        title="Candidate email"
        description="Acceptance, status and interview emails to candidates go out through your email provider."
      >
        <Group gap="sm">
          <Badge color={emailItem?.done ? 'teal' : 'red'} variant="light">
            Candidate email is {emailItem?.done ? 'on' : 'off'}
          </Badge>
          {emailItem && !emailItem.done && (
            <Text size="sm">
              Candidates won’t receive anything until this is fixed. Add the Resend API key and
              sender address to the server settings, then restart the API.
            </Text>
          )}
        </Group>
      </SettingsSection>
      <PipelineTemplatesSection />
      <CustomFieldsSection />
      <RolePermissionsSection />
    </Stack>
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
  const { draft, set, dirty } = useDraft({
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
      title="Approvals"
      description="Decide when a second person has to agree before something goes ahead."
      dirty={dirty}
      saving={saving}
      onSave={() => saveSection(draft, 'Approval settings saved')}
    >
      <Stack gap="md">
        <Switch
          label="Approve acceptances before they are sent"
          description="Someone other than the requester signs off before a candidate is told they are accepted."
          checked={draft.requireOfferApproval}
          onChange={(event) => set({ requireOfferApproval: event.currentTarget.checked })}
        />
        <Switch
          label="Approve new jobs before they open"
          description="A job stays a draft until an approver agrees it can be opened."
          checked={draft.requireRequisitionApproval}
          onChange={(event) => set({ requireRequisitionApproval: event.currentTarget.checked })}
        />
        <Switch
          label="Approvers go one after another"
          description="Off means everyone is asked at once. On means each person is asked only after the one before them agrees."
          checked={draft.approvalsSequential}
          onChange={(event) => set({ approvalsSequential: event.currentTarget.checked })}
        />
        <MultiSelect
          label="Default approvers"
          description="Asked whenever an approval is needed, in the order shown."
          placeholder="Pick people"
          searchable
          data={options}
          value={draft.defaultApproverEmails}
          onChange={(value) => set({ defaultApproverEmails: value })}
        />
      </Stack>
    </SettingsSection>
  );
}

function RemindersSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty } = useDraft({
    staleReminderDays: org.staleReminderDays,
    bookReminderDays: org.bookReminderDays,
    scorecardReminderDays: org.scorecardReminderDays,
    maxReminders: org.maxReminders,
    quietHoursStart: org.quietHoursStart,
    quietHoursEnd: org.quietHoursEnd,
  });
  const num = (value: string | number, fallback: number) =>
    typeof value === 'number' ? value : fallback;
  const hour = (value: number) => `${String(value).padStart(2, '0')}:00`;
  return (
    <SettingsSection
      id="reminders"
      title="Reminders"
      description="Gentle nudges so nobody waits on a decision, a booking or feedback."
      dirty={dirty}
      saving={saving}
      onSave={() => saveSection(draft, 'Reminder settings saved')}
    >
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label="Remind about stuck applications after (days)"
            description="If an application sits in one stage this long, the job owner is reminded."
            min={1}
            max={60}
            allowDecimal={false}
            value={draft.staleReminderDays}
            onChange={(value) => set({ staleReminderDays: num(value, 3) })}
          />
          <NumberInput
            label="Remind candidates to book after (days)"
            description="Sent when a candidate was invited to pick an interview time and hasn’t."
            min={1}
            max={30}
            allowDecimal={false}
            value={draft.bookReminderDays}
            onChange={(value) => set({ bookReminderDays: num(value, 2) })}
          />
          <NumberInput
            label="Remind interviewers about feedback after (days)"
            description="Sent when an interview is done and the scorecard is still empty."
            min={1}
            max={30}
            allowDecimal={false}
            value={draft.scorecardReminderDays}
            onChange={(value) => set({ scorecardReminderDays: num(value, 2) })}
          />
          <NumberInput
            label="Most reminders per item"
            description="After this many, we stop asking."
            min={0}
            max={10}
            allowDecimal={false}
            value={draft.maxReminders}
            onChange={(value) => set({ maxReminders: num(value, 3) })}
          />
        </SimpleGrid>
        <div>
          <Text size="sm" fw={500}>
            Quiet hours
          </Text>
          <Text size="sm" c="dimmed" mb="xs">
            Reminder emails are held back during these hours, in your organization’s time zone
            {org.timeZone ? ` (${org.timeZone})` : ''}, and sent when they end. Hours are 0 to 23.
            The window can cross midnight: 20 to 8 means 8 pm until 8 am. Use the same number for
            both to turn quiet hours off.
          </Text>
          <Group gap="md" align="flex-end">
            <NumberInput
              label="Quiet from (hour)"
              min={0}
              max={23}
              allowDecimal={false}
              w={150}
              value={draft.quietHoursStart}
              onChange={(value) => set({ quietHoursStart: num(value, 20) })}
            />
            <NumberInput
              label="Quiet until (hour)"
              min={0}
              max={23}
              allowDecimal={false}
              w={150}
              value={draft.quietHoursEnd}
              onChange={(value) => set({ quietHoursEnd: num(value, 8) })}
            />
            <Text size="sm" pb={8}>
              {draft.quietHoursStart === draft.quietHoursEnd
                ? 'No quiet hours'
                : `Quiet ${hour(draft.quietHoursStart)} to ${hour(draft.quietHoursEnd)}`}
            </Text>
          </Group>
        </div>
      </Stack>
    </SettingsSection>
  );
}

function PortalAddressSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty } = useDraft({ publicUrl: org.publicUrl ?? '' });
  const url = draft.publicUrl.trim();
  const invalid = url.length > 0 && !/^https?:\/\/\S+$/.test(url);
  return (
    <SettingsSection
      id="portal-address"
      title="Candidate portal address"
      description="Candidate emails link to the portal at this address, where they follow their application, book interviews and message you."
      dirty={dirty && !invalid}
      saving={saving}
      onSave={() =>
        saveSection({ publicUrl: url }, url ? 'Portal address saved' : 'Portal address cleared')
      }
    >
      <TextInput
        label="Where this app is reachable"
        description="For example https://ats.yourcompany.com. Without it, emails tell candidates to use the portal but can’t link to it."
        placeholder="https://ats.yourcompany.com"
        value={draft.publicUrl}
        onChange={(event) => set({ publicUrl: event.currentTarget.value })}
        error={invalid ? 'Use the full address, starting with https://.' : undefined}
      />
    </SettingsSection>
  );
}

function NotificationsSection({ org, saveSection, saving }: SectionProps) {
  const { draft, set, dirty } = useDraft({
    notificationWebhookUrl: org.notificationWebhookUrl ?? '',
  });
  const url = draft.notificationWebhookUrl.trim();
  const invalid = url.length > 0 && !url.startsWith('https://');
  const test = useMutation({
    mutationFn: () => api.post('/api/admin/notifications/test'),
    onSuccess: () =>
      notifications.show({
        color: 'teal',
        message: 'Test queued. It should appear in the channel within a few seconds.',
      }),
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  return (
    <SettingsSection
      id="notifications"
      title="Team notifications"
      description="Post hiring news into a Slack or Microsoft Teams channel."
      dirty={dirty && !invalid}
      saving={saving}
      onSave={() =>
        saveSection(
          { notificationWebhookUrl: url },
          url ? 'Team notifications saved' : 'Team notifications turned off',
        )
      }
    >
      <TextInput
        label="Incoming webhook URL"
        description="Create an incoming webhook in Slack or Teams and paste its https address here. Leave empty to turn this off."
        placeholder="https://hooks.slack.com/services/…"
        value={draft.notificationWebhookUrl}
        onChange={(event) => set({ notificationWebhookUrl: event.currentTarget.value })}
        error={invalid ? 'Use the https address Slack or Teams gave you.' : undefined}
      />
      <Text size="sm" c="dimmed" mt="sm">
        Short one-line messages go to the channel when an approval is waiting, a candidate messages
        you or withdraws, an interview needs attention, or an email to a candidate bounces. They
        never include resumes or scorecard notes.
      </Text>
      <Button
        variant="default"
        size="xs"
        mt="sm"
        disabled={!org.notificationWebhookUrl || dirty}
        loading={test.isPending}
        onClick={() => test.mutate()}
      >
        Send a test message
      </Button>
      {!org.notificationWebhookUrl && (
        <Text size="xs" c="dimmed" mt={4}>
          Save an address first, then send a test.
        </Text>
      )}
    </SettingsSection>
  );
}

function AiSection({ org, saveSection, saving }: SectionProps) {
  const status = useQuery({
    queryKey: ['ai-status'],
    queryFn: () => api.get<AiStatus>('/api/admin/ai/status'),
  });
  const { draft, set, dirty } = useDraft({ aiEnabled: org.aiEnabled, aiModel: org.aiModel ?? '' });
  const s = status.data;
  return (
    <SettingsSection
      id="ai"
      title="AI assistance"
      description="Resume reading, fit scores and drafting help. People make every decision."
      dirty={dirty}
      saving={saving}
      onSave={() => saveSection(draft, 'AI settings saved')}
    >
      <Stack gap="md">
        <Switch
          label="Turn on AI assistance"
          description="When off, nothing is sent to the AI provider and AI features are hidden."
          checked={draft.aiEnabled}
          onChange={(event) => set({ aiEnabled: event.currentTarget.checked })}
        />
        <TextInput
          label="Model"
          description="Leave blank to use the server default."
          placeholder={s?.model ?? 'Server default'}
          value={draft.aiModel}
          onChange={(event) => set({ aiModel: event.currentTarget.value })}
        />
        <Alert variant="light" color="gray" icon={<IconInfoCircle size={18} />}>
          The AI API key lives in the server settings and is never shown or stored here.
        </Alert>
        {s && (
          <Paper withBorder radius="md" p="md" aria-label="AI status">
            <Group gap="sm" mb="xs">
              <Badge color={s.configured && s.enabled ? 'teal' : 'gray'} variant="light">
                {!s.configured ? 'No API key on the server' : s.enabled ? 'Working' : 'Turned off'}
              </Badge>
              <Text size="sm" c="dimmed">
                Model {s.model} · embeddings {s.embeddingModel}
              </Text>
            </Group>
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
              <Stat label="AI calls, 30 days" value={s.calls30Days} />
              <Stat label="Failed" value={s.failed30Days} />
              <Stat label="Tokens used" value={s.promptTokens30Days + s.completionTokens30Days} />
              <Stat label="Resumes waiting" value={s.pendingResumes} />
            </SimpleGrid>
            <Anchor component={Link} href="/admin/ai" size="sm" mt="sm" display="inline-block">
              See everything the AI was asked
            </Anchor>
          </Paper>
        )}
      </Stack>
    </SettingsSection>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={650} fz="lg" className="tnum">
        {number.format(value)}
      </Text>
    </div>
  );
}

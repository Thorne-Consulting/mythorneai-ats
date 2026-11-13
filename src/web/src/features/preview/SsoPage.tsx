'use client';

import { useState } from 'react';
import { KeyRound, PlugZap, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import {
  Alert,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  CopyButton,
  Input,
  RadioGroup,
  StatCard,
  StatGrid,
  Switch,
  toast,
} from '@/components/ui';
import { PreviewAlert } from './preview-ui';
import { sampleSso, sampleSsoStats } from './sample-admin';

const providers = [
  { value: 'okta', label: 'Okta', description: 'Sign-in and automatic account setup' },
  {
    value: 'google',
    label: 'Google Workspace',
    description: 'Sign-in only. People are matched by email domain.',
  },
  {
    value: 'microsoft',
    label: 'Microsoft Entra ID',
    description: 'Sign-in and automatic account setup',
  },
];

export function SsoPage() {
  const [saved, setSaved] = useState(sampleSso);
  const [draft, setDraft] = useState(sampleSso);
  const [regenerating, setRegenerating] = useState(false);
  const [testing, setTesting] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const s = sampleSsoStats;
  const urlOk = /^https:\/\/\S+$/.test(draft.metadataUrl);
  const domainOk = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(draft.domain);

  return (
    <>
      {/* Title and Preview badge come from the Settings shell (AdminShell). */}
      <div className="-mt-1 mb-4 flex justify-end gap-2">
        <Button
          variant="secondary"
          leftIcon={<PlugZap />}
          loading={testing}
          onClick={() => {
            setTesting(true);
            setTimeout(() => {
              setTesting(false);
              toast.success('Connection looks good', 'This was a sample check. Nothing was sent.');
            }, 700);
          }}
        >
          Test connection
        </Button>
      </div>
      <PreviewAlert />

      <StatGrid className="mb-5">
        <StatCard
          icon={ShieldCheck}
          tone="green"
          label="Signing in with SSO"
          value={`${s.onSso} / ${s.members}`}
          hint={`${Math.round((s.onSso / s.members) * 100)}% of members`}
        />
        <StatCard
          icon={KeyRound}
          tone="amber"
          label="Signing in with a password"
          value={s.members - s.onSso}
        />
        <StatCard
          icon={Users}
          tone="violet"
          label="Accounts set up automatically"
          value={s.scimUsers}
        />
        <StatCard
          icon={RefreshCw}
          label="Last account update"
          value={s.lastSync}
          hint="Happens every 40 minutes"
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Sign-in provider"
            description="The service that holds your team's company accounts."
          />
          <div className="flex flex-col gap-4 px-5 pb-5">
            <RadioGroup
              aria-label="Sign-in provider"
              value={draft.provider}
              onValueChange={(v) => set({ provider: v })}
              options={providers}
            />
            <Input
              inset
              label="Email domain"
              value={draft.domain}
              onChange={(e) => set({ domain: e.currentTarget.value })}
              error={!domainOk && 'Enter a domain, for example acme.com'}
            />
            <Input
              inset
              label="Setup address (metadata URL)"
              type="url"
              value={draft.metadataUrl}
              onChange={(e) => set({ metadataUrl: e.currentTarget.value })}
              error={!urlOk && 'Use the address from your provider. It starts with https://.'}
            />
            <Switch
              labelPosition="left"
              label="Everyone must use single sign-on"
              description="This turns off password sign-in. Owners keep a password so they can still get in if the provider is down."
              checked={draft.requireSso}
              onCheckedChange={(v) => set({ requireSso: v })}
            />
            {draft.requireSso && (
              <Alert
                tone="warning"
                title={`${s.members - s.onSso} members still sign in with a password`}
              >
                They will be asked to sign in through your provider next time.
              </Alert>
            )}
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Automatic account setup (SCIM)"
            description="Your provider adds, updates and removes accounts here for you."
          />
          <div className="flex flex-col gap-4 px-5 pb-5">
            <Switch
              labelPosition="left"
              label="Turn on automatic account setup"
              checked={draft.scim}
              onCheckedChange={(v) => set({ scim: v })}
            />
            <Input
              inset
              label="Address for your provider"
              readOnly
              value={draft.scimBaseUrl}
              disabled={!draft.scim}
              rightSection={<CopyButton value={draft.scimBaseUrl} label="Copy address" />}
            />
            <Input
              inset
              label="Access key"
              readOnly
              value={draft.scimToken}
              disabled={!draft.scim}
              inputClassName="font-mono text-sm"
              rightSection={<CopyButton value={draft.scimToken} label="Copy access key" />}
            />
            <div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw />}
                disabled={!draft.scim}
                onClick={() => setRegenerating(true)}
              >
                Create new access key
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {dirty && (
        <div className="sticky bottom-4 z-10 mt-5 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-card px-4 py-3 shadow-pop">
          <span className="mr-auto text-sm text-fg-muted">You have unsaved changes.</span>
          <Button variant="secondary" onClick={() => setDraft(saved)}>
            Discard
          </Button>
          <Button
            disabled={!urlOk || !domainOk}
            onClick={() => {
              setSaved(draft);
              toast.success('Single sign-on saved', 'Saved on this page only.');
            }}
          >
            Save changes
          </Button>
        </div>
      )}

      <ConfirmDialog
        opened={regenerating}
        onClose={() => setRegenerating(false)}
        title="Create a new access key?"
        message="The current key stops working right away. Paste the new one into your sign-in provider so accounts keep updating."
        confirmLabel="Create new key"
        onConfirm={() => {
          const token = `scim_sample_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
          setDraft((d) => ({ ...d, scimToken: token }));
          setSaved((d) => ({ ...d, scimToken: token }));
          toast.success('New access key created', 'Paste it into your sign-in provider.');
        }}
      />
    </>
  );
}

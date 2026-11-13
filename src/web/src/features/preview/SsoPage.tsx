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
  { value: 'okta', label: 'Okta', description: 'SAML 2.0 with SCIM provisioning' },
  {
    value: 'google',
    label: 'Google Workspace',
    description: 'SAML 2.0, users matched by email domain',
  },
  {
    value: 'microsoft',
    label: 'Microsoft Entra ID',
    description: 'SAML 2.0 with SCIM provisioning',
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
              toast.success('Connection looks good', 'Sample check only: no request was made.');
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
          label="SSO coverage"
          value={`${s.onSso} / ${s.members}`}
          hint={`${Math.round((s.onSso / s.members) * 100)}% of members sign in with SSO`}
        />
        <StatCard
          icon={KeyRound}
          tone="amber"
          label="Password sign-ins"
          value={s.members - s.onSso}
          hint="Members not on SSO yet"
        />
        <StatCard
          icon={Users}
          tone="violet"
          label="SCIM provisioned"
          value={s.scimUsers}
          hint="Accounts managed by your provider"
        />
        <StatCard
          icon={RefreshCw}
          label="Last directory sync"
          value={s.lastSync}
          hint="Runs every 40 minutes"
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Identity provider" description="Where your team's accounts live." />
          <div className="flex flex-col gap-4 px-5 pb-5">
            <RadioGroup
              aria-label="Identity provider"
              value={draft.provider}
              onValueChange={(v) => set({ provider: v })}
              options={providers}
            />
            <Input
              inset
              label="Email domain"
              value={draft.domain}
              onChange={(e) => set({ domain: e.currentTarget.value })}
              error={!domainOk && 'Enter a domain like example.com'}
            />
            <Input
              inset
              label="Metadata URL"
              type="url"
              value={draft.metadataUrl}
              onChange={(e) => set({ metadataUrl: e.currentTarget.value })}
              error={!urlOk && 'Use the https:// URL from your provider'}
            />
            <Switch
              labelPosition="left"
              label="Require SSO for all members"
              description="Turns off password sign-in. Owners keep a password as a break-glass account."
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
            title="SCIM provisioning"
            description="Create, update and remove accounts from your provider automatically."
          />
          <div className="flex flex-col gap-4 px-5 pb-5">
            <Switch
              labelPosition="left"
              label="Enable SCIM"
              checked={draft.scim}
              onCheckedChange={(v) => set({ scim: v })}
            />
            <Input
              inset
              label="SCIM base URL"
              readOnly
              value={draft.scimBaseUrl}
              disabled={!draft.scim}
              rightSection={<CopyButton value={draft.scimBaseUrl} label="Copy base URL" />}
            />
            <Input
              inset
              label="Bearer token"
              readOnly
              value={draft.scimToken}
              disabled={!draft.scim}
              inputClassName="font-mono text-sm"
              rightSection={<CopyButton value={draft.scimToken} label="Copy token" />}
            />
            <div>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw />}
                disabled={!draft.scim}
                onClick={() => setRegenerating(true)}
              >
                Regenerate token
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
              toast.success('Single sign-on saved', 'Kept on this page only.');
            }}
          >
            Save changes
          </Button>
        </div>
      )}

      <ConfirmDialog
        opened={regenerating}
        onClose={() => setRegenerating(false)}
        title="Regenerate the SCIM token?"
        message="The current token stops working straight away. Paste the new one into your identity provider to keep provisioning running."
        confirmLabel="Regenerate token"
        onConfirm={() => {
          const token = `scim_sample_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
          setDraft((d) => ({ ...d, scimToken: token }));
          setSaved((d) => ({ ...d, scimToken: token }));
          toast.success('New token created', 'Copy it into your identity provider.');
        }}
      />
    </>
  );
}

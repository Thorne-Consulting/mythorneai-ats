'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Globe, Info, KeyRound, ShieldCheck } from 'lucide-react';
import { api } from '@/api';
import { Alert, Badge, Button, Card, CardHeader, Switch, toast } from '@/components/ui';
import { formatRelative, humanize } from '@/lib/format';
import { SettingsHeader } from './SettingsShell';
import { SettingsLoading, SettingsSection, useDraft } from './settings-shared';

interface SsoStatus {
  authMode: 'WorkOS' | 'Oidc' | 'Development';
  authority?: string | null;
  linked: boolean;
  connections: { name: string; type: string; state: string }[];
  domains: { domain: string; state: 'Verified' | 'Pending' }[];
  requireSso: boolean;
  allowGoogleLogin: boolean;
  allowMicrosoftLogin: boolean;
  ownerEmail: string;
  lastSsoSignIn?: { email: string; name?: string | null; at: string } | null;
  problem?: string | null;
}

const KEY = ['admin', 'sso'];

// WorkOS names connection types like "OktaSAML" or "GoogleOAuth"; people know the company.
const providerName = (type: string) =>
  humanize(type.replace(/(SAML|OIDC|OAuth)$/i, '')).replace(/\bAdfs\b/, 'ADFS') || 'Your company';

/**
 * Single sign-on and every other way people sign in, on one page. Set-up happens in WorkOS's own
 * hosted pages (the Admin Portal), so nobody here handles certificates or metadata files.
 */
export function SsoSettings() {
  const status = useQuery({ queryKey: KEY, queryFn: () => api.get<SsoStatus>('/api/admin/sso') });
  const data = status.data;
  return (
    <>
      <SettingsHeader />
      {!data ? (
        <SettingsLoading rows={4} />
      ) : data.authMode === 'Oidc' ? (
        <Alert tone="neutral" icon={Info} title="Your company’s sign-in service handles this">
          Everyone signs in through {data.authority ?? 'your identity provider'}. Change sign-in
          rules there.
        </Alert>
      ) : (
        <div className="flex max-w-3xl flex-col gap-5">
          {data.authMode === 'Development' && (
            <Alert tone="neutral" icon={Info}>
              This copy signs in with test accounts, so single sign-on is off here. On the live site
              you set it up on this page.
            </Alert>
          )}
          {data.problem && <Alert tone="warning">{data.problem}</Alert>}
          {data.authMode === 'WorkOS' && (
            <>
              <ConnectionCard status={data} />
              <DomainsCard status={data} />
            </>
          )}
          <SignInMethods status={data} />
        </div>
      )}
    </>
  );
}

/** Opens WorkOS's hosted set-up in a new tab. The tab opens first so pop-up blockers allow it. */
function usePortal() {
  return useMutation({
    mutationFn: async (intent: 'sso' | 'domain_verification') => {
      const tab = window.open('about:blank', '_blank');
      try {
        const { link } = await api.post<{ link: string }>('/api/admin/sso/portal-link', {
          intent,
        });
        if (tab) {
          tab.opener = null;
          tab.location.href = link;
        } else window.location.assign(link);
      } catch (error) {
        tab?.close();
        throw error;
      }
    },
    onError: (error: Error) => toast.error('The set-up page didn’t open', error.message),
  });
}

function ConnectionCard({ status }: { status: SsoStatus }) {
  const portal = usePortal();
  const active = status.connections.find((c) => c.state.toLowerCase() === 'active');
  const any = active ?? status.connections[0];
  const last = status.lastSsoSignIn;
  return (
    <Card>
      <CardHeader
        title="Identity provider"
        description={
          any
            ? undefined
            : 'Connect your identity provider, for example Okta, Microsoft Entra ID or Google Workspace. Your IT admin follows steps for your provider.'
        }
        action={
          active ? (
            <Badge tone="green">Active</Badge>
          ) : any ? (
            <Badge tone="amber">Not finished</Badge>
          ) : (
            <Badge tone="gray">Not set up</Badge>
          )
        }
      />
      <div className="flex flex-col gap-4 border-t border-border-subtle px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-base">
          {any ? (
            <>
              <p className="flex items-center gap-2 font-medium text-fg">
                <KeyRound className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                {providerName(any.type)}
              </p>
              <p className="mt-1 text-sm text-fg-subtle">
                {last
                  ? `Last sign-in: ${last.name ?? last.email}, ${formatRelative(last.at)}`
                  : active
                    ? 'Nobody has signed in this way yet.'
                    : 'Finish the set-up to turn it on.'}
              </p>
            </>
          ) : (
            <p className="text-sm text-fg-subtle">
              It takes about 15 minutes. The page opens in a new tab.
            </p>
          )}
        </div>
        <Button
          variant={any ? 'secondary' : 'primary'}
          rightIcon={<ExternalLink />}
          loading={portal.isPending && portal.variables === 'sso'}
          onClick={() => portal.mutate('sso')}
          className="shrink-0"
        >
          {any ? 'Change set-up' : 'Set up single sign-on'}
        </Button>
      </div>
    </Card>
  );
}

function DomainsCard({ status }: { status: SsoStatus }) {
  const portal = usePortal();
  return (
    <Card>
      <CardHeader
        title="Company domains"
        description="Prove you own your email domain. People at a verified domain go straight to your identity provider."
        action={
          <Button
            variant="secondary"
            size="sm"
            rightIcon={<ExternalLink />}
            loading={portal.isPending && portal.variables === 'domain_verification'}
            onClick={() => portal.mutate('domain_verification')}
          >
            Verify a domain
          </Button>
        }
      />
      {status.domains.length === 0 ? (
        <p className="border-t border-border-subtle px-5 py-4 text-sm text-fg-subtle">
          No domains yet.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle border-t border-border-subtle">
          {status.domains.map((d) => (
            <li key={d.domain} className="flex items-center gap-3 px-5 py-3">
              <Globe className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-base text-fg">{d.domain}</span>
              <Badge tone={d.state === 'Verified' ? 'green' : 'amber'}>
                {d.state === 'Verified' ? 'Verified' : 'Waiting for proof'}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Which ways in are open, and whether single sign-on is the only one for verified domains. */
function SignInMethods({ status }: { status: SsoStatus }) {
  const queryClient = useQueryClient();
  const { draft, set, dirty, reset } = useDraft({
    allowGoogleLogin: status.allowGoogleLogin,
    allowMicrosoftLogin: status.allowMicrosoftLogin,
    requireSso: status.requireSso,
  });
  const save = useMutation({
    mutationFn: () => api.put('/api/organization', draft),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      toast.success('Sign-in settings saved');
    },
    onError: (error: Error) => toast.error('Sign-in settings weren’t saved', error.message),
  });
  const verified = status.domains.filter((d) => d.state === 'Verified').map((d) => `@${d.domain}`);
  const ssoReady =
    status.authMode === 'WorkOS' &&
    verified.length > 0 &&
    status.connections.some((c) => c.state.toLowerCase() === 'active');
  return (
    <SettingsSection
      id="sign-in-methods"
      title="Sign-in methods"
      dirty={dirty}
      saving={save.isPending}
      onSave={() => save.mutate()}
      onDiscard={reset}
    >
      <div className="divide-y divide-border-subtle [&>*]:py-4 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        <p className="flex items-center gap-2 text-base text-fg">
          <Check className="size-4 shrink-0 text-tone-green-fg" aria-hidden />A code sent to their
          work email, and single sign-on, always work.
        </p>
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
        {ssoReady ? (
          <Switch
            labelPosition="left"
            label={`Require single sign-on for ${verified.join(', ')}`}
            description={`People at ${verified.length === 1 ? 'this domain' : 'these domains'} can only sign in through your identity provider. The workspace owner (${status.ownerEmail}) can always sign in another way, so a broken set-up can’t lock everyone out.`}
            checked={draft.requireSso}
            onCheckedChange={(on) => set({ requireSso: on })}
          />
        ) : (
          status.authMode === 'WorkOS' && (
            <p className="flex items-start gap-2 text-sm text-fg-subtle">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              To make single sign-on the only way in, set it up and verify a domain first.
            </p>
          )
        )}
      </div>
    </SettingsSection>
  );
}

'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ChevronRight,
  Eye,
  KeyRound,
  Pencil,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  ConfirmDialog,
  CopyButton,
  DescriptionList,
  Drawer,
  EmptyState,
  Input,
  MenuItem,
  MenuSeparator,
  Modal,
  RowActions,
  SkeletonRows,
  Switch,
  Timeline,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatRelative } from '@/lib/format';
import { SettingsHeader } from './SettingsShell';

interface EventInfo {
  type: string;
  label: string;
  description: string;
  sample: unknown;
}
interface Endpoint {
  id: string;
  url: string;
  /** Masked, for example whsec_••••a1B2. */
  secret: string;
  events: string[];
  isActive: boolean;
  disabledReason?: string | null;
  failingSince?: string | null;
  rotationEndsAt?: string | null;
  lastStatus?: string | null;
  lastAt?: string | null;
  lastError?: string | null;
  failed: number;
}
interface Delivery {
  id: string;
  eventType: string;
  status: string;
  attempts: number;
  lastStatusCode?: number | null;
  lastError?: string | null;
  durationMs?: number | null;
  createdAt: string;
  completedAt?: string | null;
}
interface DeliveryDetail extends Delivery {
  url: string;
  nextAttemptAt: string;
  payload: string;
  requestHeaders: { key: string; value: string }[];
  responseBody?: string | null;
  timeline: { at: string; status?: number | null; durationMs: number; error?: string | null }[];
}
interface Draft {
  id?: string;
  url: string;
  events: string[];
  isActive: boolean;
}

const exact = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const pretty = (json: string) => {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
};
const deliveryTone = (status: string) =>
  status === 'Failed' ? 'red' : status === 'Succeeded' ? 'green' : 'gray';
const deliveryLabel = (status: string) =>
  status === 'Succeeded'
    ? 'Delivered'
    : status === 'Pending' || status === 'Processing'
      ? 'Waiting'
      : status;

/** Settings → Webhooks: where we send events, their secrets, and what was sent. */
export function AdminWebhooks() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Endpoint | null>(null);
  const [removing, setRemoving] = useState<Endpoint | null>(null);
  const [rotating, setRotating] = useState<Endpoint | null>(null);
  const [secret, setSecret] = useState<{ value: string; title: string; note: string } | null>(null);
  const query = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get<{ events: EventInfo[]; endpoints: Endpoint[] }>('/api/admin/webhooks'),
  });
  const catalog = query.data?.events ?? [];
  const label = (type: string) =>
    type === 'ping' ? 'Test message' : (catalog.find((e) => e.type === type)?.label ?? type);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });
  const save = useMutation({
    mutationFn: (value: Draft) => {
      const body = { url: value.url.trim(), events: value.events, isActive: value.isActive };
      return value.id
        ? api.put<undefined>(`/api/admin/webhooks/${value.id}`, body)
        : api.post<{ id: string; secret: string }>('/api/admin/webhooks', body);
    },
    onSuccess: (result) => {
      refresh();
      setDraft(null);
      setError(null);
      if (result?.secret)
        setSecret({
          value: result.secret,
          title: 'Webhook added',
          note: 'Give this signing secret to whoever sets up the receiving system. It lets them check each message came from us.',
        });
      else toast.success('Webhook saved');
    },
    onError: (e: Error) => setError(e.message),
  });
  // Pause and resume straight from the card. Optimistic, rolled back on failure.
  const setActive = useMutation({
    mutationFn: (input: { endpoint: Endpoint; isActive: boolean }) =>
      api.put(`/api/admin/webhooks/${input.endpoint.id}`, {
        url: input.endpoint.url,
        events: input.endpoint.events,
        isActive: input.isActive,
      }),
    onMutate: ({ endpoint, isActive }) => {
      const previous = query.data;
      queryClient.setQueryData(
        ['webhooks'],
        (data: typeof query.data) =>
          data && {
            ...data,
            endpoints: data.endpoints.map((x) => (x.id === endpoint.id ? { ...x, isActive } : x)),
          },
      );
      return { previous };
    },
    onError: (e: Error, _, context) => {
      queryClient.setQueryData(['webhooks'], context?.previous);
      toast.error('The webhook wasn’t changed', e.message);
    },
    onSettled: refresh,
  });
  const test = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/webhooks/${id}/test`),
    onSuccess: () => {
      refresh();
      toast.success('Test message sent', 'Open “History” in a moment to see the answer.');
    },
    onError: (e: Error) => toast.error('The test message wasn’t sent', e.message),
  });
  const reveal = useMutation({
    mutationFn: (endpoint: Endpoint) =>
      api.post<{ secret: string }>(`/api/admin/webhooks/${endpoint.id}/secret`),
    onSuccess: ({ secret: value }) =>
      setSecret({
        value,
        title: 'Signing secret',
        note: 'We record in the activity history each time someone shows a secret.',
      }),
    onError: (e: Error) => toast.error('Couldn’t show the secret', e.message),
  });
  const rotate = useMutation({
    mutationFn: (endpoint: Endpoint) =>
      api.post<{ secret: string; rotationEndsAt: string }>(
        `/api/admin/webhooks/${endpoint.id}/rotate`,
      ),
    onSuccess: ({ secret: value, rotationEndsAt }) => {
      refresh();
      setSecret({
        value,
        title: 'New signing secret',
        note: `The old secret keeps working until ${exact.format(new Date(rotationEndsAt))}, so the receiving system has a day to switch.`,
      });
    },
    onError: (e: Error) => toast.error('The secret wasn’t replaced', e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/webhooks/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Webhook deleted');
    },
    onError: (e: Error) => toast.error('The webhook wasn’t deleted', e.message),
  });

  const open = (value: Draft) => {
    setError(null);
    setDraft(value);
  };
  const addNew = () => open({ url: '', events: [], isActive: true });
  const endpoints = query.data?.endpoints ?? [];

  return (
    <>
      <SettingsHeader
        actions={
          endpoints.length > 0 && (
            <Button leftIcon={<Plus />} onClick={addNew}>
              Add webhook
            </Button>
          )
        }
      />
      <Card>
        {!query.data ? (
          <SkeletonRows rows={2} />
        ) : endpoints.length === 0 ? (
          <EmptyState
            icon={Webhook}
            title="No webhooks yet"
            description="Add the web address of the system that should hear about new applicants, interviews, offers and hires."
            action={
              <Button leftIcon={<Plus />} onClick={addNew}>
                Add webhook
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border-subtle">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-4">
                  <Switch
                    checked={endpoint.isActive}
                    onCheckedChange={(isActive) => setActive.mutate({ endpoint, isActive })}
                    aria-label={
                      endpoint.isActive ? `Pause ${endpoint.url}` : `Turn on ${endpoint.url}`
                    }
                  />
                  <div className="min-w-0 flex-1 basis-72">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-all font-medium text-fg">{endpoint.url}</p>
                      <Badge
                        dot
                        tone={
                          endpoint.isActive ? 'green' : endpoint.disabledReason ? 'red' : 'gray'
                        }
                      >
                        {endpoint.isActive ? 'On' : 'Paused'}
                      </Badge>
                      {endpoint.failed > 0 && <Badge tone="red">{endpoint.failed} failed</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">
                      Sends{' '}
                      {endpoint.events.length === 0
                        ? 'every event'
                        : endpoint.events.map(label).join(', ')}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {endpoint.lastStatus && endpoint.lastAt
                        ? `Last message ${deliveryLabel(endpoint.lastStatus).toLowerCase()} ${formatRelative(endpoint.lastAt)}.`
                        : 'Nothing sent yet.'}
                      {endpoint.rotationEndsAt &&
                        ` The old signing secret works until ${exact.format(new Date(endpoint.rotationEndsAt))}.`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Send />}
                      disabled={!endpoint.isActive}
                      loading={test.isPending && test.variables === endpoint.id}
                      onClick={() => test.mutate(endpoint.id)}
                    >
                      Send test
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setHistory(endpoint)}>
                      History
                    </Button>
                    <RowActions label={`More actions for ${endpoint.url}`}>
                      <MenuItem
                        icon={<Pencil />}
                        onSelect={() =>
                          open({
                            id: endpoint.id,
                            url: endpoint.url,
                            events: endpoint.events,
                            isActive: endpoint.isActive,
                          })
                        }
                      >
                        Edit
                      </MenuItem>
                      <MenuItem icon={<Eye />} onSelect={() => reveal.mutate(endpoint)}>
                        Show signing secret
                      </MenuItem>
                      <MenuItem icon={<KeyRound />} onSelect={() => setRotating(endpoint)}>
                        Replace signing secret
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem icon={<Trash2 />} danger onSelect={() => setRemoving(endpoint)}>
                        Delete
                      </MenuItem>
                    </RowActions>
                  </div>
                </div>
                {endpoint.disabledReason && !endpoint.isActive && (
                  <Alert
                    tone="danger"
                    className="mt-3 sm:ml-[52px]"
                    title={endpoint.disabledReason}
                  >
                    Check the answers under History, fix the receiving system, then turn the webhook
                    back on. Messages that waited are sent then.
                  </Alert>
                )}
                {endpoint.isActive && endpoint.lastError && (
                  <p className="mt-2 text-xs text-destructive sm:ml-[52px]">{endpoint.lastError}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold text-fg">For developers</h2>
        <p className="mt-1 max-w-3xl text-sm text-fg-muted">
          We send a JSON message by POST and sign it the Standard Webhooks way, so you can check it
          with any Standard Webhooks library (standardwebhooks.com) and the signing secret. Answer
          with any 2xx status within 10 seconds. If you don’t, we try again 5 more times over about
          an hour and a half, and pause the webhook after 3 days of failures.
        </p>
        <DescriptionList
          className="mt-4"
          columns={2}
          items={[
            {
              label: 'webhook-id',
              value: 'The message’s ID. It stays the same when we try again.',
            },
            { label: 'webhook-timestamp', value: 'When it was sent, in seconds since 1970 (UTC).' },
            {
              label: 'webhook-signature',
              value:
                'v1, then the signature. Two are listed for a day after you replace the secret.',
            },
            { label: 'X-ATS-Event', value: 'The event, for example application.hired.' },
          ]}
        />
      </Card>

      <WebhookModal
        draft={draft}
        catalog={catalog}
        error={error}
        saving={save.isPending}
        onChange={setDraft}
        onSave={() => draft && save.mutate(draft)}
        onClose={() => setDraft(null)}
      />

      <Modal
        opened={secret !== null}
        onClose={() => setSecret(null)}
        title={secret?.title ?? ''}
        footer={<Button onClick={() => setSecret(null)}>Done</Button>}
      >
        {secret && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <Code className="min-w-0 flex-1 break-all">{secret.value}</Code>
              <CopyButton value={secret.value} label="Copy secret" />
            </div>
            <p className="text-sm text-fg-muted">{secret.note}</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        opened={rotating !== null}
        onClose={() => setRotating(null)}
        title="Replace the signing secret?"
        message="We make a new secret and sign with both for a day. Update the receiving system before then, or its checks start to fail."
        confirmLabel="Replace secret"
        confirmVariant="primary"
        onConfirm={async () => {
          if (rotating) await rotate.mutateAsync(rotating).catch(() => undefined);
        }}
      />

      <ConfirmDialog
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete this webhook?"
        message={`We’ll stop sending messages to ${removing?.url ?? ''}. Its message history is deleted too.`}
        confirmLabel="Delete webhook"
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id).catch(() => undefined);
        }}
      />

      <HistoryDrawer
        endpoint={history}
        label={label}
        onClose={() => setHistory(null)}
        onChanged={refresh}
      />
    </>
  );
}

function WebhookModal({
  draft,
  catalog,
  error,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  draft: Draft | null;
  catalog: EventInfo[];
  error: string | null;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const [sample, setSample] = useState<string | null>(null);
  const url = draft?.url.trim() ?? '';
  const urlLooksWrong = url.length > 0 && !/^https?:\/\//.test(url);
  const all = draft?.events.length === 0;
  const toggle = (type: string, on: boolean) =>
    draft &&
    onChange({
      ...draft,
      events: on ? [...draft.events, type] : draft.events.filter((e) => e !== type),
    });
  return (
    <Modal
      opened={draft !== null}
      onClose={onClose}
      size="lg"
      title={draft?.id ? 'Edit webhook' : 'Add webhook'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!url || urlLooksWrong} loading={saving} onClick={onSave}>
            {draft?.id ? 'Save webhook' : 'Add webhook'}
          </Button>
        </>
      }
    >
      {draft && (
        <div className="flex flex-col gap-5">
          {error && (
            <Alert tone="danger" title="This webhook wasn’t saved">
              {error}
            </Alert>
          )}
          <Input
            label="Web address"
            description="Where we send each message. It must start with https:// and be reachable from the internet."
            placeholder="https://hr.example.com/hooks/hiring"
            value={draft.url}
            onChange={(event) => onChange({ ...draft, url: event.currentTarget.value })}
            error={urlLooksWrong ? 'The address must start with https://' : undefined}
            autoFocus
          />
          <fieldset>
            <legend className="text-base font-medium text-fg">What to send</legend>
            <Checkbox
              className="mt-3"
              label="Every event, including ones we add later"
              checked={all}
              onCheckedChange={(on) => on && onChange({ ...draft, events: [] })}
            />
            <ul className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle">
              {catalog.map((event) => (
                <li key={event.type} className="px-3 py-2.5">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      aria-label={event.label}
                      checked={all || draft.events.includes(event.type)}
                      onCheckedChange={(on) =>
                        all
                          ? onChange({
                              ...draft,
                              events: catalog.map((e) => e.type).filter((t) => t !== event.type),
                            })
                          : toggle(event.type, !!on)
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-fg">
                        {event.label} <Code className="ml-1 text-2xs">{event.type}</Code>
                      </p>
                      <p className="text-xs text-fg-subtle">{event.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSample(sample === event.type ? null : event.type)}
                      aria-expanded={sample === event.type}
                      className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-accent-foreground hover:bg-accent"
                    >
                      Example
                      <ChevronRight
                        className={cn(
                          'size-3.5 transition-transform',
                          sample === event.type && 'rotate-90',
                        )}
                        aria-hidden
                      />
                    </button>
                  </div>
                  {sample === event.type && <SampleJson event={event} />}
                </li>
              ))}
            </ul>
          </fieldset>
          <Switch
            labelPosition="left"
            label="Send messages"
            description="Turn this off to pause the webhook without deleting it."
            checked={draft.isActive}
            onCheckedChange={(isActive) => onChange({ ...draft, isActive })}
          />
        </div>
      )}
    </Modal>
  );
}

function SampleJson({ event }: { event: EventInfo }) {
  const json = JSON.stringify(
    {
      id: '0b8f2c1e-5a3d-4e6f-9b7a-1c2d3e4f5a66',
      type: event.type,
      occurredAt: '2026-11-13T15:04:05+00:00',
      data: event.sample,
    },
    null,
    2,
  );
  return (
    <div className="relative mt-2 sm:ml-8">
      <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-2xs text-fg-muted">
        {json}
      </pre>
      <div className="absolute top-1.5 right-1.5">
        <CopyButton value={json} label="Copy example" />
      </div>
    </div>
  );
}

/** Every message sent to one webhook; open one to see exactly what went out and what came back. */
function HistoryDrawer({
  endpoint,
  label,
  onClose,
  onChanged,
}: {
  endpoint: Endpoint | null;
  label: (type: string) => string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', endpoint?.id],
    queryFn: () => api.get<Delivery[]>(`/api/admin/webhooks/${endpoint!.id}/deliveries`),
    enabled: !!endpoint,
    refetchInterval: 5_000,
  });
  const detail = useQuery({
    queryKey: ['webhook-delivery', openId],
    queryFn: () => api.get<DeliveryDetail>(`/api/admin/webhooks/deliveries/${openId}`),
    enabled: !!openId,
  });
  const after = () => {
    queryClient.invalidateQueries({ queryKey: ['webhook-deliveries'] });
    queryClient.invalidateQueries({ queryKey: ['webhook-delivery'] });
    onChanged();
  };
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/webhooks/deliveries/${id}/retry`),
    onSuccess: () => {
      after();
      toast.success('We’ll send it again now');
    },
    onError: (e: Error) => toast.error('It wasn’t sent again', e.message),
  });
  const retryAll = useMutation({
    mutationFn: () =>
      api.post<{ count: number }>(`/api/admin/webhooks/${endpoint!.id}/deliveries/retry-failed`),
    onSuccess: ({ count }) => {
      after();
      toast.success(
        count === 1 ? 'We’ll send 1 message again' : `We’ll send ${count} messages again`,
      );
    },
    onError: (e: Error) => toast.error('They weren’t sent again', e.message),
  });
  const failed = deliveries.data?.filter((d) => d.status === 'Failed').length ?? 0;
  const close = () => {
    setOpenId(null);
    onClose();
  };
  const d = detail.data;

  return (
    <Drawer
      opened={endpoint !== null}
      onClose={close}
      size="lg"
      title={openId ? label(d?.eventType ?? '') || 'Message' : 'History'}
      description={endpoint?.url}
      footer={
        openId ? (
          <>
            <Button
              variant="quiet"
              leftIcon={<ArrowLeft />}
              className="mr-auto"
              onClick={() => setOpenId(null)}
            >
              All messages
            </Button>
            <Button
              variant="secondary"
              leftIcon={<RotateCw />}
              loading={retry.isPending}
              onClick={() => retry.mutate(openId)}
            >
              Send again
            </Button>
          </>
        ) : failed > 0 ? (
          <Button
            variant="secondary"
            leftIcon={<RotateCw />}
            loading={retryAll.isPending}
            onClick={() => retryAll.mutate()}
          >
            Send all {failed} failed again
          </Button>
        ) : undefined
      }
    >
      {openId ? (
        !d ? (
          <SkeletonRows rows={4} className="px-0" />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge dot tone={deliveryTone(d.status)}>
                {deliveryLabel(d.status)}
              </Badge>
              {d.lastStatusCode ? <Badge tone="gray">Answer {d.lastStatusCode}</Badge> : null}
              {d.durationMs != null && <Badge tone="gray">{d.durationMs} ms</Badge>}
              <span className="text-xs text-fg-subtle">{exact.format(new Date(d.createdAt))}</span>
            </div>
            {d.lastError && <Alert tone="danger">{d.lastError}</Alert>}
            <Section title="What we sent" copy={pretty(d.payload)}>
              {d.requestHeaders.length > 0 && (
                <dl className="mb-3 grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-1 text-xs">
                  {d.requestHeaders.map((h) => (
                    <div key={h.key} className="contents">
                      <dt className="font-mono text-fg-subtle">{h.key}</dt>
                      <dd className="min-w-0 font-mono break-all text-fg-muted">{h.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <pre className="max-h-80 overflow-auto rounded-lg bg-muted p-3 font-mono text-2xs text-fg-muted">
                {pretty(d.payload)}
              </pre>
            </Section>
            <Section title="What came back" copy={d.responseBody ?? undefined}>
              {d.responseBody ? (
                <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 font-mono text-2xs whitespace-pre-wrap text-fg-muted">
                  {d.responseBody}
                </pre>
              ) : (
                <p className="text-sm text-fg-subtle">
                  {d.lastStatusCode ? 'An empty answer.' : 'No answer yet.'} We keep the first 2 KB
                  of each answer.
                </p>
              )}
            </Section>
            {d.timeline.length > 0 && (
              <Section title="Attempts">
                <Timeline
                  items={[...d.timeline].reverse().map((a, i) => ({
                    id: `${a.at}-${i}`,
                    title: a.error ? 'Failed' : `Delivered, answer ${a.status}`,
                    meta: `${exact.format(new Date(a.at))} · ${a.durationMs} ms`,
                    body: a.error ?? undefined,
                    tone: a.error ? 'red' : 'green',
                  }))}
                />
                {d.status === 'Pending' && d.attempts > 0 && (
                  <p className="mt-2 text-xs text-fg-subtle">
                    Next try {formatRelative(d.nextAttemptAt).replace(' ago', '')}{' '}
                    {new Date(d.nextAttemptAt) > new Date() ? 'from now' : ''}.
                  </p>
                )}
              </Section>
            )}
          </div>
        )
      ) : !deliveries.data ? (
        <SkeletonRows rows={4} className="px-0" />
      ) : deliveries.data.length === 0 ? (
        <EmptyState
          compact
          icon={Send}
          title="Nothing sent yet"
          description="Use “Send test” to check the receiving system answers."
        />
      ) : (
        <ul className="-mx-2 divide-y divide-border-subtle">
          {deliveries.data.map((delivery) => (
            <li key={delivery.id}>
              <button
                type="button"
                onClick={() => setOpenId(delivery.id)}
                className="flex w-full items-center gap-3 rounded-md px-2 py-3 text-left hover:bg-muted"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">
                    {label(delivery.eventType)}
                  </span>
                  <span className="block text-xs text-fg-subtle">
                    {formatRelative(delivery.createdAt)}
                    {delivery.lastStatusCode ? ` · answer ${delivery.lastStatusCode}` : ''}
                    {delivery.durationMs != null ? ` · ${delivery.durationMs} ms` : ''}
                    {delivery.attempts > 1 ? ` · ${delivery.attempts} tries` : ''}
                  </span>
                </span>
                <Badge dot tone={deliveryTone(delivery.status)}>
                  {deliveryLabel(delivery.status)}
                </Badge>
                <ChevronRight className="size-4 text-fg-subtle" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}

function Section({
  title,
  copy,
  children,
}: {
  title: string;
  copy?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        {copy && <CopyButton value={copy} label={`Copy ${title.toLowerCase()}`} />}
      </div>
      {children}
    </section>
  );
}

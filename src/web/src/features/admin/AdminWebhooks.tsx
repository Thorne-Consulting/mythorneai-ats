'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Plus, Send, Webhook } from 'lucide-react';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Card,
  Code,
  ConfirmDialog,
  CopyButton,
  EmptyState,
  IconButton,
  Input,
  Modal,
  MultiSelect,
  RowActions,
  MenuItem,
  SkeletonRows,
  Switch,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  toast,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';

interface Endpoint {
  id: string;
  url: string;
  secret: string;
  events: string[];
  isActive: boolean;
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
  createdAt: string;
  completedAt?: string | null;
}
interface Draft {
  id?: string;
  url: string;
  events: string[];
  isActive: boolean;
}

const EVENT_LABELS: Record<string, string> = {
  'application.created': 'Someone applies',
  'application.stage_changed': 'Someone moves to another stage',
  'application.hired': 'Someone is hired',
};
const eventLabel = (event: string) => EVENT_LABELS[event] ?? event;

export function AdminWebhooks() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<Endpoint | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState<Endpoint | null>(null);
  const query = useQuery({
    queryKey: ['webhooks'],
    queryFn: () => api.get<{ available: string[]; endpoints: Endpoint[] }>('/api/admin/webhooks'),
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });
  const save = useMutation({
    mutationFn: (value: Draft) => {
      const body = { url: value.url.trim(), events: value.events, isActive: value.isActive };
      return value.id
        ? api.put<{ id?: string } | undefined>(`/api/admin/webhooks/${value.id}`, body)
        : api.post<{ id?: string } | undefined>('/api/admin/webhooks', body);
    },
    onSuccess: (result) => {
      refresh();
      setDraft(null);
      setError(null);
      if (result?.id) setRevealed((current) => new Set(current).add(result.id!));
      toast.success(
        result ? 'Webhook added' : 'Webhook saved',
        result ? 'Copy its signing secret below.' : undefined,
      );
    },
    onError: (e: Error) => setError(e.message),
  });
  // Pause / resume straight from the card. Optimistic, rolled back on failure.
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
      toast.error('Could not change the webhook', e.message);
    },
    onSettled: refresh,
  });
  const test = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/webhooks/${id}/test`),
    onSuccess: () => {
      refresh();
      toast.success('Test sent', 'Open “Deliveries” in a moment to see how it went.');
    },
    onError: (e: Error) => toast.error('Could not send the test', e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/webhooks/${id}`),
    onSuccess: () => {
      refresh();
      toast.success('Webhook deleted');
    },
    onError: (e: Error) => toast.error('Could not delete', e.message),
  });

  const open = (value: Draft) => {
    setError(null);
    setDraft(value);
  };
  const addNew = () => open({ url: '', events: [], isActive: true });
  const endpoints = query.data?.endpoints ?? [];
  const url = draft?.url.trim() ?? '';
  const urlLooksWrong = url.length > 0 && !url.startsWith('https://');

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 max-w-2xl">
            <h2 className="text-lg font-semibold text-fg">Endpoints</h2>
            <p className="mt-0.5 text-sm text-fg-subtle">
              A webhook tells another system the moment something happens here, for example telling
              payroll or your HR system when someone is hired. We send a small message to the web
              address you give us.
            </p>
          </div>
          <Button leftIcon={<Plus />} onClick={addNew}>
            Add webhook
          </Button>
        </div>
        {!query.data ? (
          <SkeletonRows rows={2} />
        ) : endpoints.length === 0 ? (
          <EmptyState
            compact
            icon={Webhook}
            title="No webhooks yet"
            description="Add one to tell payroll, HR or another tool when someone applies, moves stage or is hired."
            action={
              <Button variant="secondary" leftIcon={<Plus />} onClick={addNew}>
                Add webhook
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border-subtle border-t border-border-subtle">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start gap-4">
                  <Switch
                    checked={endpoint.isActive}
                    onCheckedChange={(isActive) => setActive.mutate({ endpoint, isActive })}
                    aria-label={
                      endpoint.isActive ? `Pause ${endpoint.url}` : `Resume ${endpoint.url}`
                    }
                  />
                  <div className="min-w-0 flex-1 basis-72">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-all font-medium text-fg">{endpoint.url}</p>
                      <Badge dot tone={endpoint.isActive ? 'green' : 'gray'}>
                        {endpoint.isActive ? 'On' : 'Paused'}
                      </Badge>
                      {endpoint.failed > 0 && <Badge tone="red">{endpoint.failed} failed</Badge>}
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">
                      Sends:{' '}
                      {endpoint.events.length === 0
                        ? 'everything'
                        : endpoint.events.map(eventLabel).join(', ')}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {endpoint.lastStatus
                        ? `Last delivery ${endpoint.lastStatus.toLowerCase()}${endpoint.lastAt ? ` on ${formatDateTime(endpoint.lastAt)}` : ''}.`
                        : 'Nothing sent yet.'}
                    </p>
                    {endpoint.lastError && (
                      <p className="mt-0.5 text-xs text-destructive">{endpoint.lastError}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      leftIcon={<Send />}
                      loading={test.isPending && test.variables === endpoint.id}
                      onClick={() => test.mutate(endpoint.id)}
                    >
                      Send test
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setDeliveriesFor(endpoint)}
                    >
                      Deliveries
                    </Button>
                    <RowActions label={`More actions for ${endpoint.url}`}>
                      <MenuItem
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
                      <MenuItem danger onSelect={() => setRemoving(endpoint)}>
                        Delete
                      </MenuItem>
                    </RowActions>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 sm:ml-[52px]">
                  <span className="text-xs text-fg-subtle">Signing secret</span>
                  <Code className="break-all">
                    {revealed.has(endpoint.id) ? endpoint.secret : '•'.repeat(12)}
                  </Code>
                  <IconButton
                    size="sm"
                    variant="quiet"
                    label={revealed.has(endpoint.id) ? 'Hide secret' : 'Show secret'}
                    onClick={() =>
                      setRevealed((current) => {
                        const next = new Set(current);
                        if (!next.delete(endpoint.id)) next.add(endpoint.id);
                        return next;
                      })
                    }
                  >
                    {revealed.has(endpoint.id) ? <EyeOff /> : <Eye />}
                  </IconButton>
                  <CopyButton value={endpoint.secret} label="Copy secret" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {endpoints.length > 0 && (
        <p className="max-w-3xl text-sm text-fg-subtle">
          Every delivery is signed so the other system can tell it came from us. We send a header{' '}
          <Code>X-ATS-Signature: sha256=…</Code>, which is the HMAC-SHA256 of the message body using
          the signing secret. Check it before you trust a message.
        </p>
      )}

      <Modal
        opened={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit webhook' : 'Add webhook'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button
              disabled={!url || urlLooksWrong}
              loading={save.isPending}
              onClick={() => draft && save.mutate(draft)}
            >
              Save webhook
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <Input
              inset
              label="Web address"
              description="Must be a public https address."
              placeholder="https://payroll.example.com/hooks/ats"
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.currentTarget.value })}
              error={urlLooksWrong ? 'Start with https://' : undefined}
              autoFocus
            />
            <MultiSelect
              label="What to send"
              description="Leave empty to send everything."
              placeholder="Everything"
              data={(query.data?.available ?? []).map((event) => ({
                value: event,
                label: eventLabel(event),
              }))}
              value={draft.events}
              onChange={(events) => setDraft({ ...draft, events })}
            />
            <Switch
              labelPosition="left"
              label="Send messages"
              description="Turn off to pause without deleting."
              checked={draft.isActive}
              onCheckedChange={(isActive) => setDraft({ ...draft, isActive })}
            />
            {error && (
              <Alert tone="danger" title="This webhook wasn’t saved">
                {error}
              </Alert>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete this webhook?"
        message={`We’ll stop sending messages to ${removing?.url ?? ''}. Its delivery history goes with it.`}
        confirmLabel="Delete webhook"
        onConfirm={async () => {
          if (removing) await remove.mutateAsync(removing.id).catch(() => undefined);
        }}
      />

      <DeliveriesModal
        endpoint={deliveriesFor}
        onClose={() => setDeliveriesFor(null)}
        onRetried={refresh}
      />
    </>
  );
}

const deliveryTone = (status: string) =>
  status === 'Failed' ? 'red' : status === 'Pending' ? 'gray' : 'green';

function DeliveriesModal({
  endpoint,
  onClose,
  onRetried,
}: {
  endpoint: Endpoint | null;
  onClose: () => void;
  onRetried: () => void;
}) {
  const queryClient = useQueryClient();
  const deliveries = useQuery({
    queryKey: ['webhook-deliveries', endpoint?.id],
    queryFn: () => api.get<Delivery[]>(`/api/admin/webhooks/${endpoint!.id}/deliveries`),
    enabled: !!endpoint,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/webhooks/deliveries/${id}/retry`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-deliveries'] });
      onRetried();
      toast.success('Queued to send again');
    },
    onError: (e: Error) => toast.error('Could not retry', e.message),
  });
  return (
    <Modal
      opened={endpoint !== null}
      onClose={onClose}
      title="Recent deliveries"
      description={endpoint?.url}
      size="lg"
    >
      {!deliveries.data ? (
        <SkeletonRows rows={2} className="px-0" />
      ) : deliveries.data.length === 0 ? (
        <p className="text-sm text-fg-muted">
          Nothing has been sent to this address yet. Use “Send test” to try it.
        </p>
      ) : (
        <Table className="min-w-[560px]">
          <THead>
            <tr>
              <TH>Event</TH>
              <TH>Result</TH>
              <TH>When</TH>
              <TH>
                <span className="sr-only">Actions</span>
              </TH>
            </tr>
          </THead>
          <TBody>
            {deliveries.data.map((delivery) => (
              <TR key={delivery.id}>
                <TD className="font-medium">{eventLabel(delivery.eventType)}</TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Badge dot tone={deliveryTone(delivery.status)}>
                      {delivery.status}
                    </Badge>
                    {delivery.lastStatusCode ? (
                      <span className="text-xs text-fg-subtle tnum">
                        HTTP {delivery.lastStatusCode}
                      </span>
                    ) : null}
                  </div>
                  {delivery.lastError && (
                    <p className="mt-1 text-xs text-destructive">{delivery.lastError}</p>
                  )}
                </TD>
                <TD className="whitespace-nowrap text-fg-muted tnum">
                  {formatDateTime(delivery.createdAt)}
                </TD>
                <TD align="right">
                  {delivery.status === 'Failed' && (
                    <Button
                      size="xs"
                      variant="secondary"
                      loading={retry.isPending && retry.variables === delivery.id}
                      onClick={() => retry.mutate(delivery.id)}
                    >
                      Retry
                    </Button>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  MultiSelect,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus, IconWebhook } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';
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
      notifications.show({
        color: 'teal',
        message: result ? 'Webhook added. Copy its signing secret below.' : 'Webhook saved',
      });
    },
    onError: (e: Error) => setError(e.message),
  });
  const test = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/webhooks/${id}/test`),
    onSuccess: () => {
      refresh();
      notifications.show({
        color: 'teal',
        message: 'Test sent. Open “Deliveries” in a moment to see how it went.',
      });
    },
    onError: (e: Error) =>
      notifications.show({ color: 'red', title: 'Could not send the test', message: e.message }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/webhooks/${id}`),
    onSuccess: () => {
      refresh();
      setRemoving(null);
      notifications.show({ color: 'teal', message: 'Webhook deleted' });
    },
    onError: (e: Error) =>
      notifications.show({ color: 'red', title: 'Could not delete', message: e.message }),
  });

  const open = (value: Draft) => {
    setError(null);
    setDraft(value);
  };
  const endpoints = query.data?.endpoints ?? [];
  const url = draft?.url.trim() ?? '';
  const urlLooksWrong = url.length > 0 && !url.startsWith('https://');

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="sm">
        <div style={{ flex: '1 1 320px' }}>
          <Title order={3}>Webhooks</Title>
          <Text c="dimmed" size="sm" maw={680}>
            A webhook tells another system the moment something happens here, for example telling
            payroll or your HR system when someone is hired. We send a small message to the web
            address you give us.
          </Text>
        </div>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => open({ url: '', events: [], isActive: true })}
        >
          Add webhook
        </Button>
      </Group>

      {!query.data ? (
        <LoadingBlock rows={2} />
      ) : endpoints.length === 0 ? (
        <EmptyState
          icon={IconWebhook}
          title="No webhooks yet"
          description="Add the address of your payroll or HR system and choose what to send, like “Someone is hired”."
          actionLabel="Add webhook"
          onAction={() => open({ url: '', events: [], isActive: true })}
        />
      ) : (
        <Stack gap="md">
          {endpoints.map((endpoint) => (
            <Paper key={endpoint.id} withBorder radius="lg" p="lg">
              <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <Group gap="xs" mb={4}>
                    <Text fw={650} style={{ wordBreak: 'break-all' }}>
                      {endpoint.url}
                    </Text>
                    <Badge variant="light" color={endpoint.isActive ? 'teal' : 'gray'}>
                      {endpoint.isActive ? 'On' : 'Paused'}
                    </Badge>
                  </Group>
                  <Text size="sm" c="dimmed">
                    Sends:{' '}
                    {endpoint.events.length === 0
                      ? 'everything'
                      : endpoint.events.map(eventLabel).join(', ')}
                  </Text>
                  <Text size="sm" mt={4}>
                    {endpoint.lastStatus
                      ? `Last delivery ${endpoint.lastStatus.toLowerCase()}${endpoint.lastAt ? ` on ${formatDateTime(endpoint.lastAt)}` : ''}.`
                      : 'Nothing sent yet.'}
                    {endpoint.failed > 0 && (
                      <Text span c="red" fw={600}>
                        {' '}
                        {endpoint.failed} failed.
                      </Text>
                    )}
                  </Text>
                  {endpoint.lastError && (
                    <Text size="sm" c="red">
                      {endpoint.lastError}
                    </Text>
                  )}
                </div>
                <Group gap="xs">
                  <Button
                    variant="default"
                    size="xs"
                    loading={test.isPending && test.variables === endpoint.id}
                    onClick={() => test.mutate(endpoint.id)}
                  >
                    Send test
                  </Button>
                  <Button variant="default" size="xs" onClick={() => setDeliveriesFor(endpoint)}>
                    Deliveries
                  </Button>
                  <Button
                    variant="default"
                    size="xs"
                    onClick={() =>
                      open({
                        id: endpoint.id,
                        url: endpoint.url,
                        events: endpoint.events,
                        isActive: endpoint.isActive,
                      })
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    onClick={() => setRemoving(endpoint)}
                  >
                    Delete
                  </Button>
                </Group>
              </Group>
              <Group gap="sm" mt="md" align="center" wrap="wrap">
                <Text size="sm" fw={500}>
                  Signing secret
                </Text>
                <Code>{revealed.has(endpoint.id) ? endpoint.secret : '•'.repeat(12)}</Code>
                <Button
                  variant="subtle"
                  size="compact-sm"
                  onClick={() =>
                    setRevealed((current) => {
                      const next = new Set(current);
                      if (!next.delete(endpoint.id)) next.add(endpoint.id);
                      return next;
                    })
                  }
                >
                  {revealed.has(endpoint.id) ? 'Hide' : 'Show'}
                </Button>
                <CopyButton value={endpoint.secret}>
                  {({ copied, copy }) => (
                    <Button variant="subtle" size="compact-sm" onClick={copy}>
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
            </Paper>
          ))}
          <Text size="sm" c="dimmed" maw={720}>
            Every delivery is signed so the other system can tell it came from us. We send a header{' '}
            <Code>X-ATS-Signature: sha256=…</Code>, which is the HMAC-SHA256 of the message body
            using the signing secret. Check it before you trust a message.
          </Text>
        </Stack>
      )}

      <Modal
        opened={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit webhook' : 'Add webhook'}
        centered
      >
        {draft && (
          <Stack gap="md">
            <TextInput
              label="Web address"
              description="Must be a public https address."
              placeholder="https://payroll.example.com/hooks/ats"
              value={draft.url}
              onChange={(event) => setDraft({ ...draft, url: event.currentTarget.value })}
              error={urlLooksWrong ? 'Start with https://' : undefined}
              data-autofocus
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
              label="Send messages"
              description="Turn off to pause without deleting."
              checked={draft.isActive}
              onChange={(event) => setDraft({ ...draft, isActive: event.currentTarget.checked })}
            />
            {error && (
              <Alert color="red" title="This webhook wasn’t saved">
                {error}
              </Alert>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                disabled={!url || urlLooksWrong}
                loading={save.isPending}
                onClick={() => save.mutate(draft)}
              >
                Save webhook
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <Modal
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete this webhook?"
        centered
      >
        <Text size="sm" mb="md">
          We’ll stop sending messages to {removing?.url}. Its delivery history goes with it.
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setRemoving(null)}>
            Keep it
          </Button>
          <Button
            color="red"
            loading={remove.isPending}
            onClick={() => removing && remove.mutate(removing.id)}
          >
            Delete webhook
          </Button>
        </Group>
      </Modal>

      <DeliveriesModal
        endpoint={deliveriesFor}
        onClose={() => setDeliveriesFor(null)}
        onRetried={refresh}
      />
    </>
  );
}

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
      notifications.show({ color: 'teal', message: 'Queued to send again' });
    },
    onError: (e: Error) =>
      notifications.show({ color: 'red', title: 'Could not retry', message: e.message }),
  });
  return (
    <Modal
      opened={endpoint !== null}
      onClose={onClose}
      title="Recent deliveries"
      size="xl"
      centered
    >
      <Text size="sm" c="dimmed" mb="sm" style={{ wordBreak: 'break-all' }}>
        {endpoint?.url}
      </Text>
      {!deliveries.data ? (
        <LoadingBlock rows={2} />
      ) : deliveries.data.length === 0 ? (
        <Text size="sm">Nothing has been sent to this address yet. Use “Send test” to try it.</Text>
      ) : (
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="xs">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Event</Table.Th>
                <Table.Th>Result</Table.Th>
                <Table.Th>When</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {deliveries.data.map((delivery) => (
                <Table.Tr key={delivery.id}>
                  <Table.Td>{eventLabel(delivery.eventType)}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={
                        delivery.status === 'Failed'
                          ? 'red'
                          : delivery.status === 'Pending'
                            ? 'gray'
                            : 'teal'
                      }
                    >
                      {delivery.status}
                    </Badge>
                    {delivery.lastStatusCode ? (
                      <Text span size="xs" c="dimmed" ml={6}>
                        HTTP {delivery.lastStatusCode}
                      </Text>
                    ) : null}
                    {delivery.lastError && (
                      <Text size="xs" c="red">
                        {delivery.lastError}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{formatDateTime(delivery.createdAt)}</Table.Td>
                  <Table.Td>
                    {delivery.status === 'Failed' && (
                      <Button
                        size="compact-sm"
                        variant="default"
                        loading={retry.isPending && retry.variables === delivery.id}
                        onClick={() => retry.mutate(delivery.id)}
                      >
                        Retry
                      </Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Stack,
  TagsInput,
  Text,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSparkles } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  parseRequirements,
  type Requirements,
  type RequisitionWithSettings,
} from './requirements-types';

const EMPTY: Requirements = { required: [], preferred: [], minYears: null, location: '' };

export function RequisitionRequirements({
  requisition,
  canManage,
}: {
  requisition: RequisitionWithSettings;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const confirmed = parseRequirements(requisition.requirementsJson);
  const [draft, setDraft] = useState<Requirements | null>(null);
  const [fromAi, setFromAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const extract = useMutation({
    mutationFn: () =>
      api.post<Requirements>(`/api/requisitions/${requisition.id}/requirements/extract`),
    onSuccess: (result) => {
      setAiError(null);
      setFromAi(true);
      setDraft({ ...EMPTY, ...result });
    },
    onError: (error: Error) => setAiError(error.message),
  });
  const save = useMutation({
    mutationFn: (value: Requirements) =>
      api.put(`/api/requisitions/${requisition.id}/requirements`, {
        required: value.required,
        preferred: value.preferred,
        minYears: value.minYears,
        location: value.location,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisition.id] });
      notifications.show({ color: 'teal', message: 'Requirements confirmed' });
      setDraft(null);
      setFromAi(false);
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  const edit = () => {
    setFromAi(false);
    setDraft(confirmed ?? EMPTY);
  };

  const actions = canManage && !draft && (
    <Group gap="xs">
      <Button
        size="xs"
        variant="subtle"
        leftSection={<IconSparkles size={14} />}
        loading={extract.isPending}
        onClick={() => extract.mutate()}
      >
        Extract with AI
      </Button>
      <Button size="xs" variant="default" onClick={edit}>
        {confirmed ? 'Edit' : 'Add manually'}
      </Button>
    </Group>
  );

  return (
    <div>
      <div className="section-head">
        <h2 className="section-title">Requirements</h2>
        {draft && fromAi ? (
          <span className="ai-notice">
            <IconSparkles size={13} aria-hidden />
            Made by AI. Check before saving.
          </span>
        ) : (
          confirmed && actions
        )}
      </div>
      <Stack gap="md">
        {aiError && (
          <Alert color="gray" variant="light" title="AI extraction didn't run">
            {aiError}
          </Alert>
        )}
        {draft ? (
          <form
            className="req-sentence"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <h3 className="req-big-label">Must have</h3>
            <div className="req-big-field">
              <TagsInput
                variant="unstyled"
                size="md"
                aria-label="Must have"
                placeholder="Type a skill or experience and press Enter"
                value={draft.required}
                onChange={(required) => setDraft({ ...draft, required })}
              />
            </div>
            <h3 className="req-big-label">Nice to have</h3>
            <div className="req-big-field">
              <TagsInput
                variant="unstyled"
                size="md"
                aria-label="Nice to have"
                placeholder="Anything that helps but isn't required"
                value={draft.preferred}
                onChange={(preferred) => setDraft({ ...draft, preferred })}
              />
            </div>
            <div className="req-line">
              <span>At least</span>
              <NumberInput
                variant="unstyled"
                aria-label="Minimum years of experience"
                placeholder="any"
                min={0}
                max={60}
                decimalScale={1}
                hideControls
                w={64}
                value={draft.minYears ?? ''}
                onChange={(value) =>
                  setDraft({ ...draft, minYears: value === '' ? null : Number(value) })
                }
              />
              <span>years of experience, based in</span>
              <TextInput
                variant="unstyled"
                aria-label="Location rule"
                placeholder="anywhere"
                w={220}
                value={draft.location}
                onChange={(event) => setDraft({ ...draft, location: event.currentTarget.value })}
              />
            </div>
            <div className="req-edit-actions">
              <Button
                variant="subtle"
                color="gray"
                onClick={() => setDraft(null)}
                disabled={save.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                Confirm
              </Button>
            </div>
          </form>
        ) : confirmed ? (
          <dl className="req-list">
            <ReqRow label="Must have">
              <Chips items={confirmed.required} filled />
            </ReqRow>
            <ReqRow label="Nice to have">
              <Chips items={confirmed.preferred} />
            </ReqRow>
            <ReqRow label="Experience">
              {confirmed.minYears != null ? `${confirmed.minYears}+ years` : 'Not set'}
            </ReqRow>
            <ReqRow label="Location">{confirmed.location || 'Not set'}</ReqRow>
          </dl>
        ) : (
          <div className="panel empty-row">
            <Text size="sm" c="dimmed">
              Nothing set yet, so candidates are ranked by keywords only.
            </Text>
            {actions}
          </div>
        )}
      </Stack>
    </div>
  );
}

function ReqRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="req-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Chips({ items, filled }: { items: string[]; filled?: boolean }) {
  if (items.length === 0) return <Text c="dimmed">None</Text>;
  return (
    <Group gap={6}>
      {items.map((item) => (
        <Badge key={item} variant={filled ? 'light' : 'default'} tt="none" fw={500}>
          {item}
        </Badge>
      ))}
    </Group>
  );
}

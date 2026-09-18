'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  Rating,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconLock } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import type { InterviewCriterion } from '@/types';
import type { ModalProps } from './application-types';

const NONE_OBSERVED = 'None observed';

interface ScorecardDraft {
  rating: number;
  recommendation: string | null;
  evidence: string;
  strengths: string;
  concerns: string;
  values: Record<string, { rating: number; evidence: string }>;
}

const emptyDraft = (): ScorecardDraft => ({
  rating: 0,
  recommendation: null,
  evidence: '',
  strengths: '',
  concerns: '',
  values: {},
});

function readDraft(key: string): ScorecardDraft {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? { ...emptyDraft(), ...JSON.parse(stored) } : emptyDraft();
  } catch {
    return emptyDraft();
  }
}

function isDraftDirty(draft: ScorecardDraft) {
  return Boolean(
    draft.rating ||
    draft.recommendation ||
    draft.evidence.trim() ||
    draft.strengths.trim() ||
    draft.concerns.trim() ||
    Object.keys(draft.values).length,
  );
}

export function ScorecardModal({
  interviewId,
  interviewTitle,
  candidateName,
  criteria,
  opened,
  onClose,
  onSaved,
}: ModalProps & {
  interviewId: string;
  interviewTitle: string;
  candidateName: string;
  criteria: InterviewCriterion[];
}) {
  // A scorecard is long-form prose about someone's career. It must survive Esc,
  // a stray overlay click, and a tab change that unmounts this whole subtree.
  const draftKey = `scorecard-draft:${interviewId}`;
  const [draft, setDraft] = useState<ScorecardDraft>(() => readDraft(draftKey));
  const { rating, recommendation, evidence, strengths, concerns, values } = draft;
  const patch = (next: Partial<ScorecardDraft>) => setDraft((current) => ({ ...current, ...next }));
  const setRating = (value: number) => patch({ rating: value });
  const setRecommendation = (value: string | null) => patch({ recommendation: value });
  const setEvidence = (value: string) => patch({ evidence: value });
  const setStrengths = (value: string) => patch({ strengths: value });
  const setConcerns = (value: string) => patch({ concerns: value });
  const setValues = (updater: (current: ScorecardDraft['values']) => ScorecardDraft['values']) =>
    setDraft((current) => ({ ...current, values: updater(current.values) }));
  const dirty = isDraftDirty(draft);
  const restored = useRef(dirty).current;

  useEffect(() => {
    if (!dirty) {
      window.localStorage.removeItem(draftKey);
      return;
    }
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Storage full or blocked; the in-memory draft still stands for this session.
    }
  }, [draft, dirty, draftKey]);

  const closeWithGuard = () => {
    if (dirty && !window.confirm('Keep this draft? Cancel to discard it and close.')) {
      window.localStorage.removeItem(draftKey);
      setDraft(emptyDraft());
    }
    onClose();
  };

  const complete = criteria.every(
    (criterion) => values[criterion.id]?.rating && values[criterion.id]?.evidence.trim(),
  );
  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/interviews/${interviewId}/scorecards`, {
        rating,
        recommendation,
        evidence,
        strengths,
        concerns,
        criteria: criteria.map((criterion) => ({
          criterionId: criterion.id,
          rating: values[criterion.id]?.rating ?? 0,
          evidence: values[criterion.id]?.evidence ?? '',
        })),
      }),
    onSuccess: () => {
      window.localStorage.removeItem(draftKey);
      setDraft(emptyDraft());
      onSaved();
      onClose();
      notifications.show({
        color: 'teal',
        title: 'Scorecard submitted and locked',
        message: 'Feedback from the rest of the panel is now visible to you.',
      });
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });
  const update = (id: string, next: Partial<{ rating: number; evidence: string }>) =>
    setValues((current) => ({
      ...current,
      [id]: { rating: current[id]?.rating ?? 0, evidence: current[id]?.evidence ?? '', ...next },
    }));
  return (
    <Modal
      opened={opened}
      onClose={closeWithGuard}
      closeOnClickOutside={false}
      title={`Scorecard — ${candidateName} · ${interviewTitle}`}
      size="lg"
    >
      <Stack>
        <Alert
          color="orange"
          icon={<IconLock size={18} />}
          title="This cannot be edited after you submit"
        >
          Your scorecard locks on submission. Feedback from the rest of the panel stays hidden until
          then, so nobody anchors on anyone else.
        </Alert>
        {restored && (
          <Text size="sm" c="dimmed">
            Draft restored from your last visit.
          </Text>
        )}
        {criteria.map((criterion) => (
          <Paper key={criterion.id} withBorder p="md">
            <Group justify="space-between">
              <Text fw={650}>{criterion.name}</Text>
              <Badge variant="default">Weight {criterion.weight}</Badge>
            </Group>
            <Text size="sm" mt="xs">
              {criterion.question}
            </Text>
            {criterion.description && (
              <Text size="xs" c="dimmed">
                Scoring guidance: {criterion.description}
              </Text>
            )}
            <Text size="sm" fw={600} mt="sm" id={`score-${criterion.id}`}>
              Score
            </Text>
            <Rating
              value={values[criterion.id]?.rating ?? 0}
              onChange={(value) => update(criterion.id, { rating: value })}
              aria-labelledby={`score-${criterion.id}`}
            />
            <Textarea
              label="Observed evidence"
              minRows={2}
              mt="sm"
              value={values[criterion.id]?.evidence ?? ''}
              onChange={(event) => update(criterion.id, { evidence: event.currentTarget.value })}
            />
          </Paper>
        ))}
        <Group>
          <div>
            <Text size="sm" fw={600} id="overall-rating-label">
              Overall rating
            </Text>
            <Rating
              value={rating}
              onChange={setRating}
              size="lg"
              aria-labelledby="overall-rating-label"
            />
          </div>
          <Select
            label="Recommendation"
            value={recommendation}
            onChange={setRecommendation}
            data={[
              ['StrongNo', 'Strong no'],
              ['No', 'No'],
              ['Mixed', 'Mixed'],
              ['Yes', 'Yes'],
              ['StrongYes', 'Strong yes'],
            ].map(([value, label]) => ({ value, label }))}
            style={{ flex: 1 }}
          />
        </Group>
        <Textarea
          label="Decision summary"
          minRows={3}
          value={evidence}
          onChange={(event) => setEvidence(event.currentTarget.value)}
        />
        <Textarea
          label="Demonstrated strengths"
          minRows={2}
          value={strengths}
          onChange={(event) => setStrengths(event.currentTarget.value)}
        />
        <Textarea
          label="Risks or concerns"
          minRows={2}
          value={concerns}
          onChange={(event) => setConcerns(event.currentTarget.value)}
        />
        <Checkbox
          label="No risks or concerns observed"
          checked={concerns.trim() === NONE_OBSERVED}
          onChange={(event) => setConcerns(event.currentTarget.checked ? NONE_OBSERVED : '')}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={
              !rating ||
              !recommendation ||
              !evidence.trim() ||
              !strengths.trim() ||
              !concerns.trim() ||
              !complete
            }
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Submit and lock
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

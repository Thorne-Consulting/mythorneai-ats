'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Alert,
  Button,
  Checkbox,
  Fieldset,
  Label,
  Modal,
  RadioGroup,
  Rating,
  Textarea,
  toast,
} from '@/components/ui';
import type { InterviewCriterion } from '@/types';
import type { ModalProps } from './application-types';

const NONE_OBSERVED = 'None observed';

const RECOMMENDATIONS = [
  { value: 'StrongNo', label: 'Strong no' },
  { value: 'No', label: 'No' },
  { value: 'Mixed', label: 'Mixed' },
  { value: 'Yes', label: 'Yes' },
  { value: 'StrongYes', label: 'Strong yes' },
];

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

/**
 * Draft, validation and submit for one interviewer's scorecard. The modal and the Scorecards page
 * share it (and the same local draft), so starting in one and finishing in the other works.
 */
export function useScorecardForm({
  interviewId,
  criteria,
  onSubmitted,
}: {
  interviewId: string;
  criteria: InterviewCriterion[];
  onSubmitted: () => void;
}) {
  // A scorecard is long-form prose about someone's career. It must survive Esc,
  // a stray overlay click, and a tab change that unmounts this whole subtree.
  const draftKey = `scorecard-draft:${interviewId}`;
  const [draft, setDraft] = useState<ScorecardDraft>(() => readDraft(draftKey));
  const patch = (next: Partial<ScorecardDraft>) => setDraft((current) => ({ ...current, ...next }));
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

  const discard = () => {
    window.localStorage.removeItem(draftKey);
    setDraft(emptyDraft());
  };
  const { rating, recommendation, evidence, strengths, concerns, values } = draft;
  const complete = criteria.every(
    (criterion) => values[criterion.id]?.rating && values[criterion.id]?.evidence.trim(),
  );
  const canSubmit = Boolean(
    rating && recommendation && evidence.trim() && strengths.trim() && concerns.trim() && complete,
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
      discard();
      onSubmitted();
      toast.success('Scorecard submitted', 'You can now see the other interviewers’ scorecards.');
    },
    onError: (error: Error) => toast.error('Could not submit the scorecard', error.message),
  });
  const update = (id: string, next: Partial<{ rating: number; evidence: string }>) =>
    setDraft((current) => ({
      ...current,
      values: {
        ...current.values,
        [id]: {
          rating: current.values[id]?.rating ?? 0,
          evidence: current.values[id]?.evidence ?? '',
          ...next,
        },
      },
    }));

  return { draft, patch, update, dirty, restored, discard, canSubmit, mutation, criteria };
}

export type ScorecardForm = ReturnType<typeof useScorecardForm>;

/** The scorecard itself: the lock warning, one block per criterion, then the overall call. */
export function ScorecardFields({ form }: { form: ScorecardForm }) {
  const { draft, patch, update, restored, criteria } = form;
  const { rating, recommendation, evidence, strengths, concerns, values } = draft;
  return (
    <div className="space-y-5">
      <Alert tone="warning" icon={Lock} title="You cannot edit this after you submit">
        Other interviewers’ scorecards stay hidden until you submit yours, so your scores stay your
        own.
      </Alert>
      {restored && <p className="text-sm text-fg-subtle">Draft restored from your last visit.</p>}

      {criteria.map((criterion) => (
        <section
          key={criterion.id}
          className="space-y-3 rounded-lg border border-border-subtle p-4"
        >
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold text-fg">{criterion.name}</h3>
              <span className="text-xs text-fg-subtle tnum">Weight {criterion.weight}</span>
            </div>
            <p className="mt-1 text-sm text-fg">{criterion.question}</p>
            {criterion.description && (
              <p className="mt-0.5 text-xs text-fg-subtle">
                What good looks like: {criterion.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Label>Score</Label>
            <Rating
              label={`Score for ${criterion.name}`}
              value={values[criterion.id]?.rating ?? 0}
              onChange={(value) => update(criterion.id, { rating: value })}
            />
          </div>
          <Textarea
            label="What you saw or heard"
            minRows={2}
            value={values[criterion.id]?.evidence ?? ''}
            onChange={(event) => update(criterion.id, { evidence: event.currentTarget.value })}
          />
        </section>
      ))}

      <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <div className="space-y-1.5">
          <Label>Overall rating</Label>
          <Rating
            label="Overall rating"
            value={rating}
            onChange={(value) => patch({ rating: value })}
          />
        </div>
        <Fieldset legend="Recommendation">
          <RadioGroup
            aria-label="Recommendation"
            orientation="horizontal"
            value={recommendation}
            onValueChange={(value) => patch({ recommendation: value })}
            options={RECOMMENDATIONS}
          />
        </Fieldset>
      </div>
      <Textarea
        label="Decision summary"
        minRows={3}
        value={evidence}
        onChange={(event) => patch({ evidence: event.currentTarget.value })}
      />
      <Textarea
        label="Strengths"
        minRows={2}
        value={strengths}
        onChange={(event) => patch({ strengths: event.currentTarget.value })}
      />
      <Textarea
        label="Concerns"
        minRows={2}
        value={concerns}
        onChange={(event) => patch({ concerns: event.currentTarget.value })}
      />
      <Checkbox
        label="No concerns"
        checked={concerns.trim() === NONE_OBSERVED}
        onCheckedChange={(checked) => patch({ concerns: checked ? NONE_OBSERVED : '' })}
      />
    </div>
  );
}

/** Shortcut from an interview card; the Scorecards tab is the full page. */
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
  const [askKeep, setAskKeep] = useState(false);
  const form = useScorecardForm({
    interviewId,
    criteria,
    onSubmitted: () => {
      onSaved();
      onClose();
    },
  });

  // Closing with work in it asks whether to keep the draft; an empty form just closes.
  const closeWithGuard = () => (form.dirty ? setAskKeep(true) : onClose());
  const discardAndClose = () => {
    form.discard();
    setAskKeep(false);
    onClose();
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={closeWithGuard}
        dismissable={!form.mutation.isPending}
        title={`Scorecard for ${candidateName} · ${interviewTitle}`}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={form.mutation.isPending}>
              Cancel
            </Button>
            <Button
              disabled={!form.canSubmit}
              loading={form.mutation.isPending}
              onClick={() => form.mutation.mutate()}
            >
              Submit scorecard
            </Button>
          </>
        }
      >
        <ScorecardFields form={form} />
      </Modal>
      <Modal
        opened={askKeep}
        onClose={() => setAskKeep(false)}
        size="sm"
        title="Keep this draft?"
        description="Your scorecard is saved on this device until you submit it."
        footer={
          <>
            <Button variant="danger-quiet" onClick={discardAndClose}>
              Discard draft
            </Button>
            <Button
              onClick={() => {
                setAskKeep(false);
                onClose();
              }}
            >
              Keep draft
            </Button>
          </>
        }
      />
    </>
  );
}

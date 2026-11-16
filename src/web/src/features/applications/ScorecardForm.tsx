'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Lock } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Fieldset,
  Label,
  RadioGroup,
  Rating,
  SkeletonRows,
  Textarea,
  toast,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import type { Interview } from './application-types';
import { RECOMMENDATIONS, SCALE } from './scorecard-math';

interface Form {
  recommendation: string | null;
  evidence: string;
  strengths: string;
  concerns: string;
  values: Record<string, { rating: number; evidence: string }>;
}

const empty = (): Form => ({
  recommendation: null,
  evidence: '',
  strengths: '',
  concerns: '',
  values: {},
});

function parse(json: string | undefined): Form {
  try {
    return json ? { ...empty(), ...JSON.parse(json) } : empty();
  } catch {
    return empty();
  }
}

/**
 * One interviewer's scorecard. Your own draft saves to the server as you type, so you can start on
 * a laptop and finish on a phone. A recruiter entering someone else's feedback gets no draft.
 */
export function ScorecardForm({
  applicationId,
  interview,
  onBehalfOf,
  onDone,
}: {
  applicationId: string;
  interview: Interview;
  onBehalfOf?: { email: string; name: string };
  onDone: () => void;
}) {
  const draftKey = ['scorecard-draft', interview.id];
  const draft = useQuery({
    queryKey: draftKey,
    queryFn: () =>
      api.get<{ draft: { json: string; updatedAt: string } | null }>(
        `/api/interviews/${interview.id}/scorecard-draft`,
      ),
    enabled: !onBehalfOf,
    staleTime: Infinity,
  });
  if (!onBehalfOf && draft.isPending)
    return (
      <Card id={`interview-${interview.id}`}>
        <SkeletonRows rows={4} />
      </Card>
    );
  return (
    <FormCard
      applicationId={applicationId}
      interview={interview}
      onBehalfOf={onBehalfOf}
      onDone={onDone}
      initial={parse(draft.data?.draft?.json)}
      savedAt={draft.data?.draft?.updatedAt ?? null}
    />
  );
}

function FormCard({
  applicationId,
  interview,
  onBehalfOf,
  onDone,
  initial,
  savedAt: initialSavedAt,
}: {
  applicationId: string;
  interview: Interview;
  onBehalfOf?: { email: string; name: string };
  onDone: () => void;
  initial: Form;
  savedAt: string | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(initial);
  const [savedAt, setSavedAt] = useState(initialSavedAt);
  const lastSaved = useRef(JSON.stringify(initial));
  const debounced = useDebouncedValue(form, 1200);
  const criteria = interview.criteria;
  const patch = (next: Partial<Form>) => setForm((current) => ({ ...current, ...next }));
  const rate = (id: string, next: Partial<{ rating: number; evidence: string }>) =>
    setForm((current) => ({
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

  const saveDraft = useMutation({
    mutationFn: (json: string) =>
      api.put<{ updatedAt: string }>(`/api/interviews/${interview.id}/scorecard-draft`, { json }),
    onSuccess: (result, json) => {
      lastSaved.current = json;
      setSavedAt(result.updatedAt);
    },
  });
  // Autosave a few seconds after the last change.
  useEffect(() => {
    if (onBehalfOf) return;
    const json = JSON.stringify(debounced);
    if (json !== lastSaved.current && !saveDraft.isPending) saveDraft.mutate(json);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, onBehalfOf]);

  const missing = [
    ...criteria.filter((c) => !form.values[c.id]?.rating).map((c) => `a score for ${c.name}`),
    ...(form.recommendation ? [] : ['your recommendation']),
    ...(form.evidence.trim() ? [] : ['a summary']),
  ];
  const submit = useMutation({
    mutationFn: () =>
      api.post(`/api/interviews/${interview.id}/scorecards`, {
        recommendation: form.recommendation,
        evidence: form.evidence,
        strengths: form.strengths,
        concerns: form.concerns,
        onBehalfOf: onBehalfOf?.email ?? null,
        criteria: criteria.map((criterion) => ({
          criterionId: criterion.id,
          rating: form.values[criterion.id]?.rating ?? 0,
          evidence: form.values[criterion.id]?.evidence ?? '',
        })),
      }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['scorecard-draft', interview.id] });
      queryClient.invalidateQueries({ queryKey: ['my-scorecards'] });
      onDone();
      toast.success(
        'Scorecard submitted',
        onBehalfOf ? undefined : 'You can now see the rest of the panel’s feedback.',
      );
    },
    onError: (error: Error) => toast.error('Could not submit the scorecard', error.message),
  });

  const dirty = JSON.stringify(form) !== lastSaved.current;
  const status = onBehalfOf
    ? null
    : saveDraft.isPending || (dirty && JSON.stringify(debounced) !== lastSaved.current)
      ? 'Saving…'
      : saveDraft.isError
        ? 'Not saved. Check your connection.'
        : savedAt
          ? `Draft saved ${formatDateTime(savedAt)}`
          : null;

  return (
    <Card id={`interview-${interview.id}`} className="scroll-mt-24">
      <CardHeader
        title={
          onBehalfOf
            ? `${onBehalfOf.name}'s scorecard: ${interview.title}`
            : `Your scorecard: ${interview.title}`
        }
        description={`${formatDateTime(interview.startsAt)}${interview.interviewKitName ? ` · ${interview.interviewKitName}` : ''}`}
        action={
          !onBehalfOf && (
            <Button asChild variant="link" size="sm">
              <Link href={`/interviews/${interview.id}?application=${applicationId}`}>
                Open interview prep
              </Link>
            </Button>
          )
        }
      />
      <CardBody className="space-y-5">
        {/* For your own scorecard, the page banner already explains the blind rule. */}
        <Alert tone="warning" icon={Lock} title="You cannot change this after you submit">
          {onBehalfOf &&
            `Enter what ${onBehalfOf.name} sent you. It is saved as theirs, with your name as the person who entered it.`}
        </Alert>

        {criteria.map((criterion) => {
          const value = form.values[criterion.id];
          return (
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
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Label>Score</Label>
                <Rating
                  label={`Score for ${criterion.name}`}
                  value={value?.rating ?? 0}
                  onChange={(rating) => rate(criterion.id, { rating })}
                />
                <span className="text-sm text-fg-muted" aria-live="polite">
                  {value?.rating
                    ? `${value.rating} · ${SCALE[value.rating]}`
                    : '1 Well below · 3 Meets · 5 Well above'}
                </span>
              </div>
              <Textarea
                label="What you saw or heard"
                description="Optional, but it is what the team reads first."
                minRows={2}
                value={value?.evidence ?? ''}
                onChange={(event) => rate(criterion.id, { evidence: event.currentTarget.value })}
              />
            </section>
          );
        })}

        <Fieldset legend="Your recommendation">
          <RadioGroup
            aria-label="Your recommendation"
            orientation="horizontal"
            value={form.recommendation}
            onValueChange={(recommendation) => patch({ recommendation })}
            options={[...RECOMMENDATIONS]}
          />
        </Fieldset>
        <Textarea
          label="Summary"
          description="Why you landed on this recommendation, in a few sentences."
          required
          minRows={3}
          value={form.evidence}
          onChange={(event) => patch({ evidence: event.currentTarget.value })}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <Textarea
            label="Strengths"
            description="Optional."
            minRows={2}
            value={form.strengths}
            onChange={(event) => patch({ strengths: event.currentTarget.value })}
          />
          <Textarea
            label="Concerns"
            description="Optional. Leave it empty if you have none."
            minRows={2}
            value={form.concerns}
            onChange={(event) => patch({ concerns: event.currentTarget.value })}
          />
        </div>
      </CardBody>
      <CardFooter className="flex-wrap">
        <div className="min-w-0 space-y-0.5 text-xs text-fg-subtle" aria-live="polite">
          {status && (
            <p className="inline-flex items-center gap-1">
              {status.startsWith('Draft') && <Check className="size-3.5" aria-hidden />}
              {status}
            </p>
          )}
          {missing.length > 0 && <p>Still needed: {missing.join(', ')}.</p>}
        </div>
        <div className="ml-auto flex gap-2">
          {onBehalfOf && (
            <Button variant="secondary" onClick={onDone}>
              Cancel
            </Button>
          )}
          <Button
            disabled={missing.length > 0}
            loading={submit.isPending}
            onClick={() => submit.mutate()}
          >
            Submit scorecard
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

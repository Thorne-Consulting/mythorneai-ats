'use client';

import { useEffect, useRef, useState } from 'react';
import { Pencil, Sparkles } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Alert, Badge, Button, CardBody, CardHeader, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  parseRequirements,
  type Requirements,
  type RequisitionWithSettings,
} from './requirements-types';

const EMPTY: Requirements = { required: [], preferred: [], minYears: null, location: '' };

const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean);

/**
 * What a job needs, written as a short page: two bullet lists and one line. Editing happens in
 * place, in the same bullets. Enter adds a line, Backspace on an empty line removes it.
 */
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
        required: clean(value.required),
        preferred: clean(value.preferred),
        minYears: value.minYears,
        location: value.location.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['requisition', requisition.id] });
      toast.success('Requirements saved');
      setDraft(null);
      setFromAi(false);
    },
    onError: (error: Error) => toast.error('Could not save the requirements', error.message),
  });

  const edit = () => {
    setFromAi(false);
    setDraft(confirmed ?? EMPTY);
  };

  return (
    <>
      <CardHeader
        title="Requirements"
        action={
          draft && fromAi ? (
            <Badge tone="violet" icon={<Sparkles />}>
              Made by AI. Check before saving.
            </Badge>
          ) : (
            canManage &&
            !draft && (
              <div className="flex items-center gap-2">
                <Button
                  variant="soft"
                  size="sm"
                  leftIcon={<Sparkles />}
                  onClick={() => extract.mutate()}
                  loading={extract.isPending}
                >
                  {extract.isPending ? 'Drafting…' : 'Draft with AI'}
                </Button>
                {confirmed && (
                  <Button variant="secondary" size="sm" leftIcon={<Pencil />} onClick={edit}>
                    Edit
                  </Button>
                )}
              </div>
            )
          )
        }
      />
      <CardBody className="space-y-5">
        {aiError && (
          <Alert tone="danger" title="AI could not write a draft">
            {aiError}
          </Alert>
        )}

        {draft ? (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(draft);
            }}
          >
            <EditGroup
              label="Must have"
              items={draft.required}
              onChange={(required) => setDraft({ ...draft, required })}
              placeholder="Add a must-have"
            />
            <EditGroup
              label="Nice to have"
              items={draft.preferred}
              onChange={(preferred) => setDraft({ ...draft, preferred })}
              placeholder="Add a nice-to-have"
            />
            <p className="flex flex-wrap items-center gap-2 text-base text-fg-muted">
              At least
              <input
                className={inlineInput}
                aria-label="Minimum years of experience"
                inputMode="decimal"
                placeholder="any"
                size={3}
                value={draft.minYears ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value.replace(/[^0-9.]/g, '');
                  setDraft({ ...draft, minYears: value === '' ? null : Number(value) });
                }}
              />
              years of experience, based in
              <input
                className={cn(inlineInput, 'w-48')}
                aria-label="Where candidates must be based"
                placeholder="anywhere"
                value={draft.location}
                onChange={(event) => setDraft({ ...draft, location: event.currentTarget.value })}
              />
            </p>
            <div className="flex items-center gap-2">
              <Button type="submit" size="sm" loading={save.isPending}>
                Save requirements
              </Button>
              <Button
                variant="quiet"
                size="sm"
                onClick={() => setDraft(null)}
                disabled={save.isPending}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : confirmed ? (
          <>
            <ReadGroup label="Must have" items={confirmed.required} />
            <ReadGroup label="Nice to have" items={confirmed.preferred} />
            <p className="text-base text-fg-muted">
              {[
                confirmed.minYears != null
                  ? `At least ${confirmed.minYears} years of experience`
                  : null,
                confirmed.location || null,
              ]
                .filter(Boolean)
                .join(' · ') || 'No minimum experience or location'}
            </p>
          </>
        ) : (
          <p className="text-base text-fg-subtle">
            No requirements yet, so candidates are matched by keywords only.
            {canManage && (
              <>
                {' '}
                Use Draft with AI to write them from the job description, or{' '}
                <Button variant="link" onClick={edit}>
                  write them yourself
                </Button>
                .
              </>
            )}
          </p>
        )}
      </CardBody>
    </>
  );
}

const inlineInput =
  'h-8 w-16 rounded-md border border-input bg-card px-2 text-base text-fg outline-none placeholder:text-fg-subtle focus:border-primary focus:ring-2 focus:ring-primary/15';

function ReadGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-fg">{label}</h3>
      {items.length === 0 ? (
        <p className="text-base text-fg-subtle">None</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5 text-base text-fg marker:text-fg-subtle">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A bullet list you type straight into. The last line is always blank, ready for the next one. */
function EditGroup({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focus, setFocus] = useState<number | null>(null);
  const lines =
    items.length === 0 || items[items.length - 1].trim() !== '' ? [...items, ''] : items;

  // Move the caret once the new line has rendered.
  useEffect(() => {
    if (focus === null) return;
    refs.current[focus]?.focus();
    setFocus(null);
  }, [focus, lines.length]);

  const set = (index: number, value: string) =>
    onChange(lines.map((line, i) => (i === index ? value : line)));

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-fg">{label}</h3>
      <ul className="list-disc space-y-1 pl-5 text-base text-fg marker:text-fg-subtle">
        {lines.map((line, index) => (
          <li key={index}>
            <input
              ref={(node) => {
                refs.current[index] = node;
              }}
              className="w-full rounded-sm bg-transparent py-0.5 text-base text-fg outline-none placeholder:text-fg-subtle focus-visible:bg-accent"
              aria-label={`${label}, line ${index + 1}`}
              placeholder={index === lines.length - 1 ? placeholder : undefined}
              value={line}
              onChange={(event) => set(index, event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (line.trim() === '') return;
                  // The blank line after the last item already exists; only insert mid-list.
                  if (lines[index + 1] !== '') {
                    onChange([...lines.slice(0, index + 1), '', ...lines.slice(index + 1)]);
                  }
                  setFocus(index + 1);
                } else if (event.key === 'Backspace' && line === '' && index > 0) {
                  event.preventDefault();
                  onChange(lines.filter((_, i) => i !== index));
                  setFocus(index - 1);
                }
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

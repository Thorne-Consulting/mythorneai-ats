'use client';

import { useEffect, useRef, useState } from 'react';
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
      notifications.show({ color: 'teal', message: 'Requirements saved' });
      setDraft(null);
      setFromAi(false);
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  const edit = () => {
    setFromAi(false);
    setDraft(confirmed ?? EMPTY);
  };

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
          canManage &&
          !draft && (
            <span className="text-actions">
              <button
                type="button"
                className="text-action"
                onClick={() => extract.mutate()}
                disabled={extract.isPending}
              >
                {extract.isPending ? 'Drafting…' : 'Draft with AI'}
              </button>
              {confirmed && (
                <button type="button" className="text-action" onClick={edit}>
                  Edit
                </button>
              )}
            </span>
          )
        )}
      </div>

      {aiError && (
        <p className="req-error" role="alert">
          The AI draft didn’t run: {aiError}
        </p>
      )}

      {draft ? (
        <form
          className="req-page"
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
          <p className="req-line">
            At least
            <input
              className="req-inline"
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
              className="req-inline req-inline-wide"
              aria-label="Location rule"
              placeholder="anywhere"
              value={draft.location}
              onChange={(event) => setDraft({ ...draft, location: event.currentTarget.value })}
            />
          </p>
          <p className="text-actions req-form-actions">
            <button
              type="submit"
              className="text-action text-action-primary"
              disabled={save.isPending}
            >
              {save.isPending ? 'Saving…' : 'Done'}
            </button>
            <button
              type="button"
              className="text-action"
              onClick={() => setDraft(null)}
              disabled={save.isPending}
            >
              Cancel
            </button>
          </p>
        </form>
      ) : confirmed ? (
        <div className="req-page">
          <ReadGroup label="Must have" items={confirmed.required} />
          <ReadGroup label="Nice to have" items={confirmed.preferred} />
          <p className="req-line req-line-read">
            {[
              confirmed.minYears != null ? `${confirmed.minYears}+ years of experience` : null,
              confirmed.location || null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No experience or location rule'}
          </p>
        </div>
      ) : (
        <p className="req-empty">
          Nothing set yet, so candidates are ranked by keywords only. Let AI draft a list from the
          role description
          {canManage && (
            <>
              , or{' '}
              <button type="button" className="text-action" onClick={edit}>
                write it yourself
              </button>
            </>
          )}
          .
        </p>
      )}
    </div>
  );
}

function ReadGroup({ label, items }: { label: string; items: string[] }) {
  return (
    <section className="req-group">
      <h3 className="req-h">{label}</h3>
      {items.length === 0 ? (
        <p className="req-none">None</p>
      ) : (
        <ul className="req-bullets">
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
    <section className="req-group">
      <h3 className="req-h">{label}</h3>
      <ul className="req-bullets">
        {lines.map((line, index) => (
          <li key={index}>
            <input
              ref={(node) => {
                refs.current[index] = node;
              }}
              className="req-input"
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

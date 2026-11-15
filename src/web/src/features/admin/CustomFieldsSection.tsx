'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  IconButton,
  Input,
  Select,
  TagsInput,
  toast,
} from '@/components/ui';
import { keyFromLabel } from '@/features/candidates/custom-field-key';
import {
  CUSTOM_FIELD_TYPES,
  CustomFieldInput,
  customFieldText,
  hasOptions,
  type CustomFieldDefinition,
  type CustomFieldValue,
} from '@/features/candidates/custom-fields';
import { SettingsLoading, SettingsSection, useDraft } from './settings-shared';

export type { CustomFieldDefinition };

const KEY = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export function CustomFieldsSection() {
  const queryClient = useQueryClient();
  const fields = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api.get<CustomFieldDefinition[]>('/api/custom-fields'),
  });
  if (!fields.data) return <SettingsLoading rows={2} />;
  return (
    <Editor
      source={fields.data}
      onSaved={() => queryClient.invalidateQueries({ queryKey: ['custom-fields'] })}
    />
  );
}

const TYPES = CUSTOM_FIELD_TYPES;
const SAMPLE: Record<CustomFieldDefinition['type'], CustomFieldValue> = {
  text: 'Sample answer',
  number: '30',
  date: '2026-12-01',
  select: '',
  multiselect: [],
  url: 'https://example.com',
};

function Editor({ source, onSaved }: { source: CustomFieldDefinition[]; onSaved: () => void }) {
  const { draft, replace, dirty, reset } = useDraft(source);
  const [removing, setRemoving] = useState<number | null>(null);
  // A saved field's key never changes: stored answers and imports point at it.
  const saved = new Set(source.map((field) => field.key));
  const keys = draft.map((x) => x.key);
  const errors = draft.map((field, index) =>
    !KEY.test(field.key)
      ? 'Use only lowercase letters, numbers, dashes (-) and underscores (_).'
      : keys.indexOf(field.key) !== index
        ? 'Each key must be different.'
        : !field.label.trim()
          ? 'Give this field a label.'
          : hasOptions(field) && field.options.length === 0
            ? 'Add at least one option.'
            : null,
  );
  const valid = errors.every((x) => x === null);
  const save = useMutation({
    mutationFn: () => api.put('/api/admin/custom-fields', { fields: draft }),
    onSuccess: () => {
      onSaved();
      toast.success('Candidate fields saved');
    },
    onError: (error: Error) => toast.error('Could not save fields', error.message),
  });
  const update = (index: number, patch: Partial<CustomFieldDefinition>) =>
    replace(
      draft.map((field, i) => {
        if (i !== index) return field;
        const next = { ...field, ...patch };
        // New fields take their key from the label.
        if (patch.label !== undefined && !saved.has(field.key))
          next.key = keyFromLabel(
            patch.label,
            draft.filter((_, j) => j !== index).map((x) => x.key),
          );
        return next;
      }),
    );
  const add = () => replace([...draft, { key: '', label: '', type: 'text', options: [] }]);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <SettingsSection
        id="candidate-fields"
        title="Extra fields"
        description="Questions you ask every candidate, shown on their record. A field's key is made from its label when you add it and never changes after you save."
        action={
          <Button
            variant="secondary"
            leftIcon={<Plus />}
            disabled={draft.length >= 30}
            onClick={add}
          >
            Add field
          </Button>
        }
        dirty={dirty && valid}
        saving={save.isPending}
        onSave={() => save.mutate()}
        onDiscard={reset}
      >
        {draft.length === 0 ? (
          <EmptyState
            compact
            icon={ListPlus}
            title="No extra fields yet"
            description="Add one if you keep asking candidates the same question."
          />
        ) : (
          <ul className="-my-4 divide-y divide-border-subtle">
            {draft.map((field, index) => (
              <li
                key={index}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_13rem_auto]"
              >
                <Input
                  inset
                  label="Label"
                  value={field.label}
                  onChange={(event) => update(index, { label: event.currentTarget.value })}
                  error={dirty ? (errors[index] ?? undefined) : undefined}
                  className="col-start-1 min-w-0"
                />
                <Input
                  inset
                  label="Key"
                  placeholder="Made from the label"
                  value={field.key}
                  readOnly
                  aria-readonly
                  title={saved.has(field.key) ? 'Saved keys never change.' : undefined}
                  className="col-start-1 min-w-0 sm:col-start-2 [&_input]:text-fg-muted"
                />
                <Select
                  inset
                  label="Type"
                  data={TYPES}
                  value={field.type}
                  onChange={(value) =>
                    update(index, { type: (value ?? 'text') as CustomFieldDefinition['type'] })
                  }
                  className="col-start-1 min-w-0 sm:col-start-3"
                />
                <IconButton
                  variant="danger-quiet"
                  className="col-start-2 row-start-1 mt-2.5 sm:col-start-4"
                  label={`Remove field ${field.label || index + 1}`}
                  onClick={() =>
                    saved.has(field.key)
                      ? setRemoving(index)
                      : replace(draft.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 />
                </IconButton>
                {hasOptions(field) && (
                  <TagsInput
                    label="Options"
                    description="Press Enter after each one."
                    value={field.options}
                    onChange={(value) => update(index, { options: value })}
                    className="col-start-1 min-w-0 sm:col-span-3"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
      <FieldPreview fields={draft} />
      <ConfirmDialog
        opened={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          replace(draft.filter((_, i) => i !== removing));
          setRemoving(null);
        }}
        title={`Remove “${removing !== null ? draft[removing]?.label : ''}”?`}
        message="When you save, every candidate's answer to this field is removed too."
        confirmLabel="Remove field"
      />
    </div>
  );
}

/**
 * Live preview: the candidate's Details rail and the edit form, rendered the way
 * CandidateCustomFields shows them, from the unsaved draft.
 */
function FieldPreview({ fields }: { fields: CustomFieldDefinition[] }) {
  const [values, setValues] = useState<Record<string, CustomFieldValue>>({});
  const shown = fields.filter((field) => field.label.trim());
  const value = (field: CustomFieldDefinition) =>
    values[field.key] ??
    (field.type === 'select'
      ? (field.options[0] ?? '')
      : field.type === 'multiselect'
        ? field.options.slice(0, 2)
        : SAMPLE[field.type]);
  const set = (key: string, next: CustomFieldValue) =>
    setValues((current) => ({ ...current, [key]: next }));
  return (
    <Card className="xl:sticky xl:top-[101px]">
      <CardHeader
        title="Preview"
        description="How these fields look on a candidate. Try them out. Nothing here is saved."
      />
      <div className="flex flex-col gap-5 border-t border-border-subtle px-5 py-5">
        {shown.length === 0 ? (
          <p className="text-sm text-fg-subtle">Give a field a label to see it here.</p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-semibold tracking-[0.06em] text-fg-subtle uppercase">
                Details
              </p>
              <DescriptionList
                items={shown.map((field) => ({
                  label: field.label,
                  value: customFieldText(field, value(field)) || '—',
                }))}
              />
            </div>
            <div className="flex flex-col gap-4 rounded-lg bg-muted p-3">
              <p className="text-xs text-fg-subtle">When someone edits them</p>
              {shown.map((field, index) => (
                <CustomFieldInput
                  key={index}
                  field={field}
                  value={value(field)}
                  onChange={(next) => set(field.key, next)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

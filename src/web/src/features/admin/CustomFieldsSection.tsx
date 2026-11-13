'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListPlus, Plus, Trash2 } from 'lucide-react';
import { api } from '@/api';
import {
  Button,
  Card,
  CardHeader,
  DescriptionList,
  EmptyState,
  IconButton,
  Input,
  NumberInput,
  Select,
  TagsInput,
  toast,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import { SettingsLoading, SettingsSection, useDraft } from './settings-shared';

export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options: string[];
}

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

const TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Pick one from a list' },
];
const SAMPLE: Record<CustomFieldDefinition['type'], string> = {
  text: 'Sample answer',
  number: '30',
  date: '2026-12-01',
  select: '',
};

function Editor({ source, onSaved }: { source: CustomFieldDefinition[]; onSaved: () => void }) {
  const { draft, replace, dirty, reset } = useDraft(source);
  const keys = draft.map((x) => x.key);
  const errors = draft.map((field, index) =>
    !KEY.test(field.key)
      ? 'Use only lowercase letters, numbers, dashes (-) and underscores (_).'
      : keys.indexOf(field.key) !== index
        ? 'Each key must be different.'
        : !field.label.trim()
          ? 'Give this field a label.'
          : field.type === 'select' && field.options.length === 0
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
    replace(draft.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const add = () => replace([...draft, { key: '', label: '', type: 'text', options: [] }]);

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <SettingsSection
        id="candidate-fields"
        title="Extra fields"
        description="The key is a short name that never changes. We use it when you import or export candidates."
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
              <li key={index} className="flex flex-wrap items-start gap-3 py-4">
                <Input
                  inset
                  label="Label"
                  value={field.label}
                  onChange={(event) => update(index, { label: event.currentTarget.value })}
                  className="min-w-40 flex-1"
                />
                <Input
                  inset
                  label="Key"
                  placeholder="notice-period"
                  value={field.key}
                  onChange={(event) => update(index, { key: event.currentTarget.value })}
                  error={dirty ? (errors[index] ?? undefined) : undefined}
                  className="min-w-40 flex-1"
                />
                <Select
                  inset
                  label="Type"
                  data={TYPES}
                  value={field.type}
                  onChange={(value) =>
                    update(index, { type: (value ?? 'text') as CustomFieldDefinition['type'] })
                  }
                  className="w-full sm:w-52"
                />
                {field.type === 'select' && (
                  <TagsInput
                    label="Options"
                    description="Press Enter after each one."
                    value={field.options}
                    onChange={(value) => update(index, { options: value })}
                    className="min-w-52 flex-1"
                  />
                )}
                <IconButton
                  variant="danger-quiet"
                  className="mt-2.5"
                  label={`Remove field ${field.label || index + 1}`}
                  onClick={() => replace(draft.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
      <FieldPreview fields={draft} />
    </div>
  );
}

/**
 * Live preview: the candidate's Details rail and the edit form, rendered the way
 * CandidateCustomFields shows them, from the unsaved draft.
 */
function FieldPreview({ fields }: { fields: CustomFieldDefinition[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const shown = fields.filter((field) => field.label.trim());
  const value = (field: CustomFieldDefinition) =>
    values[field.key] ?? (field.type === 'select' ? (field.options[0] ?? '') : SAMPLE[field.type]);
  const set = (key: string, next: string) => setValues((current) => ({ ...current, [key]: next }));
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
                items={shown.map((field) => {
                  const v = value(field);
                  return {
                    label: field.label,
                    value: !v ? '—' : field.type === 'date' ? formatDate(v) : v,
                  };
                })}
              />
            </div>
            <div className="flex flex-col gap-4 rounded-lg bg-muted p-3">
              <p className="text-xs text-fg-subtle">When someone edits them</p>
              {shown.map((field, index) =>
                field.type === 'select' ? (
                  <Select
                    key={index}
                    label={field.label}
                    clearable
                    data={field.options}
                    value={value(field) || null}
                    onChange={(next) => set(field.key, next ?? '')}
                  />
                ) : field.type === 'number' ? (
                  <NumberInput
                    key={index}
                    label={field.label}
                    value={value(field) === '' ? '' : Number(value(field))}
                    onValueChange={(next) => set(field.key, next === '' ? '' : String(next))}
                  />
                ) : (
                  <Input
                    key={index}
                    type={field.type === 'date' ? 'date' : 'text'}
                    label={field.label}
                    value={value(field)}
                    onChange={(event) => set(field.key, event.currentTarget.value)}
                  />
                ),
              )}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

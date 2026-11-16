'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { Input, MultiSelect, NumberInput, Select } from '@/components/ui';
import { formatDate } from '@/lib/format';

/** GET /api/custom-fields */
export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'url';
  options: string[];
}
/** A stored answer: text, or a list for pick-many fields. */
export type CustomFieldValue = string | string[];

export const CUSTOM_FIELD_TYPES: { value: CustomFieldDefinition['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Pick one from a list' },
  { value: 'multiselect', label: 'Pick many from a list' },
  { value: 'url', label: 'Link' },
];

/** Fields with a list of options, which can filter the candidate list. */
export const hasOptions = (field: Pick<CustomFieldDefinition, 'type'>) =>
  field.type === 'select' || field.type === 'multiselect';

export function useCustomFields(enabled = true) {
  return useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api.get<CustomFieldDefinition[]>('/api/custom-fields'),
    enabled,
    staleTime: 60_000,
  });
}

/** The answers in a candidate's stored JSON. */
export function parseCustomValues(json?: string | null): Record<string, CustomFieldValue> {
  try {
    const parsed = json ? JSON.parse(json) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const isEmptyValue = (value?: CustomFieldValue) =>
  value === undefined || (Array.isArray(value) ? value.length === 0 : !value.trim());

/** An answer as text: a date in words, pick-many as "Sales, Support". */
export function customFieldText(field: CustomFieldDefinition, value?: CustomFieldValue) {
  if (isEmptyValue(value)) return '';
  if (Array.isArray(value)) return value.join(', ');
  return field.type === 'date' ? formatDate(value) : value!;
}

/** The right control for a field's type. */
export function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDefinition;
  value?: CustomFieldValue;
  onChange: (value: CustomFieldValue) => void;
}) {
  const text = Array.isArray(value) ? value.join('; ') : (value ?? '');
  if (field.type === 'select')
    return (
      <Select
        label={field.label}
        clearable
        data={field.options}
        value={text || null}
        onChange={(next) => onChange(next ?? '')}
      />
    );
  if (field.type === 'multiselect')
    return (
      <MultiSelect
        label={field.label}
        data={field.options}
        value={Array.isArray(value) ? value : text ? [text] : []}
        onChange={onChange}
      />
    );
  if (field.type === 'number')
    return (
      <NumberInput
        label={field.label}
        value={text === '' ? '' : Number(text)}
        onValueChange={(next) => onChange(next === '' ? '' : String(next))}
      />
    );
  return (
    <Input
      type={field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
      label={field.label}
      placeholder={field.type === 'url' ? 'https://' : undefined}
      value={text}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}

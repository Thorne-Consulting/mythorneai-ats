'use client';

import { useState } from 'react';
import { MailX } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Alert,
  Button,
  DescriptionList,
  Input,
  Modal,
  NumberInput,
  Select,
  toast,
} from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { CandidateDetail } from '@/types';
import { Missing, RailGroup } from './Rail';

/** Fields the API returns that the shared CandidateDetail type doesn't list yet. */
export type CandidateExtras = { customFieldsJson?: string | null; emailBounced?: boolean };

interface Definition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options: string[];
}

function parseValues(json?: string | null): Record<string, string> {
  try {
    const parsed = json ? JSON.parse(json) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function EmailBouncedAlert() {
  return (
    <Alert tone="warning" icon={MailX} title="Email bounced">
      Emails to this address bounced, so we’ve stopped sending. Check the address.
    </Alert>
  );
}

export function CandidateCustomFields({
  candidate,
  canEdit,
}: {
  candidate: CandidateDetail & CandidateExtras;
  canEdit: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const queryClient = useQueryClient();
  const definitions = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => api.get<Definition[]>('/api/custom-fields'),
  });
  const values = parseValues(candidate.customFieldsJson);
  const save = useMutation({
    mutationFn: () => api.put(`/api/candidates/${candidate.id}/custom-fields`, { values: draft }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      toast.success('Details saved');
      setOpened(false);
    },
    onError: (error: Error) => toast.error('Could not save', error.message),
  });
  const fields = definitions.data ?? [];
  if (fields.length === 0) return null;
  const show = (field: Definition) => {
    const value = values[field.key];
    if (!value) return <Missing />;
    return field.type === 'date' ? formatDate(value) : value;
  };
  const edit = () => {
    setDraft(Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ''])));
    setOpened(true);
  };
  const set = (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <>
      <RailGroup
        title="Details"
        action={
          canEdit && (
            <Button variant="link" size="sm" onClick={edit}>
              Edit
            </Button>
          )
        }
      >
        <DescriptionList
          items={fields.map((field) => ({ label: field.label, value: show(field) }))}
        />
      </RailGroup>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Edit details"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpened(false)}>
              Cancel
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save details
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {fields.map((field) =>
            field.type === 'select' ? (
              <Select
                key={field.key}
                label={field.label}
                clearable
                data={field.options}
                value={draft[field.key] || null}
                onChange={(value) => set(field.key, value ?? '')}
              />
            ) : field.type === 'number' ? (
              <NumberInput
                key={field.key}
                label={field.label}
                value={
                  draft[field.key] === '' || draft[field.key] === undefined
                    ? ''
                    : Number(draft[field.key])
                }
                onValueChange={(value) => set(field.key, value === '' ? '' : String(value))}
              />
            ) : (
              <Input
                key={field.key}
                type={field.type === 'date' ? 'date' : 'text'}
                label={field.label}
                value={draft[field.key] ?? ''}
                onChange={(event) => set(field.key, event.currentTarget.value)}
              />
            ),
          )}
        </div>
      </Modal>
    </>
  );
}

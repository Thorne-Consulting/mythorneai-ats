'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { Button, DescriptionList, Modal, toast } from '@/components/ui';
import { safeWebUrl } from '@/lib/safe-url';
import type { CandidateDetail } from '@/types';
import {
  CustomFieldInput,
  customFieldText,
  isEmptyValue,
  parseCustomValues,
  useCustomFields,
  type CustomFieldValue,
} from './custom-fields';
import { RailGroup } from './Rail';

export function CandidateCustomFields({
  candidate,
  canEdit,
}: {
  candidate: CandidateDetail;
  canEdit: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const [draft, setDraft] = useState<Record<string, CustomFieldValue>>({});
  const queryClient = useQueryClient();
  const definitions = useCustomFields();
  const values = parseCustomValues(candidate.customFieldsJson);
  const save = useMutation({
    mutationFn: () => api.put(`/api/candidates/${candidate.id}/custom-fields`, { values: draft }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      toast.success('Details saved');
      setOpened(false);
    },
    onError: (error: Error) => toast.error('Could not save the details', error.message),
  });
  const fields = definitions.data ?? [];
  // Only filled-in fields show; empty ones wait behind "Add details".
  const filled = fields.filter((field) => !isEmptyValue(values[field.key]));
  if (fields.length === 0 || (filled.length === 0 && !canEdit)) return null;
  const edit = () => {
    setDraft(Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ''])));
    setOpened(true);
  };
  const set = (key: string, value: CustomFieldValue) =>
    setDraft((current) => ({ ...current, [key]: value }));

  return (
    <>
      <RailGroup
        title="Details"
        action={
          canEdit &&
          filled.length > 0 && (
            <Button variant="link" size="sm" onClick={edit}>
              Edit
            </Button>
          )
        }
      >
        {filled.length > 0 ? (
          <DescriptionList
            items={filled.map((field) => ({
              label: field.label,
              value:
                field.type === 'url' && safeWebUrl(String(values[field.key])) ? (
                  <a
                    href={safeWebUrl(String(values[field.key]))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-accent-foreground hover:underline"
                  >
                    {customFieldText(field, values[field.key])}
                  </a>
                ) : (
                  customFieldText(field, values[field.key])
                ),
            }))}
          />
        ) : (
          <Button variant="link" size="sm" onClick={edit}>
            Add details
          </Button>
        )}
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
          {fields.map((field) => (
            <CustomFieldInput
              key={field.key}
              field={field}
              value={draft[field.key]}
              onChange={(value) => set(field.key, value)}
            />
          ))}
        </div>
      </Modal>
    </>
  );
}

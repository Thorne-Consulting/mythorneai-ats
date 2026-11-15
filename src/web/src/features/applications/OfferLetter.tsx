'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { Alert, Badge, Card, ConfirmDialog, Select, Skeleton } from '@/components/ui';
import { LetterPaper } from '@/features/offer-letters/LetterPaper';
import { letterChips, useOfferLetters } from '@/features/offer-letters/offer-letters-data';
import { InsertDetailMenu } from '@/features/templates/editor-tools';
import { useDebouncedValue } from '@/lib/hooks';

export type LetterDraft = { markdown: string; templateId: string | null };

/**
 * This candidate's letter: start from a template in Settings, then change anything for them.
 * Details such as Salary stay as chips and fill in from the terms when the offer is sent.
 */
export function LetterEditor({
  value,
  onChange,
}: {
  value: LetterDraft;
  onChange: (next: LetterDraft) => void;
}) {
  const library = useOfferLetters();
  const [editorKey, setEditorKey] = useState(0);
  const [replacing, setReplacing] = useState<string | null>(null);
  const letters = library.data?.letters ?? [];
  const chips = letterChips(library.data?.details);
  const template = letters.find((l) => l.id === value.templateId);
  const edited = template && template.body.trim() !== value.markdown.trim();
  const use = (id: string) => {
    const next = letters.find((l) => l.id === id);
    if (!next) return;
    onChange({ markdown: next.body, templateId: next.id });
    setEditorKey((key) => key + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Start from"
          className="min-w-0 flex-1 basis-60"
          placeholder="Choose a letter"
          value={value.templateId}
          onChange={(id) => {
            if (!id || id === value.templateId) return;
            // Switching letters replaces what is written, so ask when it was changed by hand.
            if (edited || (!template && value.markdown.trim())) setReplacing(id);
            else use(id);
          }}
          data={letters.map((l) => ({ value: l.id, label: l.name }))}
        />
        {edited && <Badge tone="blue">Changed for this offer</Badge>}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-fg">Letter</p>
        <PlateMarkdownEditor
          key={editorKey}
          value={value.markdown}
          onChange={(markdown) => onChange({ ...value, markdown })}
          chips={{ details: chips }}
          placeholder="Write the letter. Type { to add a detail such as Salary."
          header={<InsertDetailMenu chips={chips} />}
        />
        <p className="mt-1.5 text-xs text-fg-subtle">
          Changes here are for this offer only. To change the letter every offer starts from, edit
          it in{' '}
          <Link href="/settings/offer-letters" className="text-accent-foreground hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>
      <ConfirmDialog
        opened={!!replacing}
        onClose={() => setReplacing(null)}
        title="Replace this letter?"
        message="Your changes to this offer’s letter are replaced by the letter you chose."
        confirmLabel="Replace letter"
        onConfirm={() => {
          if (replacing) use(replacing);
          setReplacing(null);
        }}
      />
    </div>
  );
}

/**
 * The letter as the candidate will read it, filled in from this offer, with the details it still
 * needs. Once sent, it shows the frozen copy.
 */
export function LetterPreview({ offerId, markdown }: { offerId: string; markdown?: string }) {
  const debounced = useDebouncedValue(markdown, 400);
  const preview = useQuery({
    queryKey: ['offer-letter-preview', offerId, debounced ?? null],
    queryFn: () =>
      api.post<{ markdown: string; missing: { key: string; label: string }[] }>(
        `/api/offers/${offerId}/letter/preview`,
        { markdown: debounced ?? null },
      ),
    placeholderData: (previous) => previous,
  });
  if (!preview.data)
    return (
      <Card className="space-y-3 p-8">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </Card>
    );
  const { missing } = preview.data;
  return (
    <div className="space-y-3">
      {missing.length > 0 && (
        <Alert tone="warning" title="The letter needs details this offer does not have">
          {missing.map((m) => m.label).join(', ')}. Add them to the terms, or take them out of the
          letter. The offer cannot be sent until then.
        </Alert>
      )}
      <LetterPaper markdown={preview.data.markdown} />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { Button, Checkbox, Modal, SearchSelect, SkeletonRows } from '@/components/ui';
import { useAssessment, useLibrary } from './api';
import {
  allQuestions,
  copyQuestion,
  plural,
  promptLine,
  questionTypeLabels,
  type Question,
} from './scoring';

/** Pick questions from another assessment; they are copied with new ids (no shared question bank). */
export function CopyQuestionsModal({
  opened,
  onClose,
  excludeId,
  onCopy,
}: {
  opened: boolean;
  onClose: () => void;
  excludeId?: string;
  onCopy: (questions: Question[]) => void;
}) {
  const library = useLibrary();
  const [source, setSource] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const detail = useAssessment(source ?? undefined);
  const questions = detail.data ? allQuestions(detail.data.published ?? detail.data.content) : [];
  const close = () => {
    setSource(null);
    setPicked([]);
    onClose();
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Copy questions"
      description="The copies are yours to change. The other assessment stays as it is."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={picked.length === 0}
            onClick={() => {
              onCopy(questions.filter((q) => picked.includes(q.id)).map(copyQuestion));
              close();
            }}
          >
            {picked.length ? `Copy ${plural(picked.length, 'question')}` : 'Copy questions'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SearchSelect
          label="From"
          placeholder="Search assessments"
          value={source}
          onChange={(v) => {
            setSource(v);
            setPicked([]);
          }}
          data={(library.data ?? [])
            .filter((a) => a.id !== excludeId && a.kind === 'Native' && a.questions > 0)
            .map((a) => ({ value: a.id, label: a.name }))}
        />
        {source &&
          (detail.isPending ? (
            <SkeletonRows rows={4} />
          ) : (
            <div className="flex flex-col gap-1">
              <Checkbox
                label="Select all"
                checked={
                  picked.length === questions.length
                    ? true
                    : picked.length
                      ? 'indeterminate'
                      : false
                }
                onCheckedChange={(on) => setPicked(on ? questions.map((q) => q.id) : [])}
                className="mb-1"
              />
              <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {questions.map((q, i) => (
                  <li key={q.id} className="px-3 py-2.5">
                    <Checkbox
                      checked={picked.includes(q.id)}
                      onCheckedChange={(on) =>
                        setPicked((p) => (on ? [...p, q.id] : p.filter((x) => x !== q.id)))
                      }
                      label={`${i + 1}. ${promptLine(q.prompt) || 'No question text'}`}
                      description={`${questionTypeLabels[q.type]} · ${plural(q.points, 'point')}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    </Modal>
  );
}

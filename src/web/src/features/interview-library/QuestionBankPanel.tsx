'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Library, Plus } from 'lucide-react';
import { canManageWorkspace, useAbility } from '@/lib/ability';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  FilterSelect,
  SearchInput,
  SkeletonRows,
} from '@/components/ui';
import { useBankQuestions } from './library-data';
import { searchQuestions, tagsOf, type BankQuestion } from './library-model';

/** A side panel to find saved competencies and add them to the kit being edited. */
export function QuestionBankPanel({
  opened,
  onClose,
  onInsert,
  namesInKit,
}: {
  opened: boolean;
  onClose: () => void;
  onInsert: (question: BankQuestion) => void;
  /** Lower-case names already in the kit, so a competency is not added twice. */
  namesInKit: Set<string>;
}) {
  const ability = useAbility();
  const questions = useBankQuestions();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const all = questions.data ?? [];
  const found = searchQuestions(all, query, tag);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      size="lg"
      title="Question bank"
      description="Saved competencies with their questions. Add one to this kit, then change it here if you need to."
      footer={
        // Settings are for admins; recruiters add to the bank from a kit's competency menu.
        canManageWorkspace(ability) ? (
          <Button asChild variant="quiet" className="mr-auto">
            <Link href="/settings/interview-library/questions">Manage the question bank</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search competencies and questions"
          className="flex-1"
          autoFocus
        />
        <FilterSelect
          value={tag}
          onChange={setTag}
          data={tagsOf(all)}
          allLabel="All tags"
          aria-label="Filter by tag"
        />
      </div>
      {questions.isPending ? (
        <SkeletonRows rows={4} className="mt-4" />
      ) : found.length === 0 ? (
        <EmptyState
          compact
          icon={Library}
          className="mt-4"
          title={all.length ? 'No questions match' : 'The question bank is empty'}
          description={
            all.length
              ? 'Try fewer words or another tag.'
              : 'Save a competency from any kit with its menu, and it shows up here.'
          }
        />
      ) : (
        <ul className="mt-4 divide-y divide-border-subtle">
          {found.map((item) => {
            const added = namesInKit.has(item.name.trim().toLowerCase());
            return (
              <li key={item.id} className="flex items-start gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-fg">{item.name}</p>
                  <p className="mt-1 text-sm text-fg-muted">{item.question}</p>
                  {item.goodLooksLike && (
                    <p className="mt-1 text-sm text-fg-subtle">Good answer: {item.goodLooksLike}</p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge size="sm">Weight {item.weight}</Badge>
                    {item.tags.map((name) => (
                      <Badge key={name} size="sm" tone="blue">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={added ? 'quiet' : 'secondary'}
                  disabled={added}
                  leftIcon={added ? <Check /> : <Plus />}
                  onClick={() => onInsert(item)}
                  aria-label={added ? `${item.name} is in this kit` : `Add ${item.name}`}
                >
                  {added ? 'In this kit' : 'Add'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}

'use client';

import { useState } from 'react';
import { Archive, ArchiveRestore, Library, Pencil, Plus } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterSelect,
  Input,
  MenuItem,
  Modal,
  RowActions,
  SearchInput,
  SegmentedControl,
  Select,
  SkeletonRows,
  TagsInput,
  Textarea,
} from '@/components/ui';
import { SettingsHeader } from '@/features/admin/SettingsShell';
import {
  useArchiveLibraryItem,
  useBankQuestions,
  useSaveQuestion,
  type QuestionBody,
} from './library-data';
import { searchQuestions, tagsOf, type BankQuestion } from './library-model';

const WEIGHTS = ['1', '2', '3', '4', '5'];

/** Settings › Interview library › Question bank: competencies and questions any kit can reuse. */
export function QuestionBank() {
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<BankQuestion | 'new' | null>(null);
  const questions = useBankQuestions(view === 'archived');
  const archive = useArchiveLibraryItem('questions');
  const all = questions.data ?? [];
  const found = searchQuestions(all, query, tag);

  return (
    <>
      <SettingsHeader
        actions={
          <Button leftIcon={<Plus />} onClick={() => setEditing('new')}>
            Add question
          </Button>
        }
      />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search competencies and questions"
            className="sm:max-w-sm sm:flex-1"
          />
          <FilterSelect
            value={tag}
            onChange={setTag}
            data={tagsOf(all)}
            allLabel="All tags"
            aria-label="Filter by tag"
          />
          <SegmentedControl
            size="sm"
            aria-label="Show"
            className="sm:ml-auto"
            value={view}
            onValueChange={(value) => setView(value as 'active' | 'archived')}
            items={[
              { value: 'active', label: 'In use' },
              { value: 'archived', label: 'Archived' },
            ]}
          />
        </div>
        {questions.isPending ? (
          <SkeletonRows rows={5} className="px-5 pb-5" />
        ) : found.length === 0 ? (
          <EmptyState
            compact
            icon={Library}
            title={
              all.length
                ? 'No questions match'
                : view === 'archived'
                  ? 'No archived questions'
                  : 'No questions yet'
            }
            description={
              all.length
                ? 'Try fewer words or another tag.'
                : view === 'archived'
                  ? 'Questions you archive show here, and you can restore them.'
                  : 'Add one here, or use "Save to question bank" on a competency in any kit.'
            }
          />
        ) : (
          <ul className="border-t border-border-subtle">
            {found.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-4 border-b border-border-subtle px-5 py-4 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-medium text-fg">{item.name}</p>
                  <p className="mt-1 text-sm text-fg-muted">{item.question}</p>
                  {item.followUps && (
                    <p className="mt-1 text-sm text-fg-subtle">Follow-ups: {item.followUps}</p>
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
                <RowActions label={`Actions for ${item.name}`}>
                  <MenuItem icon={<Pencil />} onSelect={() => setEditing(item)}>
                    Edit
                  </MenuItem>
                  <MenuItem
                    icon={view === 'archived' ? <ArchiveRestore /> : <Archive />}
                    onSelect={() => archive.mutate({ id: item.id, archive: view !== 'archived' })}
                  >
                    {view === 'archived' ? 'Restore' : 'Archive'}
                  </MenuItem>
                </RowActions>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <QuestionModal
          key={editing === 'new' ? 'new' : editing.id}
          question={editing === 'new' ? undefined : editing}
          tags={tagsOf(all)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function QuestionModal({
  question,
  tags,
  onClose,
}: {
  question?: BankQuestion;
  tags: string[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<QuestionBody>({
    name: question?.name ?? '',
    question: question?.question ?? '',
    followUps: question?.followUps ?? '',
    goodLooksLike: question?.goodLooksLike ?? '',
    weight: question?.weight ?? 3,
    tags: question?.tags ?? [],
  });
  const [tried, setTried] = useState(false);
  const save = useSaveQuestion(question?.id);
  const set = (patch: Partial<QuestionBody>) => setForm((current) => ({ ...current, ...patch }));
  const nameError = !form.name.trim() ? 'Name the competency' : undefined;
  const questionError = !form.question.trim() ? 'Write the question to ask' : undefined;

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      title={question ? 'Edit question' : 'Add question'}
      description="Kits that already use this question keep their own copy."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => {
              setTried(true);
              if (!nameError && !questionError) save.mutate(form, { onSuccess: onClose });
            }}
          >
            {question ? 'Save changes' : 'Add question'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <Input
            label="Competency"
            placeholder="For example Problem solving"
            value={form.name}
            maxLength={120}
            onChange={(event) => set({ name: event.currentTarget.value })}
            error={tried ? nameError : undefined}
          />
          <Select
            label="Weight"
            data={WEIGHTS}
            value={String(form.weight)}
            onChange={(value) => value && set({ weight: Number(value) })}
          />
        </div>
        <Textarea
          label="Question to ask"
          minRows={2}
          maxLength={1000}
          value={form.question}
          onChange={(event) => set({ question: event.currentTarget.value })}
          error={tried ? questionError : undefined}
        />
        <Textarea
          label="Follow-ups"
          description="Optional. Prompts to get specifics."
          minRows={2}
          maxLength={2000}
          value={form.followUps}
          onChange={(event) => set({ followUps: event.currentTarget.value })}
        />
        <Textarea
          label="What a good answer shows"
          description="Optional. What interviewers listen for."
          minRows={2}
          maxLength={2000}
          value={form.goodLooksLike}
          onChange={(event) => set({ goodLooksLike: event.currentTarget.value })}
        />
        <TagsInput
          label="Tags"
          description="For finding it later, for example Leadership or Technical."
          data={tags}
          value={form.tags}
          onChange={(value) => set({ tags: value })}
        />
      </div>
    </Modal>
  );
}

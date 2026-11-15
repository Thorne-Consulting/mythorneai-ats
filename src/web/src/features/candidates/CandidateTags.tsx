'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Badge,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  TagsInput,
  toast,
} from '@/components/ui';
import type { CandidateDetail } from '@/types';
import { useTagOptions } from './candidate-actions';

/** A person's tags in the record header: remove with ×, add from the tags already in use. */
export function CandidateTags({
  candidateId,
  tags,
  canEdit,
}: {
  candidateId: string;
  tags: string[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(tags);
  const options = useTagOptions(open);
  const save = useMutation({
    mutationFn: (next: string[]) =>
      api.patch<{ tags: string[] }>(`/api/candidates/${candidateId}/tags`, { tags: next }),
    // Show the change straight away; put it back if the save fails.
    onMutate: async (next) => {
      const key = ['candidate', candidateId];
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<CandidateDetail>(key);
      if (before) queryClient.setQueryData(key, { ...before, tags: next });
      return { before };
    },
    onError: (error: Error, _next, context) => {
      if (context?.before) queryClient.setQueryData(['candidate', candidateId], context.before);
      toast.error('Could not save the tags', error.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidateId] });
      queryClient.invalidateQueries({ queryKey: ['candidate-tags'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
    },
  });
  const same = (a: string[], b: string[]) => [...a].sort().join() === [...b].sort().join();

  if (!canEdit && tags.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge key={tag} size="sm" className={canEdit ? 'pr-1' : undefined}>
          {tag}
          {canEdit && (
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => save.mutate(tags.filter((item) => item !== tag))}
              className="ml-0.5 rounded-full p-0.5 hover:bg-secondary hover:text-fg"
            >
              <X className="size-3" />
            </button>
          )}
        </Badge>
      ))}
      {canEdit && (
        <Popover
          open={open}
          onOpenChange={(next) => {
            if (next) setDraft(tags);
            else if (!same(draft, tags)) save.mutate(draft);
            setOpen(next);
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="quiet" size="xs" leftIcon={<Plus />}>
              {tags.length ? 'Tag' : 'Add a tag'}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72">
            <TagsInput
              label="Tags"
              description="Press Enter after each one. We save when you close this."
              placeholder="For example, silver-medalist"
              data={options.data?.map((item) => item.tag) ?? []}
              value={draft}
              onChange={(value) => setDraft(value.map((tag) => tag.trim().toLowerCase()))}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

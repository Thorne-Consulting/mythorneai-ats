'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { toast } from '@/components/ui';
import type { BankQuestion, KitTemplate, TemplateBody } from './library-model';

export function useKitTemplates(archived = false, enabled = true) {
  return useQuery({
    queryKey: ['interview-library', 'templates', archived],
    queryFn: () =>
      api.get<KitTemplate[]>(`/api/interview-library/templates${archived ? '?archived=true' : ''}`),
    enabled,
  });
}

export function useBankQuestions(archived = false) {
  return useQuery({
    queryKey: ['interview-library', 'questions', archived],
    queryFn: () =>
      api.get<BankQuestion[]>(
        `/api/interview-library/questions${archived ? '?archived=true' : ''}`,
      ),
  });
}

/** Refreshes every library list after a change. */
export function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['interview-library'] });
}

export type QuestionBody = Omit<BankQuestion, 'id' | 'updatedAt' | 'archivedAt'>;

/** Adds a competency to the question bank (from the library page or a kit's competency menu). */
export function useSaveQuestion(id?: string) {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: QuestionBody) =>
      id
        ? api.put(`/api/interview-library/questions/${id}`, body)
        : api.post(`/api/interview-library/questions`, body),
    onSuccess: () => {
      invalidate();
      toast.success(id ? 'Question saved' : 'Added to the question bank');
    },
    onError: (error: Error) => toast.error('Could not save the question', error.message),
  });
}

export function useSaveTemplate(id?: string) {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (body: TemplateBody) =>
      id
        ? api.put<KitTemplate>(`/api/interview-library/templates/${id}`, body)
        : api.post<KitTemplate>(`/api/interview-library/templates`, body),
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error('Could not save the template', error.message),
  });
}

/** Archive or restore a template or a question. */
export function useArchiveLibraryItem(kind: 'templates' | 'questions') {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ id, archive }: { id: string; archive: boolean }) =>
      api.post(`/api/interview-library/${kind}/${id}/${archive ? 'archive' : 'restore'}`),
    onSuccess: (_, { archive }) => {
      invalidate();
      toast.success(archive ? 'Archived' : 'Restored');
    },
    onError: (error: Error) => toast.error('Could not change it', error.message),
  });
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/api';
import { Button, Card, CardHeader, Input, toast } from '@/components/ui';
import { PlateMarkdownEditor } from '@/components/editor/PlateMarkdownEditor';
import { markdownSections } from '@/lib/markdown-sections';

const starterDocument = `# Company header

Introduce the company and why this role matters.

# Role description

Describe what this person will own.

# Benefits and principles

What should candidates know about working here?

# Application questions

Add any default questions for applicants.

# Interview stages

Describe the usual interview process.`;

export function PostingTemplateEditor() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [content, setContent] = useState(starterDocument);
  const sections = markdownSections(content);
  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/posting-templates', {
        name,
        headerMarkdown: sections['company header'] ?? '',
        descriptionMarkdown: sections['role description'] ?? '',
        benefitsMarkdown: sections['benefits and principles'] ?? '',
        applicationQuestionsMarkdown: sections['application questions'] ?? '',
        interviewStagesMarkdown: sections['interview stages'] ?? '',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posting-templates'] });
      toast.success('Template saved as a new version');
      router.push('/admin/templates');
    },
    onError: (error: Error) => toast.error('Could not save template', error.message),
  });
  const ready = !!name.trim() && !!sections['company header'] && !!sections['role description'];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <Button asChild variant="link" className="w-fit">
        <Link href="/admin/templates">
          <ArrowLeft className="size-4" aria-hidden />
          Back to templates
        </Link>
      </Button>
      <Card>
        <CardHeader
          title="Template content"
          description="Keep the headings. They tell us where each part goes in the job post."
        />
        <div className="flex flex-col gap-4 border-t border-border-subtle px-5 py-5">
          <Input
            inset
            label="Template name"
            placeholder="Engineering standard"
            required
            className="max-w-md"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <PlateMarkdownEditor
            value={content}
            onChange={setContent}
            placeholder="Write the template…"
          />
        </div>
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-border-subtle bg-card px-5 py-3">
          {!ready && (
            <p className="mr-auto text-xs text-fg-subtle">
              Add a name, a company header and a role description to save.
            </p>
          )}
          <Button variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} disabled={!ready} onClick={() => mutation.mutate()}>
            Save template
          </Button>
        </div>
      </Card>
    </div>
  );
}

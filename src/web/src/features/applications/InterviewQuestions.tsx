'use client';

import { useState } from 'react';
import { Check, Copy, Sparkles } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import { Alert, Button, Drawer, IconButton, Spinner, toast } from '@/components/ui';

type Question = { criterion: string; question: string; why: string };

/** Suggested questions for the interviewer. Open to anyone who can see the interview. */
export function InterviewQuestions({
  applicationId,
  interviewKitId,
  candidateName,
}: {
  applicationId: string;
  interviewKitId?: string | null;
  candidateName: string;
}) {
  const [opened, setOpened] = useState(false);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const generate = useMutation({
    mutationFn: () =>
      api.post<{ questions: Question[] }>('/api/ai/interview-questions', {
        applicationId,
        interviewKitId: interviewKitId ?? null,
      }),
    onSuccess: (result) => {
      setError(null);
      setQuestions(result.questions);
    },
    onError: (e: Error) => setError(e.message),
  });

  const open = () => {
    setOpened(true);
    if (!questions && !generate.isPending) generate.mutate();
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      toast.success('Question copied');
    } catch {
      toast.error('Could not copy', 'Select the text and copy it.');
    }
  };

  const groups = new Map<string, Question[]>();
  (questions ?? []).forEach((item) =>
    groups.set(item.criterion || 'General', [
      ...(groups.get(item.criterion || 'General') ?? []),
      item,
    ]),
  );

  return (
    <>
      <Button size="sm" variant="soft" leftIcon={<Sparkles />} onClick={open}>
        Prepare with AI
      </Button>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        size="lg"
        title={`Question ideas for ${candidateName}`}
        description="AI-written suggestions based on the resume and the job. Use the ones that help, ignore the rest. You run the interview."
        footer={
          questions &&
          questions.length > 0 && (
            <Button
              variant="secondary"
              loading={generate.isPending}
              onClick={() => generate.mutate()}
            >
              Suggest different questions
            </Button>
          )
        }
      >
        <div className="space-y-6">
          {generate.isPending && (
            <div role="status" className="flex items-start gap-3 text-sm text-fg-muted">
              <Spinner className="mt-0.5 text-primary" />
              Reading the resume and the job, then drafting questions. This takes about ten seconds.
            </div>
          )}
          {error && (
            <Alert
              tone="danger"
              title="Could not draft questions"
              action={
                <Button size="sm" variant="secondary" onClick={() => generate.mutate()}>
                  Try again
                </Button>
              }
            >
              {error}
            </Alert>
          )}
          {questions && questions.length === 0 && (
            <p className="text-sm text-fg-subtle">
              No questions came back. Try again, or use the questions in the interview kit.
            </p>
          )}
          {[...groups.entries()].map(([criterion, items]) => (
            <section key={criterion}>
              <h3 className="mb-2 text-base font-semibold text-fg">{criterion}</h3>
              <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                {items.map((item) => (
                  <li key={item.question} className="flex items-start gap-2 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base text-fg">{item.question}</p>
                      {item.why && <p className="mt-0.5 text-xs text-fg-subtle">Why: {item.why}</p>}
                    </div>
                    <IconButton
                      variant="quiet"
                      size="sm"
                      label={`Copy question: ${item.question}`}
                      onClick={() => copy(item.question)}
                    >
                      {copied === item.question ? (
                        <Check className="text-tone-green-dot" />
                      ) : (
                        <Copy />
                      )}
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Drawer>
    </>
  );
}

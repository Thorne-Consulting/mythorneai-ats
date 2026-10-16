'use client';

import { useState } from 'react';
import { ActionIcon, Button, Drawer, Group, Loader, Stack, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCopy, IconSparkles } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';

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
  const [opened, drawer] = useDisclosure();
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
    drawer.open();
    if (!questions && !generate.isPending) generate.mutate();
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      notifications.show({ color: 'teal', message: 'Question copied' });
    } catch {
      notifications.show({ color: 'red', message: 'Could not copy. Select the text and copy it.' });
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
      <Button size="sm" variant="light" leftSection={<IconSparkles size={15} />} onClick={open}>
        Prepare with AI
      </Button>
      <Drawer
        opened={opened}
        onClose={drawer.close}
        position="right"
        size="lg"
        title={`Question ideas for ${candidateName}`}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            AI-written suggestions based on the resume and the job. Use the ones that help, ignore
            the rest. You run the interview.
          </Text>
          {generate.isPending && (
            <Group gap="sm" wrap="nowrap" role="status">
              <Loader size="sm" />
              <Text size="sm">
                Reading the resume and the job, then drafting questions. This takes about ten
                seconds.
              </Text>
            </Group>
          )}
          {error && (
            <Stack gap="xs" align="flex-start">
              <Text size="sm">{error}</Text>
              <Button size="xs" variant="default" onClick={() => generate.mutate()}>
                Try again
              </Button>
            </Stack>
          )}
          {questions && questions.length === 0 && (
            <Text size="sm" c="dimmed">
              No questions came back. Try again, or use the questions in the interview kit.
            </Text>
          )}
          {[...groups.entries()].map(([criterion, items]) => (
            <section key={criterion}>
              <Text fw={650} size="sm" mb="xs">
                {criterion}
              </Text>
              <Stack gap="sm">
                {items.map((item) => (
                  <div
                    key={item.question}
                    style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}
                  >
                    <div style={{ flex: 1 }}>
                      <Text size="sm">{item.question}</Text>
                      {item.why && (
                        <Text size="xs" c="dimmed">
                          Why: {item.why}
                        </Text>
                      )}
                    </div>
                    <Tooltip label="Copy question">
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={`Copy question: ${item.question}`}
                        onClick={() => copy(item.question)}
                      >
                        {copied === item.question ? (
                          <IconCheck size={15} />
                        ) : (
                          <IconCopy size={15} />
                        )}
                      </ActionIcon>
                    </Tooltip>
                  </div>
                ))}
              </Stack>
            </section>
          ))}
          {questions && questions.length > 0 && (
            <Button
              variant="default"
              size="xs"
              loading={generate.isPending}
              onClick={() => generate.mutate()}
              style={{ alignSelf: 'flex-start' }}
            >
              Suggest different questions
            </Button>
          )}
        </Stack>
      </Drawer>
    </>
  );
}

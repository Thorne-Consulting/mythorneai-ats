'use client';

import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSparkles } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import type { CandidateDetail } from '@/types';

type ResumeProfileForm = {
  summary: string;
  currentTitle: string;
  skills: string[];
  jobTitles: string[];
  education: string[];
  certifications: string[];
  languages: string[];
  yearsExperience: number | string;
};

export function ResumeProfileReviewModal({
  candidate,
  opened,
  onClose,
}: {
  candidate: CandidateDetail;
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const form = useForm<ResumeProfileForm>({
    initialValues: valuesFrom(candidate),
  });
  const [proposal, setProposal] = useState<Partial<ResumeProfileForm> | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const askAi = useMutation({
    mutationFn: () =>
      api.post<
        Partial<Omit<ResumeProfileForm, 'yearsExperience'>> & {
          yearsExperience?: number | null;
        }
      >(`/api/candidates/${candidate.id}/resume-profile/ai`),
    onSuccess: (result) => {
      setAiError(null);
      setProposal({
        currentTitle: result.currentTitle ?? '',
        summary: result.summary ?? '',
        skills: result.skills ?? [],
        jobTitles: result.jobTitles ?? [],
        education: result.education ?? [],
        certifications: result.certifications ?? [],
        languages: result.languages ?? [],
        yearsExperience: result.yearsExperience ?? '',
      });
    },
    onError: (error: Error) => {
      setProposal(null);
      setAiError(error.message);
    },
  });
  const changes = proposal
    ? FIELDS.filter(
        ({ key }) =>
          JSON.stringify(proposal[key]) !== JSON.stringify(form.values[key]) &&
          !(isBlank(proposal[key]) && isBlank(form.values[key])),
      )
    : [];
  const review = useMutation({
    mutationFn: (values: ResumeProfileForm) =>
      api.put(`/api/candidates/${candidate.id}/resume-profile`, {
        ...values,
        yearsExperience: values.yearsExperience === '' ? null : Number(values.yearsExperience),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      queryClient.invalidateQueries({ queryKey: ['talent-search'] });
      notifications.show({ color: 'teal', message: 'Resume profile reviewed' });
      onClose();
    },
    onError: (error: Error) => notifications.show({ color: 'red', message: error.message }),
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Review resume profile" size="lg" centered>
      <form onSubmit={form.onSubmit((values) => review.mutate(values))}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Correct the searchable profile against the source resume. This does not alter the
            original document.
          </Text>
          <Group justify="space-between" align="center" wrap="wrap" gap="xs">
            <Text size="sm" c="dimmed" maw="52ch">
              Want a second read? AI can re-read the resume and suggest values. You choose which to
              use.
            </Text>
            <Button
              variant="light"
              size="xs"
              leftSection={<IconSparkles size={14} />}
              loading={askAi.isPending}
              onClick={() => askAi.mutate()}
            >
              Ask AI to re-read the resume
            </Button>
          </Group>
          {aiError && (
            <Alert color="gray" variant="light">
              {aiError}
            </Alert>
          )}
          {proposal && (
            <Stack
              gap="xs"
              p="sm"
              style={{ border: '1px solid var(--mantine-color-default-border)', borderRadius: 8 }}
            >
              <Text size="sm" fw={600}>
                AI suggestions (a draft, nothing is saved yet)
              </Text>
              {changes.length === 0 ? (
                <Text size="sm" c="dimmed">
                  AI read the same thing you already have. Nothing to change.
                </Text>
              ) : (
                changes.map(({ key, label }) => (
                  <Group
                    key={key}
                    justify="space-between"
                    align="flex-start"
                    wrap="nowrap"
                    gap="md"
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <Text size="xs" fw={600}>
                        {label}
                      </Text>
                      <Text size="xs" c="dimmed">
                        Now: {show(form.values[key])}
                      </Text>
                      <Text size="xs">AI: {show(proposal[key])}</Text>
                    </div>
                    <Button
                      size="compact-xs"
                      variant="default"
                      aria-label={`Use AI value for ${label}`}
                      onClick={() => form.setFieldValue(key, proposal[key] as never)}
                    >
                      Use AI value
                    </Button>
                  </Group>
                ))
              )}
            </Stack>
          )}
          <TextInput label="Current title" {...form.getInputProps('currentTitle')} />
          <Textarea
            label="Summary"
            autosize
            minRows={4}
            maxRows={10}
            {...form.getInputProps('summary')}
          />
          <Group grow align="flex-start">
            <TagsInput label="Skills" splitChars={[',']} {...form.getInputProps('skills')} />
            <NumberInput
              label="Years of experience"
              min={0}
              max={60}
              decimalScale={1}
              {...form.getInputProps('yearsExperience')}
            />
          </Group>
          <TagsInput
            label="Current and past titles"
            splitChars={[',']}
            {...form.getInputProps('jobTitles')}
          />
          <TagsInput label="Education" splitChars={[',']} {...form.getInputProps('education')} />
          <TagsInput
            label="Certifications"
            splitChars={[',']}
            {...form.getInputProps('certifications')}
          />
          <TagsInput label="Languages" splitChars={[',']} {...form.getInputProps('languages')} />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose} disabled={review.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={review.isPending}>
              Save reviewed profile
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

const FIELDS: Array<{ key: keyof ResumeProfileForm; label: string }> = [
  { key: 'currentTitle', label: 'Current title' },
  { key: 'summary', label: 'Summary' },
  { key: 'skills', label: 'Skills' },
  { key: 'yearsExperience', label: 'Years of experience' },
  { key: 'jobTitles', label: 'Current and past titles' },
  { key: 'education', label: 'Education' },
  { key: 'certifications', label: 'Certifications' },
  { key: 'languages', label: 'Languages' },
];

function isBlank(value: unknown) {
  return value === '' || value == null || (Array.isArray(value) && value.length === 0);
}

function show(value: unknown) {
  if (isBlank(value)) return 'empty';
  return Array.isArray(value) ? value.join(', ') : String(value);
}

function valuesFrom(candidate: CandidateDetail): ResumeProfileForm {
  return {
    summary: candidate.resumeSummary ?? '',
    currentTitle: candidate.currentTitle ?? '',
    skills: candidate.resumeSkills,
    jobTitles: candidate.resumeJobTitles,
    education: candidate.resumeEducation,
    certifications: candidate.resumeCertifications,
    languages: candidate.resumeLanguages,
    yearsExperience: candidate.resumeYearsExperience ?? '',
  };
}

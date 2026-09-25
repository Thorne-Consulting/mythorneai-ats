'use client';

import { Button, Group, Modal, NumberInput, Stack, TagsInput, Text, TextInput, Textarea } from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
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
          <TextInput label="Current title" {...form.getInputProps('currentTitle')} />
          <Textarea label="Summary" autosize minRows={4} maxRows={10} {...form.getInputProps('summary')} />
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
          <TagsInput label="Current and past titles" splitChars={[',']} {...form.getInputProps('jobTitles')} />
          <TagsInput label="Education" splitChars={[',']} {...form.getInputProps('education')} />
          <TagsInput label="Certifications" splitChars={[',']} {...form.getInputProps('certifications')} />
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

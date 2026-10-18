'use client';

import { useState } from 'react';
import {
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconFileText, IconSparkles, IconUpload } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import type { ResumeParsePreview } from '@/types';

interface ImportForm {
  firstName: string;
  lastName: string;
  email: string;
  source: string;
}

const initialValues: ImportForm = {
  firstName: '',
  lastName: '',
  email: '',
  source: 'Resume import',
};

// Only identity can be typed over here. Everything the resume says is parsed and stays read-only,
// so nobody can make a candidate look stronger than their resume.
export function ResumeImportModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ResumeParsePreview | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const form = useForm<ImportForm>({
    initialValues,
    validate: {
      firstName: (value) => (value.trim() ? null : 'Required'),
      lastName: (value) => (value.trim() ? null : 'Required'),
      email: (value) => (/^\S+@\S+\.\S+$/.test(value) ? null : 'Enter a valid email'),
      source: (value) => (value.trim() ? null : 'Required'),
    },
  });
  const parse = useMutation({
    mutationFn: async (resume: File) => {
      const data = new FormData();
      data.append('file', resume);
      return api.form<ResumeParsePreview>('/api/resumes/parse', data);
    },
    onSuccess: (result) => {
      setPreview(result);
      form.setValues({
        firstName: result.form.basics.firstName ?? '',
        lastName: result.form.basics.lastName ?? '',
        email: result.form.basics.email ?? '',
        source: 'Resume import',
      });
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Could not parse resume', message: error.message }),
  });
  const importResume = useMutation({
    mutationFn: async (values: ImportForm) => {
      if (!file) throw new Error('Choose a resume first.');
      const data = new FormData();
      data.append('file', file);
      Object.entries(values).forEach(([key, value]) => data.append(key, value));
      return api.form<{ candidateId: string; candidateName: string }>('/api/resumes/import', data);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['talent-search'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      notifications.show({ color: 'teal', message: `${result.candidateName} was added` });
      resetAndClose();
      router.push(`/candidates/${result.candidateId}`);
    },
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not import resume',
        message: error.message,
      }),
  });

  const chooseFile = (nextFile: File | null) => {
    setFile(nextFile);
    setPreview(null);
    form.setValues(initialValues);
    parse.reset();
    if (nextFile) parse.mutate(nextFile);
  };
  const resetAndClose = () => {
    setFile(null);
    setPreview(null);
    form.reset();
    parse.reset();
    importResume.reset();
    onClose();
  };
  const basics = preview?.form.basics;

  return (
    <Modal opened={opened} onClose={resetAndClose} title="Import a resume" size="lg">
      <form onSubmit={form.onSubmit((values) => importResume.mutate(values))}>
        <Stack gap="lg">
          <Text size="sm" c="dimmed">
            Upload a PDF or DOCX. The resume is parsed into the candidate&apos;s profile; you only
            confirm who they are.
          </Text>
          <FileInput
            label="Resume"
            placeholder="Choose PDF or DOCX"
            accept=".pdf,.docx"
            value={file}
            onChange={chooseFile}
            clearable
            required
            leftSection={<IconFileText size={16} />}
          />
          {parse.isPending && (
            <Paper withBorder radius="md" p="md" aria-live="polite">
              <Group gap="sm">
                <IconSparkles size={18} />
                <div>
                  <Text size="sm" fw={650}>
                    Reading the resume
                  </Text>
                  <Text size="xs" c="dimmed">
                    Contact details, experience, education and skills.
                  </Text>
                </div>
              </Group>
            </Paper>
          )}
          {preview && basics && (
            <>
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={650}>Confirm the candidate</Text>
                  <Text size="sm" c="dimmed">
                    {[basics.city, basics.region].filter(Boolean).join(', ') || 'No location found'}
                    {basics.phone ? ` · ${basics.phone}` : ''}
                  </Text>
                </div>
                <Badge variant="light" color="gray">
                  {preview.form.work.length} jobs · {preview.form.education.length} schools ·{' '}
                  {preview.form.skills.length} skills
                </Badge>
              </Group>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label="First name" required {...form.getInputProps('firstName')} />
                <TextInput label="Last name" required {...form.getInputProps('lastName')} />
                <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
                <TextInput label="Source" required {...form.getInputProps('source')} />
              </SimpleGrid>
              {preview.form.work.length > 0 && (
                <Text size="sm">
                  <b>Experience found:</b>{' '}
                  {preview.form.work
                    .slice(0, 4)
                    .map((job) => `${job.title} at ${job.company}`)
                    .join('; ')}
                </Text>
              )}
            </>
          )}
          <Group justify="space-between" mt="sm">
            <Text size="xs" c="dimmed" maw={430}>
              Parsed data supports search and review. It never makes or recommends a hiring
              decision.
            </Text>
            <Group gap="sm">
              <Button variant="default" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                leftSection={<IconUpload size={16} />}
                disabled={!preview}
                loading={importResume.isPending}
              >
                Add candidate
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

'use client';

import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconFileText, IconSparkles, IconUpload } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/api';
import type { ResumeParsePreview } from '@/types';

interface ImportForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  currentTitle: string;
  linkedInUrl: string;
  source: string;
  summary: string;
  skills: string[];
}

const initialValues: ImportForm = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  location: '',
  currentTitle: '',
  linkedInUrl: '',
  source: 'Resume import',
  summary: '',
  skills: [],
};

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
        firstName: result.firstName,
        lastName: result.lastName,
        email: result.email,
        phone: result.phone ?? '',
        location: result.location ?? '',
        currentTitle: result.currentTitle ?? '',
        linkedInUrl: result.linkedInUrl ?? '',
        source: 'Resume import',
        summary: result.summary,
        skills: result.skills,
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
      Object.entries(values).forEach(([key, value]) =>
        data.append(key, Array.isArray(value) ? value.join(',') : value),
      );
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

  return (
    <Modal opened={opened} onClose={resetAndClose} title="Import a resume" size="xl">
      <form onSubmit={form.onSubmit((values) => importResume.mutate(values))}>
        <Stack gap="lg">
          <Text size="sm" c="dimmed">
            Upload a PDF or DOCX. The parser suggests profile data; you review it before the
            candidate is added.
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
                    Extracting contact details, skills, experience, and education.
                  </Text>
                </div>
              </Group>
            </Paper>
          )}
          {preview && (
            <>
              <Group justify="space-between" align="flex-start">
                <div>
                  <Text fw={650}>Review parsed profile</Text>
                  <Text size="sm" c="dimmed">
                    Correct anything that was formatted unusually in the source file.
                  </Text>
                </div>
                <Badge variant="light" color={preview.confidence >= 75 ? 'teal' : 'yellow'}>
                  {preview.confidence}% extraction confidence
                </Badge>
              </Group>
              {preview.warnings.length > 0 && (
                <Alert icon={<IconAlertCircle size={17} />} color="yellow" title="Needs review">
                  {preview.warnings.join(' ')}
                </Alert>
              )}
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <TextInput label="First name" required {...form.getInputProps('firstName')} />
                <TextInput label="Last name" required {...form.getInputProps('lastName')} />
                <TextInput label="Email" type="email" required {...form.getInputProps('email')} />
                <TextInput label="Phone" {...form.getInputProps('phone')} />
                <TextInput label="Current title" {...form.getInputProps('currentTitle')} />
                <TextInput label="Location" {...form.getInputProps('location')} />
                <TextInput label="Source" required {...form.getInputProps('source')} />
                <TextInput label="LinkedIn URL" {...form.getInputProps('linkedInUrl')} />
              </SimpleGrid>
              <TagsInput
                label="Skills"
                description="Press Enter after each skill"
                {...form.getInputProps('skills')}
              />
              <Textarea label="Profile summary" minRows={3} {...form.getInputProps('summary')} />
              {(preview.education.length > 0 || preview.certifications.length > 0) && (
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <div>
                    <Text size="xs" fw={650} tt="uppercase" c="dimmed" mb={6}>
                      Education found
                    </Text>
                    <Text size="sm">{preview.education.join(' · ') || 'Not found'}</Text>
                  </div>
                  <div>
                    <Text size="xs" fw={650} tt="uppercase" c="dimmed" mb={6}>
                      Certifications found
                    </Text>
                    <Text size="sm">{preview.certifications.join(' · ') || 'Not found'}</Text>
                  </div>
                </SimpleGrid>
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

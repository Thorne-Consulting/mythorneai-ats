'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  NavLink,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconMail } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import { EmptyState } from '@/components/ui/Cards';
import { LoadingBlock } from '@/components/ui/LoadingBlock';

export interface EmailTemplate {
  key: string;
  label: string;
  variables: string[];
  defaultSubject: string;
  defaultBody: string;
  subject: string;
  body: string;
  source: 'default' | 'organization' | 'job';
  version: number;
}
interface Preview {
  subject: string;
  body: string;
  html: string;
}

const SOURCE_LABEL = {
  default: 'Standard wording',
  organization: 'Customized for everyone',
  job: 'Customized for this job',
} as const;

/** Lists the emails we send and edits one at a time. With requisitionId, edits the per-job override. */
export function EmailTemplateEditor({ requisitionId }: { requisitionId?: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const templates = useQuery({
    queryKey: ['email-templates', requisitionId ?? null],
    queryFn: () =>
      api.get<EmailTemplate[]>(
        `/api/email-templates${requisitionId ? `?requisitionId=${requisitionId}` : ''}`,
      ),
  });
  if (!templates.data) return <LoadingBlock rows={4} />;
  if (templates.data.length === 0)
    return (
      <EmptyState
        icon={IconMail}
        title="No emails to edit"
        description="Emails to candidates and your team will appear here once they exist."
      />
    );
  const current = templates.data.find((x) => x.key === selected) ?? templates.data[0];

  return (
    <Group align="flex-start" gap="lg" wrap="wrap">
      <Box component="nav" aria-label="Emails" style={{ flex: '0 0 240px', minWidth: 200 }}>
        {templates.data.map((template) => (
          <NavLink
            key={template.key}
            label={template.label}
            description={template.source === 'default' ? undefined : SOURCE_LABEL[template.source]}
            active={template.key === current.key}
            aria-current={template.key === current.key ? 'true' : undefined}
            onClick={() => setSelected(template.key)}
            style={{ borderRadius: 8 }}
          />
        ))}
      </Box>
      <Box style={{ flex: '1 1 480px', minWidth: 0 }}>
        <Editor
          key={`${current.key}-${requisitionId ?? ''}-${current.version}-${current.source}`}
          template={current}
          requisitionId={requisitionId}
        />
      </Box>
    </Group>
  );
}

function Editor({ template, requisitionId }: { template: EmailTemplate; requisitionId?: string }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focus = useRef<'subject' | 'body'>('body');
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = subject !== template.subject || body !== template.body;
  const variables = [
    ...template.variables,
    ...(template.variables.includes('company') ? [] : ['company']),
  ];

  useEffect(() => {
    const timer = setTimeout(() => {
      api
        .post<Preview>(`/api/email-templates/${template.key}/preview`, { subject, body })
        .then((result) => {
          setPreview(result);
          setPreviewError(false);
        })
        .catch(() => setPreviewError(true));
    }, 400);
    return () => clearTimeout(timer);
  }, [subject, body, template.key]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['email-templates'] });
  const save = useMutation({
    mutationFn: () =>
      api.put(`/api/email-templates/${template.key}`, {
        subject,
        body,
        requisitionId: requisitionId ?? null,
      }),
    onSuccess: () => {
      setError(null);
      refresh();
      notifications.show({ color: 'teal', message: `${template.label} email saved` });
    },
    onError: (e: Error) => setError(e.message),
  });
  const reset = useMutation({
    mutationFn: () =>
      api.delete(
        `/api/email-templates/${template.key}${requisitionId ? `?requisitionId=${requisitionId}` : ''}`,
      ),
    onSuccess: () => {
      refresh();
      notifications.show({
        color: 'teal',
        message: requisitionId
          ? 'This job now uses the wording for everyone'
          : 'Back to the standard wording',
      });
    },
    onError: (e: Error) =>
      notifications.show({ color: 'red', title: 'Could not reset', message: e.message }),
  });

  const insert = (variable: string) => {
    const token = `{{${variable}}}`;
    const inSubject = focus.current === 'subject';
    const element = inSubject ? subjectRef.current : bodyRef.current;
    const value = inSubject ? subject : body;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    (inSubject ? setSubject : setBody)(next);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" wrap="wrap" gap="sm">
        <div>
          <Text fw={650}>{template.label}</Text>
          <Group gap="xs" mt={4}>
            <Badge variant="light" color="gray" tt="none">
              {SOURCE_LABEL[template.source]}
            </Badge>
            {template.version > 0 && (
              <Text size="sm" c="dimmed">
                Version {template.version}
              </Text>
            )}
          </Group>
        </div>
        {template.source !== 'default' && (
          <Button
            variant="default"
            size="xs"
            loading={reset.isPending}
            onClick={() => reset.mutate()}
          >
            {requisitionId && template.source === 'job'
              ? 'Use the wording for everyone'
              : 'Reset to default'}
          </Button>
        )}
      </Group>

      <TextInput
        label="Subject"
        ref={subjectRef}
        value={subject}
        onChange={(event) => setSubject(event.currentTarget.value)}
        onFocus={() => (focus.current = 'subject')}
      />
      <Textarea
        label="Message"
        ref={bodyRef}
        autosize
        minRows={8}
        maxRows={20}
        value={body}
        onChange={(event) => setBody(event.currentTarget.value)}
        onFocus={() => (focus.current = 'body')}
      />
      <div>
        <Text size="sm" fw={500} mb={4}>
          Details you can drop in
        </Text>
        <Text size="sm" c="dimmed" mb={6}>
          Click one to add it where your cursor is. It’s filled in with real details when the email
          is sent.
        </Text>
        <Group gap={6}>
          {variables.map((variable) => (
            <UnstyledButton
              key={variable}
              onClick={() => insert(variable)}
              aria-label={`Insert ${variable}`}
              style={{
                border: '1px solid var(--mantine-color-gray-4)',
                borderRadius: 999,
                padding: '2px 10px',
                fontSize: 13,
                fontFamily: 'var(--mantine-font-family-monospace)',
              }}
            >
              {`{{${variable}}}`}
            </UnstyledButton>
          ))}
        </Group>
      </div>

      {error && (
        <Alert color="red" title="This email wasn’t saved">
          {error}
        </Alert>
      )}
      <Group justify="flex-end" gap="md">
        {dirty && (
          <Badge variant="light" color="gray" tt="none">
            Unsaved changes
          </Badge>
        )}
        {dirty && (
          <Button
            variant="subtle"
            color="gray"
            onClick={() => {
              setSubject(template.subject);
              setBody(template.body);
              setError(null);
            }}
          >
            Discard changes
          </Button>
        )}
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>
          Save
        </Button>
      </Group>

      <div>
        <Text size="sm" fw={500} mb={4}>
          Preview
        </Text>
        {previewError && (
          <Text size="sm" c="red" mb={4}>
            The preview didn’t update. Your text is still here.
          </Text>
        )}
        <Paper withBorder radius="md" p="md">
          <Text size="sm" c="dimmed">
            Subject
          </Text>
          <Text size="sm" fw={600} mb="sm">
            {preview?.subject ?? '…'}
          </Text>
          <iframe
            title={`Preview of ${template.label} email`}
            sandbox=""
            srcDoc={preview?.html ?? ''}
            style={{
              width: '100%',
              height: 360,
              border: '1px solid var(--mantine-color-gray-3)',
              borderRadius: 8,
              background: '#fff',
            }}
          />
          <Text size="xs" c="dimmed" mt={6}>
            Shown with sample details like “Alex” and “Senior Engineer”.
          </Text>
        </Paper>
      </div>
    </Stack>
  );
}

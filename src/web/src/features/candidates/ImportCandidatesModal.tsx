'use client';

import { useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconUpload } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';

interface ImportResult {
  dryRun: boolean;
  created: number;
  wouldCreate: number;
  duplicates: number;
  invalid: number;
  rows: Array<{
    line: number;
    email?: string | null;
    status: 'create' | 'duplicate' | 'invalid';
    message?: string | null;
  }>;
}

const TEMPLATE =
  'firstName,lastName,email,phone,location,currentTitle,linkedInUrl,source,tags\n' +
  'Alex,Rivera,alex@example.com,555-0100,Austin TX,Senior Engineer,https://www.linkedin.com/in/alex,Referral,"backend;python"\n';

const STATUS = {
  create: { label: 'Will be added', color: 'teal' },
  duplicate: { label: 'Already here, skipped', color: 'gray' },
  invalid: { label: 'Problem, skipped', color: 'red' },
} as const;

export function ImportCandidatesModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const queryClient = useQueryClient();
  const close = () => {
    setFile(null);
    setResult(null);
    onClose();
  };
  const check = useMutation({
    mutationFn: (selected: File) =>
      api.upload<ImportResult>('/api/candidates/import?dryRun=true', selected),
    onSuccess: setResult,
    onError: (error: Error) =>
      notifications.show({
        color: 'red',
        title: 'Could not read that file',
        message: error.message,
      }),
  });
  const run = useMutation({
    mutationFn: (selected: File) =>
      api.upload<ImportResult>('/api/candidates/import?dryRun=false', selected),
    onSuccess: (done) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      notifications.show({
        color: 'teal',
        message: `${done.created} ${done.created === 1 ? 'candidate' : 'candidates'} imported`,
      });
      close();
    },
    onError: (error: Error) =>
      notifications.show({ color: 'red', title: 'Import failed', message: error.message }),
  });
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

  return (
    <Modal opened={opened} onClose={close} title="Import candidates" size="xl" centered>
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Add many people at once from a CSV file. We check it first and show you what would happen.
          Nothing is added until you confirm. People whose email is already here are skipped.
        </Text>
        <Text size="sm">
          Columns: firstName, lastName, email, phone, location, currentTitle, linkedInUrl, source,
          tags (separate tags with ;).{' '}
          <Anchor href={templateHref} download="candidates-template.csv">
            Download a template
          </Anchor>
        </Text>
        <FileInput
          label="CSV file"
          placeholder="Choose a .csv file"
          accept=".csv,text/csv"
          leftSection={<IconUpload size={16} />}
          clearable
          value={file}
          onChange={(selected) => {
            setFile(selected);
            setResult(null);
            if (selected) check.mutate(selected);
          }}
        />
        {check.isPending && <Text size="sm">Checking your file…</Text>}
        {result && (
          <>
            <SimpleGrid cols={3}>
              <Summary label="Will be added" value={result.wouldCreate} />
              <Summary label="Already here" value={result.duplicates} />
              <Summary label="Problems" value={result.invalid} />
            </SimpleGrid>
            {result.invalid > 0 && (
              <Alert color="red" variant="light" icon={<IconAlertCircle size={18} />}>
                Rows with problems are skipped. Fix them in your file and choose it again, or import
                the rest now.
              </Alert>
            )}
            {result.rows.length > 0 && (
              <Table.ScrollContainer minWidth={520} mah={320}>
                <Table verticalSpacing="xs" stickyHeader>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th ta="right">Line</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>What happens</Table.Th>
                      <Table.Th>Note</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {result.rows.map((row) => (
                      <Table.Tr key={row.line}>
                        <Table.Td ta="right">{row.line}</Table.Td>
                        <Table.Td>{row.email || '—'}</Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={STATUS[row.status].color} tt="none">
                            {STATUS[row.status].label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>{row.message ?? ''}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            Cancel
          </Button>
          <Button
            disabled={!file || !result || result.wouldCreate === 0}
            loading={run.isPending}
            onClick={() => file && run.mutate(file)}
          >
            {result
              ? `Import ${result.wouldCreate} ${result.wouldCreate === 1 ? 'candidate' : 'candidates'}`
              : 'Import'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={650} fz="xl" className="tnum">
        {value}
      </Text>
    </div>
  );
}

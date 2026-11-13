'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  FileDrop,
  Modal,
  Table,
  TBody,
  TD,
  TH,
  THead,
  toast,
  TR,
  type Tone,
} from '@/components/ui';

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

const STATUS: Record<ImportResult['rows'][number]['status'], { label: string; tone: Tone }> = {
  create: { label: 'Will be added', tone: 'green' },
  duplicate: { label: 'Already here, skipped', tone: 'gray' },
  invalid: { label: 'Problem, skipped', tone: 'red' },
};

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
    onError: (error: Error) => toast.error('Could not read that file', error.message),
  });
  const run = useMutation({
    mutationFn: (selected: File) =>
      api.upload<ImportResult>('/api/candidates/import?dryRun=false', selected),
    onSuccess: (done) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      toast.success(`${done.created} ${done.created === 1 ? 'candidate' : 'candidates'} imported`);
      close();
    },
    onError: (error: Error) => toast.error('Import failed', error.message),
  });
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Import candidates"
      description="Add many people at once from a CSV file. We check it first and show you what would happen. Nothing is added until you confirm. People whose email is already here are skipped."
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
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
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg">
          Columns: firstName, lastName, email, phone, location, currentTitle, linkedInUrl, source,
          tags (separate tags with ;).{' '}
          <a
            href={templateHref}
            download="candidates-template.csv"
            className="text-accent-foreground hover:underline"
          >
            Download a template
          </a>
        </p>
        <FileDrop
          file={file}
          accept=".csv,text/csv"
          label="Drop a CSV file here or browse"
          hint="CSV with a header row"
          onFile={(selected) => {
            setFile(selected);
            setResult(null);
            if (selected) check.mutate(selected);
          }}
        />
        {check.isPending && (
          <p className="text-sm text-fg-muted" aria-live="polite">
            Checking your file…
          </p>
        )}
        {result && (
          <>
            <dl className="grid grid-cols-3 gap-3">
              <Summary label="Will be added" value={result.wouldCreate} />
              <Summary label="Already here" value={result.duplicates} />
              <Summary label="Problems" value={result.invalid} />
            </dl>
            {result.invalid > 0 && (
              <Alert tone="danger">
                Rows with problems are skipped. Fix them in your file and choose it again, or import
                the rest now.
              </Alert>
            )}
            {result.rows.length > 0 && (
              <div className="max-h-80 overflow-y-auto rounded-lg border border-border-subtle">
                <Table className="min-w-[520px]">
                  <THead className="sticky top-0 z-10">
                    <TR>
                      <TH align="right">Line</TH>
                      <TH>Email</TH>
                      <TH>What happens</TH>
                      <TH>Note</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {result.rows.map((row) => (
                      <TR key={row.line}>
                        <TD align="right" className="tnum">
                          {row.line}
                        </TD>
                        <TD>{row.email || '—'}</TD>
                        <TD>
                          <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                        </TD>
                        <TD>{row.message ?? ''}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted px-4 py-3">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="text-xl font-semibold text-fg tnum">{value}</dd>
    </div>
  );
}

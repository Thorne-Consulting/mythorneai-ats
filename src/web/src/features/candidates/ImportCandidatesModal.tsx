'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  FileDrop,
  Modal,
  SearchSelect,
  SegmentedControl,
  Select,
  Steps,
  TagsInput,
  Table,
  TBody,
  TD,
  TH,
  THead,
  toast,
  TR,
  type Tone,
} from '@/components/ui';
import { downloadCsv } from '@/components/data-table/csv';
import { formatRelative } from '@/lib/format';
import type { RequisitionSummary } from '@/types';
import { useTagOptions } from './candidate-actions';
import { sourceOptions, useSources } from '@/features/sources/sources-data';

type Status = 'create' | 'update' | 'duplicate' | 'invalid';
interface ImportResult {
  columns: {
    headers: string[];
    mapping: Record<string, string>;
    fields: { value: string; label: string }[];
  };
  needsMapping: boolean;
  message?: string;
  dryRun?: boolean;
  created?: number;
  wouldCreate?: number;
  updated?: number;
  wouldUpdate?: number;
  duplicates?: number;
  invalid?: number;
  createdIds?: string[];
  rows?: Array<{
    line: number;
    name: string;
    email?: string | null;
    status: Status;
    message?: string;
  }>;
}

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  create: { label: 'Will be added', tone: 'green' },
  update: { label: 'Empty fields filled', tone: 'blue' },
  duplicate: { label: 'Skipped', tone: 'gray' },
  invalid: { label: 'Problem', tone: 'red' },
};
const TEMPLATE =
  'First name,Last name,Email,Phone,Location,Current title,LinkedIn,Source,Tags\n' +
  'Alex,Rivera,alex@example.com,555-0100,"Austin, TX",Senior Engineer,https://www.linkedin.com/in/alex,Referral,backend;python\n';
const STEPS = ['Choose a file', 'Match columns', 'Check and import'];

/** Add many people from a spreadsheet: choose the file, match its columns to ours, check, import. */
export function ImportCandidatesModal({
  opened,
  onClose,
}: {
  opened: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [duplicates, setDuplicates] = useState<'skip' | 'fill'>('skip');
  const [tags, setTags] = useState<string[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const tagOptions = useTagOptions(opened);
  const sources = useSources(opened && step === 2);
  const jobs = useQuery({
    queryKey: ['requisitions', 'open'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?status=Open'),
    enabled: opened && step === 2,
  });

  const close = () => {
    setStep(0);
    setFile(null);
    setMapping({});
    setDuplicates('skip');
    setTags([]);
    setJobId(null);
    setSource(null);
    setResult(null);
    onClose();
  };
  const send = (dryRun: boolean, withMapping: boolean) => {
    const body = new FormData();
    body.append('file', file!);
    if (withMapping) body.append('mapping', JSON.stringify(mapping));
    body.append('duplicates', duplicates);
    body.append('tags', tags.join(','));
    if (source) body.append('source', source);
    return api.form<ImportResult>(`/api/candidates/imports?dryRun=${dryRun}`, body);
  };
  // Step 1 → 2: read the header row and match the columns we recognize.
  const columns = useMutation({
    mutationFn: () => send(true, false),
    onSuccess: (read) => {
      setMapping(read.columns.mapping);
      setResult(read);
      setStep(1);
    },
    onError: (error: Error) => toast.error('Could not read that file', error.message),
  });
  // Step 2 → 3: a dry run with the chosen columns.
  const check = useMutation({
    mutationFn: () => send(true, true),
    onSuccess: (checked) => {
      setResult(checked);
      if (!checked.needsMapping) setStep(2);
    },
    onError: (error: Error) => toast.error('Could not check the file', error.message),
  });
  const run = useMutation({
    mutationFn: async () => {
      const done = await send(false, true);
      if (jobId && done.createdIds?.length)
        await api.post('/api/candidates/bulk', {
          ids: done.createdIds,
          action: 'addToJob',
          requisitionId: jobId,
        });
      return done;
    },
    onSuccess: (done) => {
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidate-imports'] });
      const added = done.created ?? 0;
      toast.success(
        `${added} ${added === 1 ? 'candidate' : 'candidates'} imported`,
        done.updated ? `${done.updated} already here got their empty fields filled.` : undefined,
      );
      close();
    },
    onError: (error: Error) => toast.error('Could not import the candidates', error.message),
  });

  const fields = result?.columns.fields ?? [];
  const headers = result?.columns.headers ?? [];
  const chosen = new Set(Object.values(mapping));
  const missingRequired = ['firstName', 'lastName', 'email'].filter((field) => !chosen.has(field));
  const problems = result?.rows?.filter((row) => row.status === 'invalid') ?? [];
  const willAdd = (result?.wouldCreate ?? 0) + (result?.wouldUpdate ?? 0);

  const footer = (
    <>
      {step > 0 && (
        <Button variant="secondary" className="mr-auto" onClick={() => setStep(step - 1)}>
          Back
        </Button>
      )}
      <Button variant="secondary" onClick={close}>
        Cancel
      </Button>
      {step === 0 && (
        <Button disabled={!file} loading={columns.isPending} onClick={() => columns.mutate()}>
          Next
        </Button>
      )}
      {step === 1 && (
        <Button
          disabled={missingRequired.length > 0}
          loading={check.isPending}
          onClick={() => check.mutate()}
        >
          Check the rows
        </Button>
      )}
      {step === 2 && (
        <Button disabled={willAdd === 0} loading={run.isPending} onClick={() => run.mutate()}>
          {`Import ${willAdd} ${willAdd === 1 ? 'row' : 'rows'}`}
        </Button>
      )}
    </>
  );

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Import from a spreadsheet"
      size="xl"
      footer={footer}
    >
      <Steps steps={STEPS} current={step} className="mb-5" />
      {step === 0 && (
        <div className="flex flex-col gap-3">
          <FileDrop
            file={file}
            accept=".csv,text/csv,.xlsx"
            label="Drop a spreadsheet here, or click to choose one"
            hint="CSV or Excel (.xlsx), up to 2,000 people. The first row must name the columns."
            onFile={setFile}
          />
          <Button variant="link" size="sm" leftIcon={<Download />} className="self-start" asChild>
            <a
              href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
              download="candidates-template.csv"
            >
              Download a template
            </a>
          </Button>
          <RecentImports />
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-fg-muted">
            We matched the columns we recognized. Choose a field for the others, or leave them out.
          </p>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border-subtle">
            <Table>
              <THead className="sticky top-0 z-10">
                <TR>
                  <TH>Your column</TH>
                  <TH>Our field</TH>
                </TR>
              </THead>
              <TBody>
                {headers.map((header, index) => (
                  <TR key={index}>
                    <TD className="font-medium">{header || `Column ${index + 1}`}</TD>
                    <TD>
                      <Select
                        size="sm"
                        aria-label={`Field for ${header || `column ${index + 1}`}`}
                        className="w-60"
                        clearable
                        placeholder="Leave out"
                        value={mapping[String(index)] ?? null}
                        onChange={(value) =>
                          setMapping((current) => {
                            const next = { ...current };
                            // One column per field: choosing it here frees it elsewhere.
                            for (const [key, field] of Object.entries(next))
                              if (field === value) delete next[key];
                            if (value) next[String(index)] = value;
                            else delete next[String(index)];
                            return next;
                          })
                        }
                        data={fields}
                      />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          {missingRequired.length > 0 && (
            <Alert tone="warning">
              Choose the columns for{' '}
              {missingRequired
                .map((field) => fields.find((item) => item.value === field)?.label.toLowerCase())
                .join(', ')}
              .
            </Alert>
          )}
          <div>
            <p className="mb-1.5 text-xs text-fg-subtle">When someone is already here</p>
            <SegmentedControl
              aria-label="When someone is already here"
              value={duplicates}
              onValueChange={(value) => setDuplicates(value as 'skip' | 'fill')}
              items={[
                { value: 'skip', label: 'Skip them' },
                { value: 'fill', label: 'Fill in their empty fields' },
              ]}
            />
          </div>
        </div>
      )}

      {step === 2 && result?.rows && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Summary label="Will be added" value={result.wouldCreate ?? 0} />
            <Summary label="Filled in" value={result.wouldUpdate ?? 0} />
            <Summary label="Skipped" value={result.duplicates ?? 0} />
            <Summary label="Problems" value={result.invalid ?? 0} />
          </dl>
          {problems.length > 0 && (
            <Alert
              tone="danger"
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    downloadCsv('rows-with-problems.csv', [
                      ['Line', 'Name', 'Email', 'Problem'],
                      ...problems.map((row) => [row.line, row.name, row.email, row.message]),
                    ])
                  }
                >
                  Download these rows
                </Button>
              }
            >
              {problems.length === 1
                ? '1 row has a problem'
                : `${problems.length} rows have problems`}{' '}
              and will be skipped. Fix them and import them again later.
            </Alert>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={
                Object.values(mapping).includes('source')
                  ? 'Source for rows without one'
                  : 'Source for everyone imported'
              }
              description={
                Object.values(mapping).includes('source')
                  ? 'Sources in the file that are not on your list are added to it.'
                  : undefined
              }
              placeholder="Spreadsheet import"
              clearable
              data={sourceOptions(sources.data)}
              value={source}
              onChange={setSource}
            />
            <TagsInput
              label="Tag everyone imported (optional)"
              placeholder="For example, career-fair-2026"
              data={tagOptions.data?.map((item) => item.tag) ?? []}
              value={tags}
              onChange={(value) => {
                setTags(value.map((tag) => tag.toLowerCase()));
              }}
            />
            <SearchSelect
              label="Add the new people to a job (optional)"
              placeholder="Search open jobs"
              value={jobId}
              onChange={setJobId}
              data={
                jobs.data?.map((job) => ({ value: job.id, label: `${job.title} · ${job.code}` })) ??
                []
              }
            />
          </div>
          <div className="max-h-72 overflow-y-auto rounded-lg border border-border-subtle">
            <Table className="min-w-[560px]">
              <THead className="sticky top-0 z-10">
                <TR>
                  <TH align="right">Line</TH>
                  <TH>Person</TH>
                  <TH>What happens</TH>
                  <TH>Note</TH>
                </TR>
              </THead>
              <TBody>
                {result.rows.slice(0, 300).map((row) => (
                  <TR key={row.line}>
                    <TD align="right" className="tnum">
                      {row.line}
                    </TD>
                    <TD>
                      <div className="font-medium">{row.name || 'No name'}</div>
                      <div className="text-xs text-fg-subtle">{row.email || 'No email'}</div>
                    </TD>
                    <TD>
                      <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                    </TD>
                    <TD className="text-fg-muted">{row.message}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}
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

type ImportBatch = {
  id: string;
  fileName: string;
  by: string;
  created: number;
  updated: number;
  skipped: number;
  createdAt: string;
  undoneAt?: string | null;
  canUndo: boolean;
};

/** The latest imports, with "Undo import" for a day after each one. */
function RecentImports() {
  const queryClient = useQueryClient();
  const [undoing, setUndoing] = useState<ImportBatch | null>(null);
  const batches = useQuery({
    queryKey: ['candidate-imports'],
    queryFn: () => api.get<ImportBatch[]>('/api/candidates/imports'),
  });
  const undo = useMutation({
    mutationFn: (batch: ImportBatch) => api.post(`/api/candidates/imports/${batch.id}/undo`),
    onSuccess: (_, batch) => {
      for (const key of ['candidate-imports', 'candidates'])
        queryClient.invalidateQueries({ queryKey: [key] });
      toast.success(`Undid the import of ${batch.fileName}`);
      setUndoing(null);
    },
    onError: (error: Error) => toast.error('Could not undo the import', error.message),
  });
  if (!batches.data?.length) return null;
  const people = (n: number) => (n === 1 ? '1 person' : `${n.toLocaleString()} people`);
  return (
    <section aria-label="Recent imports" className="mt-3 border-t border-border-subtle pt-4">
      <h3 className="mb-2 text-sm font-semibold text-fg">Recent imports</h3>
      <ul className="divide-y divide-border-subtle">
        {batches.data.slice(0, 5).map((batch) => (
          <li key={batch.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base text-fg">{batch.fileName}</span>
              <span className="block text-xs text-fg-subtle">
                {batch.by} · {formatRelative(batch.createdAt)} · {people(batch.created)} added
                {batch.updated > 0 && `, ${people(batch.updated)} filled in`}
                {batch.skipped > 0 && `, ${batch.skipped.toLocaleString()} skipped`}
              </span>
            </span>
            {batch.undoneAt ? (
              <Badge size="sm">Undone</Badge>
            ) : (
              batch.canUndo && (
                <Button size="sm" variant="secondary" onClick={() => setUndoing(batch)}>
                  Undo import
                </Button>
              )
            )}
          </li>
        ))}
      </ul>
      <ConfirmDialog
        opened={undoing !== null}
        onClose={() => setUndoing(null)}
        onConfirm={async () => {
          if (undoing)
            await undo.mutateAsync(undoing).then(
              () => undefined,
              () => undefined,
            );
        }}
        title={`Undo the import of ${undoing?.fileName ?? ''}?`}
        message={`This deletes the ${people(undoing?.created ?? 0)} it added, with anything added to them since. Details filled in on people who were already here stay.`}
        confirmLabel="Undo import"
      />
    </section>
  );
}

'use client';

import { useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { FileText, Upload } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/api';
import { Badge, Button, Input, Modal, SearchSelect, Select, Spinner, toast } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { CandidateListPage, RequisitionSummary, ResumeParsePreview } from '@/types';
import { sourceOptions, useSources } from '@/features/sources/sources-data';

type Choice = 'add' | 'attach' | 'skip';
type Row = {
  file: File;
  status: 'waiting' | 'reading' | 'ready' | 'failed' | 'saving' | 'done';
  firstName: string;
  lastName: string;
  email: string;
  error?: string;
  duplicate?: { id: string; name: string };
  choice: Choice;
  candidateId?: string;
};
const LIMIT = 50;
// ponytail: reads in the browser, three at a time, through the same read the Add candidate form
// uses; move to a server batch with a status poll if people import hundreds at once.
const AT_ONCE = 3;

/** Drop up to 50 resumes, check who each one is, then add them all (and put them in a job). */
export function ManyResumesModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const picker = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sources = useSources(opened);
  const jobs = useQuery({
    queryKey: ['requisitions', 'open'],
    queryFn: () => api.get<RequisitionSummary[]>('/api/requisitions?status=Open'),
    enabled: opened,
  });
  const patch = (index: number, next: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...next } : row)));

  const readOne = async (file: File, index: number) => {
    patch(index, { status: 'reading' });
    try {
      const data = new FormData();
      data.append('file', file);
      const { form } = await api.form<ResumeParsePreview>('/api/resumes/parse', data);
      const email = (form.basics.email ?? '').toLowerCase();
      let duplicate: Row['duplicate'];
      if (email) {
        const found = await api.get<CandidateListPage>(
          `/api/candidates?search=${encodeURIComponent(email)}&includeDnc=true&pageSize=10`,
        );
        const match = found.items.find((person) => person.email.toLowerCase() === email);
        if (match) duplicate = { id: match.id, name: match.name };
      }
      patch(index, {
        status: 'ready',
        firstName: form.basics.firstName ?? '',
        lastName: form.basics.lastName ?? '',
        email,
        duplicate,
        choice: duplicate ? 'attach' : 'add',
      });
    } catch (error) {
      patch(index, { status: 'failed', error: (error as Error).message, choice: 'skip' });
    }
  };
  const choose = async (list: FileList | null) => {
    if (!list) return;
    const files = Array.from(list)
      .filter((file) => /\.(pdf|docx)$/i.test(file.name))
      .slice(0, LIMIT - rows.length);
    if (files.length < list.length)
      toast(
        'Some files were left out',
        `We read up to ${LIMIT} PDF or Word (.docx) resumes at a time.`,
      );
    const start = rows.length;
    setRows((current) => [
      ...current,
      ...files.map((file) => ({
        file,
        status: 'waiting' as const,
        firstName: '',
        lastName: '',
        email: '',
        choice: 'add' as Choice,
      })),
    ]);
    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const index = next++;
        await readOne(files[index], start + index);
      }
    };
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
  };

  const ready = rows.filter((row) => row.status === 'ready' && row.choice !== 'skip');
  const missing = ready.some(
    (row) =>
      row.choice === 'add' &&
      (!row.firstName.trim() || !row.lastName.trim() || !/^\S+@\S+\.\S+$/.test(row.email)),
  );
  const reading = rows.some((row) => row.status === 'waiting' || row.status === 'reading');

  const save = async () => {
    setSaving(true);
    const added: string[] = [];
    for (const [index, row] of rows.entries()) {
      if (row.status !== 'ready' || row.choice === 'skip') continue;
      patch(index, { status: 'saving' });
      try {
        let candidateId = row.duplicate?.id;
        if (row.choice === 'add') {
          const data = new FormData();
          data.append('file', row.file);
          data.append('firstName', row.firstName.trim());
          data.append('lastName', row.lastName.trim());
          data.append('email', row.email.trim());
          data.append('source', source ?? 'Resume import');
          candidateId = (await api.form<{ candidateId: string }>('/api/resumes/import', data))
            .candidateId;
        } else if (candidateId) {
          const data = new FormData();
          data.append('file', row.file);
          data.append('kind', 'Resume');
          await api.form(`/api/candidates/${candidateId}/attachments`, data);
        }
        if (candidateId) added.push(candidateId);
        patch(index, { status: 'done', candidateId });
      } catch (error) {
        const duplicate =
          error instanceof ApiError && error.status === 409
            ? (error.details as { candidate?: Row['duplicate'] } | undefined)?.candidate
            : undefined;
        patch(index, {
          status: 'ready',
          error: duplicate ? undefined : (error as Error).message,
          duplicate: duplicate ?? row.duplicate,
          choice: duplicate ? 'attach' : row.choice,
        });
      }
    }
    if (jobId && added.length)
      await api
        .post('/api/candidates/bulk', { ids: added, action: 'addToJob', requisitionId: jobId })
        .catch((error: Error) => toast.error('Could not add them to the job', error.message));
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['candidates'] });
    if (added.length)
      toast.success(
        added.length === 1 ? '1 resume added' : `${added.length} resumes added`,
        jobId ? 'They are in the job you chose.' : undefined,
      );
  };
  const close = () => {
    if (saving) return;
    setRows([]);
    setJobId(null);
    onClose();
  };
  const drop = {
    onDragOver: (event: DragEvent) => {
      event.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void choose(event.dataTransfer.files);
    },
  };
  const allDone =
    rows.length > 0 && rows.every((row) => row.status === 'done' || row.choice === 'skip');

  return (
    <Modal
      opened={opened}
      onClose={close}
      dismissable={!saving}
      title="Import many resumes"
      description="We read each resume to find who it is. Check the names, then add them all at once."
      size="xl"
      footer={
        allDone ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button
              leftIcon={<Upload />}
              disabled={ready.length === 0 || reading || missing}
              loading={saving}
              onClick={save}
            >
              {ready.length === 1 ? 'Add 1 resume' : `Add ${ready.length} resumes`}
            </Button>
          </>
        )
      }
    >
      <input
        ref={picker}
        type="file"
        multiple
        accept=".pdf,.docx"
        className="hidden"
        onChange={(event) => {
          void choose(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      {rows.length < LIMIT && !saving && !allDone && (
        <button
          type="button"
          {...drop}
          onClick={() => picker.current?.click()}
          className={cn(
            'flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center transition-colors hover:bg-muted',
            dragging && 'border-primary bg-accent',
          )}
        >
          <Upload className="size-5 text-fg-subtle" aria-hidden />
          <span className="text-base font-medium text-fg">
            Drop resumes here, or click to choose them
          </span>
          <span className="text-xs text-fg-subtle">
            Up to {LIMIT} PDF or Word (.docx) files, 10 MB each
          </span>
        </button>
      )}
      {rows.length > 0 && (
        <ul className="mt-4 divide-y divide-border-subtle rounded-lg border border-border">
          {rows.map((row, index) => (
            <li key={index} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden />
              <div className="w-40 min-w-0 shrink-0">
                <p className="truncate text-sm text-fg" title={row.file.name}>
                  {row.file.name}
                </p>
                {row.error && (
                  <p className="truncate text-2xs text-destructive" title={row.error}>
                    {row.error}
                  </p>
                )}
              </div>
              {row.status === 'waiting' || row.status === 'reading' ? (
                <span className="flex flex-1 items-center gap-2 text-sm text-fg-subtle">
                  <Spinner className="size-4" />
                  {row.status === 'reading' ? 'Reading…' : 'Waiting'}
                </span>
              ) : row.status === 'failed' ? (
                <span className="flex-1 text-sm text-fg-subtle">
                  Could not read this file. It is skipped.
                </span>
              ) : row.status === 'done' ? (
                <span className="flex flex-1 items-center gap-2 text-sm">
                  <Badge tone="green">{row.choice === 'attach' ? 'Resume added' : 'Added'}</Badge>
                  {row.candidateId && (
                    <Link
                      className="text-accent-foreground hover:underline"
                      href={`/candidates/${row.candidateId}`}
                    >
                      Open profile
                    </Link>
                  )}
                </span>
              ) : (
                <>
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.4fr]">
                    <Input
                      size="sm"
                      aria-label={`First name in ${row.file.name}`}
                      placeholder="First name"
                      value={row.firstName}
                      disabled={row.choice !== 'add'}
                      onChange={(event) => patch(index, { firstName: event.currentTarget.value })}
                    />
                    <Input
                      size="sm"
                      aria-label={`Last name in ${row.file.name}`}
                      placeholder="Last name"
                      value={row.lastName}
                      disabled={row.choice !== 'add'}
                      onChange={(event) => patch(index, { lastName: event.currentTarget.value })}
                    />
                    <Input
                      size="sm"
                      className="col-span-2 sm:col-span-1"
                      aria-label={`Email in ${row.file.name}`}
                      placeholder="Email"
                      value={row.email}
                      disabled={row.choice !== 'add'}
                      onChange={(event) => patch(index, { email: event.currentTarget.value })}
                    />
                  </div>
                  <Select
                    size="sm"
                    aria-label={`What to do with ${row.file.name}`}
                    className="w-52"
                    value={row.choice}
                    onChange={(value) => patch(index, { choice: (value ?? 'add') as Choice })}
                    data={[
                      ...(row.duplicate
                        ? [{ value: 'attach', label: `Add to ${row.duplicate.name}` }]
                        : [{ value: 'add', label: 'Add as a new person' }]),
                      { value: 'skip', label: 'Skip' },
                    ]}
                  />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.some((row) => row.duplicate && row.status === 'ready') && (
        <p className="mt-2 text-xs text-fg-subtle">
          Someone already has that email, so we add the resume to their record instead.
        </p>
      )}
      {rows.length > 0 && !allDone && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Select
            label="Source"
            placeholder="Resume import"
            clearable
            data={sourceOptions(sources.data)}
            value={source}
            onChange={setSource}
          />
          <SearchSelect
            label="Add them to a job (optional)"
            placeholder="Search open jobs"
            value={jobId}
            onChange={setJobId}
            data={
              jobs.data?.map((job) => ({ value: job.id, label: `${job.title} · ${job.code}` })) ??
              []
            }
          />
        </div>
      )}
    </Modal>
  );
}

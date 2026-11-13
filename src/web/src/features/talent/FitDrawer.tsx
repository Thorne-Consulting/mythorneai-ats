'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Alert,
  Badge,
  Button,
  Drawer,
  Table,
  TBody,
  TD,
  TH,
  THead,
  toast,
  TR,
  type Tone,
} from '@/components/ui';
import { formatDateTime } from '@/lib/format';

type Fit = {
  score: number;
  cached: boolean;
  createdAt: string;
  result: {
    summary: string;
    requirements: Array<{
      requirement: string;
      kind: 'required' | 'preferred';
      status: 'met' | 'partial' | 'missing' | 'unknown';
      evidence: string;
    }>;
    concerns: string[];
  };
};

const STATUS: Record<string, { label: string; tone: Tone }> = {
  met: { label: 'Met', tone: 'green' },
  partial: { label: 'Partly', tone: 'amber' },
  missing: { label: 'Not found', tone: 'red' },
  unknown: { label: "Can't tell", tone: 'gray' },
};

export function FitDrawer({
  requisitionId,
  candidate,
  onClose,
}: {
  requisitionId: string;
  candidate: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const run = useMutation({
    mutationFn: (refresh: boolean) =>
      api.post<Fit>(
        `/api/requisitions/${requisitionId}/fit/${candidate?.id}${refresh ? '?refresh=true' : ''}`,
      ),
    onError: (error: Error, refresh) => {
      if (refresh) toast.error('Could not re-run the assessment', error.message);
    },
    onSuccess: (_result, refresh) => {
      if (refresh) toast.success('Assessment re-run');
    },
  });
  const { mutate, reset } = run;
  useEffect(() => {
    reset();
    if (candidate) mutate(false);
  }, [candidate?.id, requisitionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fit = run.data;
  return (
    <Drawer
      opened={!!candidate}
      onClose={onClose}
      size="xl"
      title={candidate ? `Assess fit: ${candidate.name}` : 'Assess fit'}
      description="AI-generated assessment. It's a starting point; you decide."
    >
      <div className="flex flex-col gap-5">
        {run.isPending && (
          <p className="text-sm text-fg-muted" aria-live="polite">
            Reading the resume against the requirements…
          </p>
        )}
        {run.isError && !fit && (
          <Alert tone="neutral" title="No assessment yet">
            {run.error.message}
          </Alert>
        )}
        {fit && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs text-fg-subtle">Requirements met (draft)</p>
                <p className="text-3xl leading-tight font-bold text-fg tnum">
                  {fit.score}
                  <span className="text-sm font-normal text-fg-subtle"> / 100</span>
                </p>
                <p className="text-xs text-fg-subtle">
                  {fit.cached ? 'Saved result from ' : 'Just run, '}
                  {formatDateTime(fit.createdAt)}
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<RefreshCw />}
                loading={run.isPending}
                onClick={() => run.mutate(true)}
              >
                Re-run
              </Button>
            </div>
            {fit.result.summary && <p className="text-base text-fg">{fit.result.summary}</p>}
            <Table className="min-w-[420px]">
              <THead>
                <TR>
                  <TH>Requirement</TH>
                  <TH>Status</TH>
                  <TH>Evidence from the resume</TH>
                </TR>
              </THead>
              <TBody>
                {fit.result.requirements.map((row) => {
                  const status = STATUS[row.status] ?? STATUS.unknown;
                  return (
                    <TR key={`${row.kind}-${row.requirement}`}>
                      <TD className="align-top">
                        <p>{row.requirement}</p>
                        <p className="text-xs text-fg-subtle">
                          {row.kind === 'required' ? 'Required' : 'Preferred'}
                        </p>
                      </TD>
                      <TD className="align-top">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </TD>
                      <TD className={row.evidence ? 'align-top' : 'align-top text-fg-subtle'}>
                        {row.evidence || 'Nothing quoted'}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            {fit.result.concerns.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-base font-semibold text-fg">Things to check</h3>
                <ul className="list-disc space-y-1 pl-5 text-base text-fg">
                  {fit.result.concerns.map((concern) => (
                    <li key={concern}>{concern}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

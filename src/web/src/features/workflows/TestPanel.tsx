'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronDown, FlaskConical } from 'lucide-react';
import { api } from '@/api';
import { Alert, Badge, Button, SearchInput, Separator, SkeletonRows } from '@/components/ui';
import { StepIcon } from '@/components/workflow/StepNode';
import { cn } from '@/lib/cn';
import { useDebouncedValue } from '@/lib/hooks';
import { defOf } from './catalog';
import { toneOf } from './StepFlowNode';
import type { DryStep, Graph } from './workflow-api';

type Pick = { id: string; candidateName: string; jobTitle: string; stage: string; status: string };

/**
 * The test run: walk the draft for one real application on the server. Nothing is saved or sent;
 * the panel shows what each step would do, with every email as it would read.
 */
export function TestPanel({
  workflowId,
  graph,
  onResult,
}: {
  workflowId: string;
  graph: () => Graph;
  onResult: (steps: DryStep[] | null) => void;
}) {
  const [query, setQuery] = useState('');
  const search = useDebouncedValue(query.trim(), 300);
  const [picked, setPicked] = useState<Pick | null>(null);
  const apps = useQuery({
    queryKey: ['workflows', 'test-applications', search],
    queryFn: () => api.get<Pick[]>(`/api/workflows/applications?q=${encodeURIComponent(search)}`),
  });
  const test = useMutation({
    mutationFn: (applicationId: string) =>
      api.post<{ steps: DryStep[] }>(`/api/workflows/${workflowId}/test`, {
        graph: graph(),
        applicationId,
      }),
    onSuccess: (data) => onResult(data.steps),
    onError: () => onResult(null),
  });
  const steps = test.data?.steps;
  const run = (app: Pick) => {
    setPicked(app);
    test.mutate(app.id);
  };

  return (
    <section aria-label="Test run" className="space-y-4">
      <p className="text-sm text-fg-muted">
        Pick a real application. We walk it through your draft and show what each step would do.
        Nothing is saved or sent, and waits are skipped.
      </p>
      {!picked || !steps ? (
        <>
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search by candidate or job"
            autoFocus
          />
          {apps.isLoading ? (
            <SkeletonRows rows={4} />
          ) : (
            <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle">
              {apps.data?.length === 0 && (
                <li className="px-3 py-4 text-sm text-fg-subtle">No applications match.</li>
              )}
              {apps.data?.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => run(a)}
                    disabled={test.isPending}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-fg">
                        {a.candidateName}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {a.jobTitle} · {a.stage}
                      </span>
                    </span>
                    {a.status !== 'Active' && <Badge size="sm">{a.status}</Badge>}
                    {test.isPending && picked?.id === a.id && (
                      <span className="text-xs text-fg-subtle">Testing…</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {test.isError && <Alert tone="danger">{test.error.message}</Alert>}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-fg">
                {picked.candidateName}
              </span>
              <span className="block truncate text-xs text-fg-subtle">{picked.jobTitle}</span>
            </span>
            <span className="flex shrink-0 gap-1.5">
              <Button
                size="xs"
                variant="secondary"
                loading={test.isPending}
                onClick={() => run(picked)}
              >
                Test again
              </Button>
              <Button
                size="xs"
                variant="quiet"
                onClick={() => {
                  setPicked(null);
                  test.reset();
                  onResult(null);
                }}
              >
                Change
              </Button>
            </span>
          </div>
          <ol className="space-y-2" aria-live="polite">
            {steps.map((s, i) => (
              <TestStep key={s.nodeId} step={s} n={i + 1} />
            ))}
          </ol>
          <Alert
            tone={steps.some((s) => s.status === 'Failed') ? 'danger' : 'success'}
            icon={FlaskConical}
          >
            {steps.some((s) => s.status === 'Failed')
              ? 'The test stopped at a step that would fail. Fix it, then test again.'
              : `The test went through ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}. Nothing was sent.`}
          </Alert>
        </>
      )}
    </section>
  );
}

function TestStep({ step, n }: { step: DryStep; n: number }) {
  const def = defOf(step.kind);
  const [open, setOpen] = useState(false);
  const emails = step.detail?.emails ?? [];
  const tone = { Done: 'green', Skipped: 'gray', Waiting: 'violet', Failed: 'red' } as const;
  const label = {
    Done: 'Would run',
    Skipped: 'Skipped',
    Waiting: 'Would wait',
    Failed: 'Would fail',
  } as const;
  return (
    <li className="rounded-lg border border-border-subtle p-3">
      <div className="flex items-start gap-2.5">
        <StepIcon icon={def.icon} tone={toneOf(def.group)} className="size-7" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <p className="text-sm font-medium text-fg">
              <span className="tnum mr-1.5 text-fg-subtle">{n}</span>
              {step.title}
            </p>
            <Badge size="sm" tone={tone[step.status]}>
              {label[step.status]}
            </Badge>
          </div>
          <p
            className={cn(
              'mt-0.5 text-xs',
              step.status === 'Failed' ? 'text-tone-red-fg' : 'text-fg-muted',
            )}
          >
            {step.output}
          </p>
          {emails.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((x) => !x)}
              aria-expanded={open}
              className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-accent-foreground hover:underline"
            >
              {open ? 'Hide' : 'Show'}{' '}
              {emails.length === 1 ? 'the email' : `${emails.length} emails`}
              <ChevronDown
                className={cn('size-3.5 transition-transform', open && 'rotate-180')}
                aria-hidden
              />
            </button>
          )}
        </div>
      </div>
      {open &&
        emails.map((e) => (
          <div key={e.id} className="mt-2 rounded-md bg-muted p-3">
            <p className="text-2xs text-fg-subtle">To {e.recipient}</p>
            <p className="mt-1 text-sm font-semibold text-fg">{e.subject}</p>
            <Separator className="my-2" />
            <p className="text-xs whitespace-pre-line text-fg-muted">{e.body}</p>
          </div>
        ))}
    </li>
  );
}

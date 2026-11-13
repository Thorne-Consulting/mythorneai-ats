'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Link2, SearchX, Share2 } from 'lucide-react';
import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  IconButton,
  SkeletonRows,
  toast,
} from '@/components/ui';
import { JobPostingView } from '@/components/careers/JobPostingView';
import { JobMeta } from './CareersBoard';
import {
  publicFetch,
  PublicError,
  useCompany,
  type PublicJob,
  type PublicJobPage,
} from './public-api';
import { parseQuestions } from './questions';

export function useJob(id: string) {
  return useQuery({
    queryKey: ['public', 'job', id],
    queryFn: () => publicFetch<PublicJob>(`/public/jobs/${id}`, {}, 'We could not load this job.'),
  });
}

/** Job missing, closed or failed to load: say which, and where to go next. */
export function JobUnavailable({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (error instanceof PublicError && error.status === 404)
    return (
      <Card>
        <EmptyState
          icon={SearchX}
          title="This job is no longer open"
          description="It may have been filled or taken down. Have a look at the jobs that are still open."
          action={
            <Button asChild>
              <Link href="/careers">See open jobs</Link>
            </Button>
          }
        />
      </Card>
    );
  return (
    <Alert
      tone="danger"
      title="We could not load this job"
      action={
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {error.message}
    </Alert>
  );
}

export function JobPage({ id }: { id: string }) {
  const company = useCompany();
  const job = useJob(id);
  const others = useQuery({
    queryKey: ['public', 'jobs', 'others'],
    queryFn: () => publicFetch<PublicJobPage>('/public/jobs?limit=6'),
  });
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);

  if (job.isPending)
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  if (job.isError) return <JobUnavailable error={job.error} onRetry={() => job.refetch()} />;

  const posting = job.data;
  const questions = parseQuestions(posting.applicationQuestionsMarkdown);
  const otherRoles = (others.data?.items ?? []).filter((j) => j.id !== id).slice(0, 5);
  const applyHref = `/careers/${id}/apply`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy the link', 'Copy it from the address bar instead.');
    }
  }

  return (
    <div className="pb-24 lg:pb-0">
      <Breadcrumbs
        items={[{ label: 'Open jobs', href: '/careers' }, { label: posting.title }]}
        className="mb-4"
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <JobPostingView job={posting} company={company} />
          {questions.length > 0 && (
            <section aria-labelledby="job-questions" className="max-w-[68ch] space-y-3">
              <h2 id="job-questions" className="text-lg font-semibold text-fg">
                What we will ask you
              </h2>
              <p className="text-base text-fg-muted">
                Along with your contact details and resume, the application asks:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-base text-fg">
                {questions.map((q) => (
                  <li key={q.text}>{q.text}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <Card className="hidden lg:block">
            <CardBody className="space-y-4 pt-5">
              <div>
                <p className="text-lg font-semibold text-fg">Interested?</p>
                <p className="mt-1 text-sm text-fg-subtle">
                  Applying takes a few steps. We email you a code to confirm it is really you.
                </p>
              </div>
              <Button asChild size="lg" fullWidth>
                <Link href={applyHref}>Apply for this job</Link>
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<Link2 />}
                  onClick={copyLink}
                  className="flex-1"
                >
                  Copy link
                </Button>
                {canShare && (
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon={<Share2 />}
                    className="flex-1"
                    onClick={() =>
                      navigator
                        .share({ title: posting.title, url: window.location.href })
                        .catch(() => {})
                    }
                  >
                    Share
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>

          {otherRoles.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title="Other open roles" />
              <ul className="border-t border-border-subtle">
                {otherRoles.map((role) => (
                  <li key={role.id} className="border-b border-border-subtle last:border-b-0">
                    <Link
                      href={`/careers/${role.id}`}
                      className="block space-y-1.5 px-5 py-3 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      <span className="block text-base font-medium text-fg">{role.title}</span>
                      <JobMeta job={role} />
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="border-t border-border-subtle px-5 py-3">
                <Link
                  href="/careers"
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent-foreground hover:underline"
                >
                  All open jobs <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </Card>
          )}
        </aside>
      </div>

      {/* Mobile: the apply action stays in reach while reading. */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border-subtle bg-card px-4 py-3 shadow-pop lg:hidden">
        <Button asChild size="lg" className="flex-1">
          <Link href={applyHref}>Apply for this job</Link>
        </Button>
        <IconButton size="lg" label="Copy link to this job" onClick={copyLink}>
          <Link2 />
        </IconButton>
      </div>
    </div>
  );
}

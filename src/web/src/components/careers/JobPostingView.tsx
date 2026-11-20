import type { ReactNode } from 'react';
import { Banknote, Briefcase, CalendarDays, MapPin, Users } from 'lucide-react';
import { RichText } from '@/components/rich-text';
import { Badge, type Tone } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatDate, humanize } from '@/lib/format';

export type JobPosting = {
  title: string;
  code?: string;
  department: string;
  location: string;
  workMode: string;
  employmentType: string;
  openings?: number;
  description?: string | null;
  targetStartDate?: string | null;
};

export type JobFact = { key: string; label: string; value: string; tone: Tone; icon?: ReactNode };

/** The job's facts in reading order. The chips under the title and the sidebar list both come from here. */
export function jobFacts(job: JobPosting, pay?: string | null): JobFact[] {
  const facts: (JobFact | false | null | undefined | '')[] = [
    { key: 'team', label: 'Team', value: job.department, tone: 'blue', icon: <Briefcase /> },
    {
      key: 'location',
      label: 'Location',
      value: `${job.location} · ${humanize(job.workMode)}`,
      tone: 'gray',
      icon: <MapPin />,
    },
    { key: 'type', label: 'Type', value: humanize(job.employmentType), tone: 'gray' },
    pay && { key: 'pay', label: 'Pay', value: pay, tone: 'green', icon: <Banknote /> },
    !!job.openings &&
      job.openings > 1 && {
        key: 'openings',
        label: 'Openings',
        value: `${job.openings} openings`,
        tone: 'green',
        icon: <Users />,
      },
    job.targetStartDate && {
      key: 'start',
      label: 'Start date',
      value: `Starts ${formatDate(job.targetStartDate)}`,
      tone: 'gray',
      icon: <CalendarDays />,
    },
  ];
  return facts.filter((fact): fact is JobFact => !!fact);
}

/** The facts as a labelled list, for the sticky apply card. */
export function JobFacts({ job, pay }: { job: JobPosting; pay?: string | null }) {
  return (
    <dl className="space-y-3">
      {jobFacts(job, pay).map((fact) => (
        <div key={fact.key} className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-fg-subtle [&_svg]:size-4"
          >
            {fact.icon}
          </span>
          <div className="min-w-0">
            <dt className="text-xs text-fg-subtle">{fact.label}</dt>
            <dd className="text-sm font-medium text-fg">{fact.value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/**
 * How a job reads to applicants. Shared by the careers page and the "Job posting" preview on the
 * job record, so recruiters see exactly what candidates will see. `action` is the apply button slot.
 */
export function JobPostingView({
  job,
  action,
  company,
  pay,
  emptyDescription,
  factsInSidebar,
}: {
  job: JobPosting;
  action?: ReactNode;
  company?: string | null;
  /** The pay range as people read it, when the team shows it on the posting. */
  pay?: string | null;
  /** Shown instead of the description while there is none (a quieter line for previews). */
  emptyDescription?: string;
  /** The page shows the facts in a sidebar from the large breakpoint up, so the chips only stay for small screens. */
  factsInSidebar?: boolean;
}) {
  return (
    <article className="space-y-6">
      <header className="space-y-3">
        {company && <p className="text-sm font-medium text-accent-foreground">{company}</p>}
        <h1 className="text-3xl font-bold tracking-[-0.01em] text-fg sm:text-4xl">{job.title}</h1>
        <div className={cn('flex flex-wrap gap-2', factsInSidebar && 'lg:hidden')}>
          {jobFacts(job, pay).map((fact) => (
            <Badge key={fact.key} tone={fact.tone} icon={fact.icon}>
              {fact.value}
            </Badge>
          ))}
        </div>
        {action}
      </header>
      <section aria-label="About the role" className="max-w-[68ch]">
        <RichText
          markdown={job.description}
          className="text-md"
          empty={
            emptyDescription ? (
              <p className="text-sm text-fg-subtle">{emptyDescription}</p>
            ) : (
              <p className="text-md text-fg-subtle">No description has been added yet.</p>
            )
          }
        />
      </section>
    </article>
  );
}

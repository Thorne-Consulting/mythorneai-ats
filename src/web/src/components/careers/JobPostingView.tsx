import type { ReactNode } from 'react';
import { Briefcase, CalendarDays, MapPin, Users } from 'lucide-react';
import { Badge } from '@/components/ui';
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

/**
 * How a job reads to applicants. Shared by the careers page and the "Job posting" preview on the
 * job record, so recruiters see exactly what candidates will see. `action` is the apply button slot.
 */
export function JobPostingView({
  job,
  action,
  company,
}: {
  job: JobPosting;
  action?: ReactNode;
  company?: string | null;
}) {
  const paragraphs = (job.description ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <article className="space-y-6">
      <header className="space-y-3">
        {company && <p className="text-sm font-medium text-accent-foreground">{company}</p>}
        <h1 className="text-3xl font-bold tracking-[-0.01em] text-fg sm:text-4xl">{job.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge tone="blue" icon={<Briefcase />}>
            {job.department}
          </Badge>
          <Badge tone="gray" icon={<MapPin />}>
            {job.location} · {humanize(job.workMode)}
          </Badge>
          <Badge tone="gray">{humanize(job.employmentType)}</Badge>
          {job.openings && job.openings > 1 && (
            <Badge tone="green" icon={<Users />}>
              {job.openings} openings
            </Badge>
          )}
          {job.targetStartDate && (
            <Badge tone="gray" icon={<CalendarDays />}>
              Starts {formatDate(job.targetStartDate)}
            </Badge>
          )}
        </div>
        {action}
      </header>
      <section
        aria-label="About the role"
        className="max-w-[68ch] space-y-4 text-md leading-relaxed text-fg"
      >
        {paragraphs.length ? (
          paragraphs.map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {p}
            </p>
          ))
        ) : (
          <p className="text-fg-subtle">No description has been added yet.</p>
        )}
      </section>
    </article>
  );
}

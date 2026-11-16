'use client';

import { Button, FilterSelect, Input } from '@/components/ui';
import {
  BREAKDOWN_LABELS,
  RANGES,
  rangeOptionLabel,
  type Filters,
  type ReportInfo,
} from './report-data';
import { useReportOptions } from './queries';

export const CLEARED: Partial<Filters> = {
  requisitionId: '',
  department: '',
  source: '',
  recruiter: '',
  range: '',
  from: '',
  to: '',
};

/** Dates, job, department, source and recruiter, plus the report's "Break down by" choice. */
export function ReportFilters({
  info,
  filters,
  onChange,
}: {
  info?: ReportInfo;
  filters: Filters;
  onChange: (next: Partial<Filters>) => void;
}) {
  const options = useReportOptions().data;
  const dateField = info?.dateField ?? 'applied';
  const range = filters.range || (filters.from || filters.to ? 'custom' : '');
  const filtered = !!(
    filters.requisitionId ||
    filters.department ||
    filters.source ||
    filters.recruiter ||
    range
  );
  // A filter with one possible value can't narrow anything, so it stays out of the way.
  const worth = (count: number | undefined, value: string) => (count ?? 0) > 1 || !!value;
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <FilterSelect
        aria-label="Dates"
        allLabel={rangeOptionLabel(dateField, '')}
        value={range || null}
        data={RANGES.map((r) => ({ value: r.value, label: rangeOptionLabel(dateField, r.value) }))}
        onChange={(value) =>
          onChange(
            value === 'custom' ? { range: 'custom' } : { range: value ?? '', from: '', to: '' },
          )
        }
      />
      {range === 'custom' && (
        <span className="flex items-center gap-1.5">
          <Input
            type="date"
            aria-label="From"
            title="From"
            className="w-[150px]"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(event) => onChange({ from: event.currentTarget.value })}
          />
          <span className="text-sm text-fg-subtle">to</span>
          <Input
            type="date"
            aria-label="To"
            title="To"
            className="w-[150px]"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(event) => onChange({ to: event.currentTarget.value })}
          />
        </span>
      )}
      {worth(options?.jobs.length, filters.requisitionId) && (
        <FilterSelect
          aria-label="Job"
          allLabel="All jobs"
          value={filters.requisitionId || null}
          data={options?.jobs ?? []}
          onChange={(value) => onChange({ requisitionId: value ?? '' })}
          className="max-w-full"
        />
      )}
      {worth(options?.departments.length, filters.department) && (
        <FilterSelect
          aria-label="Department"
          allLabel="All departments"
          value={filters.department || null}
          data={options?.departments ?? []}
          onChange={(value) => onChange({ department: value ?? '' })}
        />
      )}
      {worth(options?.sources.length, filters.source) && (
        <FilterSelect
          aria-label="Source"
          allLabel="All sources"
          value={filters.source || null}
          data={options?.sources ?? []}
          onChange={(value) => onChange({ source: value ?? '' })}
        />
      )}
      {worth(options?.recruiters.length, filters.recruiter) && (
        <FilterSelect
          aria-label="Recruiter"
          allLabel="All recruiters"
          value={filters.recruiter || null}
          data={options?.recruiters ?? []}
          onChange={(value) => onChange({ recruiter: value ?? '' })}
        />
      )}
      {filtered && (
        <Button variant="quiet" onClick={() => onChange(CLEARED)}>
          Clear filters
        </Button>
      )}
      {!!info?.breakdowns.length && (
        <span className="flex items-center gap-2 sm:ml-auto">
          <span className="text-sm text-fg-subtle" id="breakdown-label">
            Break down by
          </span>
          <FilterSelect
            aria-label="Break down by"
            allLabel="Nothing"
            value={filters.groupBy || null}
            data={info.breakdowns.map((key) => ({
              value: key,
              label: BREAKDOWN_LABELS[key] ?? key,
            }))}
            onChange={(value) => onChange({ groupBy: value ?? '' })}
          />
        </span>
      )}
    </div>
  );
}

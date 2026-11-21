'use client';

import { SlidersHorizontal } from 'lucide-react';
import {
  Button,
  Checkbox,
  CountBadge,
  MultiSelect,
  NumberInput,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
  TagsInput,
} from '@/components/ui';
import { activeFilterCount, NO_FILTERS, type PipelineFilters } from './pipeline-stats';

const days = (list: number[]) => list.map((n) => ({ value: String(n), label: `${n} days` }));
const ASSESSMENTS = [
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'waiting', label: 'Sent, no decision yet' },
  { value: 'none', label: 'No assessment' },
];
const FITS = [50, 60, 70, 80, 90].map((n) => ({ value: String(n), label: `${n}% or more` }));

/**
 * The filters for one job's board and list, beyond the search box and the stage chips. They work
 * on what the cards already carry, so nothing is fetched again.
 */
export function PipelineFilterButton({
  filters,
  onChange,
  sources,
}: {
  filters: PipelineFilters;
  onChange: (next: PipelineFilters) => void;
  /** The sources the job's applicants came from. */
  sources: string[];
}) {
  const count = activeFilterCount(filters);
  const set = (patch: Partial<PipelineFilters>) => onChange({ ...filters, ...patch });
  const number = (value: string | null) => (value ? Number(value) : null);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" leftIcon={<SlidersHorizontal />}>
          Filters
          {count > 0 && <CountBadge count={count} />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(70vh,640px)] w-[min(92vw,520px)] overflow-y-auto"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <MultiSelect
            className="sm:col-span-2"
            label="Source"
            placeholder="Any source"
            data={sources}
            value={filters.sources}
            onChange={(value) => set({ sources: value })}
          />
          <TagsInput
            className="sm:col-span-2"
            label="Skills (any of them)"
            placeholder="Type a skill and press Enter"
            value={filters.skills}
            onChange={(value) => set({ skills: value })}
          />
          <TagsInput
            className="sm:col-span-2"
            label="Tags (any of them)"
            placeholder="Type a tag and press Enter"
            value={filters.tags}
            onChange={(value) => set({ tags: value })}
          />
          <NumberInput
            label="Minimum years of experience"
            min={0}
            max={50}
            value={filters.minYears ?? ''}
            onValueChange={(value) => set({ minYears: value === '' ? null : value })}
          />
          <Select
            label="AI fit check"
            clearable
            placeholder="Any"
            data={FITS}
            value={filters.minFit === null ? null : String(filters.minFit)}
            onChange={(value) => set({ minFit: number(value) })}
          />
          <div>
            <p className="mb-1.5 text-xs text-fg-subtle">Minimum rating</p>
            <SegmentedControl
              size="sm"
              aria-label="Minimum rating"
              value={filters.minRating === null ? 'any' : String(filters.minRating)}
              onValueChange={(value) => set({ minRating: value === 'any' ? null : Number(value) })}
              items={['any', '1', '2', '3', '4', '5'].map((value) => ({
                value,
                label: value === 'any' ? 'Any' : value,
              }))}
            />
          </div>
          <Select
            label="Assessment"
            clearable
            placeholder="Any"
            data={ASSESSMENTS}
            value={filters.assessment}
            onChange={(value) => set({ assessment: value as PipelineFilters['assessment'] })}
          />
          <Select
            label="Applied in the last"
            clearable
            placeholder="Any time"
            data={days([3, 7, 14, 30])}
            value={filters.appliedWithin === null ? null : String(filters.appliedWithin)}
            onChange={(value) => set({ appliedWithin: number(value) })}
          />
          <Select
            label="No activity for"
            clearable
            placeholder="Any"
            data={days([3, 7, 14, 30])}
            value={filters.idleDays === null ? null : String(filters.idleDays)}
            onChange={(value) => set({ idleDays: number(value) })}
          />
          <div className="flex flex-col gap-3 sm:col-span-2">
            <Checkbox
              label="Flagged answers only"
              checked={filters.flagged}
              onCheckedChange={(checked) => set({ flagged: checked })}
            />
            <Checkbox
              label="Waiting on interview feedback"
              checked={filters.feedbackOwed}
              onCheckedChange={(checked) => set({ feedbackOwed: checked })}
            />
            <Checkbox
              label="Has an interview coming up"
              checked={filters.hasInterview}
              onCheckedChange={(checked) => set({ hasInterview: checked })}
            />
          </div>
          {count > 0 && (
            <div className="flex justify-end sm:col-span-2">
              <Button variant="quiet" size="sm" onClick={() => onChange(NO_FILTERS)}>
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

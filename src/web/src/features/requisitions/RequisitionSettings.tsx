'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api';
import {
  Autocomplete,
  Card,
  Checkbox,
  Input,
  MultiSelect,
  NumberInput,
  SearchSelect,
  Select,
  SkeletonRows,
  Switch,
} from '@/components/ui';
import { countryName, countryOptions } from './countries';
import { PERIODS, locationText, payProblem, payText } from './job-form';
import { useSupportedCurrencyCodes } from '@/features/currencies/currency-data';
import {
  useRequisition,
  useUpdateJob,
  useUpdateJobSettings,
  type JobChanges,
} from './requisition-data';
import type { RequisitionWithSettings } from './requirements-types';

const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];
const EMPLOYMENT_TYPES = ['Full time', 'Part time', 'Contract', 'Internship', 'Temporary'];

export function RequisitionSettingsTab({ id }: { id: string }) {
  const details = useRequisition(id);
  if (!details.data)
    return (
      <Card>
        <SkeletonRows rows={3} />
      </Card>
    );
  return (
    <div className="max-w-[920px]">
      <RequisitionSettings requisition={details.data as RequisitionWithSettings} />
    </div>
  );
}

/**
 * The job's own facts and what candidates can do themselves. The posting, the team and who can
 * see the job have their own tabs. Text saves when you leave a field; choices save at once.
 */
export function RequisitionSettings({ requisition }: { requisition: RequisitionWithSettings }) {
  const saveJob = useUpdateJob(requisition.id);
  const saveSettings = useUpdateJobSettings(requisition.id);
  // Team suggests the values other jobs use, so spellings stay the same.
  const values = useQuery({
    queryKey: ['requisition-values'],
    queryFn: () => api.get<{ departments: string[] }>('/api/requisitions/values'),
    staleTime: 60_000,
  }).data;
  const structured = !!(requisition.locationCity || requisition.locationCountry);

  const saved = {
    title: requisition.title,
    department: requisition.department,
    location: requisition.location,
    employmentType: requisition.employmentType,
    workMode: requisition.workMode,
    openings: requisition.openings,
    targetStartDate: requisition.targetStartDate?.slice(0, 10) ?? '',
    // Jobs from before structured places keep their text as the city until someone changes it.
    locationCity: requisition.locationCity ?? (structured ? '' : requisition.location),
    locationRegion: requisition.locationRegion ?? '',
    locationCountry: requisition.locationCountry ?? '',
    remoteCountries: requisition.remoteCountries ?? [],
    salaryMin: requisition.salaryMin ?? ('' as number | ''),
    salaryMax: requisition.salaryMax ?? ('' as number | ''),
    salaryCurrency: requisition.salaryCurrency ?? 'USD',
    salaryPeriod: requisition.salaryPeriod ?? 'Year',
    showSalary: !!requisition.showSalary,
  };
  type Fields = typeof saved;
  const savedKey = JSON.stringify(saved);
  const [fields, setFields] = useState(saved);
  useEffect(() => setFields(JSON.parse(savedKey) as Fields), [savedKey]);

  const pay = {
    min: fields.salaryMin,
    max: fields.salaryMax,
    currency: fields.salaryCurrency,
    period: fields.salaryPeriod,
    show: fields.showSalary,
  };
  const payError = payProblem(pay);
  const commit = (input: Fields) => {
    // The location people read follows the place's parts.
    const place = {
      city: input.locationCity,
      region: input.locationRegion,
      country: input.locationCountry,
      remoteCountries: input.remoteCountries,
    };
    const next = {
      ...input,
      location: locationText(place, input.workMode, countryName) || input.location,
    };
    const changed = Object.entries(next).filter(
      ([key, value]) => JSON.stringify(saved[key as keyof Fields]) !== JSON.stringify(value),
    );
    if (
      changed.length === 0 ||
      payProblem({ ...pay, min: next.salaryMin, max: next.salaryMax, show: next.showSalary })
    )
      return;
    const changes = Object.fromEntries(
      changed.map(([key, value]) => [
        key,
        value === '' && key.startsWith('salaryM') ? null : value,
      ]),
    ) as JobChanges;
    saveJob.mutate(changes);
  };
  const text = (key: 'title' | 'targetStartDate') => ({
    value: fields[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      setFields({ ...fields, [key]: event.currentTarget.value }),
  });
  const suggest = (key: 'department') => ({
    value: fields[key],
    data: values?.departments ?? [],
    onChange: (value: string) => setFields({ ...fields, [key]: value }),
    onOptionSubmit: (value: string) => {
      const next = { ...fields, [key]: value };
      setFields(next);
      commit(next);
    },
  });
  const currencies = useSupportedCurrencyCodes();
  const pick = (key: 'workMode' | 'employmentType' | 'salaryCurrency' | 'salaryPeriod') => ({
    value: fields[key],
    onChange: (value: string | null) => {
      if (!value) return;
      const next = { ...fields, [key]: value };
      setFields(next);
      commit(next);
    },
  });

  const saving = saveJob.isPending || saveSettings.isPending;
  const failed = !saving && (saveJob.isError || saveSettings.isError);
  const touched = saveJob.isSuccess || saveSettings.isSuccess;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-fg-subtle" aria-live="polite">
        {saving
          ? 'Saving…'
          : failed
            ? 'Your last change was not saved. Try again.'
            : touched
              ? 'All changes saved.'
              : 'Changes save as you go.'}
      </p>
      <Block title="The job" copy="Candidates see these on the posting.">
        {/* Typed values save when you leave the field (blur bubbles from the inputs). */}
        <div className="grid gap-4 sm:grid-cols-2" onBlur={() => commit(fields)}>
          <Input className="sm:col-span-2" label="Job title" {...text('title')} />
          <Autocomplete label="Team" {...suggest('department')} />
          <Select label="Employment type" data={EMPLOYMENT_TYPES} {...pick('employmentType')} />
          <NumberInput
            label="Openings"
            min={1}
            value={fields.openings}
            onValueChange={(openings) => setFields({ ...fields, openings: Number(openings) || 1 })}
          />
          <Input type="date" label="Target start" {...text('targetStartDate')} />
        </div>
      </Block>
      <Block title="Where" copy={`Applicants see: ${saved.location || 'Not set'}`}>
        <div className="grid gap-4 sm:grid-cols-2" onBlur={() => commit(fields)}>
          <Select label="Work mode" data={WORK_MODES} {...pick('workMode')} />
          <Input
            label="City"
            value={fields.locationCity}
            onChange={(e) => setFields({ ...fields, locationCity: e.currentTarget.value })}
          />
          <Input
            label="State or region"
            value={fields.locationRegion}
            onChange={(e) => setFields({ ...fields, locationRegion: e.currentTarget.value })}
          />
          <SearchSelect
            label="Country"
            placeholder="Search countries"
            value={fields.locationCountry || null}
            data={countryOptions()}
            onChange={(country) => {
              const next = { ...fields, locationCountry: country ?? '' };
              setFields(next);
              commit(next);
            }}
          />
          {fields.workMode === 'Remote' && (
            <MultiSelect
              className="sm:col-span-2"
              label="People can work from"
              description="Leave empty for anywhere."
              placeholder="Search countries"
              data={countryOptions()}
              value={fields.remoteCountries}
              onChange={(remoteCountries) => {
                const next = { ...fields, remoteCountries };
                setFields(next);
                commit(next);
              }}
            />
          )}
        </div>
      </Block>
      <Block
        title="Pay"
        copy={
          payText(pay)
            ? `${payText(pay)}${pay.show ? ', on the posting' : ', not shown'}`
            : 'Not set'
        }
      >
        <div className="flex flex-col gap-4" onBlur={() => commit(fields)}>
          <div className="grid gap-4 sm:grid-cols-4">
            <NumberInput
              label="From"
              min={0}
              step={1000}
              value={fields.salaryMin}
              error={payError ?? undefined}
              onValueChange={(salaryMin) => setFields({ ...fields, salaryMin })}
            />
            <NumberInput
              label="To"
              min={0}
              step={1000}
              value={fields.salaryMax}
              onValueChange={(salaryMax) => setFields({ ...fields, salaryMax })}
            />
            <Select label="Currency" data={currencies.options} {...pick('salaryCurrency')} />
            <Select
              label="Per"
              data={PERIODS.map((p) => ({ value: p.value, label: p.label.replace(/^an? /, '') }))}
              {...pick('salaryPeriod')}
            />
          </div>
          <Switch
            label="Show the pay range on the posting"
            description="Applicants and search engines see it."
            checked={fields.showSalary}
            onCheckedChange={(showSalary) => {
              const next = { ...fields, showSalary };
              setFields(next);
              commit(next);
            }}
          />
        </div>
      </Block>
      <Block
        title="Candidate self-service"
        copy="Things candidates can do themselves, from their portal or the links in our emails."
      >
        <div className="flex flex-col gap-3">
          <Checkbox
            label="Reschedule or cancel their interview"
            checked={requisition.allowCandidateReschedule ?? false}
            onCheckedChange={(checked) =>
              saveSettings.mutate({ allowCandidateReschedule: checked })
            }
          />
          <Checkbox
            label="Withdraw their application"
            checked={requisition.allowCandidateWithdraw ?? false}
            onCheckedChange={(checked) => saveSettings.mutate({ allowCandidateWithdraw: checked })}
          />
        </div>
      </Block>
    </div>
  );
}

/** One settings group: what it does on the left, the controls on the right. */
function Block({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return (
    <Card className="grid gap-5 p-5 md:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-lg font-semibold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{copy}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </Card>
  );
}

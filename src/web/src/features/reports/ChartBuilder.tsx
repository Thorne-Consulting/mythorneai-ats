'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChartNoAxesCombined, X } from 'lucide-react';
import { Button, MultiSelect, NumberInput, Select } from '@/components/ui';
import { ReportChartView } from './ReportChartView';
import {
  CHART_FORMS,
  buildChart,
  defaultSpec,
  labelColumns,
  numericColumns,
  type ChartSpec,
} from './custom-chart';
import type { Cell } from './report-data';

const KEY = (id: string) => `report-chart:${id}`;

function load(id: string): ChartSpec | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    return raw ? (JSON.parse(raw) as ChartSpec) : null;
  } catch {
    return null;
  }
}

/**
 * Make a chart from the report's own table: choose a form, what names each row, and which
 * numbers to draw. The choice is kept in this browser per report and breakdown.
 */
export function ChartBuilder({
  id,
  columns,
  rows,
  open,
  onClose,
}: {
  id: string;
  columns: string[];
  rows: Cell[][];
  open: boolean;
  onClose: () => void;
}) {
  const numbers = useMemo(() => numericColumns(columns, rows), [columns, rows]);
  const labels = useMemo(() => labelColumns(columns, rows), [columns, rows]);
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  useEffect(() => {
    const saved = load(id);
    const ok =
      saved && columns.includes(saved.label) && saved.values.every((v) => columns.includes(v));
    setSpec(ok ? saved : defaultSpec(columns, rows));
  }, [id, columns, rows]);
  useEffect(() => {
    if (!spec) return;
    try {
      localStorage.setItem(KEY(id), JSON.stringify(spec));
    } catch {
      // Private window or storage off: the chart still shows, it is just not remembered.
    }
  }, [id, spec]);
  if (!open || !spec) return null;

  const form = CHART_FORMS.find((f) => f.kind === spec.kind) ?? CHART_FORMS[0];
  const set = (patch: Partial<ChartSpec>) => setSpec({ ...spec, ...patch });
  const chart = { ...buildChart(columns, rows, spec), report: 'custom' };
  const valuesHelp =
    form.values === 'one'
      ? 'One number per row.'
      : form.values === 'xy'
        ? 'Two numbers: the first goes across, the second up.'
        : 'One or more numbers per row.';
  return (
    <ReportChartView
      chart={chart}
      className="lg:col-span-2"
      emptyText="Choose a column with numbers to draw."
      action={
        <Button
          variant="quiet"
          size="sm"
          leftIcon={<X />}
          onClick={onClose}
          aria-label="Close the chart maker"
        >
          Close
        </Button>
      }
      toolbar={
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Form"
            value={spec.kind}
            onChange={(kind) => kind && set({ kind: kind as ChartSpec['kind'] })}
            data={CHART_FORMS.map((f) => ({ value: f.kind, label: f.label }))}
          />
          <Select
            label="Name each row by"
            value={spec.label}
            onChange={(label) => label && set({ label })}
            data={labels}
          />
          <MultiSelect
            label="Numbers to draw"
            description={valuesHelp}
            value={spec.values}
            onChange={(values) => set({ values })}
            data={numbers}
          />
          <NumberInput
            label="Keep the top"
            description="0 keeps every row."
            min={0}
            step={1}
            value={spec.top}
            onValueChange={(top) => set({ top: top === '' ? 0 : Math.max(0, Math.round(top)) })}
          />
        </div>
      }
    />
  );
}

/** The button that opens the chart maker, for the table toolbar. */
export function ChartBuilderButton({ onClick, open }: { onClick: () => void; open: boolean }) {
  return (
    <Button variant="secondary" size="sm" leftIcon={<ChartNoAxesCombined />} onClick={onClick}>
      {open ? 'Chart maker is open' : 'Make a chart'}
    </Button>
  );
}

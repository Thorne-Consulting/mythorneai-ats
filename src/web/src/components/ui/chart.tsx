'use client';

import type { ReactNode } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend as RLegend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart as RScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  BarChart as RBarChart,
} from 'recharts';
import { cn } from '@/lib/cn';

/** Series colours in order. Always tokens, so charts follow the theme. */
export const chartColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
];
/** `dashed` draws a comparison series (the previous period). `unit` follows the value in tooltips. */
export type Series = {
  key: string;
  label?: string;
  color?: string;
  dashed?: boolean;
  unit?: string;
};
type Row = Record<string, string | number | null>;
/** A target or pass mark drawn across the chart. */
export type Reference = { x?: number | string; y?: number; label?: string };
/** Called with the row index when a bar, point or slice is clicked (drill-down). */
export type OnSelect = (index: number) => void;

const indexOf = (state: { activeTooltipIndex?: unknown } | null | undefined) => {
  const value = Number(state?.activeTooltipIndex);
  return state?.activeTooltipIndex == null || Number.isNaN(value) ? null : value;
};

function references(items: Reference[] | undefined) {
  return items?.map((r, i) => (
    <ReferenceLine
      key={i}
      x={r.x}
      y={r.y}
      stroke="var(--fg-subtle)"
      strokeDasharray="4 4"
      label={
        r.label
          ? { value: r.label, position: 'insideTopRight', fill: 'var(--fg-muted)', fontSize: 11 }
          : undefined
      }
    />
  ));
}

/** Wrap a category label onto at most two lines, so long names never run off the chart. */
export function wrapLabel(text: string, perLine: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= perLine || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= 2)
    return lines.map((l) => (l.length > perLine ? `${l.slice(0, perLine - 1)}…` : l));
  const second = lines.slice(1).join(' ');
  return [lines[0], second.length > perLine ? `${second.slice(0, perLine - 1)}…` : second];
}

function CategoryTick(props: {
  x?: number | string;
  y?: number | string;
  payload?: { value?: unknown };
  perLine: number;
}) {
  const text = String(props.payload?.value ?? '');
  const lines = wrapLabel(text, props.perLine);
  return (
    <text x={props.x} y={props.y} textAnchor="end" fill="var(--fg-subtle)" fontSize={11}>
      <title>{text}</title>
      {lines.map((line, i) => (
        <tspan key={i} x={props.x} dy={i === 0 ? (lines.length > 1 ? -2 : 4) : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

const axis = {
  stroke: 'var(--fg-subtle)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;
const grid = { stroke: 'var(--border-subtle)', strokeDasharray: '' };

function TooltipBox({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string; unit?: ReactNode }[];
  label?: ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-pop">
      {label !== undefined && <p className="mb-1 font-medium text-fg">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-fg-muted">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          {p.name}
          <span className="ml-auto pl-3 font-medium text-fg tnum">
            {p.value}
            {p.unit}
          </span>
        </p>
      ))}
    </div>
  );
}

/** Inline legend row: ● Applications ● Interviews ● Hires (Figma "Hiring activity"). */
export function ChartLegend({ series, className }: { series: Series[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-2xs text-fg-muted', className)}>
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          {s.dashed ? (
            <span
              className="w-3 border-t-2 border-dashed"
              style={{ borderColor: s.color ?? chartColors[i % chartColors.length] }}
            />
          ) : (
            <span
              className="size-2 rounded-full"
              style={{ background: s.color ?? chartColors[i % chartColors.length] }}
            />
          )}
          {s.label ?? s.key}
        </li>
      ))}
    </ul>
  );
}

const color = (s: Series, i: number) => s.color ?? chartColors[i % chartColors.length];
/** The value axis shows a unit (such as %) only when every series uses it. */
const sharedUnit = (series: Series[]) =>
  series.length > 0 && series.every((s) => s.unit && s.unit === series[0].unit)
    ? series[0].unit
    : undefined;

/** Line chart over a category axis. `area` adds the soft fill under the first series. */
export function LineChart({
  data,
  dataKey,
  series,
  height = 220,
  area = true,
  legend = true,
  onSelect,
  references: refs,
}: {
  data: Row[];
  dataKey: string;
  series: Series[];
  height?: number;
  area?: boolean;
  legend?: boolean;
  onSelect?: OnSelect;
  references?: Reference[];
}) {
  return (
    <div>
      {legend && series.length > 1 && <ChartLegend series={series} className="mb-2" />}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart
          data={data}
          margin={{ top: 6, right: 8, bottom: 0, left: -18 }}
          onClick={
            onSelect ? (state) => indexOf(state) !== null && onSelect(indexOf(state)!) : undefined
          }
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <defs>
            <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} {...grid} />
          <XAxis dataKey={dataKey} minTickGap={14} {...axis} />
          <YAxis allowDecimals={false} unit={sharedUnit(series)} {...axis} />
          <RTooltip content={<TooltipBox />} cursor={{ stroke: 'var(--border)' }} />
          {area && series[0] && (
            <Area
              type="monotone"
              dataKey={series[0].key}
              stroke="none"
              fill="url(#area-fill)"
              legendType="none"
              tooltipType="none"
            />
          )}
          {references(refs)}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label ?? s.key}
              unit={s.unit}
              stroke={color(s, i)}
              strokeWidth={s.dashed ? 1.5 : 2}
              strokeDasharray={s.dashed ? '5 4' : undefined}
              dot={
                !s.dashed && data.length <= 16
                  ? { r: 2.5, strokeWidth: 0, fill: color(s, i) }
                  : false
              }
              activeDot={{ r: 4 }}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bars. `horizontal` lays long category names down the left. */
export function BarChart({
  data,
  dataKey,
  series,
  height,
  horizontal,
  stacked,
  legend = true,
  onSelect,
  references: refs,
}: {
  data: Row[];
  dataKey: string;
  series: Series[];
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  legend?: boolean;
  onSelect?: OnSelect;
  references?: Reference[];
}) {
  const h = height ?? (horizontal ? Math.max(160, data.length * 34 + 40) : 220);
  // Category labels down the left get the width they need, up to two lines of 22 characters.
  const longest = Math.max(4, ...data.map((d) => String(d[dataKey] ?? '').length));
  const perLine = Math.min(22, longest);
  const labelWidth = Math.round(perLine * 6.2 + 12);
  return (
    <div>
      {legend && series.length > 1 && <ChartLegend series={series} className="mb-2" />}
      <ResponsiveContainer width="100%" height={h}>
        <RBarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 6, right: 8, bottom: 0, left: horizontal ? 0 : -18 }}
          onClick={
            onSelect ? (state) => indexOf(state) !== null && onSelect(indexOf(state)!) : undefined
          }
          style={onSelect ? { cursor: 'pointer' } : undefined}
        >
          <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} {...grid} />
          {horizontal ? (
            <>
              <XAxis type="number" allowDecimals={false} unit={sharedUnit(series)} {...axis} />
              <YAxis
                type="category"
                dataKey={dataKey}
                width={labelWidth}
                interval={0}
                {...axis}
                tick={<CategoryTick perLine={perLine} />}
              />
            </>
          ) : (
            <>
              <XAxis dataKey={dataKey} minTickGap={8} {...axis} />
              <YAxis allowDecimals={false} unit={sharedUnit(series)} {...axis} />
            </>
          )}
          <RTooltip content={<TooltipBox />} cursor={{ fill: 'var(--accent)' }} />
          {references(refs)}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label ?? s.key}
              unit={s.unit}
              fill={color(s, i)}
              stackId={stacked ? 'a' : undefined}
              radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
              maxBarSize={28}
            />
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type Slice = { name: string; value: number; color?: string };

/** Donut with a big centre number and a legend with percentages (Figma "Candidate sources"). */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  size = 160,
  legend = true,
  onSelect,
}: {
  data: Slice[];
  centerValue?: ReactNode;
  centerLabel?: ReactNode;
  size?: number;
  legend?: boolean;
  onSelect?: OnSelect;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
              onClick={onSelect ? (_, index) => onSelect(index) : undefined}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              {data.map((d, i) => (
                <Cell key={d.name} fill={d.color ?? chartColors[i % chartColors.length]} />
              ))}
            </Pie>
            <RTooltip content={<TooltipBox />} />
          </PieChart>
        </ResponsiveContainer>
        {(centerValue !== undefined || centerLabel) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-fg tnum">{centerValue}</span>
            {centerLabel && <span className="text-xs text-fg-muted">{centerLabel}</span>}
          </div>
        )}
      </div>
      {legend && (
        <ul className="min-w-40 flex-1 space-y-2.5">
          {data.map((d, i) => {
            const body = (
              <>
                <span
                  className="size-3 shrink-0 rounded-[3px]"
                  style={{ background: d.color ?? chartColors[i % chartColors.length] }}
                />
                <span className="min-w-0 flex-1 text-left break-words text-fg-muted">{d.name}</span>
                <span className="font-medium text-fg tnum">
                  {Math.round((d.value / total) * 100)}%
                </span>
              </>
            );
            return (
              <li key={d.name} className="text-sm">
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(i)}
                    className="-mx-1.5 flex w-[calc(100%+0.75rem)] items-center gap-2.5 rounded-md px-1.5 py-0.5 hover:bg-accent"
                  >
                    {body}
                  </button>
                ) : (
                  <span className="flex items-center gap-2.5">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Stage funnel as horizontal bars with count and share of the first stage (Figma "Hiring funnel").
 * One hue: the empty track to the right of each bar is the drop-off. `onSelect` makes rows buttons.
 */
export function FunnelBars({
  data,
  footer,
  onSelect,
}: {
  data: Slice[];
  footer?: ReactNode;
  onSelect?: OnSelect;
}) {
  const top = data[0]?.value || 1;
  return (
    <div className="space-y-1">
      {data.map((d, i) => {
        const pct = (d.value / top) * 100;
        const row = (
          <>
            <span className="text-left leading-tight break-words text-fg-muted">{d.name}</span>
            <span className="h-5 overflow-hidden rounded-sm bg-muted">
              <span
                className="block h-full rounded-sm"
                style={{ width: `${Math.max(pct, 2)}%`, background: d.color ?? 'var(--chart-1)' }}
              />
            </span>
            <span className="text-right font-semibold text-fg tnum">{d.value}</span>
            <span className="text-right text-2xs text-fg-subtle tnum">{Math.round(pct)}%</span>
          </>
        );
        const grid =
          'grid w-full grid-cols-[minmax(4.5rem,8.5rem)_minmax(0,1fr)_auto_2.5rem] items-center gap-3 rounded-md py-1 text-sm';
        return onSelect ? (
          <button
            key={d.name}
            type="button"
            onClick={() => onSelect(i)}
            className={cn(grid, '-mx-1.5 w-[calc(100%+0.75rem)] px-1.5 hover:bg-accent')}
          >
            {row}
          </button>
        ) : (
          <div key={d.name} className={grid}>
            {row}
          </div>
        );
      })}
      {footer && <p className="pt-1 text-xs text-fg-subtle">{footer}</p>}
    </div>
  );
}

export function ScatterChart({
  data,
  xLabel,
  yLabel,
  height = 240,
  xDomain,
  onSelect,
}: {
  data: { x: number; y: number }[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  xDomain?: [number, number];
  onSelect?: OnSelect;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RScatterChart margin={{ top: 6, right: 8, bottom: 8, left: -10 }}>
        <CartesianGrid {...grid} />
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          domain={xDomain ?? ['auto', 'auto']}
          {...axis}
        />
        <YAxis type="number" dataKey="y" name={yLabel} allowDecimals={false} {...axis} />
        <RTooltip content={<TooltipBox />} />
        <RLegend content={() => null} />
        <Scatter
          data={data}
          fill="var(--chart-1)"
          onClick={onSelect ? (_, index) => onSelect(index) : undefined}
          style={onSelect ? { cursor: 'pointer' } : undefined}
        />
      </RScatterChart>
    </ResponsiveContainer>
  );
}

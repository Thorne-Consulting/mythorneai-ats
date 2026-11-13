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
export type Series = { key: string; label?: string; color?: string };
type Row = Record<string, string | number | null>;

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
  payload?: { name?: string; value?: number | string; color?: string }[];
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
          <span className="ml-auto pl-3 font-medium text-fg tnum">{p.value}</span>
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
          <span
            className="size-2 rounded-full"
            style={{ background: s.color ?? chartColors[i % chartColors.length] }}
          />
          {s.label ?? s.key}
        </li>
      ))}
    </ul>
  );
}

const color = (s: Series, i: number) => s.color ?? chartColors[i % chartColors.length];

/** Line chart over a category axis. `area` adds the soft fill under the first series. */
export function LineChart({
  data,
  dataKey,
  series,
  height = 220,
  area = true,
  legend = true,
}: {
  data: Row[];
  dataKey: string;
  series: Series[];
  height?: number;
  area?: boolean;
  legend?: boolean;
}) {
  return (
    <div>
      {legend && series.length > 1 && <ChartLegend series={series} className="mb-2" />}
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} {...grid} />
          <XAxis dataKey={dataKey} {...axis} />
          <YAxis allowDecimals={false} {...axis} />
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
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label ?? s.key}
              stroke={color(s, i)}
              strokeWidth={2}
              dot={data.length <= 16 ? { r: 2.5, strokeWidth: 0, fill: color(s, i) } : false}
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
}: {
  data: Row[];
  dataKey: string;
  series: Series[];
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  legend?: boolean;
}) {
  const h = height ?? (horizontal ? Math.max(160, data.length * 34 + 40) : 220);
  return (
    <div>
      {legend && series.length > 1 && <ChartLegend series={series} className="mb-2" />}
      <ResponsiveContainer width="100%" height={h}>
        <RBarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 6, right: 8, bottom: 0, left: horizontal ? 0 : -18 }}
        >
          <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} {...grid} />
          {horizontal ? (
            <>
              <XAxis type="number" allowDecimals={false} {...axis} />
              <YAxis type="category" dataKey={dataKey} width={140} {...axis} />
            </>
          ) : (
            <>
              <XAxis dataKey={dataKey} {...axis} />
              <YAxis allowDecimals={false} {...axis} />
            </>
          )}
          <RTooltip content={<TooltipBox />} cursor={{ fill: 'var(--accent)' }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label ?? s.key}
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
}: {
  data: Slice[];
  centerValue?: ReactNode;
  centerLabel?: ReactNode;
  size?: number;
  legend?: boolean;
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
          {data.map((d, i) => (
            <li key={d.name} className="flex items-center gap-2.5 text-sm">
              <span
                className="size-3 rounded-[3px]"
                style={{ background: d.color ?? chartColors[i % chartColors.length] }}
              />
              <span className="flex-1 truncate text-fg-muted">{d.name}</span>
              <span className="font-medium text-fg tnum">
                {Math.round((d.value / total) * 100)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Stage funnel as horizontal bars with count and share of the first stage (Figma "Hiring funnel"). */
export function FunnelBars({ data, footer }: { data: Slice[]; footer?: ReactNode }) {
  const top = data[0]?.value || 1;
  return (
    <div className="space-y-3">
      {data.map((d, i) => {
        const pct = (d.value / top) * 100;
        return (
          <div
            key={d.name}
            className="grid grid-cols-[88px_1fr_44px_36px] items-center gap-3 text-sm"
          >
            <span className="truncate text-fg-muted">{d.name}</span>
            <span className="h-5 overflow-hidden rounded-sm bg-muted">
              <span
                className="block h-full rounded-sm"
                style={{
                  width: `${Math.max(pct, 2)}%`,
                  background: d.color ?? chartColors[i % chartColors.length],
                }}
              />
            </span>
            <span className="text-right font-semibold text-fg tnum">{d.value}</span>
            <span className="text-right text-2xs text-fg-subtle tnum">{Math.round(pct)}%</span>
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
}: {
  data: { x: number; y: number }[];
  xLabel?: string;
  yLabel?: string;
  height?: number;
  xDomain?: [number, number];
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
        <Scatter data={data} fill="var(--chart-1)" />
      </RScatterChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";

// ---------- Calibration ----------

export interface CalibrationBucket {
  confidence: number;
  total: number;
  passRate: number | null;
}

const calConfig = {
  expected: { label: "Perfect calibration" },
  actual: { label: "Actual recall" },
} satisfies ChartConfig;

// Linear midpoint mapping of the 1–5 scale onto expected pass-rate.
const EXPECTED = [10, 30, 50, 70, 90];

/**
 * Felt-confidence vs actual pass-rate, grouped bars. The gap between the two
 * bars in a group IS the miscalibration — taller expected than actual means
 * overconfidence at that level.
 */
export function CalibrationChart({ data }: { data: CalibrationBucket[] }) {
  const rows = data.map((c) => ({
    label: `${c.confidence}/5`,
    expected: EXPECTED[c.confidence - 1],
    actual: c.passRate,
    n: c.total,
  }));
  return (
    <ChartContainer config={calConfig} className="h-44 w-full">
      <BarChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fill: "var(--muted-foreground)",
          }}
        />
        <YAxis hide domain={[0, 100]} />
        <ChartTooltip
          cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as (typeof rows)[number];
            return (
              <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <div className="font-medium">Felt {p.label}</div>
                <div className="text-muted-foreground">
                  actual {p.actual != null ? `${p.actual}%` : "no data"} ·
                  expected ~{p.expected}% · n={p.n}
                </div>
              </div>
            );
          }}
        />
        <Bar
          dataKey="expected"
          fill="var(--secondary)"
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
        <Bar
          dataKey="actual"
          fill="var(--forecast-bar)"
          radius={[3, 3, 0, 0]}
          maxBarSize={18}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}

// ---------- Confidence trend (true time axis) ----------

export interface TrendPoint {
  ts: number; // epoch ms
  confidence: number;
  rolling: number | null; // 7-day rolling average
}

const trendConfig = {
  confidence: { label: "Post-review confidence" },
  rolling: { label: "7-day average" },
} satisfies ChartConfig;

const fmtDay = (ts: number) =>
  new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Confidence over real time — uneven gaps between sessions stay visible. */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const [min, max] = [data[0].ts, data[data.length - 1].ts];
  // A sub-2-day span would render N identical "Aug 4" ticks — show times.
  const subDay = max - min < 2 * 86400_000;
  const fmtTick = subDay
    ? (ts: number) =>
        new Date(ts).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })
    : fmtDay;
  return (
    <ChartContainer config={trendConfig} className="h-44 w-full">
      <LineChart data={data} margin={{ top: 6, right: 8, left: 4, bottom: 0 }}>
        <XAxis
          dataKey="ts"
          type="number"
          scale="time"
          domain={[min, max]}
          tickFormatter={fmtTick}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tickCount={5}
          tick={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fill: "var(--muted-foreground)",
          }}
        />
        <YAxis hide domain={[0.5, 5.5]} />
        <ReferenceLine y={3} stroke="var(--border)" strokeDasharray="4 4" />
        <ChartTooltip
          cursor={{ stroke: "var(--border)" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as TrendPoint;
            return (
              <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <span className="font-medium">{fmtDay(p.ts)}</span>{" "}
                <span className="text-muted-foreground">
                  — felt {p.confidence}/5 after
                  {p.rolling != null ? ` · 7d avg ${p.rolling}` : ""}
                </span>
              </div>
            );
          }}
        />
        <Line
          dataKey="confidence"
          stroke="var(--secondary)"
          strokeWidth={0}
          dot={{ r: 2.5, fill: "var(--muted-foreground)", strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <Line
          dataKey="rolling"
          stroke="var(--forecast-today)"
          strokeWidth={2}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

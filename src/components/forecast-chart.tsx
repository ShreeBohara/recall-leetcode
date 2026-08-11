"use client";

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";

export interface ForecastPoint {
  date: string;
  label: string;
  count: number;
  isToday: boolean;
}

const config = { count: { label: "Reviews due" } } satisfies ChartConfig;

/**
 * 14-day due forecast. One series, one amber family: today emphasized by
 * lightness, the rest a dimmer step (both validated ≥3:1 on the card surface).
 */
export function ForecastChart({ data }: { data: ForecastPoint[] }) {
  const days = data.slice(0, 14);
  const max = Math.max(...days.map((d) => d.count), 1);
  return (
    <ChartContainer config={config} className="h-36 w-full">
      <BarChart data={days} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="25%">
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          interval={1}
          tick={{
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            fill: "var(--muted-foreground)",
          }}
        />
        <YAxis hide domain={[0, max]} />
        <ChartTooltip
          cursor={{ fill: "var(--secondary)", opacity: 0.5 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as ForecastPoint;
            return (
              <div className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                <span className="font-medium">{p.label}</span>{" "}
                <span className="text-muted-foreground">
                  — {p.count} review{p.count === 1 ? "" : "s"}
                  {p.isToday ? " (today)" : ""}
                </span>
              </div>
            );
          }}
        />
        <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false}>
          {days.map((d) => (
            <Cell
              key={d.date}
              fill={d.isToday ? "var(--forecast-today)" : "var(--forecast-bar)"}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

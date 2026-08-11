import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

export function SectionTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground",
        className
      )}
    >
      {children}
    </h2>
  );
}

/** Axis-less sparkline for stat tiles. Text stays in ink; the line is the accent. */
export function Sparkline({
  points,
  className,
  max: maxOverride,
}: {
  points: number[];
  className?: string;
  max?: number;
}) {
  if (points.length < 2) return null;
  const w = 96;
  const h = 28;
  const pad = 2;
  const max = Math.max(maxOverride ?? 0, ...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const xy = points.map((v, i) => [
    pad + i * step,
    h - pad - ((v - min) / span) * (h - pad * 2),
  ]);
  const d = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-7 w-24 shrink-0", className)}
      aria-hidden="true"
    >
      <path
        d={d}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
      <circle cx={lx} cy={ly} r="2.25" fill="var(--primary)" />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  delta,
  spark,
  sparkMax,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** e.g. "+3 vs last week" — sign decides color */
  delta?: { text: string; direction: "up" | "down" | "flat"; positive?: boolean };
  spark?: number[];
  sparkMax?: number;
}) {
  const deltaColor =
    delta == null || delta.direction === "flat"
      ? "text-muted-foreground"
      : (delta.positive ?? delta.direction === "up")
        ? "text-good"
        : "text-warn";
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex flex-col gap-1.5 px-4">
        <SectionTitle>{label}</SectionTitle>
        <div className="flex items-end justify-between gap-2">
          <div className="text-3xl font-semibold tabular-nums leading-none">
            {value}
          </div>
          {spark ? <Sparkline points={spark} max={sparkMax} /> : null}
        </div>
        <div className="flex items-baseline gap-2 text-xs">
          {delta ? (
            <span className={cn("font-mono tabular-nums", deltaColor)}>
              {delta.direction === "up" ? "↑" : delta.direction === "down" ? "↓" : "→"}{" "}
              {delta.text}
            </span>
          ) : null}
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function BarRow({
  label,
  value,
  max,
  href,
  colorVar = "--primary",
}: {
  label: string;
  value: number;
  max: number;
  href?: string;
  colorVar?: string;
}) {
  const inner = (
    <>
      <span className="w-40 shrink-0 truncate text-sm">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(4, (value / Math.max(max, 1)) * 100)}%`,
            background: `var(${colorVar})`,
            opacity: 0.85,
          }}
        />
      </div>
      <span className="w-7 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {value}
      </span>
    </>
  );
  if (href) {
    return (
      <a href={href} className="flex items-center gap-3 rounded px-1 py-0.5 transition-colors hover:bg-secondary/50">
        {inner}
      </a>
    );
  }
  return <div className="flex items-center gap-3">{inner}</div>;
}

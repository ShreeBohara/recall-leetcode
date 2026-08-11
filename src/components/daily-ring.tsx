/**
 * Daily-goal ring: reviews completed vs due at start of day.
 * Server-renderable; the fill animates in via CSS transition on mount.
 */
export function DailyRing({
  done,
  goal,
}: {
  done: number;
  goal: number;
}) {
  const size = 92;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fraction = goal > 0 ? Math.min(1, done / goal) : 0;
  const empty = goal === 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--secondary)"
          strokeWidth={stroke}
          strokeDasharray={empty ? "3 5" : undefined}
        />
        {!empty ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={fraction >= 1 ? "var(--good)" : "var(--primary)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - fraction)}
            className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          />
        ) : null}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {empty ? (
          <span className="font-mono text-lg font-semibold tabular-nums">
            {done > 0 ? done : "—"}
          </span>
        ) : (
          <span className="font-mono text-lg font-semibold tabular-nums">
            {done}
            <span className="text-muted-foreground">/{goal}</span>
          </span>
        )}
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          {empty ? (done > 0 ? "done" : "clear") : "reviews"}
        </span>
      </div>
    </div>
  );
}

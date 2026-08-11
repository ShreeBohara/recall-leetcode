import { getInsightsData } from "@/lib/data";
import { computeRecords } from "@/lib/records";
import { patternDisplay } from "@/lib/patterns";
import { GRADE_LABELS, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Heatmap } from "@/components/heatmap";
import { SectionTitle, StatCard } from "@/components/primitives";
import { CalibrationChart, TrendChart } from "@/components/insights-charts";
import type { Grade } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const [data, records] = await Promise.all([
    getInsightsData(),
    computeRecords(),
  ]);
  const calibrationHasData = data.calibration.some((c) => c.total > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.totalReviews} logged attempts. These charts sharpen as the data
          accumulates.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Fastest recall"
          value={
            records.fastestRecallSec != null
              ? `${records.fastestRecallSec}s`
              : "—"
          }
          hint="quickest correct approach"
        />
        <StatCard
          label="Longest streak"
          value={records.longestStreak || "—"}
          hint="consecutive active days"
        />
        <StatCard
          label="Best day"
          value={records.bestDayReviews || "—"}
          hint="most reviews in a day"
        />
        <StatCard
          label="Best calibration week"
          value={
            records.bestCalibrationWeek
              ? `${records.bestCalibrationWeek.hitRate}%`
              : "—"
          }
          hint={
            records.bestCalibrationWeek
              ? `week of ${formatDate(records.bestCalibrationWeek.weekStart)}`
              : "needs 5+ predictions in a week"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <SectionTitle>Activity — last 6 months</SectionTitle>
        </CardHeader>
        <CardContent>
          <Heatmap data={data.heatmap} />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionTitle>Calibration — felt vs actual</SectionTitle>
          </CardHeader>
          <CardContent>
            {!calibrationHasData ? (
              <p className="text-sm text-muted-foreground">
                Builds from the confidence slider in the review player: it
                compares how confident you <em>felt</em> before each reveal
                with how the recall actually went. Do a few reviews and this
                becomes the most honest chart in the app.
              </p>
            ) : (
              <>
                <CalibrationChart data={data.calibration} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Grey bar = perfect calibration, amber = your actual recall
                  rate. Amber far below grey at high confidence =
                  overconfidence — the pattern to watch.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle>Confidence over time</SectionTitle>
          </CardHeader>
          <CardContent>
            {data.trend.length < 5 ? (
              <p className="text-sm text-muted-foreground">
                Appears after a handful of reviews: every post-review
                confidence as a dot on a real timeline, with a 7-day average
                line. Gaps stay visible — that&apos;s the point.
              </p>
            ) : (
              <TrendChart data={data.trend} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle>Pattern mastery — weakest first</SectionTitle>
          </CardHeader>
          <CardContent>
            {data.patternMastery.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pattern data yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {data.patternMastery.map((p) => (
                  <li key={p.pattern} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate font-mono text-xs">
                      {patternDisplay(p.pattern)}
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full ${
                          p.score < 50 ? "bg-chart-4" : "bg-chart-2"
                        }`}
                        style={{ width: `${p.score}%` }}
                      />
                    </div>
                    <span className="w-24 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {p.score} · {p.problems} prob{p.problems === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle>Review outcomes</SectionTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3">
              {data.gradeCounts.map((g) => (
                <div key={g.grade} className="rounded-lg bg-secondary/50 p-3">
                  <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {GRADE_LABELS[g.grade as Grade] ?? g.grade}
                  </div>
                  <div className="mt-1 text-xl font-semibold tabular-nums">
                    {g.count}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              A healthy mix has mostly Good with some Hard — all Easy means the
              schedule is too gentle, frequent Failed means intervals grew too
              fast or the pattern needs a worked-example reset.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import Link from "next/link";
import { db } from "@/db";
import { lists, listItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTodayStats, USER_ID } from "@/lib/data";
import { getNextAction, getActiveList } from "@/lib/recommend";
import { daysUntil, difficultyClass, formatDue, ISSUE_TAG_LABELS } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionTitle, StatCard, BarRow } from "@/components/primitives";
import { ForecastChart } from "@/components/forecast-chart";
import { UpNext } from "@/components/up-next";
import { CatchUpBanner } from "@/components/catch-up-banner";
import { CoachReport } from "@/components/coach-report";
import { getActiveCoachReport } from "@/lib/coach";

export const dynamic = "force-dynamic";

async function getListOptions() {
  const allLists = await db
    .select()
    .from(lists)
    .where(eq(lists.userId, USER_ID))
    .all();
  const options = [];
  for (const l of allLists) {
    const count = (
      await db
        .select({ id: listItems.id })
        .from(listItems)
        .where(eq(listItems.listId, l.id))
        .all()
    ).length;
    options.push({
      slug: l.slug,
      name: l.name,
      description: l.description,
      attribution: l.attribution,
      count,
    });
  }
  return options.sort((a, b) => a.name.localeCompare(b.name));
}

export default async function TodayPage() {
  const [action, stats, listOptions, activeList, coachReport] =
    await Promise.all([
      getNextAction(),
      getTodayStats(),
      getListOptions(),
      getActiveList(),
      getActiveCoachReport(),
    ]);

  const half = Math.floor(stats.reviewsSpark.length / 2);
  const thisWeek = stats.reviewsSpark.slice(half).reduce((a, b) => a + b, 0);
  const lastWeek = stats.reviewsSpark.slice(0, half).reduce((a, b) => a + b, 0);
  const weekDelta = thisWeek - lastWeek;

  return (
    <div className="flex flex-col gap-8">
      {coachReport ? (
        <CoachReport
          id={coachReport.id}
          weekStart={coachReport.weekStart}
          markdown={coachReport.markdown}
        />
      ) : null}
      <UpNext
        action={action}
        reviewsToday={stats.reviewsToday}
        listOptions={listOptions}
        hasActiveList={activeList != null}
      />

      {action.backlog?.active ? <CatchUpBanner backlog={action.backlog} /> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Due today"
          value={stats.dueToday}
          hint={stats.overdue > 0 ? `${stats.overdue} overdue` : "all caught up"}
          spark={stats.forecast.slice(0, 7).map((f) => f.count)}
        />
        <StatCard
          label="Streak"
          value={stats.streak > 0 ? `${stats.streak}d` : "—"}
          hint={
            stats.freezesBanked > 0
              ? `❄ ${stats.freezesBanked} freeze${stats.freezesBanked === 1 ? "" : "s"} banked`
              : "1 freeze per 7 active days"
          }
          spark={stats.activitySpark}
        />
        <StatCard
          label="Reviews · 7d"
          value={stats.reviews7d}
          delta={
            weekDelta !== 0
              ? {
                  text: `${Math.abs(weekDelta)} vs last wk`,
                  direction: weekDelta > 0 ? "up" : "down",
                  positive: weekDelta > 0,
                }
              : undefined
          }
          hint={weekDelta === 0 ? "same as last week" : undefined}
        />
        <StatCard
          label="Retention · 7d"
          value={stats.retention7d != null ? `${stats.retention7d}%` : "—"}
          hint="recalled without failing"
          spark={stats.retention7d != null ? stats.retentionSpark : undefined}
          sparkMax={100}
        />
      </div>

      {action.type === "review" && action.due ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <SectionTitle>Review queue</SectionTitle>
            <Button size="sm" nativeButton={false} render={<Link href="/review" />}>
              Start session
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            {action.due.map((p) => {
              const overdueDays = -daysUntil(p.due!);
              return (
                <Card key={p.id} className="py-3 transition-colors hover:border-primary/30">
                  <CardContent className="flex items-center gap-3 px-4">
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/library/${p.id}`}
                        className="truncate font-medium hover:underline"
                      >
                        {p.number ? `${p.number}. ` : ""}
                        {p.title}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={difficultyClass(p.difficulty)}>
                          {p.difficulty ?? "—"}
                        </span>
                        <span>·</span>
                        <span>{formatDue(p.due!)}</span>
                      </div>
                    </div>
                    {overdueDays > 0 ? (
                      <Badge variant="outline" className="border-warn/40 text-warn">
                        overdue
                      </Badge>
                    ) : null}
                    <Button
                      variant="secondary"
                      size="sm"
                      nativeButton={false}
                      render={<Link href={`/review?start=${p.id}`} />}
                    >
                      Review
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionTitle>Due forecast — next 14 days</SectionTitle>
          </CardHeader>
          <CardContent>
            <ForecastChart data={stats.forecast} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <SectionTitle>Weakest areas</SectionTitle>
          </CardHeader>
          <CardContent>
            {stats.weakestIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Builds as you log problems — every mistake gets classified, and
                the repeat offenders surface here.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {stats.weakestIssues.map((issue) => (
                  <li key={issue.tag}>
                    <BarRow
                      label={ISSUE_TAG_LABELS[issue.tag] ?? issue.tag}
                      value={issue.count}
                      max={stats.weakestIssues[0].count}
                      colorVar="--chart-4"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

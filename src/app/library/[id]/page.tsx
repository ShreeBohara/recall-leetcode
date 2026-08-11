import Link from "next/link";
import { patternDisplay } from "@/lib/patterns";
import { notFound } from "next/navigation";
import { getProblemWithReviews } from "@/lib/data";
import { safeJsonParse, type Approach } from "@/lib/types";
import {
  GRADE_LABELS,
  daysUntil,
  difficultyClass,
  formatDate,
  formatDue,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Reveal } from "@/components/reveal";
import type { Grade } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProblemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getProblemWithReviews(Number(id));
  if (!data) notFound();
  const { problem, reviews } = data;

  const patterns = safeJsonParse<string[]>(problem.patterns, []);
  const tips = safeJsonParse<string[]>(problem.tips, []);
  const fundamentals = safeJsonParse<string[]>(problem.fundamentalsMissing, []);
  const bruteForce = safeJsonParse<Approach | null>(problem.bruteForce, null);
  const optimal = safeJsonParse<Approach | null>(problem.optimal, null);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link href="/library" className="hover:text-foreground">
            Library
          </Link>
          <span>/</span>
          <span className={difficultyClass(problem.difficulty)}>
            {problem.difficulty ?? "—"}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {problem.number ? `${problem.number}. ` : ""}
          {problem.title}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {patterns.map((p) => (
            <Badge key={p} variant="secondary" className="font-mono text-[10px]">
              {patternDisplay(p)}
            </Badge>
          ))}
          {problem.url ? (
            <a
              href={problem.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary hover:underline"
            >
              open on LeetCode ↗
            </a>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {problem.revise && problem.due
            ? `Next review ${formatDue(problem.due)} (${formatDate(problem.due)})`
            : "Not scheduled for review"}
        </p>
      </div>

      {fundamentals.length > 0 ? (
        <Card className="border-warn/25">
          <CardHeader>
            <CardTitle className="font-mono text-xs font-medium uppercase tracking-wider text-warn">
              Fundamentals you were missing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 text-sm">
              {fundamentals.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Reveal>
        <div className="flex flex-col gap-4">
          {bruteForce || optimal ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {bruteForce ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Brute force
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <p>{bruteForce.approach}</p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {bruteForce.time}
                      {bruteForce.space ? ` · ${bruteForce.space}` : ""}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
              {optimal ? (
                <Card className="border-primary/25">
                  <CardHeader>
                    <CardTitle className="font-mono text-xs font-medium uppercase tracking-wider text-primary">
                      Optimal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm">
                    <p>{optimal.approach}</p>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">
                      {optimal.time}
                      {optimal.space ? ` · ${optimal.space}` : ""}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          {problem.keyInsight ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Key insight
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm italic">
                “{problem.keyInsight}”
              </CardContent>
            </Card>
          ) : null}

          {tips.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Tips
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 text-sm">
                  {tips.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </Reveal>

      <Separator />

      <section className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Journal — {reviews.length} attempt{reviews.length === 1 ? "" : "s"}
          </h2>
          {problem.revise && problem.due ? (
            <span className="font-mono text-xs text-muted-foreground">
              next: {formatDue(problem.due)}
            </span>
          ) : null}
        </div>
        <ol className="relative flex flex-col gap-0 border-l border-border pl-5">
          {reviews.map((r, i) => {
            const issues = safeJsonParse<string[]>(r.issues, []);
            const isFirst = i === reviews.length - 1; // list is newest-first
            const dotClass =
              r.grade === "again"
                ? "bg-warn"
                : r.grade === "hard"
                  ? "bg-chart-4"
                  : r.grade === "easy"
                    ? "bg-primary"
                    : "bg-chart-2";
            return (
              <li key={r.id} className="relative pb-6 last:pb-0">
                <span
                  className={`absolute -left-[26.5px] top-1 size-2.5 rounded-full ring-4 ring-background ${dotClass}`}
                />
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">
                    {formatDate(r.reviewedAt)}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {isFirst ? "first solve" : r.tier.replace(/_/g, " ")}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      r.grade === "again"
                        ? "border-warn/40 text-warn"
                        : r.grade === "easy"
                          ? "border-good/40 text-good"
                          : ""
                    }
                  >
                    {GRADE_LABELS[r.grade as Grade] ?? r.grade}
                  </Badge>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  {r.preConfidence != null || r.postConfidence != null ? (
                    <span>
                      confidence{" "}
                      {r.preConfidence != null ? `${r.preConfidence}` : "—"}
                      {r.postConfidence != null ? ` → ${r.postConfidence}` : ""}
                      /5
                    </span>
                  ) : null}
                  {r.timeToApproachSec != null ? (
                    <span>
                      approach in{" "}
                      {r.timeToApproachSec >= 60
                        ? `${Math.round(r.timeToApproachSec / 60)}m`
                        : `${r.timeToApproachSec}s`}
                    </span>
                  ) : null}
                  {r.hintsUsed ? (
                    <span>
                      {r.hintsUsed} hint{r.hintsUsed === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {r.nextDue ? (
                    <span>→ rescheduled {formatDate(r.nextDue)}</span>
                  ) : null}
                </div>
                {issues.length > 0 ? (
                  <ul className="mt-1.5 list-disc pl-4 text-xs text-muted-foreground">
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : null}
                {r.notes ? (
                  <p className="mt-1.5 max-w-prose text-xs italic text-muted-foreground">
                    {r.notes}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      {problem.revise && problem.due && daysUntil(problem.due) <= 0 ? (
        <Button
          className="self-start"
          nativeButton={false} render={<Link href={`/review?start=${problem.id}`} />}
        >
          Review now
        </Button>
      ) : null}
    </div>
  );
}

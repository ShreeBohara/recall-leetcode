import { db } from "@/db";
import { coachReports, problems, reviews } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  GRADE_SCORE,
  endOfToday,
  getScheduledProblems,
  getTodayStats,
  localDayKey,
  USER_ID,
} from "./data";
import { recommendNext } from "./recommend";
import { canonicalizeAll, patternDisplay } from "./patterns";
import {
  computeRecords,
  dayKeyToDate,
  localMonday,
  type Records,
} from "./records";
import { safeJsonParse } from "./types";

export interface WeeklyReportData {
  period: { weekStart: string; weekEnd: string };
  totals: {
    gradedReviews: number;
    solves: number;
    retention: number | null; // % graded reviews not "again"
    streak: number;
    freezesBanked: number;
  };
  patterns: {
    slug: string;
    display: string;
    mastery: number | null; // 0–100 as of week end
    delta: number | null; // vs start of week
    reviewCount: number;
    topIssues: string[];
  }[];
  calibration: { confidence: number; total: number; passRate: number | null }[];
  lapses: { title: string; number: number | null; issues: string[] }[];
  forecast: { date: string; dueCount: number }[];
  recommendation: {
    title: string;
    difficulty: string | null;
    url: string | null;
    reason: string;
  } | null;
  records: Records;
}

interface ReviewJoin {
  reviewedAt: string;
  tier: string;
  grade: string;
  preConfidence: number | null;
  issueTags: string;
  issues: string;
  problemId: number;
  title: string;
  number: number | null;
  patterns: string;
}

/** Mastery per pattern from each problem's latest grade before local day `cutoffDay`. */
function masteryAsOf(rows: ReviewJoin[], cutoffDay: string): Map<string, number> {
  const latestByProblem = new Map<number, ReviewJoin>();
  for (const r of rows) {
    if (localDayKey(new Date(r.reviewedAt)) >= cutoffDay) continue;
    latestByProblem.set(r.problemId, r); // rows are reviewedAt-ascending
  }
  const agg = new Map<string, { sum: number; n: number }>();
  for (const r of latestByProblem.values()) {
    const score = GRADE_SCORE[r.grade] ?? 50;
    for (const p of canonicalizeAll(safeJsonParse<string[]>(r.patterns, []))) {
      const a = agg.get(p) ?? { sum: 0, n: 0 };
      a.sum += score;
      a.n++;
      agg.set(p, a);
    }
  }
  return new Map(
    [...agg].map(([p, { sum, n }]) => [p, Math.round(sum / n)])
  );
}

export async function getWeeklyReportData(
  weekStartArg?: string
): Promise<WeeklyReportData> {
  const weekStart = weekStartArg ?? localMonday(new Date());
  const weekEndDate = dayKeyToDate(weekStart);
  weekEndDate.setDate(weekEndDate.getDate() + 7);
  const weekEnd = localDayKey(weekEndDate); // exclusive: the next Monday

  const rows = (await db
    .select({
      reviewedAt: reviews.reviewedAt,
      tier: reviews.tier,
      grade: reviews.grade,
      preConfidence: reviews.preConfidence,
      issueTags: reviews.issueTags,
      issues: reviews.issues,
      problemId: reviews.problemId,
      title: problems.title,
      number: problems.number,
      patterns: problems.patterns,
    })
    .from(reviews)
    .innerJoin(problems, eq(reviews.problemId, problems.id))
    .where(eq(reviews.userId, USER_ID))
    .orderBy(reviews.reviewedAt)
    .all()) as ReviewJoin[];

  const inWeek = rows.filter(
    (r) =>
      localDayKey(new Date(r.reviewedAt)) >= weekStart &&
      localDayKey(new Date(r.reviewedAt)) < weekEnd
  );
  const graded = inWeek.filter((r) => r.tier !== "initial_solve");
  const solves = inWeek.filter((r) => r.tier === "initial_solve");

  const stats = await getTodayStats();

  // Pattern movement: mastery now vs start of week, plus this week's issues.
  const masteryEnd = masteryAsOf(rows, weekEnd);
  const masteryStart = masteryAsOf(rows, weekStart);
  const patternAgg = new Map<
    string,
    { reviewCount: number; issues: Map<string, number> }
  >();
  for (const r of graded) {
    for (const p of canonicalizeAll(safeJsonParse<string[]>(r.patterns, []))) {
      const a = patternAgg.get(p) ?? { reviewCount: 0, issues: new Map() };
      a.reviewCount++;
      for (const tag of safeJsonParse<string[]>(r.issueTags, [])) {
        a.issues.set(tag, (a.issues.get(tag) ?? 0) + 1);
      }
      patternAgg.set(p, a);
    }
  }
  const patternsOut = [...patternAgg.entries()]
    .map(([slug, a]) => ({
      slug,
      display: patternDisplay(slug),
      mastery: masteryEnd.get(slug) ?? null,
      delta:
        masteryEnd.get(slug) != null && masteryStart.get(slug) != null
          ? masteryEnd.get(slug)! - masteryStart.get(slug)!
          : null,
      reviewCount: a.reviewCount,
      topIssues: [...a.issues.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([tag, n]) => `${tag} ×${n}`),
    }))
    .sort((a, b) => (a.mastery ?? 50) - (b.mastery ?? 50));

  const calibration = [1, 2, 3, 4, 5].map((confidence) => {
    const bucket = graded.filter((r) => r.preConfidence === confidence);
    const passes = bucket.filter(
      (r) => r.grade === "good" || r.grade === "easy"
    ).length;
    return {
      confidence,
      total: bucket.length,
      passRate: bucket.length
        ? Math.round((passes / bucket.length) * 100)
        : null,
    };
  });

  const lapses = graded
    .filter((r) => r.grade === "again")
    .map((r) => ({
      title: r.title,
      number: r.number,
      issues: safeJsonParse<string[]>(r.issueTags, []),
    }));

  const scheduled = await getScheduledProblems();
  const forecast: WeeklyReportData["forecast"] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() + i);
    const key = localDayKey(day);
    forecast.push({
      date: key,
      // Overdue problems pile onto today, same as the dashboard forecast.
      dueCount:
        i === 0
          ? scheduled.filter((p) => new Date(p.due!) <= endOfToday()).length
          : scheduled.filter((p) => localDayKey(new Date(p.due!)) === key)
              .length,
    });
  }

  const rec = await recommendNext();

  return {
    period: { weekStart, weekEnd },
    totals: {
      gradedReviews: graded.length,
      solves: solves.length,
      retention: graded.length
        ? Math.round(
            (graded.filter((r) => r.grade !== "again").length / graded.length) *
              100
          )
        : null,
      streak: stats.streak,
      freezesBanked: stats.freezesBanked,
    },
    patterns: patternsOut,
    calibration,
    lapses,
    forecast,
    recommendation: rec
      ? {
          title: rec.title,
          difficulty: rec.difficulty,
          url: rec.url,
          reason: rec.reason,
        }
      : null,
    records: await computeRecords(),
  };
}

// ---------- report storage ----------

export async function saveCoachReport(
  weekStart: string,
  markdown: string
): Promise<void> {
  await db
    .insert(coachReports)
    .values({
      userId: USER_ID,
      weekStart,
      markdown,
      createdAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [coachReports.userId, coachReports.weekStart],
      set: {
        markdown,
        createdAt: new Date().toISOString(),
        dismissedAt: null,
      },
    })
    .run();
}

export async function getActiveCoachReport() {
  // Only the NEWEST report can be active: dismissing it must clear the card,
  // never resurface an older undismissed one.
  const latest = await db
    .select()
    .from(coachReports)
    .where(eq(coachReports.userId, USER_ID))
    .orderBy(desc(coachReports.weekStart))
    .get();
  return latest && !latest.dismissedAt ? latest : null;
}

export async function dismissCoachReport(id: number): Promise<void> {
  await db
    .update(coachReports)
    .set({ dismissedAt: new Date().toISOString() })
    .where(and(eq(coachReports.id, id), eq(coachReports.userId, USER_ID)))
    .run();
}

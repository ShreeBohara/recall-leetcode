import { db } from "@/db";
import {
  problems,
  reviews,
  concepts,
  problemConcepts,
  listItems,
} from "@/db/schema";
import { and, asc, desc, eq, isNotNull, lte, or, sql } from "drizzle-orm";
import { applyReview, cardToJson, deriveGrade } from "./fsrs";
import { enrichFromCatalog } from "./catalog";
import { lookupLc } from "./lc-lookup";
import { computeStreaks } from "./records";
import { patternDisplay } from "./patterns";
import {
  slugFromTitle,
  safeJsonParse,
  type Grade,
  type ParsedSummary,
} from "./types";

export const USER_ID = process.env.RECALL_USER_ID ?? "shreet";

export type ProblemRow = typeof problems.$inferSelect;
export type ReviewRow = typeof reviews.$inferSelect;

// ---------- writes ----------

export interface SaveResult {
  problemId: number;
  isNew: boolean;
  grade: Grade;
  gradeSource: string;
  nextDue: string | null;
}

/**
 * Save a parsed summary. If the problem already exists (same user+slug) this is
 * a RE-SOLVE: we log a review against the existing record and advance its FSRS
 * card — never a duplicate row.
 */
/** Upsert canonical concepts, link them to the problem, and claim list items. */
async function syncConceptsAndLists(
  problemId: number,
  patterns: string[],
  lcSlug: string | null
): Promise<void> {
  for (const slug of patterns) {
    let concept = await db
      .select()
      .from(concepts)
      .where(and(eq(concepts.userId, USER_ID), eq(concepts.slug, slug)))
      .get();
    if (!concept) {
      concept = await db
        .insert(concepts)
        .values({ userId: USER_ID, slug, display: patternDisplay(slug) })
        .returning()
        .get();
    }
    await db
      .insert(problemConcepts)
      .values({ problemId, conceptId: concept.id })
      .onConflictDoNothing()
      .run();
  }
  if (lcSlug) {
    await db
      .update(listItems)
      .set({ problemId })
      .where(eq(listItems.lcSlug, lcSlug))
      .run();
  }
}

export async function saveParsedSummary(
  rawParsed: ParsedSummary,
  solvedAt: Date = new Date()
): Promise<SaveResult> {
  // Fill url/difficulty from the bundled catalog and canonicalize the pattern
  // vocabulary — chat-supplied "hashing" must equal the list's "arrays-hashing".
  const enriched = enrichFromCatalog(rawParsed);
  let parsed = enriched.parsed;
  const lcSlug = enriched.lcSlug;

  // Still missing metadata (off-list problem, chat omitted the number)?
  // One cached live lookup fills it; failures never block logging.
  if (
    lcSlug &&
    (parsed.number == null || !parsed.difficulty || parsed.patterns.length === 0)
  ) {
    const live = await lookupLc(lcSlug);
    if (live) {
      parsed = {
        ...parsed,
        number: parsed.number ?? live.number,
        difficulty: parsed.difficulty ?? live.difficulty,
        patterns: parsed.patterns.length ? parsed.patterns : live.patterns,
      };
    }
  }

  const slug = slugFromTitle(parsed.title, parsed.number);
  const now = solvedAt.toISOString();
  const { grade, source } = deriveGrade(parsed);

  // Identity resolution, strongest key first — a slug miss ≠ new problem.
  // The same problem re-logged without its number (or vice versa) must hit
  // the merge path, or we'd duplicate it with a cold FSRS card; and the
  // fallback must never grab a DIFFERENT problem whose title merely ends the
  // same way ("Climbing Stairs" vs "Min Cost Climbing Stairs").
  let existing = lcSlug
    ? await db
        .select()
        .from(problems)
        .where(and(eq(problems.userId, USER_ID), eq(problems.lcSlug, lcSlug)))
        .get()
    : undefined;
  if (!existing) {
    existing = await db
      .select()
      .from(problems)
      .where(and(eq(problems.userId, USER_ID), eq(problems.slug, slug)))
      .get();
  }
  if (!existing && parsed.number != null) {
    existing = await db
      .select()
      .from(problems)
      .where(
        and(eq(problems.userId, USER_ID), eq(problems.number, parsed.number))
      )
      .get();
  }
  if (!existing) {
    const bare = slugFromTitle(parsed.title, null);
    if (bare) {
      // Exact bare slug, or exactly the row's own `${number}-${bare}` —
      // never a loose suffix match.
      existing = await db
        .select()
        .from(problems)
        .where(
          and(
            eq(problems.userId, USER_ID),
            or(
              eq(problems.slug, bare),
              sql`${problems.slug} = cast(${problems.number} as text) || '-' || ${bare}`
            )
          )
        )
        .get();
    }
  }

  let problemId: number;
  let cardJson: string | null = null;
  let due: string | null = null;
  let state = 0;

  if (parsed.revise) {
    const scheduled = applyReview(existing?.fsrsCard ?? null, grade, solvedAt);
    cardJson = cardToJson(scheduled.card);
    due = scheduled.card.due.toISOString();
    state = scheduled.card.state;
  }

  const metaFields = {
    number: parsed.number ?? undefined,
    title: parsed.title,
    url: parsed.url || undefined,
    difficulty: parsed.difficulty ?? undefined,
    patterns: JSON.stringify(parsed.patterns),
    language: parsed.language || undefined,
    bruteForce: parsed.bruteForce ? JSON.stringify(parsed.bruteForce) : undefined,
    optimal: parsed.optimal ? JSON.stringify(parsed.optimal) : undefined,
    keyInsight: parsed.keyInsight || undefined,
    tips: JSON.stringify(parsed.tips),
    fundamentalsMissing: JSON.stringify(parsed.fundamentalsMissing),
    rawSummary: undefined as string | undefined,
  };

  if (existing) {
    // Merge: overwrite metadata only where the new summary actually has content.
    const defined = Object.fromEntries(
      Object.entries(metaFields).filter(
        ([, v]) => v !== undefined && v !== "[]"
      )
    );
    await db
      .update(problems)
      .set({
        ...defined,
        lcSlug: existing.lcSlug ?? lcSlug,
        revise: parsed.revise,
        fsrsCard: cardJson ?? existing.fsrsCard,
        due: parsed.revise ? due : null,
        state: parsed.revise ? state : existing.state,
      })
      .where(eq(problems.id, existing.id))
      .run();
    problemId = existing.id;
  } else {
    const inserted = await db
      .insert(problems)
      .values({
        userId: USER_ID,
        slug,
        lcSlug,
        ...metaFields,
        url: parsed.url || null,
        difficulty: parsed.difficulty,
        language: parsed.language || null,
        bruteForce: parsed.bruteForce ? JSON.stringify(parsed.bruteForce) : null,
        optimal: parsed.optimal ? JSON.stringify(parsed.optimal) : null,
        keyInsight: parsed.keyInsight || null,
        rawSummary: null,
        revise: parsed.revise,
        firstSolvedAt: now,
        createdAt: new Date().toISOString(),
        fsrsCard: cardJson,
        due,
        state,
      })
      .returning({ id: problems.id })
      .get();
    problemId = inserted.id;
  }

  await db
    .insert(reviews)
    .values({
      userId: USER_ID,
      problemId,
      reviewedAt: now,
      tier: existing ? "full_resolve" : "initial_solve",
      solved: parsed.solved,
      hintsUsed: parsed.hintsUsed,
      recallSpeed: parsed.recallSpeed,
      preConfidence: parsed.confidenceBefore,
      postConfidence: parsed.confidenceAfter,
      timeToApproachSec:
        parsed.timeApproachMin != null
          ? Math.round(parsed.timeApproachMin * 60)
          : null,
      timeToCodeMin: parsed.timeCodeMin,
      issues: JSON.stringify(parsed.issues),
      issueTags: JSON.stringify(parsed.issueTags),
      grade,
      gradeSource: source,
      notes: parsed.gradeRationale || null,
      fsrsSnapshot: cardJson,
      nextDue: due,
    })
    .run();

  await syncConceptsAndLists(problemId, parsed.patterns, lcSlug);

  return { problemId, isNew: !existing, grade, gradeSource: source, nextDue: due };
}

export interface LogReviewInput {
  problemId: number;
  tier: "approach_recall" | "full_resolve";
  grade: Grade;
  preConfidence?: number | null;
  postConfidence?: number | null;
  timeToApproachSec?: number | null;
  notes?: string | null;
}

export async function logReview(input: LogReviewInput, when: Date = new Date()) {
  const problem = await db
    .select()
    .from(problems)
    .where(and(eq(problems.id, input.problemId), eq(problems.userId, USER_ID)))
    .get();
  if (!problem) throw new Error(`Problem ${input.problemId} not found`);

  const scheduled = applyReview(problem.fsrsCard, input.grade, when);
  const cardJson = cardToJson(scheduled.card);
  const due = scheduled.card.due.toISOString();

  await db
    .update(problems)
    .set({ fsrsCard: cardJson, due, state: scheduled.card.state })
    .where(eq(problems.id, problem.id))
    .run();

  await db
    .insert(reviews)
    .values({
      userId: USER_ID,
      problemId: problem.id,
      reviewedAt: when.toISOString(),
      tier: input.tier,
      recallSpeed: null,
      preConfidence: input.preConfidence ?? null,
      postConfidence: input.postConfidence ?? null,
      timeToApproachSec: input.timeToApproachSec ?? null,
      issues: "[]",
      issueTags: "[]",
      grade: input.grade,
      gradeSource: "user",
      notes: input.notes ?? null,
      fsrsSnapshot: cardJson,
      nextDue: due,
    })
    .run();

  return { nextDue: due };
}

// ---------- reads ----------

export function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

export async function getDueProblems(): Promise<ProblemRow[]> {
  return db
    .select()
    .from(problems)
    .where(
      and(
        eq(problems.userId, USER_ID),
        eq(problems.revise, true),
        isNotNull(problems.due),
        lte(problems.due, endOfToday().toISOString())
      )
    )
    .orderBy(asc(problems.due))
    .all();
}

export async function getAllProblems(): Promise<ProblemRow[]> {
  return db
    .select()
    .from(problems)
    .where(eq(problems.userId, USER_ID))
    .orderBy(desc(problems.firstSolvedAt))
    .all();
}

/**
 * Resolve a problem reference from an MCP tool call: LeetCode number,
 * slug, or (case-insensitive) title.
 */
export async function resolveProblem(
  ref: string | number
): Promise<ProblemRow | undefined> {
  if (typeof ref === "number" || /^\d+$/.test(String(ref).trim())) {
    const byNumber = await db
      .select()
      .from(problems)
      .where(
        and(eq(problems.userId, USER_ID), eq(problems.number, Number(ref)))
      )
      .get();
    if (byNumber) return byNumber;
  }
  const text = String(ref).trim();
  const bySlug = await db
    .select()
    .from(problems)
    .where(and(eq(problems.userId, USER_ID), eq(problems.slug, text)))
    .get();
  if (bySlug) return bySlug;
  return db
    .select()
    .from(problems)
    .where(
      and(
        eq(problems.userId, USER_ID),
        sql`lower(${problems.title}) = lower(${text})`
      )
    )
    .get();
}

export interface ReviewSummary {
  count: number; // total logged attempts (incl. the first solve)
  last: string; // most recent attempt timestamp
  lastGrade: string | null;
}

/** Per-problem logbook rollup: attempt count, last-seen, last grade. */
export async function getReviewSummaries(): Promise<Map<number, ReviewSummary>> {
  const rows = await db
    .select()
    .from(reviews)
    .where(eq(reviews.userId, USER_ID))
    .orderBy(asc(reviews.reviewedAt))
    .all();
  const out = new Map<number, ReviewSummary>();
  for (const r of rows) {
    const prev = out.get(r.problemId);
    out.set(r.problemId, {
      count: (prev?.count ?? 0) + 1,
      last: r.reviewedAt,
      lastGrade: r.grade,
    });
  }
  return out;
}

/** Most recent review timestamp per problem (includes the initial solve). */
export async function getLastReviewTimes(): Promise<Map<number, string>> {
  const rows = await db
    .select({
      problemId: reviews.problemId,
      last: sql<string>`max(${reviews.reviewedAt})`,
    })
    .from(reviews)
    .where(eq(reviews.userId, USER_ID))
    .groupBy(reviews.problemId)
    .all();
  return new Map(rows.map((r) => [r.problemId, r.last]));
}

export async function getProblemWithReviews(id: number) {
  const problem = await db
    .select()
    .from(problems)
    .where(and(eq(problems.id, id), eq(problems.userId, USER_ID)))
    .get();
  if (!problem) return null;
  const history = await db
    .select()
    .from(reviews)
    .where(and(eq(reviews.problemId, id), eq(reviews.userId, USER_ID)))
    .orderBy(desc(reviews.reviewedAt))
    .all();
  return { problem, reviews: history };
}

export async function getScheduledProblems(): Promise<ProblemRow[]> {
  return db
    .select()
    .from(problems)
    .where(
      and(
        eq(problems.userId, USER_ID),
        eq(problems.revise, true),
        isNotNull(problems.due)
      )
    )
    .orderBy(asc(problems.due))
    .all();
}

export const GRADE_SCORE: Record<string, number> = {
  again: 0,
  hard: 40,
  good: 75,
  easy: 100,
};

export interface InsightsData {
  heatmap: { date: string; count: number; level: number }[];
  calibration: { confidence: number; total: number; passRate: number | null }[];
  trend: { ts: number; confidence: number; rolling: number | null }[];
  patternMastery: { pattern: string; score: number; problems: number }[];
  gradeCounts: { grade: string; count: number }[];
  totalReviews: number;
}

export async function getInsightsData(): Promise<InsightsData> {
  const allProblems = await getAllProblems();
  const allReviews = await db
    .select()
    .from(reviews)
    .where(eq(reviews.userId, USER_ID))
    .orderBy(asc(reviews.reviewedAt))
    .all();

  // Heatmap: every day of the last 26 weeks, GitHub-style levels.
  const perDay = new Map<string, number>();
  for (const r of allReviews) {
    const key = localDayKey(new Date(r.reviewedAt));
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const heatmap: InsightsData["heatmap"] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 181);
  for (let i = 0; i <= 181; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = localDayKey(d);
    const count = perDay.get(key) ?? 0;
    heatmap.push({ date: key, count, level: Math.min(4, count) });
  }

  // Calibration: pre-review confidence vs pass rate (good/easy = pass).
  const calibration: InsightsData["calibration"] = [1, 2, 3, 4, 5].map(
    (confidence) => {
      const bucket = allReviews.filter((r) => r.preConfidence === confidence);
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
    }
  );

  // True-time trend: each point at its real timestamp with a trailing
  // 7-day rolling average (an index-based axis would lie about session gaps).
  const confPoints = allReviews
    .filter((r) => r.postConfidence != null)
    .map((r) => ({
      ts: new Date(r.reviewedAt).getTime(),
      confidence: r.postConfidence!,
    }));
  // Two-pointer sliding window over the (already time-sorted) points — O(n).
  const WEEK_MS = 7 * 86400_000;
  const trend: { ts: number; confidence: number; rolling: number | null }[] = [];
  let left = 0;
  let windowSum = 0;
  for (let i = 0; i < confPoints.length; i++) {
    windowSum += confPoints[i].confidence;
    while (confPoints[left].ts <= confPoints[i].ts - WEEK_MS) {
      windowSum -= confPoints[left].confidence;
      left++;
    }
    const n = i - left + 1;
    trend.push({
      ...confPoints[i],
      rolling: n ? Math.round((windowSum / n) * 10) / 10 : null,
    });
  }

  // Pattern mastery: score each problem by its LATEST grade, average per pattern.
  const latestGrade = new Map<number, string>();
  for (const r of allReviews) latestGrade.set(r.problemId, r.grade); // asc order → last write wins
  const patternAgg = new Map<string, { sum: number; n: number }>();
  for (const p of allProblems) {
    const grade = latestGrade.get(p.id);
    if (!grade) continue;
    const score = GRADE_SCORE[grade] ?? 50;
    for (const pattern of safeJsonParse<string[]>(p.patterns, [])) {
      const agg = patternAgg.get(pattern) ?? { sum: 0, n: 0 };
      agg.sum += score;
      agg.n += 1;
      patternAgg.set(pattern, agg);
    }
  }
  const patternMastery = [...patternAgg.entries()]
    .map(([pattern, { sum, n }]) => ({
      pattern,
      score: Math.round(sum / n),
      problems: n,
    }))
    .sort((a, b) => a.score - b.score);

  const gradeCounts = ["again", "hard", "good", "easy"].map((grade) => ({
    grade,
    count: allReviews.filter((r) => r.grade === grade).length,
  }));

  return {
    heatmap,
    calibration,
    trend,
    patternMastery,
    gradeCounts,
    totalReviews: allReviews.length,
  };
}

export interface TodayStats {
  dueToday: number;
  overdue: number;
  totalProblems: number;
  streak: number;
  freezesBanked: number;
  avgConfidence7d: number | null;
  reviewsToday: number;
  solvesToday: number;
  reviews7d: number;
  retention7d: number | null; // % of graded reviews that weren't "again"
  activitySpark: number[]; // reviews+solves per day, last 14 days
  reviewsSpark: number[]; // graded reviews per day, last 14 days
  retentionSpark: number[]; // retention % for days that HAD graded reviews
  forecast: { date: string; label: string; count: number; isToday: boolean }[];
  weakestIssues: { tag: string; count: number }[];
}

export const localDayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

export async function getTodayStats(): Promise<TodayStats> {
  const all = await getAllProblems();
  const allReviews = await db
    .select()
    .from(reviews)
    .where(eq(reviews.userId, USER_ID))
    .all();

  const now = new Date();
  const todayKey = localDayKey(now);
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);

  const scheduled = all.filter((p) => p.revise && p.due);
  const overdue = scheduled.filter(
    (p) => new Date(p.due!) < startToday
  ).length;
  const dueToday = scheduled.filter(
    (p) => new Date(p.due!) <= endOfToday()
  ).length;

  // Streak with freezes — computed by the shared walker in records.ts so the
  // live streak, the freeze bank, and the longest-streak record can never
  // disagree. Any activity counts (effort, not queue-clearing).
  const activeDays = new Set(
    allReviews.map((r) => localDayKey(new Date(r.reviewedAt)))
  );
  const { current: streak, freezesBanked } = computeStreaks(activeDays, now);

  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400_000);
  const recentConf = allReviews
    .filter(
      (r) => r.postConfidence != null && new Date(r.reviewedAt) >= sevenDaysAgo
    )
    .map((r) => r.postConfidence!);
  const avgConfidence7d = recentConf.length
    ? Math.round(
        (recentConf.reduce((a, b) => a + b, 0) / recentConf.length) * 10
      ) / 10
    : null;

  const reviewsToday = allReviews.filter(
    (r) =>
      r.tier !== "initial_solve" &&
      localDayKey(new Date(r.reviewedAt)) === todayKey
  ).length;
  const solvesToday = allReviews.filter(
    (r) =>
      r.tier === "initial_solve" &&
      localDayKey(new Date(r.reviewedAt)) === todayKey
  ).length;

  const last7 = allReviews.filter(
    (r) => new Date(r.reviewedAt) >= sevenDaysAgo
  );
  const reviews7d = last7.filter((r) => r.tier !== "initial_solve").length;
  const graded7 = last7.filter((r) => r.tier !== "initial_solve");
  const retention7d = graded7.length
    ? Math.round(
        (graded7.filter((r) => r.grade !== "again").length / graded7.length) *
          100
      )
    : null;

  const activitySpark: number[] = [];
  const reviewsSpark: number[] = [];
  const retentionSpark: number[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(startToday);
    day.setDate(day.getDate() - i);
    const key = localDayKey(day);
    const dayReviews = allReviews.filter(
      (r) => localDayKey(new Date(r.reviewedAt)) === key
    );
    activitySpark.push(dayReviews.length);
    const graded = dayReviews.filter((r) => r.tier !== "initial_solve");
    reviewsSpark.push(graded.length);
    // Idle days carry no retention signal — don't fabricate a perfect score.
    if (graded.length) {
      retentionSpark.push(
        Math.round(
          (graded.filter((r) => r.grade !== "again").length / graded.length) *
            100
        )
      );
    }
  }

  const forecast: TodayStats["forecast"] = [];
  for (let i = 0; i < 30; i++) {
    const day = new Date(startToday);
    day.setDate(day.getDate() + i);
    const key = localDayKey(day);
    const count = scheduled.filter((p) => {
      const dueDate = new Date(p.due!);
      const dueKey = localDayKey(dueDate);
      // Overdue items pile onto today.
      return i === 0 ? dueDate <= endOfToday() : dueKey === key;
    }).length;
    forecast.push({
      date: key,
      label: day.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
      count,
      isToday: i === 0,
    });
  }

  const tagCounts = new Map<string, number>();
  for (const r of allReviews) {
    for (const tag of safeJsonParse<string[]>(r.issueTags, [])) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const weakestIssues = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    dueToday,
    overdue,
    totalProblems: all.length,
    streak,
    freezesBanked,
    avgConfidence7d,
    reviewsToday,
    solvesToday,
    reviews7d,
    retention7d,
    activitySpark,
    reviewsSpark,
    retentionSpark,
    forecast,
    weakestIssues,
  };
}

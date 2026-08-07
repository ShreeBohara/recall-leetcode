import { db } from "@/db";
import { lists, listItems, problems, reviews, settings } from "@/db/schema";
import { and, asc, count, eq, gte, isNull, ne } from "drizzle-orm";
import { getDueProblems, localDayKey, USER_ID, type ProblemRow } from "./data";
import { canonicalizeAll } from "./patterns";
import { safeJsonParse } from "./types";

import { getBacklogState, orderForSession, type BacklogState } from "./backlog";

export interface NextAction {
  type: "review" | "solve" | "log";
  dueCount: number;
  /** present when type === "review" */
  due?: ProblemRow[];
  /** present when type === "review": catch-up plan info */
  backlog?: BacklogState;
  /** present when type === "solve". Deliberately carries NO pattern fields:
   *  this object is serialized into the client payload, and recognizing the
   *  pattern is the skill under test. */
  solve?: {
    lcSlug: string;
    title: string;
    difficulty: string | null;
    url: string | null;
    listName: string;
    position: number;
    total: number;
    reason: string;
  };
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await db
    .select()
    .from(settings)
    .where(and(eq(settings.userId, USER_ID), eq(settings.key, key)))
    .get();
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(settings)
    .values({ userId: USER_ID, key, value })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value },
    })
    .run();
}

export async function getActiveList() {
  const slug = (await getSetting("active_list")) ?? null;
  if (!slug) return null;
  return (
    (await db
      .select()
      .from(lists)
      .where(and(eq(lists.userId, USER_ID), eq(lists.slug, slug)))
      .get()) ?? null
  );
}

/**
 * Canonical pattern slugs the user SOLVED in the last 24h. Solves only:
 * spaced reviews must never poison the interleaving avoid-set, or a morning
 * review of pattern X would block X solves all day.
 */
async function recentPatterns(): Promise<Set<string>> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = await db
    .select({ problemId: reviews.problemId })
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, USER_ID),
        eq(reviews.tier, "initial_solve"),
        gte(reviews.reviewedAt, cutoff)
      )
    )
    .all();
  if (recent.length === 0) return new Set();
  const ids = new Set(recent.map((r) => r.problemId));
  const rows = await db
    .select({ id: problems.id, patterns: problems.patterns })
    .from(problems)
    .where(eq(problems.userId, USER_ID))
    .all();
  const out = new Set<string>();
  for (const row of rows) {
    if (!ids.has(row.id)) continue;
    for (const p of canonicalizeAll(safeJsonParse<string[]>(row.patterns, [])))
      out.add(p);
  }
  return out;
}

/** Patterns with ≥2 rough REVIEW results (again/hard) in the last 14 days. */
async function weakPatterns(): Promise<Map<string, number>> {
  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const rows = await db
    .select({
      grade: reviews.grade,
      tier: reviews.tier,
      patterns: problems.patterns,
    })
    .from(reviews)
    .innerJoin(problems, eq(reviews.problemId, problems.id))
    .where(and(eq(reviews.userId, USER_ID), gte(reviews.reviewedAt, cutoff)))
    .orderBy(asc(reviews.reviewedAt))
    .all();
  const roughByPattern = new Map<string, number>();
  for (const r of rows) {
    if (r.tier === "initial_solve") continue; // struggle on first contact ≠ decay
    if (r.grade !== "again" && r.grade !== "hard") continue;
    for (const p of canonicalizeAll(safeJsonParse<string[]>(r.patterns, []))) {
      roughByPattern.set(p, (roughByPattern.get(p) ?? 0) + 1);
    }
  }
  return new Map([...roughByPattern].filter(([, n]) => n >= 2));
}

/** Graded (non-initial) review count — the data gate for the v2 engine. */
async function gradedReviewCount(): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(reviews)
    .where(
      and(eq(reviews.userId, USER_ID), ne(reviews.tier, "initial_solve"))
    )
    .get();
  return row?.n ?? 0;
}

const V2_MIN_GRADED_REVIEWS = 20;

/**
 * Entry point: the weighted engine once ≥20 graded reviews exist to tune
 * against, the simple list-order engine before that. Both stay pattern-blind
 * in every user-facing reason string.
 */
export async function recommendNext(): Promise<NextAction["solve"] | null> {
  if ((await gradedReviewCount()) >= V2_MIN_GRADED_REVIEWS) {
    const v2 = await recommendV2();
    if (v2) return v2;
  }
  return recommendV1();
}

/**
 * v1 recommender — deliberately simple until there's data to tune on:
 * curated list order (which already encodes difficulty progression), boosted
 * toward a weak pattern when one exists, avoiding yesterday's pattern.
 */
async function recommendV1(): Promise<NextAction["solve"] | null> {
  const list = await getActiveList();
  if (!list) return null;

  const unstarted = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.listId, list.id), isNull(listItems.problemId)))
    .orderBy(asc(listItems.position))
    .all();
  if (unstarted.length === 0) return null;

  const total = (
    await db
      .select({ id: listItems.id })
      .from(listItems)
      .where(eq(listItems.listId, list.id))
      .all()
  ).length;

  const solvedCount = total - unstarted.length;
  const avoid = await recentPatterns();
  const weak = await weakPatterns();

  // 1. Weak pattern wins (unless it was today's — spacing beats cramming).
  //    The reason chip stays pattern-blind: recognizing the pattern is the
  //    skill under test, so no surface names it before the solve.
  const weakPick = unstarted.find(
    (i) => i.pattern && weak.has(i.pattern) && !avoid.has(i.pattern)
  );
  if (weakPick) {
    const n = weak.get(weakPick.pattern!)!;
    return toSolve(
      weakPick,
      list.name,
      solvedCount,
      total,
      `Targets a weak spot — ${n} rough reviews in the last 2 weeks`
    );
  }

  // 2. Next in list order, skipping a pattern you solved in the last day.
  const first = unstarted[0];
  const fresh = unstarted.find((i) => !i.pattern || !avoid.has(i.pattern));
  const pick = fresh ?? first;
  const reason = !fresh
    ? `Next in ${list.name} — same pattern as today, it's all that's left`
    : fresh.id !== first.id
      ? `Mixing it up — skipped what you practiced today`
      : `Next in ${list.name}`;
  return toSolve(pick, list.name, solvedCount, total, reason);
}

// ---------- v2: weighted scoring (weakness / coverage / difficulty-fit / order) ----------

/** Deterministic 0..1 from a string seed (mulberry32 over a simple hash). */
function seededRandom(seed: string): number {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const GRADE_VALUE: Record<string, number> = {
  again: 0,
  hard: 0.4,
  good: 0.8,
  easy: 1,
};
const RECENCY_WEIGHTS = [1, 0.8, 0.6, 0.4, 0.2]; // newest first

interface PatternKnowledge {
  mastery: Map<string, number>; // 0..1, recency-weighted last-5 grades
  coverage: Map<string, number>; // solved/total within the active list
  easySolved: Map<string, number>; // ALL solves (list + off-list)
  mediumSolved: Map<string, number>;
  easyAvail: Map<string, number>; // available in the active list
  mediumAvail: Map<string, number>;
}

async function patternKnowledge(listId: number): Promise<PatternKnowledge> {
  const gradeRows = await db
    .select({
      grade: reviews.grade,
      tier: reviews.tier,
      reviewedAt: reviews.reviewedAt,
      patterns: problems.patterns,
    })
    .from(reviews)
    .innerJoin(problems, eq(reviews.problemId, problems.id))
    .where(eq(reviews.userId, USER_ID))
    .orderBy(asc(reviews.reviewedAt))
    .all();

  const byPattern = new Map<string, number[]>(); // grade values, newest first
  for (const r of gradeRows) {
    if (r.tier === "initial_solve") continue;
    for (const p of canonicalizeAll(safeJsonParse<string[]>(r.patterns, []))) {
      const arr = byPattern.get(p) ?? [];
      arr.unshift(GRADE_VALUE[r.grade] ?? 0.5);
      byPattern.set(p, arr);
    }
  }
  const mastery = new Map<string, number>();
  for (const [p, values] of byPattern) {
    const recent = values.slice(0, RECENCY_WEIGHTS.length);
    let sum = 0;
    let wsum = 0;
    recent.forEach((v, i) => {
      sum += v * RECENCY_WEIGHTS[i];
      wsum += RECENCY_WEIGHTS[i];
    });
    mastery.set(p, wsum ? sum / wsum : 0.5);
  }

  const items = await db
    .select()
    .from(listItems)
    .where(eq(listItems.listId, listId))
    .all();
  const coverage = new Map<string, number>();
  const easyAvail = new Map<string, number>();
  const mediumAvail = new Map<string, number>();
  const totals = new Map<string, number>();
  const solved = new Map<string, number>();
  for (const i of items) {
    if (!i.pattern) continue;
    totals.set(i.pattern, (totals.get(i.pattern) ?? 0) + 1);
    if (i.difficulty === "Easy")
      easyAvail.set(i.pattern, (easyAvail.get(i.pattern) ?? 0) + 1);
    if (i.difficulty === "Medium")
      mediumAvail.set(i.pattern, (mediumAvail.get(i.pattern) ?? 0) + 1);
    if (i.problemId != null) {
      solved.set(i.pattern, (solved.get(i.pattern) ?? 0) + 1);
    }
  }
  for (const [p, total] of totals) {
    coverage.set(p, (solved.get(p) ?? 0) / total);
  }

  // Ability counts come from ALL solves, not just list members — an off-list
  // Medium you crushed still proves you're past Easies in that pattern.
  const easySolved = new Map<string, number>();
  const mediumSolved = new Map<string, number>();
  const solvedProblems = await db
    .select({ difficulty: problems.difficulty, patterns: problems.patterns })
    .from(problems)
    .where(eq(problems.userId, USER_ID))
    .all();
  for (const p of solvedProblems) {
    for (const pat of canonicalizeAll(safeJsonParse<string[]>(p.patterns, []))) {
      if (p.difficulty === "Easy")
        easySolved.set(pat, (easySolved.get(pat) ?? 0) + 1);
      if (p.difficulty === "Medium")
        mediumSolved.set(pat, (mediumSolved.get(pat) ?? 0) + 1);
    }
  }
  return { mastery, coverage, easySolved, mediumSolved, easyAvail, mediumAvail };
}

function nextTier(pattern: string | null, k: PatternKnowledge): string {
  if (!pattern) return "Easy";
  const m = k.mastery.get(pattern) ?? 0.5;
  const easy = k.easySolved.get(pattern) ?? 0;
  const med = k.mediumSolved.get(pattern) ?? 0;
  // Thresholds are relative to what the list actually offers: a pattern with
  // one Easy in the list can't demand two Easy solves before Medium.
  const needEasy = Math.min(2, k.easyAvail.get(pattern) ?? 0);
  const needMed = Math.min(3, k.mediumAvail.get(pattern) ?? 0);
  if (m >= 0.7 && med >= Math.max(1, needMed)) return "Hard";
  if (m >= 0.6 && easy >= needEasy) return "Medium";
  return "Easy";
}

/** Patterns touched by ANY review today (interleaving soft-penalty input). */
async function patternsReviewedToday(): Promise<Set<string>> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({ patterns: problems.patterns })
    .from(reviews)
    .innerJoin(problems, eq(reviews.problemId, problems.id))
    .where(
      and(eq(reviews.userId, USER_ID), gte(reviews.reviewedAt, start.toISOString()))
    )
    .all();
  const out = new Set<string>();
  for (const r of rows) {
    for (const p of canonicalizeAll(safeJsonParse<string[]>(r.patterns, [])))
      out.add(p);
  }
  return out;
}

async function recommendV2(): Promise<NextAction["solve"] | null> {
  const list = await getActiveList();
  if (!list) return null;

  const unstarted = await db
    .select()
    .from(listItems)
    .where(and(eq(listItems.listId, list.id), isNull(listItems.problemId)))
    .orderBy(asc(listItems.position))
    .all();
  if (unstarted.length === 0) return null;

  const totalRows = await db
    .select({ id: listItems.id })
    .from(listItems)
    .where(eq(listItems.listId, list.id))
    .all();
  const total = totalRows.length;
  const solvedCount = total - unstarted.length;

  const [k, avoid, reviewedToday] = await Promise.all([
    patternKnowledge(list.id),
    recentPatterns(),
    patternsReviewedToday(),
  ]);

  const scored = unstarted.map((item, idx) => {
    const p = item.pattern;
    const m = p ? (k.mastery.get(p) ?? 0.5) : 0.5;
    const cov = p ? (k.coverage.get(p) ?? 0) : 0;
    const diffFit = item.difficulty === nextTier(p, k) ? 1 : 0.3;
    const orderPrior = 1 - idx / unstarted.length;
    const terms = {
      weakness: 0.35 * (1 - m),
      coverage: 0.25 * (1 - cov),
      difficulty: 0.25 * diffFit,
      order: 0.15 * orderPrior,
    };
    let w = terms.weakness + terms.coverage + terms.difficulty + terms.order;
    if (p && avoid.has(p)) w *= 0.5; // solved this pattern in the last day
    if (p && reviewedToday.has(p)) w *= 0.75; // reviewed it today
    return { item, w, terms };
  });

  // Softmax over the top 8 — seeded by the local day + progress, so the hero
  // is stable across page refreshes but varies day to day and solve to solve.
  const top = [...scored].sort((a, b) => b.w - a.w).slice(0, 8);
  const T = 0.3;
  const exps = top.map((s) => Math.exp(s.w / T));
  const sum = exps.reduce((a, b) => a + b, 0);
  let roll = seededRandom(`${localDayKey(new Date())}:${solvedCount}`) * sum;
  let pick = top[0];
  for (let i = 0; i < top.length; i++) {
    roll -= exps[i];
    if (roll <= 0) {
      pick = top[i];
      break;
    }
  }

  // Reason chip from the dominant term — always pattern-blind.
  const { terms } = pick;
  const dominant = (
    Object.entries(terms) as [keyof typeof terms, number][]
  ).sort((a, b) => b[1] - a[1])[0][0];
  const reason =
    dominant === "weakness"
      ? "Strengthens a shaky area — recent reviews there were rough"
      : dominant === "coverage"
        ? `Fills a coverage gap in ${list.name}`
        : dominant === "difficulty"
          ? "The right next step up in difficulty"
          : `Next up in ${list.name}`;

  return toSolve(pick.item, list.name, solvedCount, total, reason);
}

function toSolve(
  item: typeof listItems.$inferSelect,
  listName: string,
  solvedCount: number,
  total: number,
  reason: string
): NextAction["solve"] {
  return {
    lcSlug: item.lcSlug,
    title: item.title,
    difficulty: item.difficulty,
    url: item.url,
    listName,
    position: solvedCount + 1, // truthful: "your Nth problem in this run"
    total,
    reason,
  };
}

/** The single question the app answers: what should I do right now? */
export async function getNextAction(): Promise<NextAction> {
  const due = await getDueProblems();
  if (due.length > 0) {
    // In catch-up the session is capped and ordered by retrievability;
    // new-problem recommendations pause until the backlog is back to normal.
    const backlog = await getBacklogState(due);
    return {
      type: "review",
      dueCount: due.length,
      due: orderForSession(due, backlog),
      backlog,
    };
  }
  const solve = await recommendNext();
  if (solve) return { type: "solve", dueCount: 0, solve };
  return { type: "log", dueCount: 0 };
}

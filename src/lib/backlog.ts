import { db } from "@/db";
import { problems, reviews } from "@/db/schema";
import { and, eq, gte } from "drizzle-orm";
import { cardFromJson, cardToJson, retrievability } from "./fsrs";
import { getDueProblems, localDayKey, USER_ID, type ProblemRow } from "./data";

export interface BacklogState {
  active: boolean;
  dueCount: number;
  /** reviews per day during catch-up */
  cap: number;
  /** estimated days to clear at the cap */
  days: number;
  medianDaily: number;
}

/** Median graded reviews per day over the last 7 days (zeros included). */
async function medianDailyLoad(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
  const rows = await db
    .select({ reviewedAt: reviews.reviewedAt, tier: reviews.tier })
    .from(reviews)
    .where(and(eq(reviews.userId, USER_ID), gte(reviews.reviewedAt, cutoff)))
    .all();
  // Same local-day convention as every other stat (TZ pinned in db/index.ts).
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (r.tier === "initial_solve") continue;
    const key = localDayKey(new Date(r.reviewedAt));
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const counts: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = localDayKey(new Date(Date.now() - i * 86400_000));
    counts.push(perDay.get(d) ?? 0);
  }
  counts.sort((a, b) => a - b);
  return counts[3]; // median of 7
}

/**
 * Catch-up triggers when the due pile clearly exceeds normal load
 * (> max(10, 1.5× the 7-day median)). The plan replaces the scary number:
 * "~cap/day for N days".
 */
export async function getBacklogState(
  due?: ProblemRow[]
): Promise<BacklogState> {
  const dueList = due ?? (await getDueProblems());
  const median = await medianDailyLoad();
  const threshold = Math.max(10, Math.ceil(1.5 * Math.max(median, 1)));
  const active = dueList.length > threshold;
  const cap = Math.max(5, median || 5);
  const days = Math.max(1, Math.ceil(dueList.length / cap));
  return {
    active,
    dueCount: dueList.length,
    cap,
    days,
    medianDaily: median,
  };
}

/**
 * Session ordering. In catch-up, rescue what's still savable first
 * (descending retrievability) and cap the session; otherwise due order.
 */
export function orderForSession(
  due: ProblemRow[],
  backlog: BacklogState
): ProblemRow[] {
  if (!backlog.active) return due;
  const now = new Date();
  return [...due]
    .sort(
      (a, b) => retrievability(b.fsrsCard, now) - retrievability(a.fsrsCard, now)
    )
    .slice(0, backlog.cap);
}

/**
 * "I was away" — spread the backlog over the coming days, ≤cap per day.
 * Highest-retrievability cards are postponed FURTHEST (they're the safest to
 * delay); the most at-risk memories come back first. Only `due` moves — the
 * FSRS memory state (stability/difficulty) is untouched, and the stored card
 * JSON is kept in sync so schedule and card never diverge.
 */
export async function spreadBacklog(): Promise<{
  kept: number;
  postponed: number;
  days: number;
}> {
  const due = await getDueProblems();
  const backlog = await getBacklogState(due);
  if (due.length === 0) return { kept: 0, postponed: 0, days: 0 };

  const now = new Date();
  const byR = [...due].sort(
    (a, b) => retrievability(b.fsrsCard, now) - retrievability(a.fsrsCard, now)
  );
  const keep = byR.slice(-backlog.cap); // lowest-R: the most at-risk stay today
  const rest = byR.slice(0, -backlog.cap); // R-descending: safest first

  // rest is R-descending: chunk from the END so the safest land the latest.
  let dayOffset = 1;
  let postponed = 0;
  for (let i = rest.length; i > 0; i -= backlog.cap) {
    const chunk = rest.slice(Math.max(0, i - backlog.cap), i);
    const target = new Date(now);
    target.setDate(target.getDate() + dayOffset);
    target.setHours(9, 0, 0, 0);
    for (const p of chunk) {
      const newDue = target.toISOString();
      let cardJson = p.fsrsCard;
      if (cardJson) {
        const card = cardFromJson(cardJson);
        card.due = new Date(newDue);
        cardJson = cardToJson(card);
      }
      await db
        .update(problems)
        .set({ due: newDue, fsrsCard: cardJson })
        .where(and(eq(problems.id, p.id), eq(problems.userId, USER_ID)))
        .run();
      postponed++;
    }
    dayOffset++;
  }
  return { kept: keep.length, postponed, days: dayOffset - 1 };
}

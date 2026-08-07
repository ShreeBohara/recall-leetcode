import { db } from "@/db";
import { reviews } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { USER_ID, localDayKey } from "./data";

export interface Records {
  fastestRecallSec: number | null; // quickest correct approach recall
  longestStreak: number; // longest run of consecutive active days
  bestDayReviews: number; // most graded reviews in one day
  bestCalibrationWeek: {
    weekStart: string;
    hitRate: number; // % of confident/unsure predictions that matched outcome
    n: number;
  } | null;
}

export function localMonday(d: Date): string {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const dow = (day.getDay() + 6) % 7; // Mon=0
  day.setDate(day.getDate() - dow);
  return localDayKey(day);
}

/** Local-noon anchor for a YYYY-MM-DD key — date-only new Date() is UTC. */
export function dayKeyToDate(key: string): Date {
  return new Date(key + "T12:00:00");
}

export interface StreakState {
  current: number;
  longest: number;
  freezesBanked: number;
}

/**
 * THE streak algorithm — one walker for the live streak, the freeze bank, and
 * the longest-streak record, so they can never disagree. Walks every calendar
 * day from first activity to today: active days extend the run and earn a
 * freeze per 7 consecutive; a missed day consumes a banked freeze (resetting
 * earn progress) or breaks the run; an inactive TODAY is not-yet-over, never
 * a break.
 */
export function computeStreaks(activeDays: Set<string>, now: Date): StreakState {
  const todayKey = localDayKey(now);
  const sorted = [...activeDays].sort();
  if (sorted.length === 0) return { current: 0, longest: 0, freezesBanked: 0 };

  let bank = 0;
  let sinceEarn = 0;
  let run = 0;
  let longest = 0;
  const cursor = dayKeyToDate(sorted[0]);
  while (localDayKey(cursor) <= todayKey) {
    const key = localDayKey(cursor);
    if (activeDays.has(key)) {
      run++;
      sinceEarn++;
      if (sinceEarn === 7) {
        bank = Math.min(2, bank + 1);
        sinceEarn = 0;
      }
    } else if (key === todayKey) {
      // Today isn't over — neither a freeze nor a break.
    } else if (bank > 0) {
      bank--;
      sinceEarn = 0; // frozen day isn't active; earning needs 7 consecutive
    } else {
      run = 0;
      sinceEarn = 0;
    }
    longest = Math.max(longest, run);
    cursor.setDate(cursor.getDate() + 1);
  }
  return { current: run, longest, freezesBanked: bank };
}

/** A calibration "hit": confident (4–5) and passed, or unsure (1–2) and failed. */
function calibrationHit(pre: number, grade: string): boolean | null {
  if (pre >= 4) return grade === "good" || grade === "easy";
  if (pre <= 2) return grade === "again" || grade === "hard";
  return null; // pre=3 carries no prediction
}

export async function computeRecords(): Promise<Records> {
  const all = await db
    .select()
    .from(reviews)
    .where(eq(reviews.userId, USER_ID))
    .orderBy(asc(reviews.reviewedAt))
    .all();

  let fastestRecallSec: number | null = null;
  const perDay = new Map<string, number>();
  const perWeek = new Map<string, { hits: number; n: number }>();
  const activeDays: string[] = [];

  for (const r of all) {
    const day = localDayKey(new Date(r.reviewedAt));
    if (activeDays[activeDays.length - 1] !== day) activeDays.push(day);

    if (r.tier !== "initial_solve") {
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
      if (
        (r.grade === "good" || r.grade === "easy") &&
        r.timeToApproachSec != null &&
        r.timeToApproachSec > 0
      ) {
        fastestRecallSec =
          fastestRecallSec == null
            ? r.timeToApproachSec
            : Math.min(fastestRecallSec, r.timeToApproachSec);
      }
      if (r.preConfidence != null) {
        const hit = calibrationHit(r.preConfidence, r.grade);
        if (hit != null) {
          const week = localMonday(new Date(r.reviewedAt));
          const agg = perWeek.get(week) ?? { hits: 0, n: 0 };
          agg.n++;
          if (hit) agg.hits++;
          perWeek.set(week, agg);
        }
      }
    }
  }

  // Longest streak via the SAME freeze-aware walker as the live streak —
  // the record can never read lower than the current streak.
  const { longest: longestStreak } = computeStreaks(
    new Set(activeDays),
    new Date()
  );

  const bestDayReviews = Math.max(0, ...perDay.values());

  let bestCalibrationWeek: Records["bestCalibrationWeek"] = null;
  for (const [weekStart, { hits, n }] of perWeek) {
    if (n < 5) continue; // too few predictions to mean anything
    const hitRate = Math.round((hits / n) * 100);
    if (!bestCalibrationWeek || hitRate > bestCalibrationWeek.hitRate) {
      bestCalibrationWeek = { weekStart, hitRate, n };
    }
  }

  return { fastestRecallSec, longestStreak, bestDayReviews, bestCalibrationWeek };
}

/** Human-readable labels for records newly set by the just-logged review. */
export function diffRecords(before: Records, after: Records): string[] {
  const out: string[] = [];
  if (
    after.fastestRecallSec != null &&
    (before.fastestRecallSec == null ||
      after.fastestRecallSec < before.fastestRecallSec)
  ) {
    out.push(`Fastest correct recall — ${after.fastestRecallSec}s`);
  }
  if (after.longestStreak > before.longestStreak) {
    out.push(`Longest streak — ${after.longestStreak} days`);
  }
  if (after.bestDayReviews > before.bestDayReviews) {
    out.push(`Most reviews in a day — ${after.bestDayReviews}`);
  }
  return out;
}

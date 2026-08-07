import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type Grade as FsrsGrade,
} from "ts-fsrs";
import type { Grade, ParsedSummary } from "./types";

// Long-term mode: no 10-minute "learning steps" — a coding problem's first
// review lands days out, not minutes. Fuzz off so schedules are reproducible.
const params = generatorParameters({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_short_term: false,
  enable_fuzz: false,
});

export const scheduler = fsrs(params);

const RATING_BY_GRADE: Record<Grade, FsrsGrade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

export function cardToJson(card: Card): string {
  return JSON.stringify(card);
}

// Revive Date fields lost in JSON round-trip.
export function cardFromJson(raw: string): Card {
  const c = JSON.parse(raw);
  return {
    ...c,
    due: new Date(c.due),
    last_review: c.last_review ? new Date(c.last_review) : undefined,
  } as Card;
}

export interface ScheduledResult {
  card: Card;
  due: Date;
}

/**
 * Apply a graded review to a card (or create the card, for the initial solve).
 * First non-Again interval is floored at 2 days — a 30-minute problem is not
 * a flashcard, and this matches the user's proven +2d habit.
 */
export function applyReview(
  existingCardJson: string | null,
  grade: Grade,
  when: Date
): ScheduledResult {
  const card = existingCardJson
    ? cardFromJson(existingCardJson)
    : createEmptyCard(when);
  const isFirst = card.reps === 0;
  const next = scheduler.next(card, when, RATING_BY_GRADE[grade]);
  let updated = next.card;

  if (isFirst && grade !== "again") {
    const minDue = new Date(when.getTime() + 2 * 24 * 60 * 60 * 1000);
    if (updated.due < minDue) {
      updated = { ...updated, due: minDue, scheduled_days: 2 };
    }
  }
  return { card: updated, due: updated.due };
}

/**
 * The grade rubric: derived from signals already in the summary so logging
 * never asks an extra question. Tutor's suggested grade (auditable) wins when present.
 */
export function deriveGrade(parsed: {
  solved: ParsedSummary["solved"];
  recallSpeed: ParsedSummary["recallSpeed"];
  hintsUsed?: number | null;
  confidenceAfter?: number | null;
  suggestedGrade?: Grade | null;
}): { grade: Grade; source: "tutor" | "derived" } {
  if (parsed.suggestedGrade) {
    return { grade: parsed.suggestedGrade, source: "tutor" };
  }
  const conf = parsed.confidenceAfter ?? 3;
  const hints = parsed.hintsUsed ?? 0;

  if (parsed.solved === "solution" || parsed.recallSpeed === "failed") {
    return { grade: "again", source: "derived" };
  }
  if (
    parsed.solved === "hints" ||
    hints > 0 ||
    parsed.recallSpeed === "hinted" ||
    parsed.recallSpeed === "slow" ||
    conf <= 2
  ) {
    return { grade: "hard", source: "derived" };
  }
  if (parsed.recallSpeed === "instant" && conf >= 5) {
    return { grade: "easy", source: "derived" };
  }
  return { grade: "good", source: "derived" };
}

/** Current recall probability (0..1) for a stored card; 0 when unknown. */
export function retrievability(cardJson: string | null, now: Date): number {
  if (!cardJson) return 0;
  try {
    const r = scheduler.get_retrievability(cardFromJson(cardJson), now, false);
    return typeof r === "number" ? r : 0;
  } catch {
    return 0;
  }
}

export { State, Rating };

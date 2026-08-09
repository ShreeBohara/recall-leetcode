/**
 * Regression tests for the scheduling engine — the part of Recall that decides
 * when every problem comes back. It had no test coverage at all until now.
 *
 * These pin BEHAVIOUR, not ts-fsrs internals: the grade rubric, the card
 * round-trip, and the two-day floor. A silent change here doesn't crash
 * anything, it just quietly schedules the wrong day forever, which is the
 * worst failure mode this app has.
 *
 * Run: npx tsx scripts/fsrs-regression.ts
 */
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from "ts-fsrs";
import {
  applyReview,
  deriveGrade,
  cardToJson,
  cardFromJson,
  retrievability,
} from "../src/lib/fsrs";
import type { Grade } from "../src/lib/types";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(
      `✗ ${name}\n  got:      ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`
    );
  } else console.log(`✓ ${name}`);
}
function ok(name: string, cond: boolean, detail = "") {
  if (!cond) {
    failures++;
    console.log(`✗ ${name}${detail ? `\n  ${detail}` : ""}`);
  } else console.log(`✓ ${name}`);
}

const AT = new Date("2026-08-09T19:00:00.000Z"); // noon PDT
const days = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / 86400_000);

// ---------------------------------------------------------------- grade rubric

// The rubric is total: every combination must produce a grade, never undefined.
check("tutor's suggested grade wins over derived signals",
  deriveGrade({ solved: "solo", recallSpeed: "instant", confidenceAfter: 5, suggestedGrade: "hard" }),
  { grade: "hard", source: "tutor" });

check("saw the solution → again",
  deriveGrade({ solved: "solution", recallSpeed: "instant", confidenceAfter: 5 }).grade, "again");
check("failed recall → again",
  deriveGrade({ solved: "solo", recallSpeed: "failed", confidenceAfter: 5 }).grade, "again");
check("hints used → hard",
  deriveGrade({ solved: "hints", recallSpeed: "instant", confidenceAfter: 5 }).grade, "hard");
check("hintsUsed count alone → hard",
  deriveGrade({ solved: "solo", recallSpeed: "instant", hintsUsed: 1, confidenceAfter: 5 }).grade, "hard");
check("slow recall → hard",
  deriveGrade({ solved: "solo", recallSpeed: "slow", confidenceAfter: 5 }).grade, "hard");
check("low confidence → hard",
  deriveGrade({ solved: "solo", recallSpeed: "instant", confidenceAfter: 2 }).grade, "hard");
check("instant + confidence 5 → easy",
  deriveGrade({ solved: "solo", recallSpeed: "instant", confidenceAfter: 5 }).grade, "easy");
check("instant + confidence 4 → good (5s must be earned)",
  deriveGrade({ solved: "solo", recallSpeed: "instant", confidenceAfter: 4 }).grade, "good");
check("missing confidence defaults to 3, not to easy",
  deriveGrade({ solved: "solo", recallSpeed: "instant" }).grade, "good");
check("derived grades are labelled derived",
  deriveGrade({ solved: "solo", recallSpeed: "instant" }).source, "derived");

// ------------------------------------------------------- first-interval shape

// Long-term mode (enable_short_term:false) is what keeps a coding problem off a
// flashcard schedule. These are the intervals the app actually ships.
const first: Record<string, number> = {};
for (const g of ["again", "hard", "good", "easy"] as Grade[]) {
  first[g] = days(applyReview(null, g, AT).due, AT);
}
check("first-solve intervals (again/hard/good/easy)",
  [first.again, first.hard, first.good, first.easy], [1, 2, 3, 8]);
ok("no first interval is shorter than a day",
  Object.values(first).every((d) => d >= 1), JSON.stringify(first));

// ------------------------------------------------- the 2-day floor is a LIVE net

// This block looks like dead code — under enable_short_term:false the floor
// never fires, because ts-fsrs already returns >= 2 days. It is NOT dead: it is
// the guard that catches enable_short_term being flipped on. A prior analysis
// recommended deleting it; this test is why that would be wrong.
{
  const shortTerm = fsrs(generatorParameters({
    request_retention: 0.9, maximum_interval: 365,
    enable_short_term: true, enable_fuzz: false,
  }));
  const raw = shortTerm.next(createEmptyCard(AT), AT, Rating.Good).card;
  const rawMinutes = (raw.due.getTime() - AT.getTime()) / 60_000;
  ok("short-term mode really does produce sub-hour first intervals",
    rawMinutes < 60, `got ${rawMinutes.toFixed(1)} min — if this fails, ts-fsrs changed and the floor's purpose needs rechecking`);
  ok("...and applyReview's floor would catch it (>= 2 days)",
    days(applyReview(null, "good", AT).due, AT) >= 2);
}

// The floor is deliberately scoped to non-Again grades only.
ok("floor does not apply to 'again' (a lapse must come back soon)",
  days(applyReview(null, "again", AT).due, AT) < 2);

// ---------------------------------------------------------- card JSON contract

// Dates do not survive JSON. cardFromJson revives them; if it stops, every
// subsequent schedule silently computes from an invalid date.
{
  const card = applyReview(null, "good", AT).card;
  const revived = cardFromJson(cardToJson(card));
  ok("due survives the JSON round-trip as a real Date",
    revived.due instanceof Date && !Number.isNaN(revived.due.getTime()));
  check("due value is preserved exactly", revived.due.toISOString(), card.due.toISOString());
  ok("last_review survives as a Date when present",
    revived.last_review === undefined || revived.last_review instanceof Date);
  check("reps preserved", revived.reps, card.reps);
  check("state preserved", revived.state, card.state);
}

// A fresh card must never be mistaken for a reviewed one.
check("a new card starts at reps 0 / State.New",
  [createEmptyCard(AT).reps, createEmptyCard(AT).state], [0, State.New]);

// ------------------------------------------------- second review compounds

// The bug that matters: a re-grade must advance from the STORED card, not from
// a fresh one. If applyReview ever ignores existingCardJson, intervals stop
// growing and the whole point of spaced repetition is gone.
{
  const r1 = applyReview(null, "good", AT);
  const later = new Date(r1.due.getTime());
  const r2 = applyReview(cardToJson(r1.card), "good", later);
  ok("second 'good' schedules further out than the first",
    days(r2.due, later) > days(r1.due, AT),
    `first=${days(r1.due, AT)}d second=${days(r2.due, later)}d`);
  ok("reps increments across reviews", r2.card.reps > r1.card.reps,
    `${r1.card.reps} -> ${r2.card.reps}`);
  ok("a lapse shortens the next interval",
    days(applyReview(cardToJson(r2.card), "again", new Date(r2.due)).due, new Date(r2.due))
      < days(r2.due, later));
}

// maximum_interval: 365 is a SOFT cap in long-term mode, and this test exists to
// keep that documented rather than surprising. LongTermScheduler.next_interval
// (ts-fsrs/dist/index.mjs:1252-1256) clamps each grade to maximum_interval and
// THEN enforces again < hard < good < easy:
//     hard = max(hard, again + 1)   good = max(good, hard + 1)   easy = max(easy, good + 1)
// So once all four saturate at 365 they get bumped to 365/366/367/368. The real
// ceiling is maximum_interval + 3, reached only by a card graded easy ~9 times
// in a row. Harmless — but assert it so a future ts-fsrs change is visible.
{
  let card = applyReview(null, "easy", AT);
  for (let i = 0; i < 12; i++) {
    card = applyReview(cardToJson(card.card), "easy", new Date(card.due));
  }
  const span = days(card.due, new Date(card.card.last_review ?? AT));
  ok("saturated interval settles at maximum_interval + 3, not below it",
    span > 365 && span <= 368, `got ${span}d — expected 366..368`);
  ok("scheduled_days agrees with the due date it produced",
    card.card.scheduled_days === span, `scheduled_days=${card.card.scheduled_days} span=${span}`);
}

// ------------------------------------------------------------- retrievability

check("retrievability of an unknown card is 0", retrievability(null, AT), 0);
check("retrievability of malformed JSON is 0 (must not throw)",
  retrievability("{not json", AT), 0);
{
  const card = applyReview(null, "good", AT).card;
  const r = retrievability(cardToJson(card), AT);
  ok("retrievability of a fresh card is a probability in (0,1]", r > 0 && r <= 1, `got ${r}`);
  const laterR = retrievability(cardToJson(card), new Date(AT.getTime() + 60 * 86400_000));
  ok("retrievability decays as time passes", laterR < r, `now=${r} later=${laterR}`);
}

// -------------------------------------------------------- scheduling is stable

// enable_fuzz is off so schedules are reproducible — two identical calls must
// agree, or the same review logged twice would land on different days.
{
  const a = applyReview(null, "good", AT).due.toISOString();
  const b = applyReview(null, "good", AT).due.toISOString();
  check("scheduling is deterministic (fuzz stays off)", a, b);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

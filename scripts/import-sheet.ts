/**
 * One-time import of Shreet's "DSA" Google Sheet (Aug 2026 snapshot).
 *
 * Each problem's attempt history is replayed through ts-fsrs so the seeded
 * card state reflects real dates, not a cold start. The sheet merged all
 * attempts' issues into one cell, so issue text lands on the problem record /
 * final attempt; intermediate attempts get a neutral "good" grade (FSRS
 * self-corrects within a review or two).
 *
 * Idempotent: problems already in the DB (by slug) are skipped.
 * Run: npm run import:sheet
 */
import "dotenv/config";
import { db } from "../src/db";
import { problems } from "../src/db/schema";
import { and, eq } from "drizzle-orm";
import { saveParsedSummary, logReview, USER_ID } from "../src/lib/data";
import { parsedSummarySchema, slugFromTitle, type Grade } from "../src/lib/types";
import { mapIssueTags } from "../src/lib/parser";

interface SheetRow {
  number: number;
  title: string;
  url: string;
  difficulty: "Easy" | "Medium" | "Hard";
  patterns: string[];
  // Chronological attempt dates; the LAST one carries the sheet's final
  // confidence/speed and gets `finalGrade`.
  attempts: string[];
  finalGrade: Grade;
  confidence: number; // sheet "Last Recall Confidence"
  speed: number; // sheet "Last Recall Speed" (1-5)
  issues: string[];
  fundamentalsMissing?: string[];
  tips: string[];
  optimal?: { approach: string; time: string; space: string };
  keyInsight?: string;
}

const ROWS: SheetRow[] = [
  {
    number: 977,
    title: "Squares of a Sorted Array",
    url: "https://leetcode.com/problems/squares-of-a-sorted-array/",
    difficulty: "Easy",
    patterns: ["two-pointers", "arrays"],
    attempts: ["2025-05-15", "2025-05-16", "2025-09-27"],
    finalGrade: "hard",
    confidence: 2,
    speed: 2,
    issues: [
      "Solution worked but used 4 separate loops — messy code, though O(N)",
      "Chose pointers at the negative/positive boundary instead of the extremes",
    ],
    tips: [
      "Two pointers on the extreme ends; whichever absolute value is bigger goes at the END of the answer array; move that pointer inward until left <= right",
    ],
    optimal: {
      approach:
        "Two pointers from both ends; place the larger absolute value at the back of the result",
      time: "O(n)",
      space: "O(n)",
    },
  },
  {
    number: 15,
    title: "3Sum",
    url: "https://leetcode.com/problems/3sum/",
    difficulty: "Medium",
    patterns: ["two-pointers", "sorting"],
    attempts: ["2025-05-15", "2025-06-07", "2025-09-27"],
    finalGrade: "good",
    confidence: 5,
    speed: 4,
    issues: [
      "Solved efficiently but missed one optimization: use if instead of while for the outer-loop duplicate check",
      "Earlier attempt took long and the code was messy",
    ],
    tips: [
      "Write clean code: use if (not while) when skipping duplicates in the outer loop",
    ],
    optimal: {
      approach:
        "Sort, fix one element, two-pointer the rest; skip duplicates on both the fixed element and the pair",
      time: "O(n²)",
      space: "O(1)",
    },
  },
  {
    number: 16,
    title: "3Sum Closest",
    url: "https://leetcode.com/problems/3sum-closest/",
    difficulty: "Medium",
    patterns: ["two-pointers", "sorting"],
    attempts: ["2025-05-15", "2025-05-16", "2025-06-07", "2025-06-08", "2025-09-28"],
    finalGrade: "easy",
    confidence: 5,
    speed: 5,
    issues: [
      "One earlier attempt failed outright (needed the hint)",
      "Missed the key line: tracking a temp diff variable and knowing what to increment each iteration",
    ],
    tips: [
      "Keep it simple: compare current sum against target each iteration and let that decide left++ or right--",
    ],
    optimal: {
      approach:
        "Sort + two pointers, tracking the closest sum seen so far in a separate variable",
      time: "O(n²)",
      space: "O(1)",
    },
  },
  {
    number: 283,
    title: "Move Zeroes",
    url: "https://leetcode.com/problems/move-zeroes/",
    difficulty: "Easy",
    patterns: ["two-pointers", "arrays"],
    attempts: ["2025-06-07", "2025-06-08", "2025-09-28"],
    finalGrade: "easy",
    confidence: 5,
    speed: 5,
    issues: ["First attempt: couldn't come up with a clean solution"],
    tips: ["Simple problem — dry run a few cases for clarity before coding"],
    optimal: {
      approach:
        "Two pointers from the start; swap when the forward pointer hits non-zero and the anchor sits on zero",
      time: "O(n)",
      space: "O(1)",
    },
  },
  {
    number: 42,
    title: "Trapping Rain Water",
    url: "https://leetcode.com/problems/trapping-rain-water/",
    difficulty: "Hard",
    patterns: ["two-pointers", "arrays"],
    attempts: ["2025-06-08", "2025-06-09", "2025-09-28"],
    finalGrade: "hard",
    confidence: 3,
    speed: 3,
    issues: [
      "Could not come up with the logic unaided — watched the video, then coded it myself",
      "Needs practice",
    ],
    fundamentalsMissing: [
      "Deciding which bar to process (left or right) and why, when using two pointers",
    ],
    tips: [
      "Two pointers from both ends, tracking left_max and right_max; process the side with the smaller max",
    ],
    optimal: {
      approach:
        "Two pointers with running left_max/right_max; water at each bar = min(maxes) - height",
      time: "O(n)",
      space: "O(1)",
    },
  },
  {
    number: 986,
    title: "Interval List Intersections",
    url: "https://leetcode.com/problems/interval-list-intersections/",
    difficulty: "Medium",
    patterns: ["two-pointers", "intervals"],
    attempts: ["2025-06-10", "2025-09-28"],
    finalGrade: "good",
    confidence: 4,
    speed: 3,
    issues: [
      "Very close to the solution — missed one simple if",
      "First solve was messy and took over 30 minutes",
    ],
    tips: [
      "Use max/min to determine the intersection's start/end; compare interval ends to decide whether to advance i or j",
    ],
    optimal: {
      approach:
        "Two pointers over both lists; intersection = [max(starts), min(ends)]; advance whichever interval ends first",
      time: "O(n + m)",
      space: "O(1)",
    },
  },
  {
    number: 49,
    title: "Group Anagrams",
    url: "https://leetcode.com/problems/group-anagrams/",
    difficulty: "Medium",
    patterns: ["arrays-hashing"],
    attempts: ["2026-08-02"],
    finalGrade: "hard",
    confidence: 2,
    speed: 3,
    issues: [
      "Could not define what makes two strings anagrams",
      "Could not answer what stays invariant when a word is shuffled (the letter counts)",
    ],
    fundamentalsMissing: [
      "Definition of anagram: two strings are anagrams iff their sorted versions are identical",
      "Letter-count invariance: character counts never change under shuffle",
    ],
    tips: ["A char-count key avoids sorting each string"],
    keyInsight: "All anagrams share one canonical form — bucket by it",
    optimal: {
      approach:
        "Bucket strings in a hash map keyed by their canonical form (sorted string or char-count tuple)",
      time: "O(n·k log k)",
      space: "O(n·k)",
    },
  },
];

// Sheet's 1-5 speed → recall speed enum (final attempt only).
function speedToRecall(speed: number): "instant" | "slow" | "hinted" | "failed" {
  if (speed >= 5) return "instant";
  if (speed >= 2) return "slow";
  return "failed";
}

// Noon local time so day boundaries can't shift with timezones.
const atNoon = (day: string) => new Date(`${day}T12:00:00`);

let imported = 0;
let skipped = 0;

for (const row of ROWS) {
  const slug = slugFromTitle(row.title, row.number);
  const existing = await db
    .select({ id: problems.id })
    .from(problems)
    .where(and(eq(problems.userId, USER_ID), eq(problems.slug, slug)))
    .get();
  if (existing) {
    skipped++;
    continue;
  }

  const [firstDay, ...laterDays] = row.attempts;
  const isSingleAttempt = laterDays.length === 0;

  const parsed = parsedSummarySchema.parse({
    number: row.number,
    title: row.title,
    url: row.url,
    difficulty: row.difficulty,
    patterns: row.patterns,
    solved: "solo",
    recallSpeed: isSingleAttempt ? speedToRecall(row.speed) : "slow",
    confidenceAfter: isSingleAttempt ? row.confidence : 3,
    fundamentalsMissing: row.fundamentalsMissing ?? [],
    issues: row.issues,
    issueTags: mapIssueTags(row.issues),
    optimal: row.optimal ?? null,
    keyInsight: row.keyInsight ?? "",
    tips: row.tips,
    revise: true,
    // Sheet rows don't carry per-attempt grades; pin the first attempt to a
    // neutral grade (or the final grade when it's the only attempt).
    suggestedGrade: isSingleAttempt ? row.finalGrade : "good",
    gradeRationale: "imported from DSA sheet",
  });

  const result = await saveParsedSummary(parsed, atNoon(firstDay));

  for (const [i, day] of laterDays.entries()) {
    const isFinal = i === laterDays.length - 1;
    await logReview(
      {
        problemId: result.problemId,
        tier: "full_resolve",
        grade: isFinal ? row.finalGrade : "good",
        postConfidence: isFinal ? row.confidence : null,
        notes: isFinal ? "Imported from DSA sheet (final logged attempt)" : null,
      },
      atNoon(day)
    );
  }

  imported++;
  console.log(`✓ ${row.number}. ${row.title} — ${row.attempts.length} attempt(s) replayed`);
}

console.log(`\nDone: ${imported} imported, ${skipped} already present.`);

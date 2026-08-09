/** Regression tests for the review-confirmed parser fixes. Run: npx tsx scripts/parser-regression.ts */
import { parseSummary, parseApproach, mapIssueTags } from "../src/lib/parser";

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failures++;
    console.log(`✗ ${name}\n  got:      ${JSON.stringify(actual)}\n  expected: ${JSON.stringify(expected)}`);
  } else console.log(`✓ ${name}`);
}

// solved negation
const s1 = parseSummary("## Problem Log — 1. Two Sum\nSolved: solo, no hints     Recall speed: instant\nRevise: yes");
check("'solo, no hints' → solo/0", [s1.parsed.solved, s1.parsed.hintsUsed], ["solo", 0]);
const s2 = parseSummary("## Problem Log — 1. Two Sum\nSolved: yes, with 2 hints\nRevise: yes");
check("'yes, with 2 hints' → hints/2", [s2.parsed.solved, s2.parsed.hintsUsed], ["hints", 2]);

// inline Time on Optimal line must not hijack
const s3 = parseSummary("## Problem Log — 49. Group Anagrams\nOptimal: hashmap keyed by sorted word. Time: O(NK log K), Space: O(NK)\nRevise: yes");
check("Optimal line keeps complexities", [s3.parsed.optimal?.time, s3.parsed.optimal?.space], ["O(NK log K)", "O(NK)"]);
check("Time-spent not hijacked", s3.parsed.timeApproachMin, null);

// template Time line still works
const s4 = parseSummary("## Problem Log — 1. Two Sum\nConfidence: before 2/5 → after 3/5     Time: approach 12 min · code 20 min\nRevise: yes");
check("Confidence-line Time split", [s4.parsed.timeApproachMin, s4.parsed.timeCodeMin, s4.parsed.confidenceBefore, s4.parsed.confidenceAfter], [12, 20, 2, 3]);

// patterns as bullet list
const s5 = parseSummary("## Problem Log — 1. Two Sum\nPatterns:\n- hash map\n- sorting\nRevise: yes");
check("bullet patterns split", s5.parsed.patterns, ["hash-map", "sorting"]);

// hyphenated approach prose
check(
  "hyphen prose survives",
  parseApproach("sort each word - use sorted string as key - O(NK log K) / O(NK)"),
  { approach: "sort each word - use sorted string as key", time: "O(NK log K)", space: "O(NK)" }
);
check(
  "template em-dash case",
  parseApproach("bucket by sorted-string key — O(nk log k) / O(nk)"),
  { approach: "bucket by sorted-string key", time: "O(nk log k)", space: "O(nk)" }
);
check(
  "O() inside approach",
  parseApproach("prune O(n²) candidate pairs with a heap — O(n log n) / O(n)"),
  { approach: "prune O(n²) candidate pairs with a heap", time: "O(n log n)", space: "O(n)" }
);

// "solution" needs a verb — a bare mention must not force grade=again
const s6 = parseSummary("## Problem Log — 1. Two Sum\nSolved: solo, then compared with the solution\nRevise: yes");
check("'compared with the solution' → solo", s6.parsed.solved, "solo");
const s7 = parseSummary("## Problem Log — 1. Two Sum\nSolved: saw solution\nRevise: yes");
check("'saw solution' → solution", s7.parsed.solved, "solution");
const s8 = parseSummary("## Problem Log — 1. Two Sum\nSolved: no — needed the editorial\nRevise: yes");
check("'no — needed the editorial' → solution", s8.parsed.solved, "solution");

// recall speed negation
const s9 = parseSummary("## Problem Log — 1. Two Sum\nRecall speed: never stuck\nRevise: yes");
check("'never stuck' is not failed", s9.parsed.recallSpeed, "slow");
const s10 = parseSummary("## Problem Log — 1. Two Sum\nRecall speed: didn't come immediately\nRevise: yes");
check("'didn't come immediately' is not instant", s10.parsed.recallSpeed, "slow");
const s11 = parseSummary("## Problem Log — 1. Two Sum\nRecall speed: slow, took a while before it clicked\nRevise: yes");
check("literal 'slow' wins", s11.parsed.recallSpeed, "slow");

// a bare O() in prose is explanation, not the recorded complexity
check(
  "mid-prose O() not promoted",
  parseApproach("avoid the O(n²) nested loop by hashing seen values"),
  { approach: "avoid the O(n²) nested loop by hashing seen values", time: "", space: "" }
);
check(
  "dash-less trailing pair still read",
  parseApproach("one pass with a hash map O(n) / O(n)"),
  { approach: "one pass with a hash map O(n) / O(n)", time: "O(n)", space: "O(n)" }
);

// the tutor prompt asks for taxonomy tag NAMES on the Issues line; four of the
// seven matched none of the prose regexes and used to evaporate silently
check("bare tag names are recognised", mapIssueTags(["off_by_one"]), ["off_by_one"]);
check("wrong_data_structure by name", mapIssueTags(["wrong_data_structure"]), ["wrong_data_structure"]);
check("missed_edge_case by name", mapIssueTags(["missed_edge_case"]), ["missed_edge_case"]);
check("wrong_pattern by name", mapIssueTags(["wrong_pattern"]), ["wrong_pattern"]);
check(
  "tag name plus a note",
  mapIssueTags(["off_by_one — the while loop ran one short"]),
  ["off_by_one"]
);
check("hyphen and space spellings agree", [mapIssueTags(["off-by-one"]), mapIssueTags(["off by one"])], [["off_by_one"], ["off_by_one"]]);
check("prose still maps", mapIssueTags(["code was messy", "wrong pattern"]), ["wrong_pattern", "implementation_messy"]);
check("'other' is not matched on its name in prose", mapIssueTags(["some other thing went wrong"]), []);

// revise negations
check("'not needed' → false", parseSummary("## Problem Log — 1. X\nRevise: not needed").parsed.revise, false);
check("'yes — rationale' → true", parseSummary("## Problem Log — 1. X\nRevise: yes — weak").parsed.revise, true);

// canonical template end-to-end unchanged
const full = parseSummary(`## Problem Log — 49. Group Anagrams
URL / Difficulty / Patterns: https://leetcode.com/problems/group-anagrams/ · Medium · arrays-hashing, sorting
Solved: with 2 hints     Recall speed: slow
Confidence: before 2/5 → after 3/5     Time: approach 12 min · code 20 min
Fundamentals missing: definition of anagram
Issues: wrong pattern; code was messy
Brute force: compare every pair — O(n²k) / O(1)
Optimal: bucket by sorted-string key — O(nk log k) / O(nk)
Key insight: all anagrams share one canonical form
Tips: char-count tuple avoids the sort
Revise: yes — pattern recognition still weak
Suggested grade: hard — needed hints for the invariant`);
check(
  "canonical template",
  [full.parsed.title, full.parsed.solved, full.parsed.hintsUsed, full.parsed.recallSpeed, full.parsed.suggestedGrade, full.parsed.optimal?.time, full.warnings.length],
  ["Group Anagrams", "hints", 2, "slow", "hard", "O(nk log k)", 0]
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);

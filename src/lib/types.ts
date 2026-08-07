import { z } from "zod";

export const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
export const SOLVED_VALUES = ["solo", "hints", "solution"] as const;
export const RECALL_SPEEDS = ["instant", "slow", "hinted", "failed"] as const;
export const GRADES = ["again", "hard", "good", "easy"] as const;
export const REVIEW_TIERS = [
  "initial_solve",
  "approach_recall",
  "full_resolve",
] as const;

// Fixed issue taxonomy — free-text issues are mapped onto these so analytics
// never fragment on wording ("mono stack" vs "monotonic stack").
export const ISSUE_TAGS = [
  "off_by_one",
  "wrong_data_structure",
  "missed_edge_case",
  "wrong_pattern",
  "complexity_error",
  "implementation_messy",
  "syntax",
  "other",
] as const;

export type Grade = (typeof GRADES)[number];
export type RecallSpeed = (typeof RECALL_SPEEDS)[number];
export type Solved = (typeof SOLVED_VALUES)[number];

export const approachSchema = z.object({
  approach: z.string().default(""),
  time: z.string().default(""),
  space: z.string().default(""),
});
export type Approach = z.infer<typeof approachSchema>;

// The output of parsing a pasted Problem Log summary (deterministic or AI).
export const parsedSummarySchema = z.object({
  number: z.number().int().nullable().default(null),
  title: z.string().min(1),
  url: z.string().default(""),
  difficulty: z.enum(DIFFICULTIES).nullable().default(null),
  patterns: z.array(z.string()).default([]),
  language: z.string().default(""),
  solved: z.enum(SOLVED_VALUES).default("solo"),
  hintsUsed: z.number().int().min(0).default(0),
  recallSpeed: z.enum(RECALL_SPEEDS).default("slow"),
  confidenceBefore: z.number().int().min(1).max(5).nullable().default(null),
  confidenceAfter: z.number().int().min(1).max(5).nullable().default(null),
  timeApproachMin: z.number().min(0).nullable().default(null),
  timeCodeMin: z.number().min(0).nullable().default(null),
  fundamentalsMissing: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  issueTags: z.array(z.enum(ISSUE_TAGS)).default([]),
  bruteForce: approachSchema.nullable().default(null),
  optimal: approachSchema.nullable().default(null),
  keyInsight: z.string().default(""),
  tips: z.array(z.string()).default([]),
  revise: z.boolean().default(true),
  suggestedGrade: z.enum(GRADES).nullable().default(null),
  gradeRationale: z.string().default(""),
});
export type ParsedSummary = z.infer<typeof parsedSummarySchema>;

export function slugFromTitle(title: string, number: number | null): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return number != null ? `${number}-${base}` : base;
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

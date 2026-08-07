import type { Grade } from "./types";

export const ISSUE_TAG_LABELS: Record<string, string> = {
  off_by_one: "Off-by-one errors",
  wrong_data_structure: "Wrong data structure",
  missed_edge_case: "Missed edge cases",
  wrong_pattern: "Pattern recognition",
  complexity_error: "Complexity analysis",
  implementation_messy: "Messy implementation",
  syntax: "Syntax slips",
  other: "Other",
};

export const GRADE_LABELS: Record<Grade, string> = {
  again: "Failed",
  hard: "Hard",
  good: "Good",
  easy: "Easy",
};

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

/** Days from today to the given date, by calendar day (negative = past). */
export function daysUntil(iso: string): number {
  return Math.round(
    (startOfDay(new Date(iso)).getTime() - startOfDay(new Date()).getTime()) /
      DAY_MS
  );
}

export function formatDue(iso: string): string {
  const days = daysUntil(iso);
  if (days < -1) return `${-days} days overdue`;
  if (days === -1) return "1 day overdue";
  if (days === 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

export function formatDate(iso: string): string {
  // Date-only strings parse as UTC midnight, which renders as the PREVIOUS
  // day in any UTC- timezone — anchor them to local midnight instead.
  const dateOnly = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatRelativePast(iso: string): string {
  const days = -daysUntil(iso);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  return `${Math.round(days / 365)} yr ago`;
}

export function difficultyClass(difficulty: string | null): string {
  switch (difficulty) {
    case "Easy":
      return "text-good";
    case "Medium":
      return "text-primary";
    case "Hard":
      return "text-warn";
    default:
      return "text-muted-foreground";
  }
}

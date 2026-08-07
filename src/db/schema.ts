import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// JSON-in-text columns hold arrays/objects; typed accessors live in src/lib/types.ts.
// user_id is on every table from day one so multi-user later is a toggle, not a migration.

export const problems = sqliteTable(
  "problems",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("shreet"),
    slug: text("slug").notNull(),
    lcSlug: text("lc_slug"), // LeetCode slug (from URL/catalog) — joins to list_items
    number: integer("number"),
    title: text("title").notNull(),
    url: text("url"),
    difficulty: text("difficulty"), // Easy | Medium | Hard
    patterns: text("patterns").notNull().default("[]"), // JSON string[]
    language: text("language"),
    bruteForce: text("brute_force"), // JSON {approach,time,space}
    optimal: text("optimal"), // JSON {approach,time,space}
    keyInsight: text("key_insight"),
    tips: text("tips").notNull().default("[]"), // JSON string[]
    fundamentalsMissing: text("fundamentals_missing").notNull().default("[]"), // JSON string[]
    rawSummary: text("raw_summary"),
    revise: integer("revise", { mode: "boolean" }).notNull().default(true),
    firstSolvedAt: text("first_solved_at").notNull(),
    createdAt: text("created_at").notNull(),
    // FSRS card state: full card as JSON, plus due/state lifted out for querying.
    fsrsCard: text("fsrs_card"), // JSON serialized ts-fsrs Card
    due: text("due"), // ISO datetime, null when revise=false
    state: integer("state").notNull().default(0), // ts-fsrs State enum
  },
  (t) => [uniqueIndex("problems_user_slug_idx").on(t.userId, t.slug)]
);

export const lists = sqliteTable(
  "lists",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("shreet"),
    slug: text("slug").notNull(), // neetcode-150 | blind-75
    name: text("name").notNull(),
    description: text("description"),
    attribution: text("attribution"),
    source: text("source").notNull().default("curated"),
    position: integer("position").notNull().default(0),
  },
  (t) => [uniqueIndex("lists_user_slug_idx").on(t.userId, t.slug)]
);

export const listItems = sqliteTable(
  "list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    lcSlug: text("lc_slug").notNull(),
    title: text("title").notNull(),
    difficulty: text("difficulty"),
    url: text("url"),
    pattern: text("pattern"), // canonical pattern slug
    problemId: integer("problem_id").references(() => problems.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("list_items_list_slug_idx").on(t.listId, t.lcSlug),
    index("list_items_list_pos_idx").on(t.listId, t.position),
  ]
);

export const concepts = sqliteTable(
  "concepts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("shreet"),
    slug: text("slug").notNull(), // canonical pattern slug
    display: text("display").notNull(),
  },
  (t) => [uniqueIndex("concepts_user_slug_idx").on(t.userId, t.slug)]
);

export const problemConcepts = sqliteTable(
  "problem_concepts",
  {
    problemId: integer("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    conceptId: integer("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.problemId, t.conceptId] })]
);

/** Weekly coach reports written by Claude via the MCP save_coach_report tool. */
export const coachReports = sqliteTable(
  "coach_reports",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull().default("shreet"),
    weekStart: text("week_start").notNull(), // local Monday, YYYY-MM-DD
    markdown: text("markdown").notNull(),
    createdAt: text("created_at").notNull(),
    dismissedAt: text("dismissed_at"),
  },
  (t) => [uniqueIndex("coach_user_week_idx").on(t.userId, t.weekStart)]
);

/** Per-slug cache of live LeetCode metadata — each slug is fetched at most once. */
export const problemsCatalog = sqliteTable("problems_catalog", {
  lcSlug: text("lc_slug").primaryKey(),
  number: integer("number"),
  title: text("title"),
  difficulty: text("difficulty"),
  patterns: text("patterns").notNull().default("[]"), // canonical slugs from topic tags
  fetchedAt: text("fetched_at").notNull(),
});

export const settings = sqliteTable(
  "settings",
  {
    userId: text("user_id").notNull().default("shreet"),
    key: text("key").notNull(), // active_list | daily_review_goal | ...
    value: text("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })]
);

export const reviews = sqliteTable("reviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().default("shreet"),
  problemId: integer("problem_id")
    .notNull()
    .references(() => problems.id, { onDelete: "cascade" }),
  reviewedAt: text("reviewed_at").notNull(),
  tier: text("tier").notNull(), // initial_solve | approach_recall | full_resolve
  solved: text("solved"), // solo | hints | solution
  hintsUsed: integer("hints_used"),
  recallSpeed: text("recall_speed"), // instant | slow | hinted | failed
  preConfidence: integer("pre_confidence"), // 1-5, captured BEFORE reveal
  postConfidence: integer("post_confidence"), // 1-5
  timeToApproachSec: integer("time_to_approach_sec"),
  timeToCodeMin: real("time_to_code_min"),
  issues: text("issues").notNull().default("[]"), // JSON string[] (free text)
  issueTags: text("issue_tags").notNull().default("[]"), // JSON string[] (taxonomy)
  grade: text("grade").notNull(), // again | hard | good | easy
  gradeSource: text("grade_source").notNull().default("derived"), // derived | tutor | user
  notes: text("notes"),
  fsrsSnapshot: text("fsrs_snapshot"), // JSON card state after this review
  nextDue: text("next_due"),
});

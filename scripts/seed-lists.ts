/**
 * Seed Shreet's 57-Day Plan as THE curated list (and remove the retired
 * NeetCode 150 / Blind 75 lists). Idempotent and self-healing: items are
 * upserted by (list, lcSlug), positions refreshed every run, and items are
 * linked to already-solved problems by lcSlug. Seeds Turso when
 * TURSO_DATABASE_URL is set, local SQLite otherwise.
 * Run: npx tsx scripts/seed-lists.ts
 */
import "dotenv/config";
import { db } from "../src/db";
import { lists, listItems, problems, settings } from "../src/db/schema";
import { and, eq, notInArray } from "drizzle-orm";
import { USER_ID } from "../src/lib/data";
import plan from "../src/data/plan-57.json";

interface PlanEntry {
  day: number;
  number: number;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard";
  slug: string;
  url: string;
  pattern: string;
}

const LIST_DEFS = [
  {
    slug: "plan-57",
    name: "57-Day Plan",
    description:
      "Shreet's pattern-based plan: 105 problems in 14 blocks over 57 days. Reviews are handled by Recall's scheduler.",
    attribution: "Authored by Shreet (57-day-leetcode-plan-final.md)",
    position: 0,
    items: (plan as PlanEntry[]).map((e) => ({
      lcSlug: e.slug,
      title: `${e.number}. ${e.title}`,
      difficulty: e.difficulty,
      url: e.url,
      pattern: e.pattern,
    })),
  },
];

async function main() {
  // Retire lists that are no longer defined (cascade removes their items).
  const keep = LIST_DEFS.map((d) => d.slug);
  const retired = await db
    .select()
    .from(lists)
    .where(and(eq(lists.userId, USER_ID), notInArray(lists.slug, keep)))
    .all();
  for (const l of retired) {
    await db.delete(lists).where(eq(lists.id, l.id)).run();
    console.log(`retired list: ${l.name}`);
  }

  for (const def of LIST_DEFS) {
    let list = await db
      .select()
      .from(lists)
      .where(and(eq(lists.userId, USER_ID), eq(lists.slug, def.slug)))
      .get();
    if (!list) {
      list = await db
        .insert(lists)
        .values({
          userId: USER_ID,
          slug: def.slug,
          name: def.name,
          description: def.description,
          attribution: def.attribution,
          position: def.position,
        })
        .returning()
        .get();
    }

    let inserted = 0;
    for (const [i, entry] of def.items.entries()) {
      const existing = await db
        .select({ id: listItems.id })
        .from(listItems)
        .where(
          and(eq(listItems.listId, list.id), eq(listItems.lcSlug, entry.lcSlug))
        )
        .get();
      if (existing) {
        await db
          .update(listItems)
          .set({ position: i + 1, title: entry.title, difficulty: entry.difficulty, url: entry.url, pattern: entry.pattern })
          .where(eq(listItems.id, existing.id))
          .run();
      } else {
        await db
          .insert(listItems)
          .values({
            listId: list.id,
            position: i + 1,
            lcSlug: entry.lcSlug,
            title: entry.title,
            difficulty: entry.difficulty,
            url: entry.url,
            pattern: entry.pattern,
          })
          .run();
        inserted++;
      }
    }
    console.log(`${def.name}: ${def.items.length} items (${inserted} new)`);
  }

  // Link items to already-solved problems by lcSlug.
  const solved = await db
    .select()
    .from(problems)
    .where(eq(problems.userId, USER_ID))
    .all();
  let linked = 0;
  for (const p of solved) {
    if (!p.lcSlug) continue;
    const res = await db
      .update(listItems)
      .set({ problemId: p.id })
      .where(eq(listItems.lcSlug, p.lcSlug))
      .run();
    linked +=
      (res as { rowsAffected?: number }).rowsAffected ??
      (res as unknown as { changes?: number }).changes ??
      0;
  }
  console.log(`linked ${linked} list items to solved problems`);

  // The plan is the active list.
  await db
    .insert(settings)
    .values({ userId: USER_ID, key: "active_list", value: "plan-57" })
    .onConflictDoUpdate({
      target: [settings.userId, settings.key],
      set: { value: "plan-57" },
    })
    .run();
  console.log("active_list → plan-57");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

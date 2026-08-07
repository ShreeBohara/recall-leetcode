import { db } from "@/db";
import { problemsCatalog } from "@/db/schema";
import { eq } from "drizzle-orm";
import { canonicalizeAll } from "./patterns";

export interface LcMeta {
  lcSlug: string;
  number: number | null;
  title: string | null;
  difficulty: "Easy" | "Medium" | "Hard" | null;
  patterns: string[]; // canonical slugs
}

const timeout = (ms: number) =>
  new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

// Failures are retried at most every 5 min (in-memory — a permanent stub row
// would poison the slug forever after one transient outage).
const lookupFailedAt = new Map<string, number>();
const FAILURE_RETRY_MS = 5 * 60_000;

/**
 * Live LeetCode metadata: successes are cached permanently per slug; failures
 * back off for 5 minutes so an outage costs at most one ~4s stall per slug
 * per interval. Never blocks logging on error.
 */
export async function lookupLc(lcSlug: string): Promise<LcMeta | null> {
  const cached = await db
    .select()
    .from(problemsCatalog)
    .where(eq(problemsCatalog.lcSlug, lcSlug))
    .get();
  if (cached) {
    return {
      lcSlug,
      number: cached.number,
      title: cached.title,
      difficulty: cached.difficulty as LcMeta["difficulty"],
      patterns: JSON.parse(cached.patterns ?? "[]"),
    };
  }

  const failed = lookupFailedAt.get(lcSlug);
  if (failed !== undefined && Date.now() - failed < FAILURE_RETRY_MS) {
    return null;
  }

  try {
    const { LeetCode } = await import("leetcode-query");
    const lc = new LeetCode();
    const p = await Promise.race([lc.problem(lcSlug), timeout(4000)]);
    if (!p || typeof p !== "object") {
      lookupFailedAt.set(lcSlug, Date.now());
      return null;
    }
    const number = Number(
      (p as { questionFrontendId?: string }).questionFrontendId
    );
    const tagNames: string[] = (
      (p as { topicTags?: { name: string }[] }).topicTags ?? []
    ).map((t) => t.name);
    const meta: LcMeta = {
      lcSlug,
      number: Number.isFinite(number) ? number : null,
      title: (p as { title?: string }).title ?? null,
      difficulty:
        ((p as { difficulty?: string }).difficulty as LcMeta["difficulty"]) ??
        null,
      patterns: canonicalizeAll(tagNames),
    };
    await db
      .insert(problemsCatalog)
      .values({
        lcSlug,
        number: meta.number,
        title: meta.title,
        difficulty: meta.difficulty,
        patterns: JSON.stringify(meta.patterns),
        fetchedAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run();
    lookupFailedAt.delete(lcSlug);
    return meta;
  } catch {
    lookupFailedAt.set(lcSlug, Date.now());
    return null;
  }
}

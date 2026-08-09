/**
 * Regression: the problem identity ladder has exactly one implementation.
 *
 * The save path and the MCP resolver each grew their own version, and they
 * drifted: `resolveProblem` never looked up `lc_slug`, so the `log_review`
 * tool rejected the LeetCode slug its own schema advertises — for every
 * problem that has a number, which is all of them once the catalog fills it
 * in. Both now go through findProblem(); this pins each rung and the
 * near-miss that must NOT resolve.
 *
 * Also pins: logReview refuses a problem retired from review, rather than
 * writing a due date every read path filters out.
 *
 * Seeds a scratch SQLite DB — never the real one.
 * Run: npm run test:identity
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Blank (not delete) so dotenv inside drizzle.config.ts can't resurrect a
// Turso URL from a .env file — this run must never touch the real DB.
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
const dbPath = path.join(os.tmpdir(), `recall-identity-regression-${process.pid}.db`);
process.env.DATABASE_PATH = dbPath;

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

function cleanup() {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
}

async function main() {
  try {
    execFileSync("npx", ["drizzle-kit", "push", "--force"], {
      cwd: path.join(__dirname, ".."),
      env: process.env,
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`drizzle-kit push failed:\n${err.stdout ?? ""}\n${err.stderr ?? ""}`);
  }

  const { db } = await import("../src/db");
  const { problems } = await import("../src/db/schema");
  const { resolveProblem, findProblem, logReview, USER_ID } = await import("../src/lib/data");

  const now = "2026-07-22T19:00:00.000Z";
  await db
    .insert(problems)
    .values([
      {
        userId: USER_ID,
        slug: "49-group-anagrams",
        lcSlug: "group-anagrams",
        number: 49,
        title: "Group Anagrams",
        patterns: JSON.stringify(["arrays-hashing"]),
        revise: true,
        firstSolvedAt: now,
        createdAt: now,
      },
      // The near-miss: a title that ENDS with another problem's title.
      {
        userId: USER_ID,
        slug: "746-min-cost-climbing-stairs",
        lcSlug: "min-cost-climbing-stairs",
        number: 746,
        title: "Min Cost Climbing Stairs",
        patterns: JSON.stringify(["dp-1d"]),
        revise: true,
        firstSolvedAt: now,
        createdAt: now,
      },
      // Retired from review: due is null and every read path skips it.
      {
        userId: USER_ID,
        slug: "1-two-sum",
        lcSlug: "two-sum",
        number: 1,
        title: "Two Sum",
        patterns: JSON.stringify(["arrays-hashing"]),
        revise: false,
        firstSolvedAt: now,
        createdAt: now,
      },
    ])
    .run();

  const title = async (ref: string | number) => (await resolveProblem(ref))?.title ?? null;

  // Every form the log_review tool schema advertises.
  check("lcSlug resolves (the bug)", await title("group-anagrams"), "Group Anagrams");
  check("stored slug resolves", await title("49-group-anagrams"), "Group Anagrams");
  check("number resolves", await title(49), "Group Anagrams");
  check("numeric string resolves", await title("49"), "Group Anagrams");
  check("exact title resolves", await title("Group Anagrams"), "Group Anagrams");
  check("title is case-insensitive", await title("group anagrams"), "Group Anagrams");
  check("unknown ref stays unresolved", await title("does-not-exist"), null);

  // The bare-slug rung is exact equality, never a suffix LIKE.
  check("suffix near-miss does NOT resolve", await title("climbing-stairs"), null);
  check("the real slug still resolves", await title("min-cost-climbing-stairs"), "Min Cost Climbing Stairs");

  // Ladder order: the strongest key wins even when a weaker one also matches.
  const twoSum = await findProblem({ lcSlug: "two-sum", number: 49 });
  check("lcSlug outranks number", twoSum?.title, "Two Sum");

  // A retired problem is refused, not silently re-enrolled.
  const retired = await resolveProblem("two-sum");
  let message = "no error thrown";
  try {
    await logReview({ problemId: retired!.id, tier: "full_resolve", grade: "good" });
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  check("logReview refuses a retired problem", /retired from review/.test(message), true);
  const after = await resolveProblem("two-sum");
  check("refused review leaves due untouched", after?.due, null);

  // The scheduled problem still logs normally.
  const ga = await resolveProblem("group-anagrams");
  const res = await logReview({ problemId: ga!.id, tier: "approach_recall", grade: "good" });
  check("scheduled problem still schedules", typeof res.nextDue, "string");

  console.log(failures ? `\n${failures} failure(s)` : "\nAll checks passed");
}

main().then(
  () => {
    cleanup();
    process.exit(failures ? 1 : 0);
  },
  (e) => {
    cleanup();
    console.error(e);
    process.exit(1);
  }
);

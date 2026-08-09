/**
 * Regression: Sunday reviews must land in their own week's report.
 *
 * `new Date("YYYY-MM-DD")` parses as UTC midnight (ES spec), which is the
 * PREVIOUS local day in any UTC-negative timezone — and the app pins
 * TZ=America/Los_Angeles (src/db/index.ts). getWeeklyReportData once derived
 * its exclusive week end from that parse, so weekEnd landed on Sunday and the
 * `< weekEnd` filter silently dropped every Sunday review; the same parse in
 * the streak math froze longestStreak at 1. Seeds a scratch SQLite DB (never
 * the real one) and asserts the local-midnight anchors hold.
 *
 * Run: npx tsx scripts/weekly-report-tz-regression.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Simulate the DEPLOYED environment, not a convenient one: AWS Lambda (behind
// Vercel's Node functions) pre-sets TZ=:UTC, so the pin in src/db/index.ts has
// to overwrite an existing value. Hard-setting TZ here would mean this script
// could only ever pass — it would never exercise the path it exists to protect.
process.env.TZ = ":UTC";
process.env.APP_TIMEZONE = "America/Los_Angeles";
// Blank (not delete) so dotenv inside drizzle.config.ts can't resurrect a
// Turso URL from a .env file — this run must never touch the real DB.
process.env.TURSO_DATABASE_URL = "";
process.env.TURSO_AUTH_TOKEN = "";
const dbPath = path.join(os.tmpdir(), `recall-tz-regression-${process.pid}.db`);
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
  // Every assertion below depends on the TZ pin having overwritten the
  // pre-set TZ above. If this throws, src/db/index.ts has regressed to `??=`.
  await import("../src/db");
  if (new Date("2026-01-15T20:00:00Z").getHours() !== 12) {
    throw new Error(
      `TZ pin did not overwrite a pre-set TZ (still ${process.env.TZ}) — ` +
        "src/db/index.ts must assign process.env.TZ unconditionally, not with ??="
    );
  }

  try {
    execFileSync("npx", ["drizzle-kit", "push", "--force"], {
      cwd: path.join(__dirname, ".."),
      env: process.env,
      stdio: "pipe",
      timeout: 120_000,
    });
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `drizzle-kit push failed:\n${err.stdout ?? ""}\n${err.stderr ?? ""}`
    );
  }

  const { db } = await import("../src/db");
  const { problems, reviews } = await import("../src/db/schema");
  const { localDayKey, USER_ID } = await import("../src/lib/data");
  const { dayKeyToDate } = await import("../src/lib/records");
  const { getWeeklyReportData } = await import("../src/lib/coach");
  const { eq } = await import("drizzle-orm");

  await db
    .insert(problems)
    .values({
      userId: USER_ID,
      slug: "tz-regression-two-sum",
      title: "TZ Regression Two Sum",
      number: 1,
      patterns: JSON.stringify(["hash-map"]),
      revise: false, // keep it out of scheduling/recommendation paths
      firstSolvedAt: "2026-07-22T19:00:00.000Z",
      createdAt: "2026-07-22T19:00:00.000Z",
    })
    .run();
  const problem = await db
    .select({ id: problems.id })
    .from(problems)
    .where(eq(problems.slug, "tz-regression-two-sum"))
    .get();
  if (!problem) throw new Error("seed problem missing");

  // Week under test: Mon 2026-07-20 … Sun 2026-07-26 local — safely in the
  // past so the up-to-today streak walker sees it. Grades step again → hard →
  // good so "latest grade in week" is unambiguous, and the next-Monday "easy"
  // would show up in mastery/calibration if it leaked in.
  const seed = [
    // Wed 12:00 PDT — the lapse
    { reviewedAt: "2026-07-22T19:00:00.000Z", grade: "again", preConfidence: 3 },
    // Thu 12:00 PDT
    { reviewedAt: "2026-07-23T19:00:00.000Z", grade: "hard", preConfidence: null },
    // SUNDAY 20:00 PDT (UTC already says Mon Jul 27!) — the review the bug dropped
    { reviewedAt: "2026-07-27T03:00:00.000Z", grade: "good", preConfidence: 4 },
    // Monday 08:00 PDT — next week, must stay out
    { reviewedAt: "2026-07-27T15:00:00.000Z", grade: "easy", preConfidence: 5 },
  ];
  for (const r of seed) {
    await db
      .insert(reviews)
      .values({
        userId: USER_ID,
        problemId: problem.id,
        reviewedAt: r.reviewedAt,
        tier: "approach_recall",
        grade: r.grade,
        preConfidence: r.preConfidence,
      })
      .run();
  }

  const report = await getWeeklyReportData("2026-07-20");

  check("weekEnd is the NEXT Monday, not Sunday", report.period.weekEnd, "2026-07-27");
  check("all 3 in-week reviews counted (Sunday included, Monday not)", report.totals.gradedReviews, 3);
  check("retention counts Sunday (2 of 3 non-again)", report.totals.retention, 67);

  const cal4 = report.calibration.find((c) => c.confidence === 4);
  check("Sunday review reaches calibration", [cal4?.total, cal4?.passRate], [1, 100]);
  const cal5 = report.calibration.find((c) => c.confidence === 5);
  check("next-Monday review stays out of calibration", [cal5?.total, cal5?.passRate], [0, null]);

  // seeded "hash-map" canonicalizes to "arrays-hashing"
  const hashMap = report.patterns.find((p) => p.slug === "arrays-hashing");
  check("mastery = Sunday's grade (good=75), not Thu(40)/Mon(100)", hashMap?.mastery, 75);
  check("pattern reviewCount includes Sunday", hashMap?.reviewCount, 3);
  check("Wednesday lapse recorded", report.lapses.map((l) => l.number), [1]);
  check("longestStreak chains consecutive local days", report.records.longestStreak, 2);

  // Default no-arg window: a local Monday, exclusive end exactly +7 local days.
  const live = await getWeeklyReportData();
  check("default weekStart is a local Monday", dayKeyToDate(live.period.weekStart).getDay(), 1);
  const plus7 = dayKeyToDate(live.period.weekStart);
  plus7.setDate(plus7.getDate() + 7);
  check("default weekEnd is weekStart + 7 local days", live.period.weekEnd, localDayKey(plus7));

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

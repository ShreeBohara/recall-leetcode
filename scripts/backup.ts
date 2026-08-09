/**
 * Take a verified snapshot of the Recall database.
 *
 * Why this exists: the deployed Turso database is the only durable copy of a
 * review history that cannot be reconstructed. Turso's free plan keeps 24h of
 * point-in-time recovery, and before this script the only other copies were two
 * files a human made by hand immediately before a risky operation, both living
 * on one laptop. A backup nobody verifies is a guess, so this one reopens what
 * it wrote and proves it.
 *
 * Read-only against the source. It never writes to the database it backs up.
 * No shell is invoked anywhere; every SQL statement runs through better-sqlite3
 * or @libsql/client, and every table name comes from sqlite_master.
 *
 *   npx tsx scripts/backup.ts                 # snapshot into backups/
 *   npx tsx scripts/backup.ts --out /some/dir
 *   npx tsx scripts/backup.ts --verify-only backups/<file>.db
 *   npx tsx scripts/backup.ts --keep 30       # how many snapshots to retain
 *
 * Targets whatever the environment points at, exactly like the app:
 * TURSO_DATABASE_URL set -> the deployed database; otherwise DATABASE_PATH.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createClient, type Client } from "@libsql/client";

const BASELINE = path.join(process.cwd(), "drizzle", "0000_baseline.sql");

// Tables SQLite manages itself — never copied, never counted.
const INTERNAL = /^sqlite_/;

interface Source {
  label: string;
  tables(): Promise<string[]>;
  /** The source's own CREATE TABLE, for anything the baseline doesn't declare. */
  ddl(table: string): Promise<string | null>;
  rows(table: string): Promise<Record<string, unknown>[]>;
  close(): void;
}

function tursoSource(url: string): Source {
  const client: Client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return {
    label: `turso ${new URL(url.replace(/^libsql:/, "https:")).host}`,
    async tables() {
      const r = await client.execute(
        "select name from sqlite_master where type='table' order by name"
      );
      return r.rows.map((x) => String(x.name)).filter((n) => !INTERNAL.test(n));
    },
    async ddl(table) {
      const r = await client.execute({
        sql: "select sql from sqlite_master where type='table' and name = ?",
        args: [table],
      });
      return r.rows[0] ? String(r.rows[0].sql) : null;
    },
    async rows(table) {
      // Table name originates from sqlite_master above, never from user input.
      const r = await client.execute(`select * from "${table}"`);
      return r.rows as unknown as Record<string, unknown>[];
    },
    close() {
      client.close();
    },
  };
}

function fileSource(file: string): Source {
  const db = new Database(file, { readonly: true });
  return {
    label: `sqlite ${file}`,
    async tables() {
      return db
        .prepare("select name from sqlite_master where type='table' order by name")
        .all()
        .map((r) => String((r as { name: string }).name))
        .filter((n) => !INTERNAL.test(n));
    },
    async ddl(table) {
      const row = db
        .prepare("select sql from sqlite_master where type='table' and name = ?")
        .get(table) as { sql: string } | undefined;
      return row?.sql ?? null;
    },
    async rows(table) {
      return db.prepare(`select * from "${table}"`).all() as Record<string, unknown>[];
    },
    close() {
      db.close();
    },
  };
}

function openSource(): Source {
  const turso = process.env.TURSO_DATABASE_URL;
  if (turso) {
    if (!process.env.TURSO_AUTH_TOKEN) {
      throw new Error(
        "TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is not — refusing to " +
          "guess. Export both, or unset TURSO_DATABASE_URL to snapshot the local file."
      );
    }
    return tursoSource(turso);
  }
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "recall.db");
  if (!fs.existsSync(file)) throw new Error(`No database at ${file}`);
  return fileSource(file);
}

/**
 * The committed baseline migration IS the schema — reuse it rather than
 * restating it, so a snapshot can never drift from what the app expects.
 */
function applySchema(db: InstanceType<typeof Database>) {
  if (!fs.existsSync(BASELINE)) {
    throw new Error(
      `Missing ${BASELINE}. The snapshot builds its schema from the committed ` +
        "baseline migration; run npm run db:generate if drizzle/ is absent."
    );
  }
  const ddl = fs.readFileSync(BASELINE, "utf8");
  // better-sqlite3's multi-statement DDL runner. Local trusted file, no shell.
  db.exec(ddl);
}

async function snapshot(outFile: string): Promise<{ tables: number; rows: number }> {
  const src = openSource();
  console.log(`source: ${src.label}`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.rmSync(outFile, { force: true });

  const out = new Database(outFile);
  out.pragma("journal_mode = DELETE"); // one self-contained file, no -wal sidecar
  out.pragma("foreign_keys = OFF"); // insertion order across FKs must not matter
  applySchema(out);

  let totalRows = 0;
  const tables = await src.tables();

  // The baseline declares the app's own tables. Anything else the source
  // carries gets created from its own DDL — notably __drizzle_migrations, which
  // a restored database MUST keep, or drizzle-kit would try to re-apply the
  // baseline over populated tables.
  const declared = new Set(
    out
      .prepare("select name from sqlite_master where type='table'")
      .all()
      .map((r) => String((r as { name: string }).name))
  );
  for (const table of tables) {
    if (declared.has(table)) continue;
    const ddl = await src.ddl(table);
    if (!ddl) throw new Error(`No DDL available for source table "${table}"`);
    console.log(`  (carrying over non-baseline table ${table})`);
    out.exec(ddl);
  }

  for (const table of tables) {
    const rows = await src.rows(table);
    totalRows += rows.length;
    if (rows.length === 0) {
      console.log(`  ${table.padEnd(20)} 0`);
      continue;
    }
    const cols = Object.keys(rows[0]);
    const stmt = out.prepare(
      `insert into "${table}" (${cols.map((c) => `"${c}"`).join(",")}) ` +
        `values (${cols.map(() => "?").join(",")})`
    );
    const insertAll = out.transaction((batch: Record<string, unknown>[]) => {
      for (const r of batch) stmt.run(cols.map((c) => normalise(r[c])));
    });
    insertAll(rows);
    console.log(`  ${table.padEnd(20)} ${rows.length}`);
  }

  out.pragma("foreign_keys = ON");
  out.close();
  src.close();
  return { tables: tables.length, rows: totalRows };
}

/** libSQL hands back bigint/boolean/typed-array shapes better-sqlite3 won't bind. */
function normalise(v: unknown): string | number | bigint | Buffer | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "bigint" || typeof v === "number" || typeof v === "string") return v;
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (v instanceof ArrayBuffer) return Buffer.from(new Uint8Array(v));
  return String(v);
}

/**
 * A snapshot is only a backup if it opens and makes sense. The structural
 * checks catch a corrupt file; the domain checks catch a file that is
 * technically valid but useless — which is the failure that would actually bite.
 */
function verify(file: string, expect?: { tables: number; rows: number }): boolean {
  console.log(`\nverifying ${path.basename(file)}`);
  const db = new Database(file, { readonly: true });
  let bad = 0;
  /** Reports one check. `whenBad` is only built when the check actually fails. */
  function assert(good: boolean, okMsg: string, whenBad: () => string) {
    if (good) {
      console.log(`  ✓ ${okMsg}`);
      return;
    }
    bad++;
    console.log(`  ✗ ${whenBad()}`);
  }

  const integrity = db.pragma("integrity_check", { simple: true });
  assert(integrity === "ok", "integrity_check ok", () => `integrity_check: ${integrity}`);

  const fkIssues = db.pragma("foreign_key_check") as unknown[];
  assert(
    fkIssues.length === 0,
    "no foreign key violations",
    () => `${fkIssues.length} foreign key violations`
  );

  const tables = db
    .prepare("select name from sqlite_master where type='table'")
    .all()
    .map((r) => String((r as { name: string }).name))
    .filter((n) => !INTERNAL.test(n));

  let rows = 0;
  for (const t of tables) {
    rows += (db.prepare(`select count(*) c from "${t}"`).get() as { c: number }).c;
  }
  if (expect) {
    assert(
      tables.length === expect.tables,
      `${tables.length} tables, matching source`,
      () => `table count ${tables.length} != source ${expect.tables}`
    );
    assert(
      rows === expect.rows,
      `${rows} rows, matching source`,
      () => `row count ${rows} != source ${expect.rows}`
    );
  } else {
    assert(true, `${tables.length} tables, ${rows} rows`, () => "");
  }

  // Domain invariants — what makes the data restorable rather than merely
  // present. Each mirrors an invariant the app itself depends on.
  const count = (sql: string) => (db.prepare(sql).get() as { c: number }).c;

  const badCard = count(
    `select count(*) c from problems
     where fsrs_card is not null and json_valid(fsrs_card) = 0`
  );
  assert(
    badCard === 0,
    "every stored FSRS card is valid JSON",
    () => `${badCard} unparseable fsrs_card`
  );

  const scheduledNoDue = count(
    `select count(*) c from problems where revise = 1 and due is null and state != 0`
  );
  assert(
    scheduledNoDue === 0,
    "no started, reviewable problem is missing its due date",
    () => `${scheduledNoDue} problems marked revise with no due date`
  );

  const orphanReviews = count(
    `select count(*) c from reviews r
     left join problems p on p.id = r.problem_id where p.id is null`
  );
  assert(
    orphanReviews === 0,
    "every review points at a real problem",
    () => `${orphanReviews} orphaned reviews`
  );

  const badJson = count(
    `select count(*) c from problems
     where json_valid(patterns) = 0 or json_valid(tips) = 0
        or json_valid(fundamentals_missing) = 0`
  );
  assert(
    badJson === 0,
    "JSON-in-text columns all parse",
    () => `${badJson} rows with malformed JSON columns`
  );

  db.close();
  console.log(bad === 0 ? "  snapshot verified" : `  ${bad} PROBLEMS`);
  return bad === 0;
}

function prune(dir: string, keep: number) {
  const snaps = fs
    .readdirSync(dir)
    .filter((f) => /^recall-\d{4}-\d{2}-\d{2}T[\d-]+Z\.db$/.test(f))
    .sort()
    .reverse();
  for (const stale of snaps.slice(keep)) {
    fs.rmSync(path.join(dir, stale), { force: true });
    console.log(`pruned ${stale}`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const verifyOnly = arg("--verify-only");
  if (verifyOnly) process.exit(verify(verifyOnly) ? 0 : 1);

  const outDir = arg("--out") ?? path.join(process.cwd(), "backups");
  const keep = Number(arg("--keep") ?? 14);
  // Filenames sort lexicographically in chronological order, which is what
  // prune() relies on.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");
  const outFile = path.join(outDir, `recall-${stamp}.db`);

  const counts = await snapshot(outFile);
  if (!verify(outFile, counts)) {
    // A snapshot that fails verification is worse than none, because it looks
    // like protection. Keep it, but name it so nobody mistakes it for good.
    const quarantine = outFile.replace(/\.db$/, ".FAILED.db");
    fs.renameSync(outFile, quarantine);
    console.error(`\nverification FAILED — quarantined as ${path.basename(quarantine)}`);
    process.exit(1);
  }

  const bytes = fs.statSync(outFile).size;
  console.log(`\n${path.basename(outFile)}  ${(bytes / 1024).toFixed(1)} KB`);
  prune(outDir, keep);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

// All day-boundary math (streaks, "due today", forecast buckets) uses the
// process timezone; pin it so the deployed UTC server counts days the way the
// user does. This module loads before any date math runs.
//
// Assigned unconditionally, NOT with `??=`: AWS Lambda (the runtime behind
// Vercel's Node functions) pre-sets TZ, so `??=` skipped the pin on exactly
// the deployment it was written for. Override with APP_TIMEZONE, not TZ.
process.env.TZ = process.env.APP_TIMEZONE ?? "America/Los_Angeles";

/**
 * One schema, two drivers:
 * - TURSO_DATABASE_URL set (deployed / cloud dev) → libsql over HTTP, async.
 * - otherwise → local better-sqlite3 file, sync.
 * Everything downstream awaits query results; awaiting the sync driver's
 * plain values is a no-op, so both drivers share the async LibSQL type.
 */
export type Db = LibSQLDatabase<typeof schema>;

/*
 * require(), not import(): the driver is chosen at runtime and `db` is a
 * module-scope const, so this has to stay synchronous — a top-level `import`
 * would load BOTH drivers (pulling better-sqlite3's native binding into every
 * serverless bundle), and `await import()` would make createDb async and
 * ripple through every caller. The rule is disabled here and nowhere else.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
function createDb(): Db {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    const { createClient } = require("@libsql/client") as
      typeof import("@libsql/client");
    const { drizzle } = require("drizzle-orm/libsql") as
      typeof import("drizzle-orm/libsql");
    const client = createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    return drizzle(client, { schema });
  }

  const Database = require("better-sqlite3") as
    typeof import("better-sqlite3");
  const { drizzle } = require("drizzle-orm/better-sqlite3") as
    typeof import("drizzle-orm/better-sqlite3");
  const dbPath =
    process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "recall.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema }) as unknown as Db;
}
/* eslint-enable @typescript-eslint/no-require-imports */

// Survive Next.js dev-server hot reloads without leaking connections.
const globalForDb = globalThis as unknown as { _recallDb?: Db };

export const db: Db = (globalForDb._recallDb ??= createDb());
export { schema };

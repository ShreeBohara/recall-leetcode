import "dotenv/config";
import type { Config } from "drizzle-kit";

// Same schema, two targets: Turso (deployed) when TURSO_DATABASE_URL is set,
// otherwise the local SQLite file.
export default (process.env.TURSO_DATABASE_URL
  ? {
      schema: "./src/db/schema.ts",
      out: "./drizzle",
      dialect: "turso" as const,
      dbCredentials: {
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      },
    }
  : {
      schema: "./src/db/schema.ts",
      out: "./drizzle",
      dialect: "sqlite" as const,
      dbCredentials: {
        url: process.env.DATABASE_PATH ?? "data/recall.db",
      },
    }) satisfies Config;

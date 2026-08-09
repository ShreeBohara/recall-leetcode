/** One-off backfill: map existing reviews' free-text issues onto the taxonomy. */
import "dotenv/config";
import { db } from "../src/db";
import { reviews } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { mapIssueTags } from "../src/lib/parser";
import { safeJsonParse } from "../src/lib/types";

const rows = await db.select().from(reviews).all();
let updated = 0;
for (const r of rows) {
  const tags = safeJsonParse<string[]>(r.issueTags, []);
  const issues = safeJsonParse<string[]>(r.issues, []);
  if (tags.length === 0 && issues.length > 0) {
    const mapped = mapIssueTags(issues);
    if (mapped.length > 0) {
      await db
        .update(reviews)
        .set({ issueTags: JSON.stringify(mapped) })
        .where(eq(reviews.id, r.id))
        .run();
      updated++;
    }
  }
}
console.log(`backfilled issueTags on ${updated} reviews`);

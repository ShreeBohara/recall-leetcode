# Recall

A memory engine for your LeetCode practice. Paste the Problem Log summary from
your Claude tutoring session; Recall parses it, derives a review grade from how
the solve actually went, schedules spaced-repetition reviews with
[FSRS](https://github.com/open-spaced-repetition/ts-fsrs), and mirrors due
dates onto your calendar.

## Run it

```bash
npm install
npm run db:migrate     # create/update the schema from drizzle/
npm run seed:lists     # one-time: seed the problem list and make it active
npm run dev            # http://localhost:3000
```

Skip `seed:lists` and there is no active list, so the recommender has nothing
to draw from and "what should I solve next" stays empty.

> **These follow your `.env`, not the filename above.** `drizzle.config.ts`
> loads dotenv, so if `TURSO_DATABASE_URL` is set (see
> [Deploy](#deploy-vercel--turso)) then `db:migrate`, `db:push` and
> `import:sheet` target the **deployed** database, not `data/recall.db`. Unset
> the `TURSO_*` vars for a purely local run.

`npm run import:sheet` is a one-time historical import from the original Google
Sheet; it is not part of a normal setup.

## Tests

```bash
npm test               # parser, identity ladder, and timezone regressions
```

No test runner — each suite is a plain `tsx` script that exits non-zero on
failure. The two DB-backed suites seed a scratch SQLite file in `os.tmpdir()`
and never touch a real database.

## Daily loop

1. Solve a problem with your Claude tutor (the tutor Skill ends the session
   with a Problem Log summary).
2. **Log** → paste → Parse → confirm → Save. (~15 seconds)
3. Each morning, **Today** shows what's due. Each review is a 2-minute
   approach recall: name the pattern, state the invariant, give the
   complexity — then reveal and grade yourself honestly.

## The Problem Log template

Anything close to this parses perfectly (free-form text also works, best-effort;
set `ANTHROPIC_API_KEY` to parse messy summaries with Claude):

```
## Problem Log — 49. Group Anagrams
URL / Difficulty / Patterns: https://leetcode.com/problems/group-anagrams/ · Medium · arrays-hashing
Solved: with 2 hints     Recall speed: slow
Confidence: before 2/5 → after 3/5     Time: approach 12 min · code 20 min
Fundamentals missing: definition of anagram
Issues: wrong pattern; code was messy
Brute force: compare every pair — O(n²k) / O(1)
Optimal: bucket by sorted-string key — O(nk log k) / O(nk)
Key insight: all anagrams share one canonical form
Tips: char-count tuple avoids the sort
Revise: yes — pattern recognition still weak
Suggested grade: hard — needed hints for the invariant
```

Grades: `again` (couldn't do it) · `hard` (hints/slow/low confidence) ·
`good` (solo with friction) · `easy` (instant + optimal). The tutor's
suggested grade wins; otherwise Recall derives it from the signals.

## Calendar

Subscribe once in Google Calendar: **Other calendars → From URL** →
`http://<host>:3000/api/calendar/dev.ics` (set `CALENDAR_TOKEN` to change the
secret). Overdue reviews appear on today. Note: Google only refreshes
subscribed feeds every 12–24h, which is fine for multi-day intervals; Apple
Calendar refreshes faster. While the app only runs on localhost the feed can't
be reached by Google's servers — use the in-app Today queue as primary (it is
anyway), or deploy first.

## MCP — let the tutoring chat log problems itself

Recall is also an MCP server at `/api/mcp`. Tools: `get_next_action` (call it
first — it returns the day's plan), `add_problem`, `get_due_reviews`,
`log_review`, `get_stats`, `get_weekly_report_data`, `save_coach_report`. With
the dev server running, connect Claude Code:

```bash
claude mcp add --transport http recall http://localhost:3000/api/mcp --header "Authorization: Bearer dev"
```

(Replace `dev` if you set `MCP_TOKEN`.) Then at the end of a tutoring session,
say **"log it"** — Claude calls `add_problem` directly, zero copy-paste. For
claude.ai custom connectors the endpoint must be publicly reachable, i.e.
after deployment.

The tutor prompt in [docs/tutor-prompt.md](docs/tutor-prompt.md) is written to
use these tools when available and fall back to the paste template otherwise.

## Insights

`/insights` — activity heatmap, felt-vs-actual calibration (fed by the review
player's pre-reveal confidence slider), confidence trend, per-pattern mastery,
and grade distribution. Sparse until you've logged a few weeks of reviews.

## Environment (.env)

| Variable            | Default             | Purpose                                       |
| ------------------- | ------------------- | --------------------------------------------- |
| `DATABASE_PATH`     | `data/recall.db`    | SQLite location                               |
| `CALENDAR_TOKEN`    | `dev` — see below   | Secret in the ICS feed URL                    |
| `MCP_TOKEN`         | `dev` — see below   | Bearer token for the MCP endpoint             |
| `ANTHROPIC_API_KEY` | —                   | Enables AI parsing of free-form summaries     |
| `PARSE_MODEL`       | Haiku 4.5           | Model for AI parsing                          |
| `RECALL_USER_ID`    | `shreet`            | Row owner (multi-user later)                  |
| `APP_TIMEZONE`      | `America/Los_Angeles` | Timezone all day math uses (streaks, "due today") |
| `APP_URL`           | Vercel URL, else localhost | Base URL the MCP tools put in their replies |

> The `dev` fallback for `CALENDAR_TOKEN` and `MCP_TOKEN` is **local-only**. It
> is revoked the moment `APP_PASSWORD` is set or `NODE_ENV=production`, because
> those two routes are exempt from the login gate and a shared default would
> leave them open. On a gated instance, set both explicitly or the ICS feed and
> the MCP endpoint return "Not found" / 401. See `src/lib/secrets.ts`.
>
> Set `APP_TIMEZONE`, not `TZ`, to change the app's day boundary — `TZ` is
> overwritten at startup (`src/db/index.ts`) because the deploy platform
> presets it to UTC.

## Deploy (Vercel + Turso)

The app runs on local SQLite with zero setup; setting `TURSO_DATABASE_URL`
switches it to [Turso](https://turso.tech) (hosted libSQL — same schema, same
queries). Deployed instances should also set `APP_PASSWORD`, which activates
the login gate on every page and API (the MCP endpoint and ICS feed keep their
own tokens).

One-time, interactive (browser OAuth — only steps a human can do):

```bash
turso auth signup
```

```bash
npx vercel login
```

Then, from `recall/`:

1. `sqlite3 data/recall.db "PRAGMA wal_checkpoint(TRUNCATE);"` then
   `turso db create recall --from-file data/recall.db` — creates the cloud DB
   *with all existing data*.
2. `turso db show recall --url` and `turso db tokens create recall` → the two
   `TURSO_*` values.
3. `npx vercel link`, add env vars (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`,
   `APP_PASSWORD`, `CALENDAR_TOKEN`, `MCP_TOKEN`, optionally
   `ANTHROPIC_API_KEY`), then `npx vercel --prod`.

After deploy:

- **Calendar**: Google Calendar → Other calendars → From URL →
  `https://<app>.vercel.app/api/calendar/<CALENDAR_TOKEN>.ics` (now reachable
  by Google's servers, so it actually syncs).
- **MCP from claude.ai**: Settings → Connectors → Add custom connector →
  `https://<app>.vercel.app/api/mcp` with header
  `Authorization: Bearer <MCP_TOKEN>`.
- **Note**: local SQLite and Turso are now separate databases. Treat the
  deployed app as the source of truth; for cloud-backed local dev, put the
  `TURSO_*` values in `.env`.

## Architecture notes

- Next.js 16 App Router · Tailwind v4 + shadcn/ui (Base UI) · Drizzle over
  Turso (libSQL) in deployment, better-sqlite3 locally · ts-fsrs (FSRS-6,
  long-term mode, retention 0.9, max interval 365d, first interval floored at
  2 days).
- Every *user-owned* table carries `user_id`, so multi-user is a migration
  rather than a rewrite. The three that don't are not user-scoped:
  `list_items` (owned by its list), `problem_concepts` (a join table), and
  `problems_catalog` (a shared cache of public LeetCode metadata).
- A re-solve of an existing problem logs a review against the existing record —
  never a duplicate row. Identity resolves lcSlug → slug → number → exact bare
  slug, in one place (`findProblem` in `src/lib/data.ts`).
- Schema changes go through migration files: edit `src/db/schema.ts`, then
  `npm run db:generate` to emit reviewable SQL into `drizzle/`, then
  `npm run db:migrate` to apply it. `drizzle/0000_baseline.sql` is a baseline —
  it describes the schema as it already existed when migrations were adopted,
  and is recorded as applied, so it never re-runs against a live database.
- `npm run db:push` still exists but is for throwaway/scratch databases only.
  Against a database with real rows, push resolves a column rename or a new
  `NOT NULL` column without a default by **recreating the table**, with no SQL
  to review and nothing to roll back to. Use `db:generate` + `db:migrate`.
- Roadmap: concept-level scheduling (the `concepts` / `problem_concepts` tables
  are declared and waiting for it); sibling-problem substitution on mature cards.
